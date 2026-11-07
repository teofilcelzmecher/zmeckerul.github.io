// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * What people are listening to and playing (Budgie 1.4).
 *
 * The server knows someone's activity (a song, a game) from Budgie for Windows and Linux, Last.fm, Steam, or what
 * they typed; this shows it where people are: a lively card on profiles (album art on a spinning record, an
 * equaliser, the card in the album's own colours; a game in a morphing controller shape), a line under names in
 * friends lists and chats, a little badge on avatars in Messages, and a "Lately" section of what they've been into.
 *
 * Activities are asked for in one go for every name on the page, and asked again every 30 seconds while the page is
 * showing (never in the background). They're kept here meanwhile, so a page drawn again draws them at once.
 *
 * In the desktop app (window.BUDGIE_DESKTOP), what the computer plays and runs is posted to the server when it
 * changes and as a heartbeat (each lasts three minutes on the server unless it comes again).
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const store = Nook.store;
  const ui = Nook.ui;
  const api = Nook.api;
  const { esc, icon } = ui;
  const settings = () => store.state.settings;
  const fx = () => Nook.fx;
  const app = () => Nook.app;
  // things that move on their own hold still under reduced motion and in calm mode
  const still = () => ui.motionOff() || !!settings().calm;
  const calm = () => !!settings().calm;
  const clean = (text) => (settings().filterLanguage === false || !Nook.mod ? text : Nook.mod.soften(text));
  const haptic = (pattern) => fx() && fx().haptic(pattern);

  const REFRESH = 30000; // how often what's showing is asked for again
  const FRESH = 20000; // what was asked for this recently is drawn without asking again
  const cache = new Map(); // a name in lower case -> { act, at }
  let skew = 0; // the server's clock minus this device's, for "for 3 min"
  let off = false; // a server from before 1.4: nothing is asked again
  const lower = (name) => String(name || '').toLowerCase();
  const actOf = (name) => (cache.get(lower(name)) || {}).act || null;
  const isMe = (name) => store.isMe(name);

  // ---- asking the server ------------------------------------------------------------------------------

  /** what these people are doing, from the server (those already known lately aren't asked about again) */
  async function load(names, { force = false } = {}) {
    if (off) return;
    const t = Date.now();
    const want = [...new Set(names.map(lower))].filter((n) => n && (force || !cache.has(n) || t - cache.get(n).at > FRESH)).slice(0, 50);
    if (!want.length) return;
    try {
      const r = await api.get('/api/activity?names=' + encodeURIComponent(want.join(',')));
      if (r.now) skew = r.now - Date.now();
      const got = new Map(Object.entries(r.activities || {}).map(([n, a]) => [lower(n), a]));
      for (const n of want) cache.set(n, { act: got.get(n) || null, at: Date.now() });
      paint();
    } catch (error) {
      if (error.status === 404) off = true;
    }
  }
  /** your own activity, as the server just said it is */
  function mine(activity) {
    cache.set(lower(store.state.me.name), { act: activity && (activity.music || activity.game) ? activity : null, at: Date.now() });
    paint();
  }

  let timer = 0;
  function schedule() {
    clearTimeout(timer);
    if (off || document.hidden) return;
    timer = setTimeout(() => refresh(true), REFRESH);
  }
  /** everyone on the page, asked about again (force) or only if not lately; nothing on the page, nothing asked */
  function refresh(force) {
    tick();
    const names = [...document.querySelectorAll('[data-pres]')].map((el) => el.dataset.name);
    if (!names.length || off) return clearTimeout(timer);
    load(names, { force }).finally(schedule);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? clearTimeout(timer) : refresh(true)));

  // ---- words ----------------------------------------------------------------------------------------------

  /** how long it's been going: "just started", "for 3 min", "for 1 h 12 min" */
  function forHowLong(since) {
    const minutes = Math.floor(Math.max(0, Date.now() + skew - since) / 60000);
    if (minutes < 1) return 'just started';
    if (minutes < 60) return `for ${minutes} min`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `for ${h} h ${m} min` : `for ${h} h`;
  }
  /** where it comes from, as a little tag beside "Listening" or "Playing": the app, Last.fm, Steam, or "Status" */
  function sourceTag(x) {
    if (x.source === 'manual') return `<span class="pres-tag">${icon('edit_note')}Status</span>`;
    const name = x.source === 'lastfm' ? 'Last.fm' : x.source === 'steam' ? 'Steam' : x.app || 'PC';
    return `<span class="pres-tag" translate="no">${esc(name)}</span>`;
  }
  const songText = (m) => clean(m.title) + (m.artist ? ' — ' + clean(m.artist) : '');
  /** an hour count, plainly: "40 min", "12 h" */
  const hours = (minutes) => (minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`);

  // ---- drawing --------------------------------------------------------------------------------------------

  const artSrc = (art) => (art ? api.url(art) : '');
  const EQ = '<span class="pres-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
  const MINI_EQ = '<span class="pres-eq mini" aria-hidden="true"><i></i><i></i><i></i></span>';
  // the controller's shape: a pixel circle (it's a game, after all), then softer ones, round and round
  const GAME_SHAPES = ['pixelCircle', 'cookie4', 'puffyDiamond', 'clover4'];

  /** the big card for a song, on a profile */
  function musicCard(m, own) {
    const src = artSrc(m.art);
    const genres = (m.genres || []).slice(0, 2);
    return (
      `<div class="pres-card pres-music${src ? ' has-art' : ''}" data-slot="music"${own ? ' data-pres-act="mine" data-m3-ripple role="button" tabindex="0" aria-label="Change or clear what you’re listening to"' : ''}>` +
      (src ? `<img class="pres-glow" src="${esc(src)}" alt="" aria-hidden="true">` : '') +
      `<div class="pres-art" aria-hidden="true"><span class="pres-vinyl"${src ? ` style="--art:url('${esc(src)}')"` : ''}></span>` +
      (src ? `<img class="pres-cover" src="${esc(src)}" alt="" crossorigin="anonymous">` : `<span class="pres-cover pres-cover-empty">${icon('music_note')}</span>`) +
      '</div>' +
      `<div class="pres-info"><span class="pres-label">${EQ}<span class="pres-word">Listening</span>${sourceTag(m)}</span>` +
      `<b class="pres-title" translate="no">${esc(clean(m.title))}</b>` +
      (m.artist || m.album ? `<span class="pres-sub" translate="no">${esc(clean(m.artist || ''))}${m.artist && m.album ? ' · ' : ''}${m.album ? `<span class="pres-album">${esc(clean(m.album))}</span>` : ''}</span>` : '') +
      `<span class="pres-meta"><span data-since="${m.since}">${esc(forHowLong(m.since))}</span>${genres.length ? `<span class="pres-genres" translate="no">${genres.map(esc).join(' · ')}</span>` : ''}</span></div>` +
      (own ? `<span class="pres-edit" aria-hidden="true">${icon('edit')}</span>` : '') +
      '</div>'
    );
  }

  /** the big card for a game */
  function gameCard(g, own) {
    return (
      `<div class="pres-card pres-game" data-slot="game"${own ? ' data-pres-act="mine" data-m3-ripple role="button" tabindex="0" aria-label="Change or clear what you’re playing"' : ''}>` +
      `<div class="pres-pad" aria-hidden="true"><m3-shape shape="pixelCircle"></m3-shape>${icon('sports_esports')}<i></i><i></i><i></i></div>` +
      `<div class="pres-info"><span class="pres-label"><span class="pres-live" aria-hidden="true"></span><span class="pres-word">Playing</span>${sourceTag(g)}</span>` +
      `<b class="pres-title" translate="no">${esc(clean(g.name))}</b>` +
      `<span class="pres-meta"><span data-since="${g.since}">${esc(forHowLong(g.since))}</span></span></div>` +
      (own ? `<span class="pres-edit" aria-hidden="true">${icon('edit')}</span>` : '') +
      '</div>'
    );
  }

  const cardSig = (slot, x) => (!x ? '' : slot === 'music' ? JSON.stringify([x.title, x.artist, x.album, x.art, x.source, x.app, x.genres, x.since]) : JSON.stringify([x.name, x.source, x.since]));

  /**
   * a line under a name: the song (with a tiny equaliser) or the game. Someone doing both gets both, taking turns in
   * the one line (a list has no room for two titles side by side); held still, the song shows with a game badge
   */
  function lineHTML(act) {
    if (!act) return '';
    const parts = [];
    if (act.music) parts.push(`<span class="pres-bit music">${MINI_EQ}<span translate="no">${esc(songText(act.music))}</span></span>`);
    if (act.game) parts.push(`<span class="pres-bit game">${icon('sports_esports')}<span translate="no">${esc(clean(act.game.name))}</span></span>`);
    return parts.length > 1 ? `<span class="pres-roll" data-show="0">${parts.join('')}</span><span class="pres-also" aria-hidden="true">${icon('sports_esports')}</span>` : parts.join('');
  }
  const lineSig = (act) => (!act ? '' : JSON.stringify([act.music && songText(act.music), act.game && act.game.name]));
  /** in words, for screen readers and tooltips */
  function spoken(act) {
    if (!act) return '';
    const bits = [];
    // the words are Budgie's, the song and the game are the person's own: they're put in after the words are translated
    const say = (text) => (window.Nook && Nook.i18n ? Nook.i18n.t(text) : text);
    if (act.music) bits.push(say('Listening to {0}').replace('{0}', () => songText(act.music)));
    if (act.game) bits.push(say('Playing {0}').replace('{0}', () => act.game.name));
    return bits.join('. ');
  }

  // ---- keeping what's on the page up to date -----------------------------------------------------------------

  /** a fresh card springs in: the card grows and settles, the record slides out from behind the cover */
  function arrive(card) {
    if (still() || !card.animate) return;
    const f = fx();
    const spring = (f && f.lively) || { duration: 600, easing: 'cubic-bezier(.2,1.4,.4,1)' };
    card.animate([{ opacity: 0, transform: 'translateY(10px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: spring.duration, easing: spring.easing, fill: 'backwards' });
    const cover = card.querySelector('.pres-cover, .pres-pad');
    if (cover) cover.animate([{ transform: 'scale(.6) rotate(-12deg)' }, { transform: 'none' }], { duration: spring.duration, easing: spring.easing, delay: 60, fill: 'backwards' });
    const vinyl = card.querySelector('.pres-vinyl');
    if (vinyl) vinyl.animate([{ translate: '-34px 0' }, { translate: '0 0' }], { duration: 700, easing: (f && f.decel) || 'ease-out', delay: 180, fill: 'backwards' });
  }

  /** the card wears its album's colours (the picture is read once, small, and its colour kept) */
  const seeds = new Map();
  function wearArt(card) {
    const img = card.querySelector('img.pres-cover');
    if (!img || !window.M3 || !M3.color || !M3.color.seedFromImage) return;
    const go = () => {
      const url = img.currentSrc || img.src;
      if (!seeds.has(url)) {
        const job = new Promise((resolve) => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 48;
            canvas.getContext('2d').drawImage(img, 0, 0, 48, 48);
            resolve(M3.color.seedFromImage(canvas.toDataURL()));
          } catch (_) {
            resolve(null); // a picture that can't be read stays in the page's colours
          }
        }).catch(() => null);
        seeds.set(url, job);
      }
      seeds.get(url).then((seed) => seed && card.isConnected && ui.theme.tint(card, seed, true).then(() => card.classList.add('tinted')));
    };
    if (img.complete && img.naturalWidth) go();
    else img.addEventListener('load', go, { once: true });
  }

  /** a picture that's gone (the server let it go) becomes the note shape */
  function guardImages(el) {
    for (const img of el.querySelectorAll('img.pres-cover, img.pres-glow')) {
      img.addEventListener('error', () => {
        const card = img.closest('.pres-card');
        if (img.classList.contains('pres-cover')) img.outerHTML = `<span class="pres-cover pres-cover-empty">${icon('music_note')}</span>`;
        else img.remove();
        if (card) card.classList.remove('has-art');
      }, { once: true });
    }
  }

  function paintHero(el) {
    const name = el.dataset.name;
    const act = actOf(name);
    const own = isMe(name);
    let changed = false;
    for (const slot of ['music', 'game']) {
      const x = act && act[slot];
      const sig = cardSig(slot, x);
      let card = el.querySelector(`.pres-card[data-slot="${slot}"]`);
      if (card && card.dataset.sig === sig) continue;
      changed = true;
      if (!x) {
        if (card) card.remove();
        continue;
      }
      const next = document.createElement('div');
      next.innerHTML = slot === 'music' ? musicCard(x, own) : gameCard(x, own);
      const fresh = next.firstElementChild;
      fresh.dataset.sig = sig;
      fresh.dataset.key = slot === 'music' ? JSON.stringify([x.title, x.artist || '']) : x.name;
      // the same song, only dressed (its art or genres arrived): no entrance
      const sameThing = !!card && card.dataset.key === fresh.dataset.key;
      if (card) card.replaceWith(fresh);
      else if (slot === 'music') el.prepend(fresh);
      else el.append(fresh);
      guardImages(fresh);
      wearArt(fresh);
      if (!sameThing) arrive(fresh);
    }
    // your own profile with nothing on: a way to share something
    const empty = !(act && (act.music || act.game));
    let add = el.querySelector('.pres-add');
    if (own && empty && !add && cache.has(lower(name))) {
      el.insertAdjacentHTML('beforeend', `<button type="button" class="pres-add" data-pres-act="add">${icon('graphic_eq')}<span>Share a song or game</span>${icon('add')}</button>`);
      changed = true;
    } else if (add && !empty) {
      add.remove();
      changed = true;
    }
    el.hidden = !el.children.length;
    if (changed && act) el.setAttribute('aria-label', spoken(act));
    else if (changed) el.removeAttribute('aria-label');
  }

  function paintLine(el) {
    const act = actOf(el.dataset.name);
    const sig = lineSig(act);
    if (el.dataset.sig === sig) return;
    const had = !!el.dataset.sig;
    el.dataset.sig = sig;
    el.innerHTML = lineHTML(act);
    el.classList.toggle('two', !!el.querySelector('.pres-roll'));
    el.hidden = !sig;
    el.title = spoken(act);
    if (sig && !still() && el.animate) el.animate([{ opacity: 0, transform: had ? 'translateY(-4px)' : 'translateX(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,0,0,1)' });
  }

  /** a little badge on someone's picture in Messages: green for a song, purple for a game */
  function paintDot(el) {
    const act = actOf(el.dataset.name);
    const kind = act ? (act.music ? 'music' : act.game ? 'game' : '') : '';
    let dot = el.querySelector('.pres-dot');
    if (!kind) return dot && dot.remove();
    if (dot && dot.dataset.kind === kind) return;
    if (dot) dot.remove();
    el.insertAdjacentHTML('beforeend', `<span class="pres-dot ${kind}" data-kind="${kind}" aria-hidden="true">${icon(kind === 'music' ? 'music_note' : 'sports_esports')}</span>`);
    dot = el.querySelector('.pres-dot');
    if (!still() && dot.animate) dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  }

  const PAINT = { hero: paintHero, row: paintLine, chat: paintLine, dot: paintDot };
  function paint(root = document) {
    for (const el of root.querySelectorAll('[data-pres]')) {
      try {
        (PAINT[el.dataset.pres] || (() => {}))(el);
      } catch (error) {
        console.error('presence', error);
      }
    }
    tick();
  }

  /** "for 3 min" moves on */
  function tick() {
    for (const el of document.querySelectorAll('[data-pres] [data-since]')) {
      const words = forHowLong(Number(el.dataset.since));
      if (el.textContent !== words) el.textContent = words;
    }
  }

  // while they're on screen, a game's controller shape morphs from one shape to the next, and a line with a song and
  // a game turns from one to the other
  let beats = 0;
  setInterval(() => {
    if (document.hidden || still()) return;
    beats++;
    for (const shape of document.querySelectorAll('.pres-pad m3-shape')) {
      if (typeof shape.transitionTo === 'function') shape.transitionTo(GAME_SHAPES[beats % GAME_SHAPES.length], { spring: true });
    }
    if (beats % 2) for (const roll of document.querySelectorAll('.pres-roll')) roll.dataset.show = roll.dataset.show === '1' ? '0' : '1';
  }, 2400);

  // ---- "Lately": what someone has been into this last month ------------------------------------------

  const latelyCache = new Map();
  async function fillLately(section) {
    const name = section.dataset.presLately;
    let entry = latelyCache.get(lower(name));
    if (!entry || Date.now() - entry.at > 60000) {
      try {
        const r = await api.get(`/api/activity/${encodeURIComponent(name)}/lately`);
        entry = { at: Date.now(), lately: r.lately };
        latelyCache.set(lower(name), entry);
      } catch (error) {
        if (error.status === 404) off = true;
        return;
      }
    }
    const l = entry.lately;
    if (!l || !section.isConnected) return;
    const counts = !calm();
    const plays = (n) => (n === 1 ? '1 play' : `${n} plays`);
    const chip = (symbol, label, extra = '') => `<span class="chip static">${icon(symbol)}<span translate="no">${esc(clean(label))}</span>${extra ? `<small>${extra}</small>` : ''}</span>`;
    const group = (title, body) => `<div class="pres-group"><h3 class="pres-group-title">${title}</h3>${body}</div>`;
    const songs = l.songs.length
      ? group(
          'Top songs',
          `<div class="shelf pres-shelf" translate="no">${l.songs
            .map(
              (s, i) =>
                `<div class="m3-media-card pres-song" role="listitem" data-title="${esc(clean(s.title))}" data-subtitle="${esc(clean(s.artist || ''))}"${s.art ? ` data-art="${esc(artSrc(s.art))}"` : ''} data-symbol="music_note">` +
                `<span class="pres-rank" aria-hidden="true">${i + 1}</span>${counts ? `<span class="pres-plays" title="${esc(plays(s.plays))}">${icon('play_arrow')}${s.plays}</span>` : ''}</div>`
            )
            .join('')}</div>`
        )
      : '';
    const totals = counts && (l.minutes.music >= 1 || l.minutes.games >= 1)
      ? `<div class="pres-totals">${l.minutes.music >= 1 ? `<span>${icon('headphones')}<b>${esc(hours(l.minutes.music))}</b> of music</span>` : ''}${l.minutes.games >= 1 ? `<span>${icon('sports_esports')}<b>${esc(hours(l.minutes.games))}</b> of games</span>` : ''}</div>`
      : '';
    section.innerHTML =
      `<header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="cookie12" symbol="graphic_eq" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Lately</h2><m3-wavy-line></m3-wavy-line><span class="muted">Last 30 days</span></header>` +
      `<div class="card pres-lately-card">${totals}${songs}` +
      (l.artists.length ? group('Artists', `<div class="chips wrap">${l.artists.map((a) => chip('person', a.name, counts ? String(a.plays) : '')).join('')}</div>`) : '') +
      (l.genres.length ? group('Genres', `<div class="chips wrap">${l.genres.map((g) => chip('queue_music', g.name)).join('')}</div>`) : '') +
      (l.games.length ? group('Games', `<div class="chips wrap">${l.games.map((g) => chip('sports_esports', g.name)).join('')}</div>`) : '') +
      '</div>';
    section.hidden = false;
    section.querySelector('.shelf') && section.querySelector('.shelf').setAttribute('role', 'list');
    if (!still() && fx()) fx().stagger(section.querySelectorAll('.pres-song, .pres-group .chip'), { y: 10, step: 30, max: 10 });
  }

  // ---- your own: a status typed by hand ---------------------------------------------------------------

  const DURATIONS = [[30, '30 min'], [60, '1 hour'], [240, '4 hours'], [1440, 'Until I clear it']];
  /** the sheet for "Listening to…" or "Playing…" */
  function setStatus(slot) {
    const music = slot === 'music';
    const now = actOf(store.state.me.name);
    const cur = now && now[slot] && now[slot].source === 'manual' ? now[slot] : null;
    let minutes = 60;
    const field = (id, label, value, max, placeholder) =>
      `<div class="field"><label for="${id}">${label}</label><input class="m3-field" id="${id}" maxlength="${max}" autocomplete="off" spellcheck="false" placeholder="${placeholder}" value="${esc(value || '')}"></div>`;
    return ui.sheet({
      headline: music ? 'What are you listening to?' : 'What are you playing?',
      symbol: music ? 'music_note' : 'sports_esports',
      shape: music ? 'cookie12' : 'pixelCircle',
      className: 'pres-sheet',
      html:
        (music ? field('ps-title', 'Song', cur && cur.title, 150, 'Song name') + field('ps-artist', 'Artist (optional)', cur && cur.artist, 100, 'Who it’s by') : field('ps-game', 'Game', cur && cur.name, 80, 'Game name')) +
        `<div class="field"><span class="field-label">Show it for</span><div class="chips wrap pres-durations" role="radiogroup" aria-label="Show it for">${DURATIONS.map(
          ([m, label]) => `<button type="button" class="chip" role="radio" data-minutes="${m}" aria-checked="${m === minutes}" aria-pressed="${m === minutes}">${label}</button>`
        ).join('')}</div></div>` +
        '<p class="muted pres-note">It’s just words, so it doesn’t count towards music or game achievements. Only the people you chose in Settings → Activity see it.</p>' +
        '<span class="error" id="ps-err" role="alert"></span>',
      setup(body) {
        for (const b of body.querySelectorAll('[data-minutes]')) {
          b.addEventListener('click', () => {
            minutes = Number(b.dataset.minutes);
            for (const o of body.querySelectorAll('[data-minutes]')) {
              o.setAttribute('aria-checked', String(o === b));
              o.setAttribute('aria-pressed', String(o === b));
            }
            haptic(6);
          });
        }
        setTimeout(() => {
          const first = body.querySelector('input');
          if (first) first.focus();
        }, 120);
        body.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && e.target.matches('input')) {
            e.preventDefault();
            body.closest('dialog').querySelector('#ps-share').click();
          }
        });
      },
      actions: [
        { label: 'Cancel' },
        {
          label: 'Share',
          variant: 'filled',
          symbol: 'check',
          id: 'ps-share',
          run(close, body) {
            const value = (id) => (body.querySelector(id) ? body.querySelector(id).value.trim() : '');
            const item = music ? { title: value('#ps-title'), artist: value('#ps-artist') } : { name: value('#ps-game') };
            const err = body.querySelector('#ps-err');
            if (!(music ? item.title : item.name)) {
              err.textContent = music ? 'Say which song.' : 'Say which game.';
              body.querySelector('input').focus();
              return false;
            }
            const button = body.closest('dialog').querySelector('#ps-share');
            button.setAttribute('aria-busy', 'true');
            api
              .post('/api/activity', { source: 'manual', [slot]: item, minutes })
              .then((r) => {
                mine(r.activity);
                haptic([8, 40, 12]);
                close(true);
                M3.toast(music ? 'Your friends can see what you’re listening to' : 'Your friends can see what you’re playing', { symbol: music ? 'music_note' : 'sports_esports', shape: music ? 'cookie12' : 'pixelCircle' });
              })
              .catch((error) => {
                err.textContent = error.message;
                button.removeAttribute('aria-busy');
              });
            return false;
          },
        },
      ],
    });
  }

  function clearSlot(slot) {
    return api.post('/api/activity', { clear: slot }).then(
      (r) => {
        mine(r.activity);
        haptic(8);
      },
      (error) => app().showError(error)
    );
  }

  let jumpToSettings = false;
  function openSettings() {
    jumpToSettings = true;
    if (location.hash === '#/settings') scrollToSettings();
    else location.hash = '#/settings';
  }
  function scrollToSettings() {
    const section = document.getElementById('activity-settings');
    jumpToSettings = false;
    if (section) setTimeout(() => section.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'start' }), 80);
  }

  // a card that's a button answers Enter and Space too
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pres-card[data-pres-act]')) {
      e.preventDefault();
      e.target.click();
    }
  });
  document.addEventListener('click', (e) => {
    // someone else's card answers a tap: a little burst of notes (or pixels) and a buzz, just for fun
    const card = !e.target.closest('[data-pres-act]') && e.target.closest('.pres-card');
    if (card) {
      haptic(card.dataset.slot === 'music' ? [6, 30, 6] : 10);
      if (!still()) M3.burst(card.querySelector('.pres-cover, .pres-pad') || card, card.dataset.slot === 'music' ? 'playlist' : 'play', { count: 12 });
      return;
    }
    const target = e.target.closest('[data-pres-act]');
    if (!target) return;
    const act = target.dataset.presAct;
    haptic(6);
    if (act === 'add') {
      M3.menu(target, [
        { label: 'Listening to…', symbol: 'music_note', onSelect: () => setStatus('music') },
        { label: 'Playing…', symbol: 'sports_esports', onSelect: () => setStatus('game') },
        { separator: true },
        { label: 'Activity settings', symbol: 'tune', onSelect: openSettings },
      ]);
    } else if (act === 'mine') {
      const slot = target.dataset.slot;
      const x = (actOf(store.state.me.name) || {})[slot];
      M3.menu(target, [
        { label: x && x.source === 'manual' ? 'Change' : slot === 'music' ? 'Set a song instead' : 'Set a game instead', symbol: 'edit', onSelect: () => setStatus(slot) },
        { label: 'Clear', symbol: 'close', onSelect: () => clearSlot(slot) },
        { separator: true },
        { label: 'Activity settings', symbol: 'tune', onSelect: openSettings },
      ]);
    } else if (act === 'set') setStatus(target.dataset.slot);
    else if (act === 'clear') clearSlot(target.dataset.slot).then(() => fillSettings(target.closest('[data-pres-settings]')));
  });

  // ---- the hooks: where it shows -------------------------------------------------------------------------

  Nook.hook('profileHero', (u) => (off ? '' : `<div class="pres-hero" data-pres="hero" data-name="${esc(u.name)}" role="group" hidden></div>`));
  Nook.hook('profileSections', (u) => (off ? '' : `<section class="section pres-lately" data-pres-lately="${esc(u.name)}" hidden></section>`));
  Nook.hook('profileMount', (root) => {
    // the card spans the whole header, under the name and bio, rather than squeezing in beside the picture
    const hero = root.querySelector('.pres-hero');
    const host = root.querySelector('.profile-hero');
    const stats = host && host.querySelector(':scope > .stats');
    if (hero && host && stats) host.insertBefore(hero, stats);
    if (hero) paintHero(hero);
    const lately = root.querySelector('[data-pres-lately]');
    if (lately) fillLately(lately);
  });
  Nook.hook('personRow', (u) => (off ? '' : `<small class="pres-line" data-pres="row" data-name="${esc(u.name)}" hidden></small>`));
  Nook.hook('chatHead', (u) => (off ? '' : `<small class="pres-line pres-chat" data-pres="chat" data-name="${esc(u.name)}" hidden></small>`));
  Nook.hook('afterRender', (route, main) => {
    // a badge on friends' pictures in Messages
    if (route.view === 'messagesPage') {
      for (const row of main.querySelectorAll('a.convo:not(.group-convo)')) {
        const m = /^#\/messages\/([^/?]+)$/.exec(row.getAttribute('href') || '');
        const av = row.querySelector('.avatar');
        if (m && av) {
          av.dataset.pres = 'dot';
          av.dataset.name = decodeURIComponent(m[1]);
        }
      }
    }
    paint(main);
    refresh(false);
  });

  // ---- Settings → Activity -----------------------------------------------------------------------------------

  const desktop = () => {
    const D = window.BUDGIE_DESKTOP;
    return D && typeof D.onActivity === 'function' && typeof D.setActivityOptions === 'function' ? D : null;
  };
  let options = { music: true, games: true };
  // on a Windows or Linux computer's browser, the desktop app is worth a mention (it finds music and games by itself)
  const offerDesktop = () =>
    !window.BUDGIE_DESKTOP && !window.BUDGIE_APPLE && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) &&
    /Windows|Linux/.test(navigator.userAgent) && !/Android/.test(navigator.userAgent) && matchMedia('(pointer: fine)').matches;

  Nook.hook('settingsSections', (header) =>
    off ? '' : `<section id="activity-settings">${header('cookie12', 'graphic_eq', 'Activity')}<div class="card setting-card pres-settings" data-pres-settings><m3-loading class="pres-loading"></m3-loading></div></section>`
  );
  Nook.hook('settingsMount', (root) => {
    const box = root.querySelector('[data-pres-settings]');
    if (box) fillSettings(box);
    if (jumpToSettings) scrollToSettings();
  });

  async function fillSettings(box, given) {
    if (!box) return;
    let s = given;
    if (!s) {
      try {
        s = await api.get('/api/activity/settings');
      } catch (error) {
        if (error.status === 404) {
          off = true;
          const section = box.closest('section');
          if (section) section.remove();
        } else box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
        return;
      }
    }
    if (!box.isConnected) return;
    mine(s.activity);
    const seg = (id, value, opts) =>
      `<div class="m3-segmented" id="${id}" role="radiogroup" aria-label="Who can see it">${opts.map(([v, label, symbol]) => `<button class="m3-segment" role="radio" aria-checked="${v === value}" value="${v}" data-symbol="${symbol}">${icon(symbol)}${label}</button>`).join('')}</div>`;
    const a = s.activity || {};
    const nowRow = (slot) => {
      const x = a[slot];
      if (!x) return '';
      const words = slot === 'music' ? songText(x) : clean(x.name);
      const from = { manual: 'typed by you', desktop: 'from this computer', lastfm: 'from Last.fm', steam: 'from Steam' }[x.source] || '';
      return `<div class="pres-now"><span class="pres-now-icon">${slot === 'music' ? MINI_EQ : icon('sports_esports')}</span><span class="row-text"><b translate="no">${esc(words)}</b><small>${esc(slot === 'music' ? 'Listening' : 'Playing')} · ${esc(from)}</small></span><button type="button" class="m3-btn text small" data-pres-act="clear" data-slot="${slot}">${icon('close')}Clear</button></div>`;
    };
    const source = (shape, symbol, title, about, body) =>
      `<div class="pres-source"><div class="pres-source-head"><m3-shape-icon shape="${shape}" symbol="${symbol}" size="40" icon-size="20"></m3-shape-icon><b>${title}</b></div><small>${about}</small>${body}</div>`;
    const linkForm = (id, placeholder, label) =>
      `<form class="pres-link" data-link="${id}" novalidate><input class="m3-field" name="v" placeholder="${placeholder}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="200" aria-label="${placeholder}"><button class="m3-btn tonal" type="submit">${icon('link')}${label}</button></form><span class="error" data-err="${id}" role="alert"></span>`;
    const linked = (id, name) =>
      `<div class="pres-linked"><span class="chip static">${icon('link')}<span translate="no">${esc(name)}</span></span><button type="button" class="m3-btn text small" data-unlink="${id}">${icon('link_off')}Unlink</button></div>`;
    const D = desktop();
    box.innerHTML =
      '<p class="muted">Show your friends the song you’re listening to and the game you’re playing: on your profile, in chats and in their list of friends.</p>' +
      `<div class="setting-row"><span class="label">Who can see it</span>${seg('pres-vis', s.visibility, [['everyone', 'Everyone', 'public'], ['friends', 'Friends', 'group'], ['nobody', 'Nobody', 'visibility_off']])}</div>` +
      (a.music || a.game ? `<div class="pres-nows">${nowRow('music')}${nowRow('game')}</div>` : '') +
      source(
        'sunny',
        'edit_note',
        'Set it yourself',
        'Type what you’re listening to or playing, for as long as you like (up to a day). It’s just words, so it doesn’t count towards music or game achievements.',
        `<div class="toolbar"><button type="button" class="m3-btn tonal" data-pres-act="set" data-slot="music">${icon('music_note')}Listening to…</button><button type="button" class="m3-btn tonal" data-pres-act="set" data-slot="game">${icon('sports_esports')}Playing…</button></div>`
      ) +
      source(
        'cookie12',
        'album',
        'Last.fm',
        'Spotify, YouTube Music, Apple Music and most music apps can send what you play to Last.fm (it’s called scrobbling). Link your Last.fm username, and while you’re using Budgie, it shows what’s playing.',
        !s.available.lastfm && !s.lastfm ? '<p class="muted pres-off">Last.fm isn’t set up on this Budgie server yet.</p>' : s.lastfm ? linked('lastfm', s.lastfm) : linkForm('lastfm', 'Your Last.fm username', 'Link')
      ) +
      source(
        'pixelCircle',
        'sports_esports',
        'Steam',
        'Link your Steam profile: paste its link, or the name in its custom URL. Your profile and its Game details must be public in Steam’s privacy settings.',
        !s.available.steam && !s.steam ? '<p class="muted pres-off">Steam isn’t set up on this Budgie server yet.</p>' : s.steam ? linked('steam', s.steam.name || s.steam.id) : linkForm('steam', 'Steam profile link or name', 'Link')
      ) +
      (D
        ? source(
            'clover8',
            'computer',
            'This computer',
            'Budgie for Windows and Linux can see the music your computer plays (Spotify and other players) and the games it runs. Nothing else on your computer is looked at.',
            `<label class="switch-row"><span class="switch-text"><span>Show what I’m listening to</span><small>From your computer’s media controls</small></span><input type="checkbox" class="m3-switch" role="switch" id="pres-d-music"${options.music !== false ? ' checked' : ''}></label>` +
              `<label class="switch-row"><span class="switch-text"><span>Show what I’m playing</span><small>Games running on this computer</small></span><input type="checkbox" class="m3-switch" role="switch" id="pres-d-games"${options.games !== false ? ' checked' : ''}></label>`
          )
        : '') +
      (offerDesktop() ? `<p class="muted pres-off pres-get">${icon('computer')}<span>Budgie for Windows and Linux can show what your computer plays and runs by itself. <a href="download.html">Get it</a></span></p>` : '') +
      '<p class="muted pres-privacy">Budgie keeps what you’re listening to and playing right now, and counts the songs, artists, genres and games you play for your achievements and your profile’s Lately. Album art is fetched by Budgie’s own server, so no other company sees who’s looking.</p>';

    // who can see it
    const vis = box.querySelector('#pres-vis');
    vis.addEventListener('change', (e) => {
      const value = e.detail.value;
      api.put('/api/activity/settings', { visibility: value }).then(
        () => M3.snackbar(value === 'everyone' ? 'Everyone can see what you’re listening to and playing.' : value === 'friends' ? 'Only your friends can see what you’re listening to and playing.' : 'Nobody can see what you’re listening to and playing.'),
        (error) => {
          app().showError(error);
          fillSettings(box);
        }
      );
    });
    // linking and unlinking
    for (const form of box.querySelectorAll('form.pres-link')) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const id = form.dataset.link;
        const input = form.querySelector('input');
        const err = box.querySelector(`[data-err="${id}"]`);
        const button = form.querySelector('button');
        err.textContent = '';
        if (!input.value.trim()) return input.focus();
        button.setAttribute('aria-busy', 'true');
        api.post('/api/activity/' + id, id === 'lastfm' ? { user: input.value.trim() } : { id: input.value.trim() }).then(
          (r) => {
            haptic([8, 40, 12]);
            M3.toast(id === 'lastfm' ? 'Last.fm is linked' : 'Steam is linked', { symbol: 'link', shape: id === 'lastfm' ? 'cookie12' : 'pixelCircle' });
            if (r.warning) M3.snackbar(r.warning, { timeout: 12000 });
            fillSettings(box, r);
          },
          (error) => {
            button.removeAttribute('aria-busy');
            err.textContent = error.message;
          }
        );
      });
    }
    for (const b of box.querySelectorAll('[data-unlink]')) {
      b.addEventListener('click', () => {
        const id = b.dataset.unlink;
        api.del('/api/activity/' + id).then(
          (r) => {
            M3.snackbar(id === 'lastfm' ? 'Last.fm is unlinked.' : 'Steam is unlinked.');
            fillSettings(box, r);
          },
          (error) => app().showError(error)
        );
      });
    }
    // the desktop app's own switches
    if (D) {
      for (const [id, key] of [['#pres-d-music', 'music'], ['#pres-d-games', 'games']]) {
        box.querySelector(id).addEventListener('change', (e) => {
          options = Object.assign({}, options, { [key]: e.target.checked });
          try {
            D.setActivityOptions(options);
          } catch (_) {
            /* an app that can't take it keeps its own */
          }
          sendDesktop(true);
        });
      }
    }
  }

  // ---- Budgie for Windows and Linux: what the computer plays and runs -------------------------------------

  let latest = null;
  let sent = { sig: '', at: 0 };
  let soon = 0;
  /** posts what the computer says, when it changed, or as a heartbeat (nothing playing needs no heartbeat) */
  function sendDesktop(force) {
    clearTimeout(soon);
    if (!api.signedIn() || off) return;
    const a = latest || {};
    const m = a.music && a.music.playing !== false && options.music !== false && a.music.title ? a.music : null;
    const g = a.game && options.games !== false && a.game.name ? a.game : null;
    const music = m ? { title: String(m.title).slice(0, 150), artist: String(m.artist || '').slice(0, 100), album: String(m.album || '').slice(0, 100), app: String(m.app || '').slice(0, 32) } : null;
    const game = g ? { name: String(g.name).slice(0, 80) } : null;
    const sig = JSON.stringify([music, game]);
    const t = Date.now();
    if (!force && sig === sent.sig && (!music && !game ? true : t - sent.at < 50000)) return;
    if (!sent.sig && !music && !game && !force) return;
    sent = { sig, at: t };
    api.post('/api/activity', { source: 'desktop', music, game }).then((r) => mine(r.activity), () => {});
  }
  (function connectDesktop() {
    const D = desktop();
    if (!D) return;
    try {
      Promise.resolve(typeof D.activityOptions === 'function' ? D.activityOptions() : null).then(
        (o) => o && (options = { music: o.music !== false, games: o.games !== false }),
        () => {}
      );
      D.onActivity((a) => {
        latest = a || null;
        // a song skipped through quickly settles before it's sent
        clearTimeout(soon);
        soon = setTimeout(() => sendDesktop(false), 1500);
      });
    } catch (error) {
      console.error('desktop activity', error);
    }
  })();

  Nook.presence = {
    /** what someone is doing, as last heard (null for nothing, or not known yet) */
    of: actOf,
    /** asks again for everyone on the page */
    refresh: () => refresh(true),
    /** the sheet to type a status: 'music' or 'game' */
    set: setStatus,
    /** Settings → Activity */
    openSettings,
  };
})();
