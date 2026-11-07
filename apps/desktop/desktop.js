// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Run inside budgiesocial.com by the desktop app (main.js), and only there: it meets Budgie where a browser would
 * have been, so none of the website's code has to know about the app.
 *
 *   messages       a new message, group message, reply or anything else in your inbox, while Budgie isn't in front,
 *                  becomes a notification (a click opens it)
 *   unread         how many, on the taskbar button and the tray icon
 *   in the tray    a website stops checking for news while its page is hidden; the app's window is hidden whenever
 *                  it's closed to the tray, so here it keeps checking, every 20 seconds (calls come on their own
 *                  live connection, which never stops)
 *   playing        the first time the song or game this computer found is shown to someone signed in, the app says
 *                  once where to change it (the website itself posts it; see presence.js)
 */
(function () {
  'use strict';
  const D = window.BUDGIE_DESKTOP;
  if (!D || window.__budgieDesktop) return;
  window.__budgieDesktop = true;

  const ready = () => window.Nook && Nook.store && Nook.store.state && Nook.store.state.me;
  const t = (s) => (window.Nook && Nook.i18n ? Nook.i18n.t(s) : s);
  const lower = (s) => String(s || '').toLowerCase();

  /** what a message says, as the chat list says it */
  function said(m) {
    if (m.body) return String(m.body).replace(/[*_~`>#]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (m.media) return /gif/i.test(m.media.type || '') || m.media.type === 'klipy' ? 'GIF' : t('📷 Photo');
    return '';
  }

  let seen = null; // chat -> the newest message's id
  let notes = null; // inbox items already here
  function check() {
    if (!ready()) return;
    const s = Nook.store.state;
    const now = new Map();
    for (const c of s.conversations || []) {
      if (c.last) now.set('c:' + lower(c.with), { c, m: c.last, href: '#/messages/' + encodeURIComponent(c.with), title: 'u/' + c.with });
    }
    for (const g of s.groups || []) {
      if (g.last) now.set('g:' + g.id, { c: g, m: g.last, href: '#/messages/g/' + encodeURIComponent(g.id), title: g.name, group: true });
    }
    // the first look only learns what's there; after that, what's new is news
    if (seen) {
      for (const [key, x] of now) {
        const m = x.m;
        if (m.id > (seen.get(key) || 0) && !m.mine && !m.kind && x.c.unread > 0) {
          const text = said(m);
          D.notify({ title: x.title, body: x.group && m.from ? `${m.from}: ${text}` : text, href: x.href });
        }
      }
    }
    seen = new Map([...now].map(([key, x]) => [key, x.m.id]));
    const inbox = s.notes || [];
    if (notes) {
      for (const n of inbox) {
        if (notes.has(n.id) || Nook.store.isRead(n)) continue;
        D.notify({ title: 'Budgie', body: n.text || '', href: /^#\//.test(n.href || '') ? n.href : '#/inbox' });
      }
    }
    notes = new Set(inbox.map((n) => n.id));
    badge(Nook.store.unreadMessages() + Nook.store.unread());
  }

  // the count on the taskbar button: a red circle with the number in it
  let lastCount = -1;
  function badge(n) {
    if (n === lastCount) return;
    lastCount = n;
    let png = '';
    if (n > 0) {
      const c = document.createElement('canvas');
      c.width = c.height = 32;
      const g = c.getContext('2d');
      g.fillStyle = '#E5484D';
      g.beginPath();
      g.arc(16, 16, 15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.font = `bold ${n > 9 ? 15 : 19}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(n > 99 ? '99+' : n > 9 ? '9+' : String(n), 16, 17);
      png = c.toDataURL('image/png');
    }
    D.badge(n, png);
  }

  // what's playing and running: the app is told once that it has been shown on Budgie
  let playing = null;
  let listened = false;
  let told = false;
  const shared = () => {
    const a = playing;
    if (told || !ready() || !a || !((a.music && a.music.playing) || a.game)) return;
    told = true;
    D.activityShared();
  };
  function listenPlaying() {
    // only a website that shows it (an older one never asked the app to look)
    if (listened || !D.onActivity || !D.activityShared || !(window.Nook && Nook.presence)) return;
    listened = true;
    D.onActivity((a) => {
      playing = a;
      shared();
    });
  }

  let hooked = false;
  function hook() {
    listenPlaying();
    if (!ready()) return;
    if (!hooked) {
      hooked = true;
      for (const what of ['synced', 'messages', 'gmessages', 'notify', 'chat', 'groups']) Nook.store.on(what, () => setTimeout(check, 0));
    }
    D.lang(document.documentElement.lang || 'en');
    check();
    shared();
  }
  setInterval(hook, 3000);
  hook();
  // hidden in the tray: the website would wait to be seen before checking for news, so the app checks for it
  setInterval(() => {
    if (document.visibilityState !== 'visible' && ready() && Nook.store.sync) Nook.store.sync();
  }, 20000);
})();
