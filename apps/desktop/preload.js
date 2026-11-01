// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * What the website gets from the desktop app, and nothing more: window.BUDGIE_DESKTOP, to say "there's something new"
 * (a notification), "this many unread" (the taskbar and tray), and which language it's in (the app's own words
 * follow it). The website's own code doesn't need any of it; desktop.js, which the app adds, uses it.
 *
 * A call ringing is noticed here, from the ringing screen the website shows (the page is shared, its code isn't):
 * the app then rings with a window of its own when Budgie isn't in front, and its Answer and Decline press the
 * website's own buttons.
 */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const clip = (s, n) => String(s == null ? '' : s).slice(0, n);

contextBridge.exposeInMainWorld(
  'BUDGIE_DESKTOP',
  Object.freeze({
    platform: process.platform,
    notify: (n) => ipcRenderer.send('notify', { title: clip(n && n.title, 120), body: clip(n && n.body, 400), href: clip(n && n.href, 300) }),
    badge: (count, png) => ipcRenderer.send('badge', Number(count) || 0, typeof png === 'string' && png.startsWith('data:image/png;base64,') && png.length < 200000 ? png : ''),
    lang: (code) => ipcRenderer.send('lang', clip(code, 5)),
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
