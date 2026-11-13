// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * What people are listening to and playing (Budgie 1.4).
 *
 * Someone's activity is a song (`music`) and a game (`game`), each from one of these places:
 *   desktop  Budgie for Windows and Linux sees what the computer plays and runs, and its page posts it here as a
 *            heartbeat: it lasts three minutes unless it comes again
 *   steam    their Steam profile: this server asks Steam which game they're in, for people who used Budgie in the
 *            last ten minutes only
 *   manual   what they typed themselves ("Listening to…", "Playing…"), for up to a day. Just words: it never counts
 *            towards an achievement
 *   spotify  (1.7) their Spotify account, linked in Settings: music.js asks Spotify what's playing, with where in the
 *            song they are and a link to it (so friends can listen along)
 * When two places say different things, what they set by hand shows first, then the computer, then Spotify, then
 * Steam. Who sees it is theirs to choose: everyone, friends (the default) or nobody; blocked people never do.
 *
 * Real listening and playing feed the counts achievements are made of (stats.js): songs, artists and genres heard,
 * games played, and minutes of each. Minutes only run between sightings at most five minutes apart, so they can
 * never add up to more than the time that really passed; a song counts once it has played for 30 seconds, a game
 * once it has run for two minutes.
 *
 * Album art is fetched here, from Spotify's picture or else Apple's iTunes Search, and kept in DATA/art (up to
 * 150 MB, the least used go first). People's browsers only ever load it from this server (/api/art/<hash>.jpg),
 * so no other company sees who's looking. Genres come from the genre iTunes gives an artist's song, kept
 * for a month per artist.
 *
 * The key: `nook steam <Web API key>`, kept in the meta table like KLIPY's. (Last.fm, which 1.4 to 1.6 asked too, is
 * gone in 1.7: what was kept for it goes when the server starts.)
 * NOOK_ACTIVITY_API points Steam and iTunes at a stand-in server, for the tests (polls run faster then).
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mod = require('../js/moderation.js');

const TEST_API = (process.env.NOOK_ACTIVITY_API || '').replace(/\/$/, '');
const STEAM_API = TEST_API ? TEST_API + '/steam' : 'https://api.steampowered.com';
const ITUNES_API = TEST_API ? TEST_API + '/itunes/search' : 'https://itunes.apple.com/search';
// where album art may be downloaded from (Apple's and Spotify's picture servers), and nowhere else
const ART_HOSTS = [/^is\d+-ssl\.mzstatic\.com$/, /^i\.scdn\.co$/];

const SLOTS = ['music', 'game'];
// what wins when two places say different things: what someone typed, then their phone or computer, then Spotify and Steam
const RANK = { manual: 3, desktop: 2, spotify: 1.5, steam: 1 };
const VISIBILITY = ['everyone', 'friends', 'nobody'];
const LIMITS = { title: 150, artist: 100, album: 100, app: 32, game: 80 };

function install(ctx) {
  const { db, route, limit, fail, now, CONFIG, VERSION, MINUTE, HOUR, DAY, friendship, hasBlocked, lastSeen, textmodel, autoReport, CLI, modules, serving } = ctx;
  const stats = modules.stats;
  const FAST = !!TEST_API;
  const HEARTBEAT = 3 * MINUTE; // a sighting from a computer, Spotify or Steam lasts this long unless it comes again
  const GAP = 5 * MINUTE; // sightings further apart than this don't make listening or playing time
  const SEEN = 10 * MINUTE; // Steam is only asked about people who used Budgie this recently
  const MANUAL_MAX = 24 * 60; // minutes: "until I clear it" means a day at most
  const STEAM_EVERY = FAST ? 2500 : 60000;
  const ART_DIR = path.join(CONFIG.data, 'art');
  const ART_MAX = 1536 * 1024; // one picture
  const ART_CACHE = { bytes: 150 * 1024 * 1024, files: 5000 };
  const USER_AGENT = `Budgie/${VERSION} (+https://budgiesocial.com)`;

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS presence (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'friends',
  steam_id TEXT NOT NULL DEFAULT '',
  steam_name TEXT NOT NULL DEFAULT '',
  music TEXT NOT NULL DEFAULT '',
  game TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS presence_art (
  key TEXT PRIMARY KEY,
  file TEXT NOT NULL DEFAULT '',
  bytes INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS presence_genres (
  artist TEXT PRIMARY KEY,
  genres TEXT NOT NULL DEFAULT '[]',
  fetched_at INTEGER NOT NULL
);`);
  // (1.7) Last.fm is gone: the usernames linked to it, its key, and a song it was showing
  if (db.raw.prepare('PRAGMA table_info(presence)').all().some((c) => c.name === 'lastfm')) {
    db.raw.exec("UPDATE presence SET music = '' WHERE json_valid(music) AND json_extract(music, '$.source') = 'lastfm'; UPDATE presence SET music = '' WHERE music != '' AND NOT json_valid(music); UPDATE presence SET game = '' WHERE game != '' AND NOT json_valid(game)");
    try {
      db.raw.exec('ALTER TABLE presence DROP COLUMN lastfm');
    } catch (_) {
      db.raw.exec("UPDATE presence SET lastfm = ''");
    }
  }
  db.raw.exec("DELETE FROM meta WHERE key = 'lastfm-key'");

  // ---- small helpers ------------------------------------------------------------------------------------

  /** text from outside, tidied: no control or direction-flipping characters, one space between words, cut to size */
  const tidy = (value, max) => {
    if (typeof value !== 'string') return '';
    const flat = value
      .normalize('NFC')
      .replace(/[\u0000-\u001f\u007f-\u009f\u00ad\u200b\u200c\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(flat).slice(0, max).join('').trim();
  };
  const parse = (json) => {
    try {
      return json ? JSON.parse(json) : null;
    } catch (_) {
      return null;
    }
  };
  /** what's still showing: a sighting that hasn't run out */
  const live = (item, t = now()) => (item && item.until > t ? item : null);
  const lower = (s) => String(s || '').toLowerCase();
  const songKey = (m) => `${lower(m.artist)}\n${lower(m.title)}`.slice(0, 200);
  const gameKey = (name) => lower(name).replace(/[™®©]/g, '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 200);
  const keyOf = (slot, item) => (slot === 'music' ? songKey(item) : gameKey(item.name));
  const artKey = (key) => crypto.createHash('sha256').update('art1\n' + key).digest('hex').slice(0, 32);
  const artUrl = (key) => `/api/art/${key}.jpg`;

  const rowOf = (userId) => db.get('SELECT * FROM presence WHERE user_id = ?', userId);
  function ensureRow(userId) {
    db.run('INSERT OR IGNORE INTO presence (user_id, updated_at) VALUES (?, ?)', userId, now());
    return rowOf(userId);
  }
  function save(userId, slot, item) {
    ensureRow(userId);
    db.run(`UPDATE presence SET ${slot === 'music' ? 'music' : 'game'} = ?, updated_at = ? WHERE user_id = ?`, item ? JSON.stringify(item) : '', now(), userId);
  }

  /** what someone's activity looks like to the app */
  function activityOut(row, t = now()) {
    const out = {};
    if (!row) return out;
    const m = live(parse(row.music), t);
    if (m) {
      out.music = { title: m.title, artist: m.artist || undefined, album: m.album || undefined, art: m.art || undefined, genres: m.genres && m.genres.length ? m.genres : undefined, source: m.source, app: m.app || undefined, since: m.since };
      // (1.7) where in the song they are (at `at`, this server's time) and how long it is, and where it is on Spotify
      if (m.duration) Object.assign(out.music, { duration: m.duration, position: m.position || 0, at: m.at || m.since, paused: m.paused || undefined });
      if (m.link) out.music.link = m.link;
      if (m.spotify) out.music.spotify = m.spotify;
      if (m.appleId) out.music.appleId = m.appleId;
      if (m.source === 'manual') out.music.until = m.until;
    }
    const g = live(parse(row.game), t);
    if (g) {
      out.game = { name: g.name, source: g.source, since: g.since };
      if (g.source === 'manual') out.game.until = g.until;
    }
    return out;
  }

  /** whether `viewer` may see what `owner` is listening to and playing */
  function canSee(viewer, owner, row) {
    if (viewer.id === owner.id) return true;
    if (owner.banned_at) return false;
    if (hasBlocked(owner.id, viewer.id) || hasBlocked(viewer.id, owner.id)) return false;
    const visibility = (row && row.visibility) || 'friends';
    if (visibility === 'everyone') return true;
    if (visibility === 'nobody') return false;
    const f = friendship(viewer.id, owner.id);
    return !!f && f.status === 'friends';
  }

  /** the word lists' say about something someone's computer or Spotify sent: a slur or a scam isn't shown */
  const wordsOk = (texts) => !mod.check(texts.filter(Boolean), { kind: 'profile' }).block;

  /** what people type themselves is checked like a bio: the word lists, then the text model */
  async function checkTyped(user, texts) {
    texts = texts.filter(Boolean);
    const verdict = mod.check(texts, { kind: 'profile' });
    if (verdict.block) fail(422, verdict.block.why, { rule: verdict.block.rule });
    const info = verdict.warn.find((w) => w.rule === mod.RULES.personal);
    if (info) fail(422, info.why, { rule: info.rule });
    const judged = textmodel.judge(await textmodel.score(texts.join('\n')), 'public');
    if (judged.verdict === 'block') fail(422, 'This reads as hurtful to an automatic check, so it can’t be your status. If it got you wrong, try putting it differently.', { rule: mod.RULES.harassment });
    if (judged.verdict === 'review') autoReport('user', user.name, textmodel.reason(judged).replace('this might be', 'this activity status might be'));
  }

  // ---- calls to Steam and iTunes ------------------------------------------------------------------------

  /** a budget of calls a minute: take() is false once it's spent (whoever asked tries again later) */
  function pace(perMinute) {
    let stamps = [];
    return () => {
      const t = now();
      stamps = stamps.filter((s) => s > t - MINUTE);
      if (stamps.length >= perMinute) return false;
      stamps.push(t);
      return true;
    };
  }
  // Apple asks for about twenty calls a minute
  const itunesPace = pace(FAST ? 600 : 18);

  /** JSON from outside, or null when it couldn't be had (the reason goes to the log, without the URL and its key) */
  async function getJson(url, what) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
      const body = await res.text();
      if (body.length > 512 * 1024) throw new Error('answer too big');
      if (!res.ok) throw new Error('status ' + res.status);
      return JSON.parse(body);
    } catch (error) {
      console.error(`${what} didn’t answer:`, error.message);
      return null;
    }
  }
  const steamCall = (method, params) =>
    getJson(`${STEAM_API}/ISteamUser/${method}/?${new URLSearchParams(Object.assign({ key: db.meta('steam-key') || '' }, params))}`, 'Steam');

  // ---- genres -------------------------------------------------------------------------------------------

  // a genre's name, as Apple gives it: kept when it names a kind of music (and not "Music" or a country)
  const GENRE_WORDS =
    /(rock|pop|metal|punk|core$|hip hop|rap|trap|drill|grime|jazz|blues|soul|funk|disco|house|techno|trance|dubstep|drum and bass|jungle|garage|electro|electronic|edm|ambient|idm|synth|wave$|indie|alternative|folk|country|bluegrass|americana|r&b|gospel|reggae|ska|dub$|dancehall|reggaeton|latin|salsa|bachata|cumbia|samba|bossa nova|tango|flamenco|fado|afro|amapiano|k-pop|j-pop|c-pop|city pop|anime|classical|baroque|opera|orchestral|soundtrack|chiptune|lo-fi|chill|downtempo|trip hop|breakbeat|hardstyle|hardcore|emo|grunge|shoegaze|psychedelic|progressive|experimental|noise|industrial|gothic|darkwave|math rock|singer-songwriter|acoustic|swing|big band|motown|manele|schlager|chanson|polka|bhangra|bollywood|phonk|hyperpop|vaporwave|eurodance|dance|bass$|beats$|instrumental|a cappella|musical|christmas|new age|world|video game music|lounge|ballad|neo soul|grime|footwork|shoegaze)/;
  const NOT_GENRES =
    /^(seen live|favou?rites?|my .*|.*love.*|awesome|beautiful|cool|amazing|best.*|good|great|catchy|sexy|.*vocalists?|spotify|youtube|under \d+.*|albums? i own|check out|to listen|guilty pleasures?|songs?|music|radio|playlist|cover|covers|remix|live|.*\d0s|\d+|british|american|uk|usa|english|german|french|swedish|canadian|australian|japanese|korean|romanian|spanish|italian|brazilian|mexican|irish|scottish|norwegian|finnish|danish|dutch|polish|russian|turkish|greek|chinese|portuguese|african|argentinian|colombian)$/;
  const GENRE_CAPS = { 'r&b': 'R&B', edm: 'EDM', idm: 'IDM', 'k-pop': 'K-pop', 'j-pop': 'J-pop', 'c-pop': 'C-pop', 'lo-fi': 'Lo-fi', ska: 'Ska' };
  function normGenre(tag) {
    let g = lower(tag)
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/hip[\s-]?hop/g, 'hip hop')
      .replace(/\b(rnb|r ?'?n'? ?b|r and b)\b/g, 'r&b')
      .replace(/\b(drum[\s']*(n|and|&)[\s']*bass|dnb|d&b)\b/g, 'drum and bass')
      .replace(/\blo[\s-]?fi\b/g, 'lo-fi')
      .replace(/\b([kjc])[\s-]?pop\b/g, '$1-pop')
      .replace(/\btrip[\s-]?hop\b/g, 'trip hop')
      .replace(/[^a-z0-9&' -]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!g || g.length > 30 || NOT_GENRES.test(g) || !GENRE_WORDS.test(g)) return '';
    return g;
  }
  const genreLabel = (g) => GENRE_CAPS[g] || g.replace(/\b(r&b|edm|idm|k-pop|j-pop|lo-fi)\b/g, (w) => GENRE_CAPS[w]).replace(/^./, (c) => c.toUpperCase());
  // iTunes' genres ("Hip-Hop/Rap", "R&B/Soul", "Singer/Songwriter") into the same words
  const itunesGenre = (name) => (/^(music|spoken word|comedy|fitness & workout)$/i.test(name || '') ? '' : normGenre(/^singer\/songwriter$/i.test(name) ? 'singer-songwriter' : String(name || '').split('/')[0]));

  /** an artist's genres, from what's kept, or the genre iTunes gave one of their songs */
  async function genresFor(artist, fallback) {
    const backup = fallback ? [itunesGenre(fallback)].filter(Boolean) : [];
    if (!artist) return backup;
    const key = lower(artist).slice(0, 200);
    const kept = db.get('SELECT genres, fetched_at FROM presence_genres WHERE artist = ?', key);
    const keptList = kept ? parse(kept.genres) || [] : [];
    if (kept && kept.fetched_at > now() - 30 * DAY && (keptList.length || !backup.length)) return keptList;
    const genres = backup;
    if (genres.length) {
      db.run('INSERT INTO presence_genres (artist, genres, fetched_at) VALUES (?, ?, ?) ON CONFLICT(artist) DO UPDATE SET genres = excluded.genres, fetched_at = excluded.fetched_at', key, JSON.stringify(genres), now());
    }
    return genres;
  }

  // ---- album art ----------------------------------------------------------------------------------------

  /** a kept picture's address, '' when it's known there's none (for a week), null when nobody has looked yet */
  function keptArt(key) {
    const row = db.get('SELECT file, fetched_at, used_at FROM presence_art WHERE key = ?', key);
    if (!row) return null;
    if (row.file) {
      if (row.used_at < now() - HOUR) db.run('UPDATE presence_art SET used_at = ? WHERE key = ?', now(), key);
      return artUrl(row.file);
    }
    return row.fetched_at > now() - 7 * DAY ? '' : null;
  }

  const allowedArt = (src) => {
    try {
      const u = new URL(src);
      if (TEST_API && src.startsWith(TEST_API + '/')) return true;
      return u.protocol === 'https:' && ART_HOSTS.some((re) => re.test(u.hostname));
    } catch (_) {
      return false;
    }
  };

  /** a song's picture on Apple's iTunes Search (and its genre): { art, genre }, null for none, undefined for "not now" */
  async function itunes(m) {
    if (!itunesPace()) return undefined;
    const term = [m.artist, m.title].filter(Boolean).join(' ').slice(0, 200);
    const answer = await getJson(`${ITUNES_API}?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: '8' })}`, 'iTunes Search');
    if (!answer) return undefined;
    // words only, without "(Remastered 2011)", "- Radio Edit" or "feat. someone", to match the song up
    const plain = (s) => lower(s).replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\s-\s.*$/, ' ').replace(/\b(feat|ft)\.? .*$/, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    const title = plain(m.title);
    const artist = plain(m.artist);
    const results = (Array.isArray(answer.results) ? answer.results : []).filter((r) => r && typeof r.artworkUrl100 === 'string');
    const byArtist = (r) => !artist || plain(r.artistName).includes(artist) || artist.includes(plain(r.artistName));
    const best = results.find((r) => plain(r.trackName) === title && byArtist(r)) || results.find((r) => plain(r.trackName).startsWith(title) && byArtist(r)) || (artist ? results.find(byArtist) : null);
    if (!best) return null;
    return { art: best.artworkUrl100.replace(/\/\d+x\d+bb\.(jpg|png|webp)$/, '/300x300bb.jpg'), genre: typeof best.primaryGenreName === 'string' ? best.primaryGenreName : '' };
  }

  /** downloads a picture into the art folder: its address here, or '' */
  async function download(src, key) {
    if (!allowedArt(src)) return '';
    try {
      const res = await fetch(src, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/jpeg,image/png' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      if (!res.ok || Number(res.headers.get('content-length') || 0) > ART_MAX) return '';
      // read with a cap, so an answer that never says its size can't fill the memory
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > ART_MAX) return '';
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
      const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      if (!jpeg && !png) return '';
      fs.mkdirSync(ART_DIR, { recursive: true, mode: 0o750 });
      const file = path.join(ART_DIR, key);
      fs.writeFileSync(file + '.part', bytes);
      fs.renameSync(file + '.part', file);
      const t = now();
      db.run('INSERT INTO presence_art (key, file, bytes, fetched_at, used_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET file = excluded.file, bytes = excluded.bytes, fetched_at = excluded.fetched_at, used_at = excluded.used_at', key, key, bytes.length, t, t);
      trimArt();
      return artUrl(key);
    } catch (error) {
      console.error('album art download failed:', error.message);
      return '';
    }
  }

  /** the art folder stays under its size: the pictures used longest ago go */
  function trimArt() {
    let { bytes, files } = db.get("SELECT COALESCE(SUM(bytes), 0) AS bytes, COUNT(*) AS files FROM presence_art WHERE file != ''");
    while (bytes > ART_CACHE.bytes || files > ART_CACHE.files) {
      const oldest = db.all("SELECT key, file, bytes FROM presence_art WHERE file != '' ORDER BY used_at LIMIT 50");
      if (!oldest.length) break;
      for (const r of oldest) {
        fs.rm(path.join(ART_DIR, r.file), { force: true }, () => {});
        db.run('DELETE FROM presence_art WHERE key = ?', r.key);
        bytes -= r.bytes;
        files--;
      }
    }
  }

  const lookups = new Map(); // one look per song at a time
  /** a song's picture (an address here, or '') and genres, looked up once and kept */
  function lookup(m, image) {
    const key = artKey(songKey(m));
    if (lookups.has(key)) return lookups.get(key);
    const job = (async () => {
      let art = keptArt(key);
      let genre = '';
      if (art === null) {
        let src = typeof image === 'string' && image && allowedArt(image) ? image : '';
        let looked = !!src;
        if (!src) {
          const found = await itunes(m);
          looked = found !== undefined;
          if (found) {
            src = found.art;
            genre = found.genre;
          }
        }
        art = src ? await download(src, key) : '';
        // nothing there: remembered for a week, so nobody asks again and again (but "not now" isn't remembered)
        if (!art && looked) db.run('INSERT INTO presence_art (key, fetched_at, used_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET fetched_at = excluded.fetched_at', key, now(), now());
      }
      return { art: art || '', genres: await genresFor(m.artist, genre) };
    })().finally(() => lookups.delete(key));
    lookups.set(key, job);
    return job;
  }

  // what one person's songs may ask Apple for, so nobody can use up everyone's budget by sending
  // song after made-up song: 40 new songs looked up an hour each (what's already kept costs nothing)
  const lookupsBy = new Map();
  function mayLookUp(userId, m) {
    const key = artKey(songKey(m));
    if (keptArt(key) !== null || lookups.has(key)) return true;
    const t = now();
    const mine = (lookupsBy.get(userId) || []).filter((at) => at > t - HOUR);
    if (mine.length >= 40) return false;
    mine.push(t);
    lookupsBy.set(userId, mine);
    return true;
  }

  /** once a song's picture and genres are known, the song wears them (if it's still playing) */
  function dressSong(userId, m, image) {
    if (!mayLookUp(userId, m)) return;
    lookup(m, image)
      .then(({ art, genres }) => {
        const cur = live(parse((rowOf(userId) || {}).music));
        if (!cur || songKey(cur) !== songKey(m)) return;
        const labels = genres.map(genreLabel);
        if ((cur.art || '') === art && JSON.stringify(cur.genres || []) === JSON.stringify(labels)) return;
        cur.art = art || undefined;
        cur.genres = labels.length ? labels : undefined;
        save(userId, 'music', cur);
      })
      .catch((error) => console.error('album art:', error.message));
  }

  // ---- counting real listening and playing (for achievements) ----------------------------------------------

  const tracks = new Map(); // user id -> where their listening and playing stand, in memory
  const trackOf = (userId) => {
    let t = tracks.get(userId);
    if (!t) {
      t = {
        music: { at: 0, carry: 0, key: '', keyAt: 0, cur: null, done: false, counted: new Map(), last: 0, hour: [] },
        game: { at: 0, carry: 0, key: '', since: 0, name: '', done: false, day: '', fresh: 0 },
      };
      tracks.set(userId, t);
    }
    return t;
  };

  /** time runs on between two sightings no more than five minutes apart: whole minutes go into the stats */
  function runTime(state, userId, key, t) {
    if (state.at && t > state.at && t - state.at <= GAP) state.carry += t - state.at;
    state.at = Math.max(state.at, t);
    if (state.carry < MINUTE) return false;
    const whole = Math.floor(state.carry / MINUTE);
    state.carry -= whole * MINUTE;
    stats.add(userId, key, whole);
    return true;
  }

  const checks = new Map();
  /** achievements look again, a moment after the counts change (once for a burst of changes) */
  function checkSoon(userId) {
    const a = modules.achievements;
    if (!a || typeof a.check !== 'function' || checks.has(userId)) return;
    const timer = setTimeout(() => {
      checks.delete(userId);
      try {
        a.check(userId);
      } catch (error) {
        console.error('achievements check:', error.message);
      }
    }, 1500);
    if (timer.unref) timer.unref();
    checks.set(userId, timer);
  }

  const SONG_PLAYED = MINUTE; // a song counts once it has played this long
  const SONGS_PER_HOUR = 25;
  const GAME_PLAYED = 10 * MINUTE; // a game counts as played once it has run this long
  const NEW_GAMES_PER_DAY = 5;

  /**
   * one song heard: its artist and genres too. At most 25 an hour (about what real listening gives: songs are three
   * or four minutes long), and the same one not twice in half an hour, so achievements can't be farmed with fake plays
   */
  function countSong(userId, s, m, t) {
    s.done = true;
    for (const [k, at] of s.counted) if (t - at > 30 * MINUTE) s.counted.delete(k);
    s.hour = s.hour.filter((at) => t - at < HOUR);
    const key = songKey(m);
    if (s.counted.has(key) || s.hour.length >= SONGS_PER_HOUR) return false;
    s.counted.set(key, t);
    s.hour.push(t);
    stats.addItem(userId, 'music.songs', key, `${m.title}\n${m.artist || ''}`);
    if (m.artist) stats.addItem(userId, 'music.artists', lower(m.artist), m.artist);
    genresFor(m.artist, '')
      .then((genres) => {
        for (const g of genres) stats.addItem(userId, 'music.genres', g, genreLabel(g));
        if (genres.length) checkSoon(userId);
      })
      .catch(() => {});
    return true;
  }

  /** a sighting of a song really playing (never a status someone typed) */
  function heardMusic(userId, m, t) {
    const s = trackOf(userId).music;
    const fresh = !s.at || t - s.at > GAP;
    let changed = runTime(s, userId, 'music.minutes', t);
    const key = songKey(m);
    if (key === s.key && !fresh) {
      // a song counts once it has played for a minute
      if (!s.done && t - s.keyAt >= SONG_PLAYED) changed = countSong(userId, s, s.cur, t) || changed;
    } else {
      // the one before it, if it played long enough and wasn't counted yet
      if (s.cur && !s.done && !fresh && t - s.keyAt >= SONG_PLAYED) changed = countSong(userId, s, s.cur, t) || changed;
      Object.assign(s, { key, keyAt: t, cur: { title: m.title, artist: m.artist }, done: false });
    }
    if (changed) checkSoon(userId);
  }

  /** a sighting of a game really running: it counts as played once it has run for ten minutes (five new ones a day at most) */
  function sawGame(userId, g, t) {
    const s = trackOf(userId).game;
    const fresh = !s.at || t - s.at > GAP;
    let changed = runTime(s, userId, 'games.minutes', t);
    const key = gameKey(g.name);
    if (!key) return;
    if (key !== s.key || fresh) Object.assign(s, { key, since: t, name: g.name, done: false });
    else if (!s.done && t - s.since >= GAME_PLAYED) {
      s.done = true;
      const day = new Date(t).toISOString().slice(0, 10);
      if (s.day !== day) Object.assign(s, { day, fresh: 0 });
      const isNew = !db.get("SELECT 1 AS x FROM stat_items WHERE user_id = ? AND key = 'games.played' AND item = ?", userId, key);
      if (!isNew || s.fresh < NEW_GAMES_PER_DAY) {
        if (isNew) s.fresh++;
        stats.addItem(userId, 'games.played', key, s.name);
        changed = true;
      }
    }
    if (changed) checkSoon(userId);
  }

  // ---- what shows ---------------------------------------------------------------------------------------

  const dismissed = new Map(); // `${user}:${slot}` -> what they cleared by hand, kept away until it changes

  /** a song or game from somewhere: it shows unless something that wins over it is showing */
  function offer(userId, slot, item, t, image) {
    const row = ensureRow(userId);
    const cur = live(parse(row[slot]), t);
    if (cur && RANK[cur.source] > RANK[item.source]) return;
    const key = keyOf(slot, item);
    const away = dismissed.get(`${userId}:${slot}`);
    if (away !== undefined) {
      if (away === key) return;
      dismissed.delete(`${userId}:${slot}`);
    }
    const same = !!cur && keyOf(slot, cur) === key;
    item.since = same ? cur.since : t;
    if (slot === 'music') {
      item.art = same ? cur.art : keptArt(artKey(songKey(item))) || undefined;
      item.genres = same ? cur.genres : undefined;
    }
    save(userId, slot, item);
    if (slot === 'music' && (!same || !cur.art)) dressSong(userId, item, image);
  }

  /** a place stops saying something: it goes, if that's what was showing */
  function withdraw(userId, slot, source) {
    const row = rowOf(userId);
    const cur = row && parse(row[slot]);
    if (cur && cur.source === source) save(userId, slot, null);
  }

  /** a sighting from a phone or computer, Spotify or Steam: counted, then offered for showing */
  function sighted(userId, slot, item, image) {
    const texts = slot === 'music' ? [item.title, item.artist, item.album] : [item.name];
    if (!wordsOk(texts)) return withdraw(userId, slot, item.source);
    const t = now();
    item.until = t + HEARTBEAT;
    // while the computer reports, Spotify and Steam would only say the same again (and count it twice)
    const cur = live(parse((rowOf(userId) || {})[slot]), t);
    const desktopNow = cur && cur.source === 'desktop';
    if (item.source !== 'desktop' && desktopNow) return;
    if (item.source !== 'desktop' && cur && cur.source === 'manual' && trackOf(userId)[slot].desktopAt > t - HEARTBEAT) return;
    if (item.source === 'desktop') trackOf(userId)[slot].desktopAt = t;
    if (slot === 'music') heardMusic(userId, item, t);
    else sawGame(userId, item, t);
    offer(userId, slot, item, t, image);
  }

  /** what someone types: it shows (over anything else) for its minutes */
  function setManual(userId, slot, item, minutes, t) {
    Object.assign(item, { source: 'manual', since: t, until: t + minutes * MINUTE });
    dismissed.delete(`${userId}:${slot}`);
    if (slot === 'music') item.art = keptArt(artKey(songKey(item))) || undefined;
    save(userId, slot, item);
    if (slot === 'music' && !item.art) dressSong(userId, item, '');
  }

  /** cleared by hand: whatever shows goes, and a song or game that was found by itself stays away until it changes */
  function clearByHand(userId, slot) {
    const cur = live(parse((rowOf(userId) || {})[slot]));
    if (cur && cur.source !== 'manual') dismissed.set(`${userId}:${slot}`, keyOf(slot, cur));
    save(userId, slot, null);
  }

  /** a song or game as sent: checked and tidied (null when there's nothing, or the words aren't OK) */
  function readItem(slot, raw, source) {
    if (!raw || typeof raw !== 'object') return null;
    if (slot === 'music') {
      const title = tidy(raw.title, LIMITS.title);
      if (!title) {
        if (source === 'manual') fail(400, 'Say which song.', { field: 'title' });
        return null;
      }
      const item = { title, artist: tidy(raw.artist, LIMITS.artist), album: tidy(raw.album, LIMITS.album), source };
      // the app it plays in, from Budgie for Windows and Linux ("Spotify"): a plain name, or nothing
      const app = source === 'desktop' ? tidy(raw.app, LIMITS.app) : '';
      if (app && /^[\p{L}\p{N}][\p{L}\p{N} .&+'’!-]*$/u.test(app)) item.app = app;
      // (1.7) from a phone or computer that knows: how long the song is, where in it they are, and (Budgie for iPhone,
      // from the Music app) its number in Apple Music, so a friend can play it there
      if (source === 'desktop') {
        const duration = Math.round(Number(raw.duration));
        if (duration >= 1000 && duration <= 6 * 3600000) {
          item.duration = duration;
          item.position = Math.max(0, Math.min(duration, Math.round(Number(raw.position)) || 0));
          item.at = now();
        }
        if (/^[0-9]{1,15}$/.test(String(raw.appleId || '')) && raw.appleId !== '0') item.appleId = String(raw.appleId);
      }
      if (!item.album) delete item.album;
      return item;
    }
    const name = tidy(raw.name, LIMITS.game);
    if (!name) {
      if (source === 'manual') fail(400, 'Say which game.', { field: 'name' });
      return null;
    }
    return { name, source };
  }

  const userNamed = (name) => (/^[A-Za-z0-9_]{3,20}$/.test(name || '') ? db.get('SELECT id, name, banned_at FROM users WHERE name = ?', name) : null);

  // ---- routes -------------------------------------------------------------------------------------------

  // what the people named are listening to and playing, for those the asker may see
  route('GET', '/api/activity', ({ user, query }) => {
    limit('activity-read:' + user.id, 120, MINUTE, 'Too many requests. Slow down a little.');
    const names = [...new Set(String(query.names || '').split(',').map((n) => n.trim()).filter(Boolean))].slice(0, 50);
    const t = now();
    const activities = {};
    for (const name of names) {
      const owner = userNamed(name);
      if (!owner) continue;
      const row = rowOf(owner.id);
      if (!row || !canSee(user, owner, row)) continue;
      const out = activityOut(row, t);
      if (out.music || out.game) activities[owner.name] = out;
    }
    return { activities, now: t };
  });

  // a computer's heartbeat, a status typed by hand, or one cleared
  route('POST', '/api/activity', async ({ user, body }) => {
    const t = now();
    if (body.clear != null) {
      limit('activity:' + user.id, 60, 10 * MINUTE, 'That’s a lot of updates. Try again in a minute.');
      const slots = body.clear === 'all' ? SLOTS : [body.clear];
      if (!slots.every((s) => SLOTS.includes(s))) fail(400, 'That can’t be cleared.');
      for (const slot of slots) {
        if (body.source === 'desktop') withdraw(user.id, slot, 'desktop');
        else clearByHand(user.id, slot);
      }
      return { activity: activityOut(rowOf(user.id)), now: t };
    }
    if (body.source === 'desktop') {
      limit('activity:' + user.id, 60, 10 * MINUTE, 'That’s a lot of updates. Budgie will catch up in a minute.');
      for (const slot of SLOTS) {
        if (!(slot in body)) continue;
        const item = readItem(slot, body[slot], 'desktop');
        if (item) sighted(user.id, slot, item, '');
        else withdraw(user.id, slot, 'desktop');
      }
    } else if (body.source === 'manual') {
      limit('activity-manual:' + user.id, 30, HOUR, 'That’s a lot of statuses for one hour. Try again later.');
      const minutes = Math.min(MANUAL_MAX, Math.max(5, Math.round(Number(body.minutes) || MANUAL_MAX)));
      const items = SLOTS.map((slot) => [slot, readItem(slot, body[slot], 'manual')]).filter(([, item]) => item);
      if (!items.length) fail(400, 'Say what you’re listening to or playing.');
      await checkTyped(user, items.flatMap(([slot, item]) => (slot === 'music' ? [item.title, item.artist] : [item.name])));
      for (const [slot, item] of items) setManual(user.id, slot, item, minutes, t);
    } else fail(400, 'That isn’t a place Budgie knows activity from.');
    return { activity: activityOut(rowOf(user.id)), now: t };
  });

  // your own settings: who sees it, and what's linked
  const settingsOut = (userId) => {
    const row = rowOf(userId) || {};
    return {
      visibility: row.visibility || 'friends',
      steam: row.steam_id ? { id: row.steam_id, name: row.steam_name || '' } : null,
      available: { steam: !!db.meta('steam-key') },
      activity: activityOut(row),
    };
  };
  route('GET', '/api/activity/settings', ({ user }) => settingsOut(user.id));
  route('PUT', '/api/activity/settings', ({ user, body }) => {
    limit('activity-settings:' + user.id, 60, HOUR);
    if (!VISIBILITY.includes(body.visibility)) fail(400, 'Choose everyone, friends or nobody.');
    ensureRow(user.id);
    db.run('UPDATE presence SET visibility = ?, updated_at = ? WHERE user_id = ?', body.visibility, now(), user.id);
    return settingsOut(user.id);
  });


  route('POST', '/api/activity/steam', async ({ user, body }) => {
    limit('activity-link:' + user.id, 20, HOUR, 'That’s a lot of tries. Wait a little and try again.');
    if (!db.meta('steam-key')) fail(503, 'Steam isn’t set up on this Budgie server yet.');
    const given = tidy(body.id, 200);
    let id = '';
    let vanity = '';
    let m;
    if ((m = /steamcommunity\.com\/profiles\/(\d{17})/i.exec(given))) id = m[1];
    else if ((m = /steamcommunity\.com\/id\/([\w-]{2,32})/i.exec(given))) vanity = m[1];
    else if (/^\d{17}$/.test(given)) id = given;
    else if (/^[\w-]{2,32}$/.test(given)) vanity = given;
    else fail(400, 'Paste your Steam profile’s link, its 17-digit number, or the name in its custom URL.', { field: 'steam' });
    if (vanity) {
      const answer = await steamCall('ResolveVanityURL/v1', { vanityurl: vanity });
      if (!answer || !answer.response) fail(503, 'Steam isn’t answering right now. Try again in a minute.');
      if (answer.response.success !== 1 || !/^\d{17}$/.test(answer.response.steamid || '')) fail(404, `Steam doesn’t know a profile called “${vanity}”.`, { field: 'steam' });
      id = answer.response.steamid;
    }
    if (!id.startsWith('7656119')) fail(400, 'That isn’t a Steam profile’s number.', { field: 'steam' });
    const answer = await steamCall('GetPlayerSummaries/v2', { steamids: id });
    const player = answer && answer.response && Array.isArray(answer.response.players) ? answer.response.players[0] : null;
    if (!answer) fail(503, 'Steam isn’t answering right now. Try again in a minute.');
    if (!player) fail(404, 'Steam doesn’t know that profile.', { field: 'steam' });
    ensureRow(user.id);
    db.run('UPDATE presence SET steam_id = ?, steam_name = ?, updated_at = ? WHERE user_id = ?', id, tidy(player.personaname, 40), now(), user.id);
    seeSteamPlayer(user.id, player);
    return Object.assign(settingsOut(user.id), player.communityvisibilitystate === 3 ? {} : { warning: 'Your Steam profile is private, so Budgie can’t see what you play. In Steam, set your profile and its Game details to Public.' });
  });
  route('DELETE', '/api/activity/steam', ({ user }) => {
    db.run("UPDATE presence SET steam_id = '', steam_name = '', updated_at = ? WHERE user_id = ?", now(), user.id);
    withdraw(user.id, 'game', 'steam');
    return settingsOut(user.id);
  });

  /** a kept picture of a song, by its key in the stats */
  const artOfSong = (key) => {
    const row = db.get("SELECT file FROM presence_art WHERE key = ? AND file != ''", artKey(key));
    return row ? artUrl(row.file) : undefined;
  };
  // what someone has been into for the last month: their most played songs, artists, genres and games
  route('GET', '/api/activity/:name/lately', ({ user, params }) => {
    limit('activity-read:' + user.id, 120, MINUTE, 'Too many requests. Slow down a little.');
    const owner = userNamed(params.name);
    if (!owner) fail(404, 'There’s no one by that name.');
    if (!canSee(user, owner, rowOf(owner.id))) return { lately: null };
    const since = now() - 30 * DAY;
    const top = (key, n) =>
      db.all('SELECT item, label, count, last_at AS lastAt FROM stat_items WHERE user_id = ? AND key = ? AND last_at > ? ORDER BY count DESC, last_at DESC LIMIT ?', owner.id, key, since, n);
    const songs = top('music.songs', 10).map((r) => {
      const [title, artist] = String(r.label || '').split('\n');
      return { title: title || r.item, artist: artist || undefined, plays: r.count, art: artOfSong(r.item) };
    });
    const artists = top('music.artists', 8).map((r) => ({ name: r.label || r.item, plays: r.count }));
    const genres = top('music.genres', 8).map((r) => ({ name: r.label || genreLabel(r.item), plays: r.count }));
    const games = top('games.played', 6).map((r) => ({ name: r.label || r.item, plays: r.count }));
    if (!songs.length && !artists.length && !games.length) return { lately: null };
    const minutes = { music: stats.get(owner.id, 'music.minutes'), games: stats.get(owner.id, 'games.minutes') };
    return { lately: { songs, artists, genres, games, minutes } };
  });

  // album art, for anyone (like every other picture): from the art folder, never from another company
  route('GET', '/api/art/:file', ({ params, res }) => {
    const m = /^([a-f0-9]{32})\.jpg$/.exec(params.file);
    const missing = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    };
    if (!m) return missing();
    fs.readFile(path.join(ART_DIR, m[1]), (error, bytes) => {
      if (error) return missing();
      res.writeHead(200, {
        'Content-Type': bytes[0] === 0x89 ? 'image/png' : 'image/jpeg',
        'Content-Length': bytes.length,
        'Cache-Control': 'public, max-age=2592000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Cross-Origin-Resource-Policy': 'cross-origin',
        // the app reads a picture's colours to tint its card, which needs this
        'Access-Control-Allow-Origin': '*',
      });
      res.end(bytes);
    });
  }, { auth: false, stream: true });

  // ---- asking Steam --------------------------------------------------------------------------------------


  /** what Steam says someone is playing */
  function seeSteamPlayer(userId, player) {
    const name = tidy(player.gameextrainfo, LIMITS.game);
    if (name) sighted(userId, 'game', { name, source: 'steam' });
    else withdraw(userId, 'game', 'steam');
  }

  let steamBusy = false;
  async function pollSteam() {
    if (steamBusy || !db.meta('steam-key')) return;
    steamBusy = true;
    try {
      const t = now();
      const rows = db.all("SELECT user_id, steam_id FROM presence WHERE steam_id != ''").filter((r) => (lastSeen.get(r.user_id) || 0) > t - SEEN);
      // a hundred people a call: what Steam allows
      for (let i = 0; i < rows.length; i += 100) {
        const chunk = rows.slice(i, i + 100);
        const answer = await steamCall('GetPlayerSummaries/v2', { steamids: chunk.map((r) => r.steam_id).join(',') });
        const players = new Map((answer && answer.response && Array.isArray(answer.response.players) ? answer.response.players : []).map((p) => [String(p.steamid), p]));
        if (!answer) break;
        for (const r of chunk) if (players.has(r.steam_id)) seeSteamPlayer(r.user_id, players.get(r.steam_id));
      }
    } catch (error) {
      console.error('Steam check failed:', error.message);
    } finally {
      steamBusy = false;
    }
  }

  /** what ran out goes, rows with nothing in them go, and the memory of people long gone is let go */
  function tidyUp() {
    const t = now();
    db.run("UPDATE presence SET music = '' WHERE music != '' AND json_valid(music) AND COALESCE(json_extract(music, '$.until'), 0) < ?", t);
    db.run("UPDATE presence SET game = '' WHERE game != '' AND json_valid(game) AND COALESCE(json_extract(game, '$.until'), 0) < ?", t);
    db.run("DELETE FROM presence WHERE music = '' AND game = '' AND steam_id = '' AND visibility = 'friends'");
    db.run("DELETE FROM presence_art WHERE file = '' AND fetched_at < ?", t - 7 * DAY);
    db.run('DELETE FROM presence_genres WHERE fetched_at < ?', t - 90 * DAY);
    for (const [id, tr] of tracks) if (Math.max(tr.music.at, tr.game.at, tr.music.desktopAt || 0, tr.game.desktopAt || 0) < t - HOUR) tracks.delete(id);
    for (const key of dismissed.keys()) if (!tracks.has(Number(key.split(':')[0]))) dismissed.delete(key);
    for (const [id, list] of lookupsBy) if (!list.some((at) => at > t - HOUR)) lookupsBy.delete(id);
  }

  if (serving) {
    setInterval(pollSteam, STEAM_EVERY).unref();
    setInterval(tidyUp, 15 * MINUTE).unref();
    tidyUp();
  }

  // ---- `nook` commands ----------------------------------------------------------------------------------

  const say = (...lines) => console.log(lines.join('\n'));
  /** a key from the command line, checked with the service first (unless NOOK_ACTIVITY=test) */
  async function setKey({ meta, label, check, usage, on, off }, key) {
    if (key === 'off') {
      db.meta(meta, '');
      return say(off);
    }
    if (!key) return say(db.meta(meta) ? `${label} is on, with the key ${db.meta(meta).slice(0, 6)}…. Turn it off with: nook ${usage} off` : `${label} is off. To turn it on: nook ${usage} <key>`);
    if (!/^[A-Fa-f0-9]{32}$/.test(key)) throw new Error(`That doesn’t look like a ${label} key (32 letters and digits). Usage: nook ${usage} <key>`);
    if (process.env.NOOK_ACTIVITY !== 'test') await check(key);
    db.meta(meta, key);
    say(...on);
  }
  CLI.help.push(
    '  nook steam <Web API key>         show which Steam game people are playing; nook steam off turns it off',
    '  nook activity [name]             who has linked Steam and how big the album art is, or what someone is listening to and playing'
  );
  CLI.commands.steam = (key) =>
    setKey(
      {
        meta: 'steam-key',
        label: 'Steam',
        usage: 'steam',
        async check(k) {
          let res;
          try {
            res = await fetch(`${STEAM_API}/ISteamUser/GetPlayerSummaries/v2/?key=${k}&steamids=76561197960435530`, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000) });
          } catch (error) {
            throw new Error(`Couldn't reach Steam to check the key (${error.message}). Is the laptop online?`);
          }
          if (!res.ok) throw new Error(`Steam didn't accept that key (it answered ${res.status}). Copy it again from https://steamcommunity.com/dev/apikey.`);
        },
        on: [
          'Steam is on: people can link their Steam profile in Settings → Activity. No restart needed.',
          'Budgie asks Steam what linked people are playing once a minute, only while they’re using Budgie. Their Steam profile’s Game details must be public.',
          'To turn it off: nook steam off',
        ],
        off: 'Steam is off: nobody’s Steam is asked any more (their links stay, for when it’s back on). To turn it on again: nook steam <Web API key>',
      },
      key
    );
  CLI.commands.activity = (name) => {
    if (name) {
      const u = db.get('SELECT id, name FROM users WHERE name = ?', name);
      if (!u) throw new Error(`There's no user called "${name}". Try: nook users`);
      const row = rowOf(u.id) || {};
      const a = activityOut(row);
      return say(
        `u/${u.name}: shown to ${row.visibility || 'friends'}`,
        `  Steam: ${row.steam_id ? `${row.steam_id} (${row.steam_name})` : 'not linked'}`,
        `  listening: ${a.music ? `${a.music.title}${a.music.artist ? ' — ' + a.music.artist : ''} (${a.music.source})` : 'nothing'}`,
        `  playing:   ${a.game ? `${a.game.name} (${a.game.source})` : 'nothing'}`,
        `  heard ${stats.count(u.id, 'music.songs')} songs, ${stats.count(u.id, 'music.artists')} artists, ${stats.count(u.id, 'music.genres')} genres in ${Math.floor(stats.get(u.id, 'music.minutes') / 60)} h; played ${stats.count(u.id, 'games.played')} games for ${Math.floor(stats.get(u.id, 'games.minutes') / 60)} h`
      );
    }
    const n = (sql) => db.get(sql).n;
    const art = db.get("SELECT COALESCE(SUM(bytes), 0) AS b, COUNT(*) AS n FROM presence_art WHERE file != ''");
    say(
      `Steam:   ${db.meta('steam-key') ? 'on' : 'off'}, linked by ${n("SELECT COUNT(*) AS n FROM presence WHERE steam_id != ''")}`,
      `Album art kept: ${art.n} pictures, ${(art.b / 1024 / 1024).toFixed(1)} MB (at most ${ART_CACHE.bytes / 1024 / 1024} MB)`
    );
  };

  /** (1.7) the song showing for someone gets more said about it (where in it they are, its Spotify link), if it's still
   * that song: the source and when it started stay as they were */
  function merge(userId, song, fields) {
    const cur = live(parse((rowOf(userId) || {}).music));
    if (!cur || songKey(cur) !== songKey(song)) return false;
    Object.assign(cur, fields);
    save(userId, 'music', cur);
    return true;
  }

  return {
    // (1.7) for music.js: Spotify's sightings, its link and place in a song, and who may see whose, and the one
    // budget of iTunes Search calls both modules share (about twenty a minute, Apple asks)
    itunesPace,
    sighted,
    withdraw,
    merge,
    songKey,
    /** the song someone's playing, if `viewer` may see it, as the server keeps it (null otherwise) */
    musicFor(viewer, ownerId) {
      const owner = db.get('SELECT id, banned_at FROM users WHERE id = ?', ownerId);
      const row = owner && rowOf(owner.id);
      return row && canSee(viewer, owner, row) ? live(parse(row.music)) : null;
    },
    /** what someone's activity is, as `viewer` may see it ({} when they may not) */
    activityFor(viewer, ownerId) {
      const owner = db.get('SELECT id, banned_at FROM users WHERE id = ?', ownerId);
      const row = owner && rowOf(owner.id);
      return row && canSee(viewer, owner, row) ? activityOut(row) : {};
    },
    /** what an account's export holds about this part */
    exportFor(userId) {
      const row = rowOf(userId) || {};
      return {
        activity: {
          shownTo: row.visibility || 'friends',
          steam: row.steam_id ? { id: row.steam_id, name: row.steam_name } : undefined,
          now: activityOut(row),
        },
      };
    },
  };
}

module.exports = { install };
