// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Music (Budgie 1.7): Spotify, Apple Music, and hearing what a friend is listening to.
 *
 *   Spotify       someone links their Spotify account (Settings → Activity). This server asks Spotify what they're
 *                 playing, about every 20 seconds while they've used Budgie in the last two hours, and shows it as
 *                 their activity (presence.js, the source "spotify"), with where in the song they are and its link.
 *                 Linking is Spotify's own sign-in, with PKCE: there's no secret to keep, only the client ID of the
 *                 owner's Spotify app (`nook spotify <client ID>`). The keys Spotify gives are kept encrypted with a
 *                 key of this server's own (DATA/music.key), and go when someone unlinks or their account goes.
 *   Listen along  a friend's song on your own Spotify, from where they are in it (Spotify's rules: Premium, and
 *                 Spotify open on one of your devices). A song they hear somewhere else is looked up on Spotify.
 *   Previews      30 seconds of the song a friend is listening to, from Apple's iTunes Search, fetched and kept here
 *                 (DATA/previews, up to 100 MB, the least used go first), so people's browsers only talk to Budgie.
 *   Apple Music   Apple has no way for a server to see what someone's playing: Budgie for iPhone reads what the Music
 *                 app plays (if they turn it on) and sends it as its device's sighting, like Budgie for computers. A
 *                 song's place in Apple Music comes from iTunes Search, for "Open in Apple Music", and on an iPhone,
 *                 Play in Apple Music.
 * NOOK_MUSIC_API points Spotify (its sign-in and its API) and iTunes Search at a stand-in server, for the tests.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const TEST_API = (process.env.NOOK_MUSIC_API || '').replace(/\/$/, '');
const ACCOUNTS = TEST_API ? TEST_API + '/spotify-accounts' : 'https://accounts.spotify.com';
const SPOTIFY_API = TEST_API ? TEST_API + '/spotify-api/v1' : 'https://api.spotify.com/v1';
const ITUNES_API = TEST_API ? TEST_API + '/itunes/search' : 'https://itunes.apple.com/search';
// what a linked account lets Budgie do: see what's playing (and how far in), whether it's Premium, and start a song
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state user-read-private';
const REDIRECT = 'https://budgiesocial.com/connected.html';
// where previews may be downloaded from (Apple's), and nowhere else
const PREVIEW_HOSTS = [/^audio-ssl\.itunes\.apple\.com$/, /^audio\.itunes\.apple\.com$/];

function install(ctx) {
  const { db, route, limit, fail, notify, signal, now, CONFIG, VERSION, MINUTE, HOUR, DAY, lastSeen, CLI, modules, serving } = ctx;
  const presence = modules.presence;
  if (!presence || !presence.sighted) return {};
  const FAST = !!TEST_API;
  const ASK_EVERY = FAST ? 1200 : 20000; // how often a linked Spotify is asked what's playing (give or take five seconds)
  const SEEN = 2 * HOUR; // only for people who used Budgie this recently
  const PREVIEW_DIR = path.join(CONFIG.data, 'previews');
  const PREVIEW_MAX = 4 * 1024 * 1024; // one clip
  const PREVIEW_CACHE = 100 * 1024 * 1024;
  const USER_AGENT = `Budgie/${VERSION} (+https://budgiesocial.com)`;

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS music_links (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service TEXT NOT NULL,
  account TEXT NOT NULL DEFAULT '',
  premium INTEGER NOT NULL DEFAULT 0,
  access TEXT NOT NULL DEFAULT '',
  refresh TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, service)
);
CREATE TABLE IF NOT EXISTS music_songs (
  key TEXT PRIMARY KEY,
  apple_url TEXT NOT NULL DEFAULT '',
  apple_id TEXT NOT NULL DEFAULT '',
  preview TEXT NOT NULL DEFAULT '',
  clip TEXT NOT NULL DEFAULT '',
  clip_bytes INTEGER NOT NULL DEFAULT 0,
  fetched_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL
);`);

  const clientId = () => db.meta('spotify-client') || '';
  const redirect = () => db.meta('spotify-redirect') || REDIRECT;

  // ---- Spotify's keys, kept sealed ----------------------------------------------------------------------

  let sealKey = null;
  /** this server's own key for what it keeps of other services' keys: made once, kept beside the database */
  function keyNow() {
    if (sealKey) return sealKey;
    const file = path.join(CONFIG.data, 'music.key');
    try {
      sealKey = fs.readFileSync(file);
    } catch (_) {
      sealKey = null;
    }
    if (!sealKey || sealKey.length !== 32) {
      sealKey = crypto.randomBytes(32);
      fs.mkdirSync(CONFIG.data, { recursive: true });
      fs.writeFileSync(file, sealKey, { mode: 0o600 });
    }
    return sealKey;
  }
  const seal = (text) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', keyNow(), iv);
    const body = Buffer.concat([cipher.update(String(text), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  };
  const unseal = (sealed) => {
    try {
      const all = Buffer.from(String(sealed || ''), 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', keyNow(), all.subarray(0, 12));
      decipher.setAuthTag(all.subarray(12, 28));
      return Buffer.concat([decipher.update(all.subarray(28)), decipher.final()]).toString('utf8');
    } catch (_) {
      return '';
    }
  };

  const linkOf = (userId) => db.get("SELECT * FROM music_links WHERE user_id = ? AND service = 'spotify'", userId);
  const tidy = (value, max) =>
    typeof value === 'string'
      ? Array.from(value.normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('').trim()
      : '';
  const userNamed = (name) => (/^[A-Za-z0-9_]{3,20}$/.test(name || '') ? db.get('SELECT * FROM users WHERE name = ?', name) : null);

  // ---- talking to Spotify -------------------------------------------------------------------------------

  let pausedUntil = 0; // Spotify said to slow down: nobody is asked about until then
  /** a form to Spotify's sign-in server (exchanging a code, or refreshing a key): its answer, or null when it's away */
  async function accounts(form) {
    try {
      const res = await fetch(ACCOUNTS + '/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
        body: new URLSearchParams(form),
        signal: AbortSignal.timeout(10000),
        redirect: 'error',
      });
      const answer = await res.json().catch(() => null);
      return answer && typeof answer === 'object' ? answer : null;
    } catch (error) {
      console.error('Spotify’s sign-in didn’t answer:', error.message);
      return null;
    }
  }

  /** a working key for someone's Spotify, refreshed when it has run out (null: not now, or not any more) */
  async function keyFor(row, fresh = false) {
    if (!fresh && row.expires_at > now() + MINUTE) return unseal(row.access);
    const refresh = unseal(row.refresh);
    if (!refresh) return null;
    const answer = await accounts({ grant_type: 'refresh_token', refresh_token: refresh, client_id: clientId() });
    if (!answer) return null;
    if (answer.error) {
      // they took Budgie's access away in Spotify (or it was never granted): the link goes, and they're told
      if (answer.error === 'invalid_grant') unlink(row.user_id, 'Spotify stopped letting Budgie see what you play, so it’s unlinked. Link it again in Settings → Activity.');
      return null;
    }
    const access = String(answer.access_token || '');
    if (!access) return null;
    db.run(
      "UPDATE music_links SET access = ?, refresh = ?, expires_at = ? WHERE user_id = ? AND service = 'spotify'",
      seal(access),
      answer.refresh_token ? seal(answer.refresh_token) : row.refresh,
      now() + Math.max(60, Number(answer.expires_in) || 3600) * 1000,
      row.user_id
    );
    return access;
  }

  /** one call to Spotify's API for someone: { status, body }, or null when it couldn't be made */
  async function spotify(row, method, pathname, body, again = true) {
    const key = await keyFor(row);
    if (!key) return null;
    let res;
    try {
      res = await fetch(SPOTIFY_API + pathname, {
        method,
        headers: Object.assign({ Authorization: 'Bearer ' + key, 'User-Agent': USER_AGENT, Accept: 'application/json' }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
      });
    } catch (error) {
      console.error('Spotify didn’t answer:', error.message);
      return null;
    }
    if (res.status === 429) {
      pausedUntil = now() + Math.min(10 * MINUTE, (Number(res.headers.get('retry-after')) || 30) * 1000);
      return null;
    }
    // a key that stopped working early: a fresh one, once
    if (res.status === 401 && again) {
      const fresh = await keyFor(row, true);
      return fresh ? spotify(linkOf(row.user_id) || row, method, pathname, body, false) : null;
    }
    const text = await res.text().catch(() => '');
    let json = null;
    try {
      json = text && text.length < 512 * 1024 ? JSON.parse(text) : null;
    } catch (_) {
      json = null;
    }
    return { status: res.status, body: json };
  }

  /** (2026) Spotify's answer for an account the server's Spotify app hasn't been told about: its Development Mode lets
   * in only the people its owner adds in Spotify's dashboard (User Management), up to five */
  const notAllowed = (answer) => !!answer && answer.status === 403 && /not registered|developer dashboard|user may not be registered/i.test(JSON.stringify(answer.body || ''));
  const NOT_ALLOWED = 'Spotify doesn’t let this account use this Budgie server’s Spotify app yet. Ask whoever runs Budgie to add you in Spotify’s developer dashboard (User Management), then link it again.';

  /** someone's Spotify link goes (they unlinked, or Spotify ended it: then `why` says so in their inbox) */
  function unlink(userId, why) {
    db.run("DELETE FROM music_links WHERE user_id = ? AND service = 'spotify'", userId);
    presence.withdraw(userId, 'music', 'spotify');
    asked.delete(userId);
    if (why) notify(userId, { kind: 'system', text: why, href: '#/settings', symbol: 'link_off', shape: 'cookie9' });
    signal(userId, 'music', { spotify: false });
  }

  // ---- what a linked Spotify is playing -----------------------------------------------------------------

  /** the picture of a song nearest 300 pixels across, from Spotify's own list of sizes */
  const pictureOf = (images) => {
    const list = (Array.isArray(images) ? images : []).filter((i) => i && typeof i.url === 'string');
    list.sort((a, b) => Math.abs((a.width || 300) - 300) - Math.abs((b.width || 300) - 300));
    return list.length ? list[0].url : '';
  };
  const linkTo = (item) => (item && item.external_urls && typeof item.external_urls.spotify === 'string' && /^https:\/\/open\.spotify\.com\//.test(item.external_urls.spotify) ? item.external_urls.spotify : '');

  async function check(row) {
    const answer = await spotify(row, 'GET', '/me/player/currently-playing?additional_types=track,episode');
    if (!answer) return;
    const playing = answer.body;
    if (answer.status === 204 || !playing || !playing.item || answer.status !== 200) return presence.withdraw(row.user_id, 'music', 'spotify');
    const it = playing.item;
    // a podcast's episode is its show's; a song is its artists'
    const episode = it.type === 'episode';
    const item = {
      title: tidy(it.name, 150),
      artist: tidy(episode ? it.show && it.show.name : (Array.isArray(it.artists) ? it.artists : []).map((a) => a && a.name).filter(Boolean).join(', '), 100),
      album: tidy(episode ? '' : it.album && it.album.name, 100),
      source: 'spotify',
    };
    if (!item.title) return presence.withdraw(row.user_id, 'music', 'spotify');
    if (!item.album) delete item.album;
    // paused: shown no longer (it's not being listened to)
    if (!playing.is_playing) return presence.withdraw(row.user_id, 'music', 'spotify');
    const extra = { link: linkTo(it) || undefined, spotify: /^spotify:(track|episode):[A-Za-z0-9]{8,40}$/.test(it.uri || '') ? it.uri : undefined };
    const duration = Math.round(Number(it.duration_ms));
    if (duration >= 1000) Object.assign(extra, { duration, position: Math.max(0, Math.min(duration, Math.round(Number(playing.progress_ms)) || 0)), at: now() });
    Object.assign(item, extra);
    presence.sighted(row.user_id, 'music', item, pictureOf(episode ? it.images || (it.show && it.show.images) : it.album && it.album.images));
    // their computer shows the same song already (it wins): Spotify says where it is, so friends can listen along
    const shown = presence.musicFor({ id: row.user_id }, row.user_id);
    if (shown && shown.source !== 'spotify') presence.merge(row.user_id, item, extra);
  }

  const asked = new Map(); // user id -> when their Spotify is next asked
  let busy = false;
  async function poll() {
    if (busy || !clientId() || now() < pausedUntil) return;
    busy = true;
    try {
      const t = now();
      const due = db
        .all("SELECT * FROM music_links WHERE service = 'spotify'")
        .filter((r) => (lastSeen.get(r.user_id) || 0) > t - SEEN && (asked.get(r.user_id) || 0) <= t)
        .sort((a, b) => (asked.get(a.user_id) || 0) - (asked.get(b.user_id) || 0))
        .slice(0, 30);
      for (const row of due) {
        if (now() < pausedUntil) break;
        asked.set(row.user_id, now() + ASK_EVERY + Math.round((Math.random() - 0.5) * (FAST ? 300 : 10000)));
        await check(row);
      }
    } catch (error) {
      console.error('Spotify check failed:', error.message);
    } finally {
      busy = false;
    }
  }

  // ---- a song's place on Apple Music, and its preview ------------------------------------------------------

  const plain = (s) =>
    String(s || '')
      .toLowerCase()
      .replace(/\(.*?\)|\[.*?\]/g, ' ')
      .replace(/\s-\s.*$/, ' ')
      .replace(/\b(feat|ft)\.? .*$/, ' ')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const songKeyOf = (m) => crypto.createHash('sha256').update('song1\n' + presence.songKey(m)).digest('hex').slice(0, 32);
  const lookups = new Map();

  /** what iTunes Search knows of a song: { appleUrl, appleId, preview } (kept for a month), or null */
  async function songInfo(m) {
    const key = songKeyOf(m);
    const kept = db.get('SELECT * FROM music_songs WHERE key = ?', key);
    if (kept && kept.fetched_at > now() - 30 * DAY) return kept;
    if (lookups.has(key)) return lookups.get(key);
    const job = (async () => {
      // about twenty a minute, Apple asks: the same budget as presence.js's lookups of album art
      if (!presence.itunesPace()) return kept || null;
      const term = [m.artist, m.title].filter(Boolean).join(' ').slice(0, 200);
      let answer = null;
      try {
        const res = await fetch(`${ITUNES_API}?${new URLSearchParams({ term, media: 'music', entity: 'song', limit: '8' })}`, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
        answer = res.ok ? await res.json() : null;
      } catch (error) {
        console.error('iTunes Search didn’t answer:', error.message);
      }
      if (!answer) return kept || null;
      const title = plain(m.title);
      const artist = plain(m.artist);
      const results = (Array.isArray(answer.results) ? answer.results : []).filter((r) => r && r.kind === 'song');
      const byArtist = (r) => !artist || plain(r.artistName).includes(artist) || artist.includes(plain(r.artistName));
      const best = results.find((r) => plain(r.trackName) === title && byArtist(r)) || results.find((r) => plain(r.trackName).startsWith(title) && byArtist(r)) || null;
      const row = {
        key,
        apple_url: best && /^https:\/\/music\.apple\.com\//.test(best.trackViewUrl || '') ? String(best.trackViewUrl).replace(/[?&]uo=\d+/, '') : '',
        apple_id: best && /^[0-9]{1,15}$/.test(String(best.trackId || '')) ? String(best.trackId) : '',
        preview: best && typeof best.previewUrl === 'string' ? best.previewUrl : '',
      };
      db.run(
        `INSERT INTO music_songs (key, apple_url, apple_id, preview, fetched_at, used_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET apple_url = excluded.apple_url, apple_id = excluded.apple_id, preview = excluded.preview, fetched_at = excluded.fetched_at`,
        key, row.apple_url, row.apple_id, row.preview, now(), now()
      );
      return db.get('SELECT * FROM music_songs WHERE key = ?', key);
    })().finally(() => lookups.delete(key));
    lookups.set(key, job);
    return job;
  }

  const allowedPreview = (src) => {
    try {
      const u = new URL(src);
      if (TEST_API && src.startsWith(TEST_API + '/')) return true;
      return u.protocol === 'https:' && PREVIEW_HOSTS.some((re) => re.test(u.hostname));
    } catch (_) {
      return false;
    }
  };

  /** a song's 30 seconds, fetched once and kept here: its file's name, or '' */
  async function clipFor(info) {
    if (info.clip && fs.existsSync(path.join(PREVIEW_DIR, info.clip))) return info.clip;
    if (!info.preview || !allowedPreview(info.preview)) return '';
    try {
      const res = await fetch(info.preview, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!res.ok || Number(res.headers.get('content-length') || 0) > PREVIEW_MAX) return '';
      const chunks = [];
      let size = 0;
      for await (const chunk of res.body) {
        size += chunk.length;
        if (size > PREVIEW_MAX) return '';
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      // an MP4 (M4A) file says "ftyp" four bytes in
      if (bytes.length < 1024 || bytes.toString('latin1', 4, 8) !== 'ftyp') return '';
      fs.mkdirSync(PREVIEW_DIR, { recursive: true, mode: 0o750 });
      const name = info.key + '.m4a';
      fs.writeFileSync(path.join(PREVIEW_DIR, name + '.part'), bytes);
      fs.renameSync(path.join(PREVIEW_DIR, name + '.part'), path.join(PREVIEW_DIR, name));
      db.run('UPDATE music_songs SET clip = ?, clip_bytes = ?, used_at = ? WHERE key = ?', name, bytes.length, now(), info.key);
      trimClips();
      return name;
    } catch (error) {
      console.error('a preview couldn’t be fetched:', error.message);
      return '';
    }
  }

  /** the previews kept stay under 100 MB: the least used go first */
  function trimClips() {
    let total = db.get("SELECT COALESCE(SUM(clip_bytes), 0) AS b FROM music_songs WHERE clip != ''").b;
    if (total <= PREVIEW_CACHE) return;
    for (const row of db.all("SELECT key, clip, clip_bytes FROM music_songs WHERE clip != '' ORDER BY used_at")) {
      if (total <= PREVIEW_CACHE * 0.9) break;
      fs.rm(path.join(PREVIEW_DIR, row.clip), { force: true }, () => {});
      db.run("UPDATE music_songs SET clip = '', clip_bytes = 0 WHERE key = ?", row.key);
      total -= row.clip_bytes;
    }
  }

  // ---- routes -------------------------------------------------------------------------------------------

  const statusOut = (userId) => {
    const link = linkOf(userId);
    return {
      spotify: clientId() ? (link ? { linked: true, account: link.account || '', premium: !!link.premium } : { linked: false }) : null,
      previews: true,
    };
  };
  route('GET', '/api/music', ({ user }) => statusOut(user.id));

  // linking: Spotify's own sign-in, in a new window; it comes back to budgiesocial.com/connected.html, which hands the
  // code to /api/music/spotify/done (the one-time state says whose it is, so that page needs no sign-in of its own)
  const pending = new Map(); // state -> { userId, verifier, at }
  const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  route('POST', '/api/music/spotify/start', ({ user }) => {
    limit('spotify-start:' + user.id, 20, HOUR, 'That’s a lot of tries. Wait a little and try again.');
    if (!clientId()) fail(503, 'Spotify isn’t set up on this Budgie server yet.');
    // links run out after 15 minutes; someone's three newest still work (Settings open in two windows, a second tap)
    for (const [s, p] of pending) if (p.at < now() - 15 * MINUTE) pending.delete(s);
    const theirs = [...pending].filter(([, p]) => p.userId === user.id);
    for (const [s] of theirs.slice(0, Math.max(0, theirs.length - 2))) pending.delete(s);
    const state = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    pending.set(state, { userId: user.id, verifier, at: now() });
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    const url = `${ACCOUNTS}/authorize?${new URLSearchParams({ client_id: clientId(), response_type: 'code', redirect_uri: redirect(), code_challenge_method: 'S256', code_challenge: challenge, state, scope: SCOPES })}`;
    return { url };
  });

  route('POST', '/api/music/spotify/done', async ({ body, ip }) => {
    limit('spotify-done:' + ip, 30, HOUR, 'That’s a lot of tries. Wait a little and try again.');
    const state = typeof body.state === 'string' ? body.state : '';
    const p = pending.get(state);
    pending.delete(state);
    if (!p || p.at < now() - 15 * MINUTE) fail(400, 'This link to Spotify has run out. Start again from Settings → Activity in Budgie.');
    if (body.error) fail(400, body.error === 'access_denied' ? 'You didn’t let Budgie see what you play on Spotify, so nothing is linked.' : 'Spotify didn’t link. Try again from Settings → Activity in Budgie.');
    const code = typeof body.code === 'string' && body.code.length < 2048 ? body.code : '';
    if (!code) fail(400, 'Spotify didn’t send what Budgie needs. Try again from Settings → Activity in Budgie.');
    const answer = await accounts({ grant_type: 'authorization_code', code, redirect_uri: redirect(), client_id: clientId(), code_verifier: p.verifier });
    if (!answer || answer.error || !answer.access_token || !answer.refresh_token) fail(502, 'Spotify didn’t finish linking. Try again in a minute.');
    db.run(
      `INSERT INTO music_links (user_id, service, access, refresh, expires_at, created_at) VALUES (?, 'spotify', ?, ?, ?, ?)
       ON CONFLICT(user_id, service) DO UPDATE SET access = excluded.access, refresh = excluded.refresh, expires_at = excluded.expires_at`,
      p.userId, seal(answer.access_token), seal(answer.refresh_token), now() + Math.max(60, Number(answer.expires_in) || 3600) * 1000, now()
    );
    // who they are on Spotify, and whether they can listen along (Premium)
    const me = await spotify(linkOf(p.userId), 'GET', '/me');
    if (notAllowed(me)) {
      db.run("DELETE FROM music_links WHERE user_id = ? AND service = 'spotify'", p.userId);
      fail(403, NOT_ALLOWED, { notAllowed: true });
    }
    const account = me && me.status === 200 && me.body ? tidy(me.body.display_name || me.body.id || '', 60) : '';
    // (Spotify stopped saying who has Premium in 2026: it's known from the first song listened along to, then)
    const premium = me && me.body && me.body.product === 'premium' ? 1 : 0;
    db.run("UPDATE music_links SET account = ?, premium = ? WHERE user_id = ? AND service = 'spotify'", account, premium, p.userId);
    asked.delete(p.userId);
    signal(p.userId, 'music', { spotify: true });
    check(linkOf(p.userId)).catch(() => {});
    return { ok: true, account };
  }, { auth: false, body: 8 * 1024 });

  route('DELETE', '/api/music/spotify', ({ user }) => {
    unlink(user.id, '');
    return statusOut(user.id);
  });

  /** the song a friend is listening to, if you may see it (or your own) */
  function songOf(viewer, name) {
    const owner = userNamed(name);
    if (!owner) fail(404, 'There’s nobody called that on Budgie.');
    const m = presence.musicFor(viewer, owner.id);
    if (!m) fail(404, owner.id === viewer.id ? 'You’re not listening to anything right now.' : `u/${owner.name} isn’t listening to anything right now.`);
    return { owner, m };
  }

  // a friend's song: where it is on Apple Music, and its 30 seconds (fetched now, if not kept already)
  route('GET', '/api/music/song', async ({ user, query }) => {
    limit('music-song:' + user.id, 60, 10 * MINUTE, 'That’s a lot of songs in a row. Try again in a minute.');
    const { m } = songOf(user, query.name);
    const info = await songInfo(m);
    const clip = info ? await clipFor(info) : '';
    if (info) db.run('UPDATE music_songs SET used_at = ? WHERE key = ?', now(), info.key);
    return {
      title: m.title,
      artist: m.artist || undefined,
      preview: clip ? `/api/music/clip/${clip}` : undefined,
      apple: (info && info.apple_url) || undefined,
      appleId: m.appleId || (info && info.apple_id) || undefined,
      spotify: m.link || undefined,
    };
  });

  // the preview itself: no sign-in (an audio element can't send one; the name is long and random), in byte ranges
  // (Safari asks for those)
  route('GET', '/api/music/clip/:file', ({ params, req, res }) => {
    const m = /^([a-f0-9]{32})\.m4a$/.exec(params.file);
    const missing = () => {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
    };
    if (!m) return missing();
    const file = path.join(PREVIEW_DIR, m[0]);
    fs.stat(file, (error, st) => {
      if (error || !st.isFile()) return missing();
      const headers = {
        'Content-Type': 'audio/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=2592000, immutable',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      };
      const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
      if (range && (range[1] || range[2])) {
        let start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
        let end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
          return res.end();
        }
        res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Content-Length': end - start + 1 }));
        return fs.createReadStream(file, { start, end }).pipe(res);
      }
      res.writeHead(200, Object.assign(headers, { 'Content-Length': st.size }));
      fs.createReadStream(file).pipe(res);
    });
  }, { auth: false, stream: true });

  // listen along: a friend's song on your own Spotify, from where they are in it
  route('POST', '/api/music/listen', async ({ user, body }) => {
    limit('music-listen:' + user.id, 40, 10 * MINUTE, 'That’s a lot of songs in a row. Try again in a minute.');
    const link = linkOf(user.id);
    if (!link) fail(409, 'Link your Spotify in Settings → Activity first.', { link: true });
    const { owner, m } = songOf(user, body.name);
    if (owner.id === user.id) fail(400, 'That’s your own song.');
    let uri = typeof m.spotify === 'string' ? m.spotify : '';
    // heard somewhere else (Apple Music, a computer's player): the same song on Spotify, if it's there
    if (!uri) {
      const q = `track:${m.title.slice(0, 80)}${m.artist ? ` artist:${m.artist.split(',')[0].slice(0, 60)}` : ''}`;
      const found = await spotify(link, 'GET', `/search?${new URLSearchParams({ q, type: 'track', limit: '5' })}`);
      const items = (found && found.body && found.body.tracks && Array.isArray(found.body.tracks.items) ? found.body.tracks.items : []).filter((t) => t && typeof t.uri === 'string');
      const best = items.find((t) => plain(t.name) === plain(m.title)) || items[0];
      if (!best) fail(404, `Spotify doesn’t seem to have “${m.title}”.`);
      uri = best.uri;
    }
    // where they are in it now: where they were, and the time since
    const position = m.duration && uri === m.spotify ? Math.max(0, Math.min(m.duration - 3000, (m.position || 0) + (m.paused ? 0 : now() - (m.at || now())))) : 0;
    const answer = await spotify(link, 'PUT', '/me/player/play', { uris: [uri], position_ms: Math.round(position) });
    if (!answer) fail(503, 'Spotify isn’t answering right now. Try again in a minute.');
    if (answer.status === 404) fail(409, 'Open Spotify on your phone or computer first, play anything for a moment, then try again.', { device: true });
    if (notAllowed(answer)) fail(403, NOT_ALLOWED, { notAllowed: true });
    if (answer.status === 403) fail(403, 'Listening along needs Spotify Premium: Spotify only lets Budgie start songs for Premium accounts.', { premium: true });
    if (answer.status >= 400) fail(502, 'Spotify didn’t start the song. Try again in a minute.');
    if (!link.premium) db.run("UPDATE music_links SET premium = 1 WHERE user_id = ? AND service = 'spotify'", user.id);
    return { ok: true, title: m.title, artist: m.artist || undefined };
  });

  // ---- the laptop's own commands ------------------------------------------------------------------------

  const say = (...lines) => console.log(lines.join('\n'));
  CLI.help.push(
    '  nook spotify <client ID> [redirect URI]   let people link Spotify (from developer.spotify.com); nook spotify off turns it off'
  );
  CLI.commands.spotify = (id, uri) => {
    if (id === 'off') {
      db.meta('spotify-client', '');
      return say('Spotify is off: linked accounts aren’t asked any more (the links stay, for when it’s back on). To turn it on again: nook spotify <client ID>');
    }
    if (!id) {
      const n = db.get("SELECT COUNT(*) AS n FROM music_links WHERE service = 'spotify'").n;
      return say(clientId() ? `Spotify is on (client ID ${clientId().slice(0, 6)}…), linked by ${n}. Redirect URI: ${redirect()}` : 'Spotify is off. To turn it on: nook spotify <client ID>');
    }
    if (!/^[A-Za-z0-9]{32}$/.test(id)) throw new Error('That doesn’t look like a Spotify client ID (32 letters and digits). Find it in your app at https://developer.spotify.com/dashboard.');
    if (uri && !/^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/\S*)$/.test(uri)) throw new Error('The redirect URI must start with https:// (or be http://127.0.0.1, for testing).');
    db.meta('spotify-client', id);
    if (uri) db.meta('spotify-redirect', uri);
    say(
      'Spotify is on: people can link their Spotify in Settings → Activity. No restart needed.',
      `In your Spotify app's settings (developer.spotify.com), add this Redirect URI: ${redirect()}`,
      'While your Spotify app is in Development mode, Spotify only lets up to 5 people link it: the ones you add under User Management (and your own Spotify account needs Premium).',
      'To turn it off: nook spotify off'
    );
  };

  if (serving) {
    setInterval(poll, FAST ? 300 : 5000).unref();
    setInterval(() => {
      for (const [id, at] of asked) if (at < now() - SEEN) asked.delete(id);
      db.run("DELETE FROM music_songs WHERE clip = '' AND used_at < ?", now() - 60 * DAY);
    }, 30 * MINUTE).unref();
  }

  return {
    /** what an account's export holds about this part (never the keys) */
    exportFor(userId) {
      const link = linkOf(userId);
      return { music: { spotify: link ? { account: link.account || undefined, premium: !!link.premium, linkedAt: new Date(link.created_at).toISOString() } : undefined } };
    },
  };
}

module.exports = { install };
