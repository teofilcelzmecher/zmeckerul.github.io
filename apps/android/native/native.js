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
 *   back button    closes what's open (a menu, a dialog, the side menu, search, a picker, the call screen), then
 *                  goes back, then leaves
 *   system bars    their icons light or dark, to suit the colours under them (a call's are always dark)
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

  const language = () => (window.Nook && Nook.i18n && Nook.i18n.lang) || 'en';
  // the app's own words that Android shows (these are only in the Android app, so they aren't in the website's
  // language files): the share sheet's title, and the notification categories in Android's settings
  const WORDS = {
    en: { share: 'Share', messages: ['Messages', 'Messages from friends and in your groups'], calls: ['Calls', 'Someone calling you'], activity: ['Replies and more', 'Replies, mentions, friend requests and news from Budgie'] },
    ro: { share: 'Distribuie', messages: ['Mesaje', 'Mesaje de la prieteni și din grupurile tale'], calls: ['Apeluri', 'Cineva te sună'], activity: ['Răspunsuri și altele', 'Răspunsuri, mențiuni, cereri de prietenie și noutăți de la Budgie'] },
    es: { share: 'Compartir', messages: ['Mensajes', 'Mensajes de amigos y de tus grupos'], calls: ['Llamadas', 'Alguien te está llamando'], activity: ['Respuestas y más', 'Respuestas, menciones, solicitudes de amistad y novedades de Budgie'] },
    fr: { share: 'Partager', messages: ['Messages', 'Messages de tes amis et de tes groupes'], calls: ['Appels', 'Quelqu’un t’appelle'], activity: ['Réponses et plus', 'Réponses, mentions, demandes d’ami et nouvelles de Budgie'] },
    de: { share: 'Teilen', messages: ['Nachrichten', 'Nachrichten von Freunden und aus deinen Gruppen'], calls: ['Anrufe', 'Jemand ruft dich an'], activity: ['Antworten und mehr', 'Antworten, Erwähnungen, Freundschaftsanfragen und Neues von Budgie'] },
    it: { share: 'Condividi', messages: ['Messaggi', 'Messaggi dagli amici e dai tuoi gruppi'], calls: ['Chiamate', 'Qualcuno ti sta chiamando'], activity: ['Risposte e altro', 'Risposte, menzioni, richieste di amicizia e novità da Budgie'] },
  };
  const words = () => WORDS[language()] || WORDS.en;

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
        Share.share({ title: data.title, text: forSharing(data.text), url: forSharing(data.url), dialogTitle: words().share }).then(() => undefined),
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
      // the side menu, search, or the reaction or emoji picker: closed as Esc would close them on a computer
      if (document.querySelector('#drawer.open, .topbar.searching, .spark-picker, .emoji-picker')) {
        if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return;
      }
      // a call on the whole screen: as Esc would, a stream out of full screen (or the reactions closed) first, then
      // back to Budgie, and the call carries on in its bar
      const call = document.querySelector('.call-screen:not([hidden])');
      if (call && !call.classList.contains('ended')) return void call.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      // a text box being typed in: the keyboard goes first (Android does that itself), then this
      if (location.hash && location.hash !== '#/' && location.hash !== '#' && history.length > 1) return history.back();
      quiet(App.minimizeApp());
    })
  );

  // ---- system bars: their icons dark on light colours and light on dark ones -----------------------------------
  // A call (ringing, on the whole screen, or carrying on in its bar across the top) is always dark, whatever the
  // app's own colours; otherwise the app's theme colour says.
  const inCall = () => shown(document.querySelector('.call-ring')) || shown(document.querySelector('.call-screen:not([hidden])')) || document.documentElement.classList.contains('has-call-bar');
  let barStyle = '';
  function bars() {
    const meta = document.querySelector('meta[name="theme-color"]');
    const color = (meta && meta.content) || getComputedStyle(document.body || document.documentElement).backgroundColor;
    const rgb = String(color).match(/[\da-f]{2}/gi) && color.startsWith('#') ? color.slice(1).match(/../g).map((x) => parseInt(x, 16)) : (String(color).match(/\d+/g) || [255, 255, 255]).map(Number);
    const light = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255 > 0.55;
    const style = light && !inCall() ? 'LIGHT' : 'DARK'; // LIGHT: for a light background (dark icons)
    if (style === barStyle) return;
    barStyle = style;
    quiet(SystemBars.setStyle({ style }));
  }
  let barsSoon = 0;
  const barsLater = () => barsSoon || (barsSoon = requestAnimationFrame(() => ((barsSoon = 0), bars())));
  // the call's screens come and go (added, removed, hidden), and the theme colour changes with the page
  new MutationObserver(barsLater).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['content', 'class', 'data-theme', 'style', 'hidden'] });
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
    // (in the app's language; making a channel again with the same id renames it, so a new language shows next start)
    const w = words();
    for (const c of [
      { id: 'messages', name: w.messages[0], description: w.messages[1], importance: 4, vibration: true },
      { id: 'calls', name: w.calls[0], description: w.calls[1], importance: 5, vibration: true },
      { id: 'activity', name: w.activity[0], description: w.activity[1], importance: 3 },
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
  // and nothing else open over it for a moment: what the app shows as it starts (the day's streak) goes first, and a
  // sheet someone opened is finished with before anything is asked, for up to two minutes
  const settled = () =>
    new Promise((resolve) => {
      const started = Date.now();
      let clearSince = 0;
      (function check() {
        if (!signedIn() || Date.now() - started > 120000) return resolve(false);
        const clear = !document.documentElement.classList.contains('gated') && !document.querySelector('dialog[open]');
        clearSince = clear ? clearSince || Date.now() : 0;
        if (clearSince && Date.now() - clearSince >= 2500) return resolve(true);
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
    } catch (_) {
      return;
    }
    // the question opens straight after this (nothing can open in between)
    if (!(await settled())) return;
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
  // for Settings (1.6): whether this phone gets notifications, and turning them on after a "Not now"
  window.BudgieNotifications = {
    async state() {
      if (!PUSH) return 'unavailable';
      const now = await Push.checkPermissions().catch(() => null);
      if (!now) return 'unavailable';
      return now.receive === 'granted' ? 'on' : now.receive === 'denied' ? 'blocked' : 'off';
    },
    async turnOn() {
      if (!PUSH) return 'unavailable';
      const got = await Push.requestPermissions().catch(() => null);
      if (got && got.receive === 'granted') {
        await register();
        return 'on';
      }
      return got && got.receive === 'denied' ? 'blocked' : 'off';
    },
  };
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
