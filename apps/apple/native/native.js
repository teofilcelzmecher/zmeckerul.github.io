// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie for iPhone, iPhone Duo, iPad and Mac: the device's own haptics, notifications, share sheet, windows, menus,
 * Handoff and fold, around Budgie's screens. Only the Apple app loads this (apps/apple/tools/build-www.py puts it in the
 * page's list of scripts, right after js/config.js), so the website never changes for it, and none of the app's own
 * code knows about Apple: this file meets it where the browser would have been.
 *
 * It talks to the Swift side (apps/apple/Budgie) through one message handler, `budgie`, which answers each message
 * with a promise; the Swift side talks back through BudgieApple.receive(kind, data).
 *
 *   haptics        the app's navigator.vibrate(…) buzzes become taps of the Taptic Engine (iPhone) or trackpad (Mac)
 *   notifications  messages, calls and replies, pushed by the server through Apple; reply to a message right from its
 *                  notification; tapping one opens the chat or post it's about; the app icon's badge counts what's new
 *   share, links   the share sheet; links to Budgie read budgiesocial.com; other sites open in Safari, over the app
 *   windows        ⌘-click (or the link menu's Open in New Window) opens a chat in a window of its own (iPad, Mac,
 *                  iPhone Duo open); the menu bar's and keyboard's commands (New Post, Go, Back…) come here
 *   look           the status bar and window follow the app's light or dark colours
 *   Handoff        what's open here can be picked up on another iPhone, iPad or Mac (the Swift side does it, from the
 *                  page's place and title, sent from here)
 *   fold           on iPhone Duo half open, like a laptop, a call puts the faces above the fold and the buttons below
 *   robot check    Cloudflare's check runs on budgiesocial.com in a sheet over the app (it doesn't know the app's own
 *                  address), and hands its answer back to the sign-up form
 */
(function () {
  'use strict';
  const handler = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.budgie;
  const APPLE = window.BUDGIE_APPLE;
  if (!handler || !APPLE) return;
  const html = document.documentElement;
  html.classList.add('app', 'app-apple', 'app-' + APPLE.platform, 'app-' + APPLE.idiom);

  /** a message to the Swift side; its answer comes back as a promise */
  const post = (type, data) => {
    try {
      return Promise.resolve(handler.postMessage(Object.assign({ type }, data || {}))).catch(() => null);
    } catch (_) {
      return Promise.resolve(null);
    }
  };
  // what the Swift side says
  const listeners = {};
  window.BudgieApple = {
    receive(kind, data) {
      (listeners[kind] || []).forEach((fn) => {
        try {
          fn(data || {});
        } catch (_) {
          /* one listener's trouble isn't the others' */
        }
      });
      return true;
    },
  };
  const on = (kind, fn) => (listeners[kind] = listeners[kind] || []).push(fn);

  // the address people know: what's shared and copied points there, not at the app's own
  const SITE = 'https://budgiesocial.com/';
  const forSharing = (text) => (typeof text === 'string' ? text.split(location.origin + '/').join(SITE) : text);
  const isBudgie = (url) => url.hostname === 'budgiesocial.com' || url.hostname === 'www.budgiesocial.com';

  // ---- haptics ---------------------------------------------------------------------------------------------
  // The app asks for buzzes in milliseconds, as a browser would; the Swift side turns short ones into taps of rising
  // strength, a pattern into its taps in time, and anything long into a real vibration.
  try {
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern) => {
        const steps = (Array.isArray(pattern) ? pattern : [pattern]).map((ms) => Math.max(0, Number(ms) || 0)).slice(0, 40);
        if (steps.some(Boolean)) post('haptic', { pattern: steps });
        return true;
      },
    });
  } catch (_) {
    /* left as it was */
  }

  // ---- sharing and links -------------------------------------------------------------------------------------
  try {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data = {}) =>
        post('share', { title: data.title || '', text: forSharing(data.text || ''), url: forSharing(data.url || '') }).then((done) => {
          if (done === false) throw new DOMException('Share canceled', 'AbortError');
        }),
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  } catch (_) {
    /* left as it was */
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => write(forSharing(text));
  }
  // a link to another site opens in Safari, over the app; a link to Budgie stays in it; ⌘-click opens a new window
  document.addEventListener(
    'click',
    (e) => {
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || e.defaultPrevented) return;
      let url;
      try {
        url = new URL(a.getAttribute('href'), location.href);
      } catch (_) {
        return;
      }
      const own = url.origin === location.origin;
      // Budgie's other pages (Terms, Privacy Policy, licences) open from budgiesocial.com in Safari, over the app
      if (own && /\.html$/.test(url.pathname) && !/\/index\.html$/.test(url.pathname)) {
        e.preventDefault();
        post('open', { url: SITE + url.pathname.replace(/^\//, '') + url.hash });
        return;
      }
      if (own || isBudgie(url)) {
        const hash = own ? url.hash : url.hash || '#/';
        if ((e.metaKey || e.button === 1) && /^#\//.test(hash)) {
          e.preventDefault();
          post('window', { hash });
          return;
        }
        if (!own) {
          e.preventDefault();
          location.hash = hash;
        }
        return;
      }
      if (!/^(https?|mailto|tel):$/.test(url.protocol)) return;
      e.preventDefault();
      post('open', { url: url.href });
    },
    true
  );
  // the middle button doesn't make a click
  document.addEventListener('auxclick', (e) => {
    const a = e.button === 1 && e.target.closest && e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    post('window', { hash: a.getAttribute('href') });
  });
  const openWindow = window.open;
  window.open = (url, target, features) => {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) return post('open', { url: u.href }), null;
    } catch (_) {
      /* as it was */
    }
    return openWindow.call(window, url, target, features);
  };

  // ---- commands from the menu bar, the keyboard, Siri and the Home Screen ---------------------------------------
  const press = (selector) => {
    const el = document.querySelector(selector);
    if (el) el.click();
    return !!el;
  };
  on('go', ({ hash }) => {
    if (typeof hash === 'string' && /^#\//.test(hash)) location.hash = hash;
  });
  on('action', ({ name }) => {
    if (name === 'new-post') location.hash = '#/submit';
    else if (name === 'search') press('[data-act="search"]') || (location.hash = '#/search');
    else if (name === 'back') history.back();
    else if (name === 'forward') history.forward();
    else if (name === 'escape') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  // the server is asked what's new: a notification came, or the app came back
  const sync = () => window.Nook && Nook.store && Nook.store.sync && Nook.store.sync();
  on('sync', sync);

  // ---- where you are: for Handoff and the window's title ----------------------------------------------------------
  let lastPlace = '';
  function place() {
    const hash = location.hash || '#/';
    const title = document.title || 'Budgie';
    const now = hash + '\n' + title;
    if (now === lastPlace) return;
    lastPlace = now;
    post('route', { hash, title });
  }
  addEventListener('hashchange', () => setTimeout(place, 150));
  new MutationObserver(() => setTimeout(place, 50)).observe(document.querySelector('title') || html, { childList: true, subtree: true, characterData: true });

  // ---- light or dark: the status bar, the window and the sheets follow the app's colours ------------------------
  let lastLook = '';
  function look() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = (meta && meta.content) || getComputedStyle(document.body || html).backgroundColor;
    let rgb = [255, 255, 255];
    if (/^#[\da-f]{6}$/i.test(color)) rgb = color.slice(1).match(/../g).map((x) => parseInt(x, 16));
    else if (/\d/.test(color)) rgb = (String(color).match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const dark = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 <= 0.55;
    const hex = '#' + rgb.map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
    if (hex + dark === lastLook) return;
    lastLook = hex + dark;
    post('theme', { dark, color: hex });
  }
  new MutationObserver(look).observe(html, { subtree: true, attributes: true, attributeFilter: ['content', 'class', 'data-theme', 'style'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', look);

  // ---- the badge on the app's icon: unread messages and inbox ---------------------------------------------------
  let lastBadge = -1;
  function badge() {
    const s = window.Nook && Nook.store;
    if (!s || !s.unread || !s.unreadMessages) return;
    let count = 0;
    try {
      count = signedIn() ? s.unread() + s.unreadMessages() : 0;
    } catch (_) {
      return;
    }
    if (count === lastBadge) return;
    lastBadge = count;
    post('badge', { count });
  }
  setInterval(badge, 2500);
  document.addEventListener('visibilitychange', badge);

  // ---- notifications -----------------------------------------------------------------------------------------------
  const api = () => {
    let saved = '';
    try {
      saved = localStorage.getItem('nook-api') || '';
    } catch (_) {
      /* the configured one */
    }
    return String(saved || (window.NOOK_CONFIG && window.NOOK_CONFIG.api) || '').replace(/\/$/, '');
  };
  function signedIn() {
    try {
      return localStorage.getItem('nook-token') || '';
    } catch (_) {
      return '';
    }
  }
  const language = () => (window.Nook && Nook.i18n && Nook.i18n.lang) || 'en';
  // the sign-in, for replying to a message right from its notification while Budgie is closed (kept in the
  // Keychain, on this device only)
  let lastSession = null;
  function session() {
    const now = signedIn() + ' ' + api();
    if (now === lastSession) return;
    lastSession = now;
    post('session', { token: signedIn(), api: api() });
  }
  let device = null; // { token, platform, sandbox } from Apple, through the Swift side
  let sentFor = '';
  async function tell() {
    const token = signedIn();
    const lang = language();
    if (!device || !token) return;
    const key = [token, device.token, lang].join(' ');
    if (sentFor === key) return;
    try {
      const res = await fetch(api() + '/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ token: device.token, platform: device.platform, sandbox: !!device.sandbox, lang }),
      });
      if (res.ok) sentFor = key;
    } catch (_) {
      /* next time the app opens */
    }
  }
  on('pushToken', (d) => {
    if (typeof d.token !== 'string' || !d.token) return;
    device = { token: d.token, platform: d.platform === 'macos' ? 'macos' : 'ios', sandbox: !!d.sandbox };
    tell();
  });
  // tapped: open what it's about
  on('open', ({ href }) => {
    if (typeof href === 'string' && /^#\//.test(href)) location.hash = href;
  });
  // asked once, once someone has signed in and the app is showing, with a word first about what for (in the app's
  // six languages: these words are only in the Apple app, so they aren't in the website's language files)
  const ASK = {
    en: ['Get notified?', 'Budgie can tell you when a friend messages or calls you, and when someone replies to you. You can turn them off in Settings at any time.', 'Not now', 'Turn on'],
    ro: ['Primești notificări?', 'Budgie îți poate spune când un prieten îți scrie sau te sună și când cineva îți răspunde. Le poți opri oricând din Configurări.', 'Nu acum', 'Pornește'],
    es: ['¿Quieres recibir avisos?', 'Budgie puede avisarte cuando un amigo te escribe o te llama, y cuando alguien te responde. Puedes desactivarlos en Ajustes cuando quieras.', 'Ahora no', 'Activar'],
    fr: ['Recevoir des notifications ?', 'Budgie peut te prévenir quand un ami t’écrit ou t’appelle, et quand quelqu’un te répond. Tu peux les désactiver à tout moment dans Réglages.', 'Pas maintenant', 'Activer'],
    de: ['Mitteilungen erhalten?', 'Budgie kann dir Bescheid geben, wenn dir ein Freund schreibt oder dich anruft und wenn dir jemand antwortet. Du kannst sie jederzeit in den Einstellungen ausschalten.', 'Nicht jetzt', 'Einschalten'],
    it: ['Vuoi ricevere notifiche?', 'Budgie può avvisarti quando un amico ti scrive o ti chiama, e quando qualcuno ti risponde. Puoi disattivarle in qualsiasi momento in Impostazioni.', 'Non ora', 'Attiva'],
  };
  const showing = () =>
    new Promise((resolve) => {
      const started = Date.now();
      (function check() {
        if (!html.classList.contains('gated')) return resolve(true);
        if (!signedIn() || Date.now() - started > 60000) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  async function ask() {
    if (!APPLE.push || !signedIn() || !(await showing())) return;
    const now = await post('push', { action: 'status' });
    if (!now) return;
    if (now.permission === 'granted') return post('push', { action: 'register' });
    if (now.permission === 'denied') return;
    try {
      if (localStorage.getItem('nook-push-asked')) return;
      localStorage.setItem('nook-push-asked', '1');
    } catch (_) {
      return;
    }
    const say = ASK[language()] || ASK.en;
    const yes =
      window.M3 && M3.dialog
        ? await M3.dialog({
            headline: say[0],
            symbol: 'notifications_active',
            iconShape: 'cookie9',
            body: say[1],
            actions: [
              { label: say[2], value: false },
              { label: say[3], value: true, variant: 'filled' },
            ],
          })
        : true;
    if (yes) post('push', { action: 'ask' });
  }
  // signing in (or out) is the app writing its token: it's noticed here
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (this !== localStorage || (key !== 'nook-token' && key !== 'nook-api')) return;
    setTimeout(session, 50);
    if (key === 'nook-token' && value) setTimeout(() => (device ? tell() : ask()), 1500);
  };
  const removeItem = Storage.prototype.removeItem;
  Storage.prototype.removeItem = function (key) {
    removeItem.call(this, key);
    if (this === localStorage && key === 'nook-token') setTimeout(session, 50);
  };

  // ---- the robot check on sign-up ------------------------------------------------------------------------------
  // The sign-up form loads Cloudflare Turnstile into the page. Here, it gets a stand-in with the same few calls
  // (render, getResponse, reset): a button that opens the real check on budgiesocial.com in a sheet over the app.
  const widgets = {};
  let widgets_n = 0;
  const CHECK = {
    en: ['Verify you’re human', 'Success!', 'Try the check again'],
    ro: ['Verifică faptul că ești om', 'Gata!', 'Încearcă verificarea din nou'],
    es: ['Verifica que eres humano', '¡Listo!', 'Vuelve a intentar la verificación'],
    fr: ['Vérifie que tu es humain', 'C’est bon !', 'Réessaie la vérification'],
    de: ['Bestätige, dass du ein Mensch bist', 'Erledigt!', 'Prüfung noch mal versuchen'],
    it: ['Verifica di essere umano', 'Fatto!', 'Riprova la verifica'],
  };
  const turnstile = {
    render(slot, options) {
      const el = typeof slot === 'string' ? document.querySelector(slot) : slot;
      const id = 'w' + ++widgets_n;
      const w = (widgets[id] = { el, options: options || {}, answer: '' });
      const words = CHECK[language()] || CHECK.en;
      const draw = (state) => {
        if (!el) return;
        el.innerHTML =
          state === 'done'
            ? `<div class="apple-check done" role="status"><span class="m3-icon" aria-hidden="true">check_circle</span>${words[1]}</div>`
            : `<button type="button" class="m3-btn tonal apple-check"><span class="m3-icon" aria-hidden="true">verified_user</span>${state === 'again' ? words[2] : words[0]}</button>`;
        const b = el.querySelector('button');
        if (b) b.addEventListener('click', check);
      };
      async function check() {
        const theme = lastLook.endsWith('true') ? 'dark' : 'light';
        const got = await post('captcha', { sitekey: w.options.sitekey || '', theme });
        if (got && typeof got.answer === 'string' && got.answer) {
          w.answer = got.answer;
          draw('done');
          if (typeof w.options.callback === 'function') w.options.callback(got.answer);
        } else {
          draw('again');
          if (got && got.error && got.error !== 'cancelled' && typeof w.options['error-callback'] === 'function') w.options['error-callback']();
        }
      }
      w.draw = draw;
      draw('ask');
      return id;
    },
    getResponse: (id) => (widgets[id] && widgets[id].answer) || '',
    reset(id) {
      const w = widgets[id];
      if (!w) return;
      w.answer = '';
      w.draw('ask');
    },
    remove(id) {
      delete widgets[id];
    },
  };
  // the sign-up form asks for Cloudflare's script: it gets the stand-in instead, as if the script had loaded
  const append = Node.prototype.appendChild;
  Node.prototype.appendChild = function (child) {
    if (child && child.tagName === 'SCRIPT' && /^https:\/\/challenges\.cloudflare\.com\/turnstile\//.test(child.src || '')) {
      const ready = new URL(child.src).searchParams.get('onload');
      window.turnstile = turnstile;
      setTimeout(() => typeof window[ready] === 'function' && window[ready](), 0);
      return child;
    }
    return append.call(this, child);
  };

  // ---- iPhone Duo: half open like a laptop ----------------------------------------------------------------------
  // The Swift side says where the fold is (in the page's own pixels) while the phone is partly folded.
  on('fold', ({ folded, top, bottom }) => {
    const half = !!folded && top > 0 && bottom > top;
    html.classList.toggle('fold-tabletop', half);
    if (half) {
      html.style.setProperty('--fold-top', top + 'px');
      html.style.setProperty('--fold-height', bottom - top + 'px');
      html.style.setProperty('--below-fold', Math.max(0, innerHeight - bottom) + 'px');
    }
  });

  // ---- coming and going -------------------------------------------------------------------------------------------
  on('resume', () => {
    sync();
    tell();
    badge();
  });

  // for the build machine's checks: whether calls can use the camera here, and what the page shows
  if (APPLE.debug) {
    const errors = [];
    addEventListener('error', (e) => errors.push(String(e.message)));
    setTimeout(
      () =>
        post('debug', {
          info: {
            secure: window.isSecureContext,
            media: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
            origin: location.origin,
            api: api(),
            signedIn: !!signedIn(),
            gated: html.classList.contains('gated'),
            title: document.title,
            hash: location.hash,
            width: innerWidth,
            height: innerHeight,
            errors,
          },
        }),
      9000
    );
  }

  // the app has decided what to show: tell the Swift side, then ask about notifications
  function ready() {
    const gated = html.classList.contains('gated');
    if (!document.querySelector('#main') && performance.now() < 6000) return setTimeout(ready, 120);
    post('ready', { gated });
    look();
    place();
    session();
    badge();
    if (signedIn()) ask();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ready, 60));
  else setTimeout(ready, 60);
})();
