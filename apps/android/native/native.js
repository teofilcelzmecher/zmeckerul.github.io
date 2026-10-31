// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie for Android: the phone's own haptics, notifications, back button, system bars, share sheet and links,
 * around Budgie's screens. Only the Android app loads this (apps/android/tools/build-www.py puts it in the page's
 * list of scripts, right after js/config.js), so the website never changes for it, and none of the app's own code
 * knows about Android: this file meets it where the browser would have been.
 *
 *   haptics        the app's navigator.vibrate(…) buzzes become the phone's haptic taps
 *   notifications  messages, calls and replies, pushed by the server through Firebase Cloud Messaging; tapping
 *                  one opens the chat or post it's about
 *   back button    closes what's open (a menu, a dialog, the call screen), then goes back, then leaves
 *   system bars    their icons light or dark, to suit the app's colours
 *   share, links   the phone's share sheet; links to Budgie read budgiesocial.com, not the app's own address;
 *                  links to other sites open in the browser
 */
(function () {
  'use strict';
  const Cap = window.Capacitor;
  if (!Cap || !Cap.isNativePlatform || !Cap.isNativePlatform()) return;
  const plugin = (name) => (Cap.registerPlugin ? Cap.registerPlugin(name) : Cap.Plugins[name]);
  const App = plugin('App');
  const Haptics = plugin('Haptics');
  const Push = plugin('PushNotifications');
  const Share = plugin('Share');
  const Browser = plugin('Browser');
  const SplashScreen = plugin('SplashScreen');
  const SystemBars = plugin('SystemBars');
  const quiet = (p) => p && p.catch && p.catch(() => {});

  // the address people know: what's shared and copied points there, not at the app's own
  const SITE = 'https://budgiesocial.com/';
  const forSharing = (text) => (typeof text === 'string' ? text.split(location.origin + '/').join(SITE) : text);

  // ---- haptics ---------------------------------------------------------------------------------------------
  // The app asks for buzzes in milliseconds, as a browser would: short ones are taps of rising strength, a pattern
  // is its taps in time, and anything long is a real vibration.
  function tap(ms) {
    if (ms <= 0) return;
    if (ms > 30) return quiet(Haptics.vibrate({ duration: Math.min(ms, 1000) }));
    quiet(Haptics.impact({ style: ms <= 6 ? 'LIGHT' : ms <= 10 ? 'MEDIUM' : 'HEAVY' }));
  }
  const vibrate = (pattern) => {
    const steps = Array.isArray(pattern) ? pattern : [pattern];
    let at = 0;
    steps.forEach((ms, i) => {
      ms = Number(ms) || 0;
      if (i % 2 === 0) setTimeout(() => tap(ms), at);
      at += ms;
    });
    return true;
  };
  try {
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
  } catch (_) {
    /* left as it was */
  }

  // ---- sharing and links -------------------------------------------------------------------------------------
  try {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data = {}) =>
        Share.share({ title: data.title, text: forSharing(data.text), url: forSharing(data.url), dialogTitle: 'Share' }).then(() => undefined),
    });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
  } catch (_) {
    /* left as it was */
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    const write = navigator.clipboard.writeText.bind(navigator.clipboard);
    navigator.clipboard.writeText = (text) => write(forSharing(text));
  }
  // a link to another site opens in the browser (a tab over the app), not in place of Budgie
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
      if (url.origin === location.origin || !/^https?:$/.test(url.protocol)) return;
      e.preventDefault();
      // budgiesocial.com's own pages are in the app already
      if (url.hostname === 'budgiesocial.com' || url.hostname === 'www.budgiesocial.com') {
        location.href = location.origin + url.pathname + url.search + url.hash;
        return;
      }
      quiet(Browser.open({ url: url.href }));
    },
    true
  );
  const openWindow = window.open;
  window.open = (url, target, features) => {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin && /^https?:$/.test(u.protocol)) return quiet(Browser.open({ url: u.href })), null;
    } catch (_) {
      /* as it was */
    }
    return openWindow.call(window, url, target, features);
  };

  // ---- the back button ------------------------------------------------------------------------------------------
  const shown = (el) => el && el.getClientRects().length > 0;
  quiet(
    App.addListener('backButton', () => {
      // an open menu
      const menu = [...document.querySelectorAll('.m3-menu')].filter(shown).pop();
      if (menu) {
        (document.activeElement || menu).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        if (shown(menu)) menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      // the topmost dialog or sheet, closed as Esc would
      const dialog = [...document.querySelectorAll('dialog[open]')].pop();
      if (dialog) {
        if (dialog.dispatchEvent(new Event('cancel', { cancelable: true }))) dialog.close();
        return;
      }
      // a call on the whole screen: back to Budgie, and the call carries on in its bar
      const call = document.querySelector('.call-screen:not([hidden])');
      const min = call && call.querySelector('[data-call="min"]');
      if (min) return min.click();
      // a text box being typed in: the keyboard goes first (Android does that itself), then this
      if (location.hash && location.hash !== '#/' && location.hash !== '#' && history.length > 1) return history.back();
      quiet(App.minimizeApp());
    })
  );

  // ---- system bars: their icons dark on light colours and light on dark ones -----------------------------------
  let barStyle = '';
  function bars() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = (meta && meta.content) || getComputedStyle(document.body || document.documentElement).backgroundColor;
    const rgb = String(color).match(/[\da-f]{2}/gi) && color.startsWith('#') ? color.slice(1).match(/../g).map((x) => parseInt(x, 16)) : (String(color).match(/\d+/g) || [255, 255, 255]).map(Number);
    const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
    const style = light ? 'LIGHT' : 'DARK'; // LIGHT: for a light background (dark icons)
    if (style === barStyle) return;
    barStyle = style;
    quiet(SystemBars.setStyle({ style }));
  }
  new MutationObserver(bars).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['content', 'class', 'data-theme', 'style'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', bars);

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
  const signedIn = () => {
    try {
      return localStorage.getItem('nook-token') || '';
    } catch (_) {
      return '';
    }
  };
  const language = () => (window.Nook && Nook.i18n && Nook.i18n.lang) || 'en';
  let deviceToken = '';
  let sentFor = ''; // the sign-in and language this device's token was last given to the server with
  async function tell() {
    const token = signedIn();
    const lang = language();
    if (!deviceToken || !token || sentFor === [token, deviceToken, lang].join(' ')) return;
    try {
      const res = await fetch(api() + '/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ token: deviceToken, platform: 'android', lang }),
      });
      if (res.ok) sentFor = [token, deviceToken, lang].join(' ');
    } catch (_) {
      /* next time the app opens */
    }
  }
  async function channels() {
    // each can be silenced on its own in Android's settings
    for (const c of [
      { id: 'messages', name: 'Messages', description: 'Messages from friends and in your groups', importance: 4, vibration: true },
      { id: 'calls', name: 'Calls', description: 'Someone calling you', importance: 5, vibration: true },
      { id: 'activity', name: 'Replies and more', description: 'Replies, mentions, friend requests and news from Budgie', importance: 3 },
    ])
      await quiet(Push.createChannel(Object.assign({ visibility: 1, lights: true, lightColor: '#6750A4' }, c)));
  }
  // push needs Firebase's file for this app in the build (android/app/google-services.json): without it, asking for
  // a token would stop the app, so the build says whether it's there
  const PUSH = window.BUDGIE_PUSH === true;
  async function register() {
    if (!PUSH) return;
    const now = await Push.checkPermissions().catch(() => null);
    if (!now || now.receive !== 'granted') return;
    await quiet(Push.register());
  }
  // asked once, once someone has signed in, with a word first about what for (in the app's six languages: these
  // words are only in the Android app, so they aren't in the website's language files)
  const ASK = {
    en: ['Get notified?', 'Budgie can tell you when a friend messages or calls you, and when someone replies to you. You can turn each kind off in Android’s settings.', 'Not now', 'Turn on'],
    ro: ['Primești notificări?', 'Budgie îți poate spune când un prieten îți scrie sau te sună și când cineva îți răspunde. Poți opri fiecare tip din setările Android.', 'Nu acum', 'Pornește'],
    es: ['¿Quieres recibir avisos?', 'Budgie puede avisarte cuando un amigo te escribe o te llama, y cuando alguien te responde. Puedes desactivar cada tipo en los ajustes de Android.', 'Ahora no', 'Activar'],
    fr: ['Recevoir des notifications ?', 'Budgie peut te prévenir quand un ami t’écrit ou t’appelle, et quand quelqu’un te répond. Tu peux désactiver chaque type dans les réglages d’Android.', 'Pas maintenant', 'Activer'],
    de: ['Benachrichtigungen erhalten?', 'Budgie kann dir Bescheid geben, wenn dir ein Freund schreibt oder dich anruft und wenn dir jemand antwortet. Jede Art kannst du in den Android-Einstellungen ausschalten.', 'Nicht jetzt', 'Einschalten'],
    it: ['Vuoi ricevere notifiche?', 'Budgie può avvisarti quando un amico ti scrive o ti chiama, e quando qualcuno ti risponde. Puoi disattivare ogni tipo nelle impostazioni di Android.', 'Non ora', 'Attiva'],
  };
  // the app itself on the screen, not the welcome page (a question over that would be hidden), for up to a minute
  const showing = () =>
    new Promise((resolve) => {
      const started = Date.now();
      (function check() {
        if (!document.documentElement.classList.contains('gated')) return resolve(true);
        if (!signedIn() || Date.now() - started > 60000) return resolve(false);
        setTimeout(check, 250);
      })();
    });
  async function ask() {
    if (!PUSH || !(await showing())) return;
    const now = await Push.checkPermissions().catch(() => null);
    if (!now) return;
    if (now.receive === 'granted') return register();
    if (now.receive === 'denied') return;
    try {
      if (localStorage.getItem('nook-push-asked')) return;
      localStorage.setItem('nook-push-asked', '1');
    } catch (_) {
      return;
    }
    const say = ASK[language()] || ASK.en;
    const yes = window.M3 && M3.dialog
      ? await M3.dialog({
          headline: say[0],
          symbol: 'notifications_active',
          iconShape: 'cookie9',
          body: say[1],
          actions: [{ label: say[2], value: false }, { label: say[3], value: true, variant: 'filled' }],
        })
      : true;
    if (!yes) return;
    const got = await Push.requestPermissions().catch(() => null);
    if (got && got.receive === 'granted') register();
  }
  quiet(Push.addListener('registration', (t) => ((deviceToken = t.value), tell())));
  // tapped: open what it's about
  quiet(
    Push.addListener('pushNotificationActionPerformed', (action) => {
      const data = (action && action.notification && action.notification.data) || {};
      if (typeof data.href === 'string' && data.href.startsWith('#/')) location.hash = data.href;
    })
  );
  // one that comes while Budgie is open: the app shows it its own way, so it's just brought up to date
  quiet(Push.addListener('pushNotificationReceived', () => window.Nook && Nook.store && Nook.store.sync && Nook.store.sync()));
  // signing in (or out) is the app writing its token: it's noticed here
  const setItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    setItem.call(this, key, value);
    if (this === localStorage && key === 'nook-token' && value) setTimeout(() => (deviceToken ? tell() : ask()), 1500);
  };

  // ---- coming and going -------------------------------------------------------------------------------------------
  quiet(
    App.addListener('resume', () => {
      // what's on the lock screen has been seen now
      quiet(Push.removeAllDeliveredNotifications());
      if (window.Nook && Nook.store && Nook.store.sync) Nook.store.sync();
      tell();
    })
  );

  // the splash screen goes once the app has decided what to show (the welcome page, or the app)
  function ready() {
    const gated = document.documentElement.classList.contains('gated');
    if (gated && performance.now() < 6000) return setTimeout(ready, 120);
    quiet(SplashScreen.hide({ fadeOutDuration: 250 }));
    bars();
    channels().then(() => (signedIn() ? ask() : null));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(ready, 60));
  else setTimeout(ready, 60);
})();
