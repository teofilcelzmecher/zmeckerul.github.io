// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * What the website gets from the desktop app, and nothing more: window.BUDGIE_DESKTOP, to say "there's something new"
 * (a notification), "this many unread" (the taskbar and tray), and which language it's in (the app's own words
 * follow it). The website's own code doesn't need any of it; desktop.js, which the app adds, uses it.
 *
 * Since Budgie 1.4 it also hears what the computer is playing and running, for "Listening to" and "Playing":
 *   onActivity(cb)           cb({ music: { title, artist, album, app, playing } | null, game: { name } | null }) when
 *                            that changes, and every minute with the same again; returns a function that stops it
 *   activityOptions()        { music, games }: what may be shared (both, unless turned off)
 *   setActivityOptions(o)    turns either on or off (kept by the app; its tray has a switch too)
 *   onActivityOptions(cb)    cb({ music, games }) when they change, from the tray for instance
 * Nothing is looked for until the page asks with onActivity. Older apps have none of these: the website checks.
 *
 * A call ringing is noticed here, from the ringing screen the website shows (the page is shared, its code isn't):
 * the app then rings with a window of its own when Budgie isn't in front, and its Answer and Decline press the
 * website's own buttons.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

// ---- what's playing and running (Budgie 1.4) -----------------------------------------------------------------------

const hearing = new Set(); // the page's onActivity callbacks
const hearingOptions = new Set();
let last = null; // what the app said last
let options = null; // what may be shared, once asked
const song = (m) => (m && typeof m === 'object' && m.title ? { title: clip(m.title, 150), artist: clip(m.artist, 100), album: clip(m.album, 100), app: clip(m.app, 32), playing: m.playing !== false } : null);
const tidy = (a) => ({ music: song(a && a.music), game: a && a.game && a.game.name ? { name: clip(a.game.name, 80) } : null });
const tidyOptions = (o) => ({ music: !o || o.music !== false, games: !o || o.games !== false });
/** one of the page's callbacks: what goes wrong in it is the page's, and never stops the others */
function call(cb, value) {
  try {
    cb(value);
  } catch (e) {
    console.error(e);
  }
}
function currentOptions() {
  if (!options) {
    try {
      options = tidyOptions(ipcRenderer.sendSync('activity-options'));
    } catch (_) {
      options = tidyOptions(null);
    }
  }
  return options;
}
function onActivity(cb) {
  if (typeof cb !== 'function') return () => {};
  hearing.add(cb);
  // the first to ask starts the looking; anyone later hears what's already known
  if (hearing.size === 1) ipcRenderer.send('activity-listen', true);
  else if (last) setTimeout(() => hearing.has(cb) && call(cb, last), 0);
  let on = true;
  return () => {
    if (!on) return;
    on = false;
    hearing.delete(cb);
    if (!hearing.size) ipcRenderer.send('activity-listen', false);
  };
}
function setActivityOptions(o) {
  const now = currentOptions();
  o = o && typeof o === 'object' ? o : {};
  options = { music: typeof o.music === 'boolean' ? o.music : now.music, games: typeof o.games === 'boolean' ? o.games : now.games };
  ipcRenderer.send('activity-set', options);
  return Object.assign({}, options);
}
function onActivityOptions(cb) {
  if (typeof cb !== 'function') return () => {};
  hearingOptions.add(cb);
  return () => void hearingOptions.delete(cb);
}
ipcRenderer.on('activity', (e, a) => {
  last = tidy(a);
  for (const cb of [...hearing]) call(cb, last);
});
ipcRenderer.on('activity-options', (e, o) => {
  options = tidyOptions(o);
  for (const cb of [...hearingOptions]) call(cb, Object.assign({}, options));
});

contextBridge.exposeInMainWorld(
  'BUDGIE_DESKTOP',
  Object.freeze({
    platform: process.platform,
    notify: (n) => ipcRenderer.send('notify', { title: clip(n && n.title, 120), body: clip(n && n.body, 400), href: clip(n && n.href, 300) }),
    badge: (count, png) => ipcRenderer.send('badge', Number(count) || 0, typeof png === 'string' && png.startsWith('data:image/png;base64,') && png.length < 200000 ? png : ''),
    lang: (code) => ipcRenderer.send('lang', clip(code, 5)),
    onActivity,
    activityOptions: () => Object.assign({}, currentOptions()),
    setActivityOptions,
    onActivityOptions,
    // desktop.js: something found was shown to a signed-in person (the app says once where to change it)
    activityShared: () => ipcRenderer.send('activity-shared'),
  })
);

// ---- a call ringing -------------------------------------------------------------------------------------------------

/** an element's words, without its icons (an icon is a word too, drawn by its font) */
function words(el) {
  if (!el) return '';
  const copy = el.cloneNode(true);
  copy.querySelectorAll('.m3-icon').forEach((i) => i.remove());
  return clip(copy.textContent.replace(/\s+/g, ' ').trim(), 160);
}

window.addEventListener('DOMContentLoaded', () => {
  let shown = null;
  const look = () => {
    const ring = document.querySelector('.call-ring');
    if (ring === shown) return;
    shown = ring;
    if (!ring) return ipcRenderer.send('unring');
    const img = ring.querySelector('.ring-pic img');
    const label = (sel) => {
      const b = ring.querySelector(sel);
      return b ? clip(b.getAttribute('aria-label'), 40) : '';
    };
    ipcRenderer.send('ring', {
      who: words(ring.querySelector('#ring-who')),
      what: words(ring.querySelector('#ring-what')),
      answer: label('[data-ring="answer"]'),
      decline: label('[data-ring="decline"]'),
      video: !!ring.querySelector('.ring-cam'),
      img: img && /^https:\/\//.test(img.src) ? img.src : '',
    });
  };
  new MutationObserver(look).observe(document.body, { childList: true });
  look();
});

ipcRenderer.on('ring-act', (e, act) => {
  const b = document.querySelector(`.call-ring [data-ring="${act === 'answer' ? 'answer' : 'decline'}"]`);
  if (b) b.click();
});

// a notification clicked: the chat or post it's about
ipcRenderer.on('go', (e, href) => {
  if (typeof href === 'string' && /^#\/[\w\-/%.~]*$/.test(href)) location.hash = href.slice(1);
});
