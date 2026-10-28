// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * The way in: the welcome page for someone who isn't signed in, then sign in,
 * create an account (with an invite code, and a robot check, if the server asks
 * for them), or get back in with a recovery code. Once signed in, it fetches everything the app needs
 * from the server and only then starts the app's own scripts.
 */
(function () {
  'use strict';

  const api = window.Nook.api;
  const APP = ['js/data.js', 'js/store.js', 'js/ui.js', 'js/ads.js', 'js/moderation.js', 'js/fx.js', 'js/views.js', 'js/calls.js', 'js/app.js'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (name) => `<span class="m3-icon" aria-hidden="true">${name}</span>`;

  let gate = null;
  const landing = document.getElementById('landing');
  // open to everyone unless the server says it's invite-only (asked as soon as the page opens)
  let signup = 'open';
  // the Turnstile site key, when the server wants a robot check before making an account
  let captcha = '';

  function frame() {
    if (gate) return gate;
    gate = document.createElement('div');
    gate.className = 'gate';
    gate.setAttribute('role', 'dialog');
    gate.setAttribute('aria-modal', 'true');
    gate.setAttribute('aria-labelledby', 'gate-title');
    document.body.prepend(gate);
    return gate;
  }

  const field = (id, label, type, extra = '') =>
    `<label class="gate-field" for="${id}"><span>${label}</span><input class="m3-field" id="${id}" type="${type}" ${extra}><small class="gate-error" data-for="${id}"></small></label>`;
  const passwordField = (id, label, autocomplete) =>
    `<label class="gate-field" for="${id}"><span>${label}</span><span class="gate-pass"><input class="m3-field" id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="200" required>` +
    `<button type="button" class="m3-icon-btn small" data-show="${id}" aria-label="Show password">${icon('visibility')}</button></span><small class="gate-error" data-for="${id}"></small></label>`;
  const head = (title, text, shape = 'cookie9') =>
    `<m3-shape class="gate-shape" shape="${shape}" aria-hidden="true"></m3-shape><span class="gate-tag">Early access</span><h1 class="m3-title" id="gate-title">${title}</h1>${text ? `<p class="gate-text">${text}</p>` : ''}`;
  const legal = '<p class="gate-legal"><a href="terms.html">Terms of Use</a> · <a href="privacy.html">Privacy Policy</a></p>';

  const SCREENS = {
    signin: (o) =>
      `<form class="gate-card" novalidate>${head('Welcome back', o.message ? esc(o.message) : 'Sign in to Budgie.')}` +
      field('g-name', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required') +
      passwordField('g-pass', 'Password', 'current-password') +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('login')}Sign in</button>` +
      '<p class="gate-links"><button type="button" class="link" data-go="signup">New here? Create an account</button><button type="button" class="link" data-go="forgot">Forgot your password?</button></p>' +
      legal + '</form>',

    signup: (o) =>
      (signup === 'invite'
        ? `<form class="gate-card" novalidate>${head('Join Budgie', o.message ? esc(o.message) : 'Budgie is invite-only right now. You’ll need the 6-digit code a friend gave you.')}` +
          '<div class="gate-field"><span id="g-invite-label">Invite code</span><label class="gate-code">' +
          '<input id="g-invite" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" aria-labelledby="g-invite-label" spellcheck="false">' +
          '<span class="gate-cells" aria-hidden="true">' + '<span></span>'.repeat(6) + '</span></label><small class="gate-error" data-for="g-invite"></small></div>'
        : `<form class="gate-card" novalidate>${head('Join Budgie', 'Pick a username and a password, and you’re in.')}`) +
      field('g-name', 'Pick a username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required aria-describedby="g-name-hint"') +
      '<small class="gate-hint" id="g-name-hint">3–20 letters, numbers or underscores. Everyone on Budgie sees it.</small>' +
      passwordField('g-pass', 'Password (at least 8 characters)', 'new-password') +
      '<label class="gate-check"><input type="checkbox" id="g-age"><span>I’m at least 13. Where my country requires it, a parent or guardian has said yes.</span></label>' +
      '<label class="gate-check"><input type="checkbox" id="g-terms"><span>I agree to the <a href="terms.html" target="_blank">Terms of Use</a> and the <a href="privacy.html" target="_blank">Privacy Policy</a>.</span></label>' +
      '<div class="gate-captcha" id="g-captcha" hidden><div class="gate-captcha-box"></div><small class="gate-error" data-for="g-captcha"></small></div>' +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('person_add')}Create account</button>` +
      '<p class="gate-links"><button type="button" class="link" data-go="signin">Already have an account? Sign in</button></p></form>',

    forgot: () =>
      `<form class="gate-card" novalidate>${head('Forgot your password?', 'Use the recovery code you saved when you joined. You’ll get a new one after.', 'clover4')}` +
      field('g-name', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required') +
      field('g-recovery', 'Recovery code', 'text', 'autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="24" required') +
      passwordField('g-pass', 'New password', 'new-password') +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('lock_reset')}Reset password</button>` +
      '<p class="gate-links"><button type="button" class="link" data-go="signin">Back to sign in</button></p>' +
      '<p class="gate-hint">Lost the code too? Ask the person who runs Budgie to reset your password.</p></form>',

    recovery: (o) =>
      `<form class="gate-card" novalidate>${head('Save your recovery code', 'If you ever forget your password, this code gets you back in. It’s shown only now, so write it down or keep it in your password manager.', 'gem')}` +
      `<output class="gate-recovery" id="g-code">${esc(o.code)}</output>` +
      `<button type="button" class="m3-btn tonal" data-copy>${icon('content_copy')}Copy code</button>` +
      '<label class="gate-check"><input type="checkbox" id="g-saved"><span>I’ve saved it somewhere safe.</span></label>' +
      `<button class="m3-btn filled gate-go" type="submit" disabled>${icon('arrow_forward')}Continue</button></form>`,

    loading: () =>
      `<div class="gate-card">${head('Opening Budgie…', '')}<m3-loading aria-label="Loading"></m3-loading></div>`,

    offline: (o) =>
      `<div class="gate-card">${head(o.setup ? 'Almost there' : 'Can’t reach Budgie', o.setup ? 'Budgie’s server hasn’t been connected yet. Check back soon.' : esc(o.message || 'Budgie’s server isn’t answering. It may be restarting, or your connection may be down.'), 'pixelCircle')}` +
      (o.setup ? '' : `<button class="m3-btn filled gate-go" type="button" data-retry>${icon('refresh')}Try again</button>`) + legal + '</div>',
  };

  function show(name, options = {}) {
    const root = frame();
    root.innerHTML = SCREENS[name](options);
    // from the welcome page, a way back to it, in the card's corner (as a dialog's close button is)
    if (landing && landing.isConnected && ['signin', 'signup', 'forgot'].includes(name)) {
      root.querySelector('.gate-card').insertAdjacentHTML('afterbegin', `<button type="button" class="m3-icon-btn gate-back" aria-label="Back">${icon('arrow_back')}</button>`);
      root.querySelector('.gate-back').addEventListener('click', welcome);
    }
    document.title = 'Budgie';
    const form = root.querySelector('form');
    root.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => show(b.dataset.go)));
    root.querySelectorAll('[data-show]').forEach((b) =>
      b.addEventListener('click', () => {
        const input = root.querySelector('#' + b.dataset.show);
        const visible = input.type === 'text';
        input.type = visible ? 'password' : 'text';
        b.querySelector('.m3-icon').textContent = visible ? 'visibility' : 'visibility_off';
        b.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
      })
    );
    const retry = root.querySelector('[data-retry]');
    if (retry) retry.addEventListener('click', start);
    if (name === 'signup' && signup === 'invite') wireCode(root);
    if (name === 'signup') placeCaptcha(form);
    if (name === 'recovery') wireRecovery(root, options);
    if (form && name !== 'recovery') form.addEventListener('submit', (e) => (e.preventDefault(), submit(name, form)));
    const first = root.querySelector('input:not([type=checkbox])');
    if (first && name !== 'recovery') first.focus({ preventScroll: true });
  }

  // the invite code: one real input over six boxes, as before
  function wireCode(root) {
    const input = root.querySelector('#g-invite');
    const cells = [...root.querySelectorAll('.gate-cells span')];
    const paint = () =>
      cells.forEach((cell, i) => {
        cell.textContent = input.value[i] || '';
        cell.classList.toggle('filled', i < input.value.length);
        cell.classList.toggle('here', document.activeElement === input && i === Math.min(input.value.length, 5));
      });
    input.addEventListener('input', () => {
      input.value = input.value.replace(/\D/g, '').slice(0, 6);
      paint();
    });
    input.addEventListener('focus', paint);
    input.addEventListener('blur', paint);
    paint();
  }

  function wireRecovery(root, options) {
    const go = root.querySelector('.gate-go');
    root.querySelector('#g-saved').addEventListener('change', (e) => (go.disabled = !e.target.checked));
    root.querySelector('[data-copy]').addEventListener('click', async (e) => {
      try {
        await navigator.clipboard.writeText(options.code);
        e.currentTarget.innerHTML = icon('check') + 'Copied';
      } catch (_) {
        const range = document.createRange();
        range.selectNodeContents(root.querySelector('#g-code'));
        getSelection().removeAllRanges();
        getSelection().addRange(range);
      }
    });
    root.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      start();
    });
  }

  // ---- the robot check (Cloudflare Turnstile) -------------------------------------------------------
  // Cloudflare's script is only loaded once someone opens the sign-up form, and only when the server asks for it.
  // Usually it passes by itself ("Success!"); sometimes it asks for a tick.

  let turnstile = null;
  function loadTurnstile() {
    if (!turnstile) {
      turnstile = new Promise((resolve, reject) => {
        window.nookTurnstileReady = () => resolve(window.turnstile);
        const script = document.createElement('script');
        script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=nookTurnstileReady&render=explicit';
        script.async = true;
        script.onerror = () => {
          turnstile = null;
          reject(new Error('blocked'));
        };
        document.head.appendChild(script);
      });
    }
    return turnstile;
  }

  const CAPTCHA_WAIT = 'Wait for the robot check to say “Success!” (tick it if it asks).';
  const CAPTCHA_BLOCKED = 'The robot check couldn’t load. If something blocks challenges.cloudflare.com here (an ad blocker, say), allow it on Budgie, or try another browser.';
  const widgetOf = (form) => {
    const id = form.querySelector('#g-captcha').dataset.widget || '';
    return window.turnstile && id && id !== 'loading' && id !== 'failed' ? id : null;
  };

  async function placeCaptcha(form) {
    const box = form && form.querySelector('#g-captcha');
    if (!box || !captcha || box.dataset.widget) return;
    box.hidden = false;
    box.dataset.widget = 'loading';
    const error = box.querySelector('.gate-error');
    try {
      const api = await loadTurnstile();
      if (!box.isConnected) return;
      const slot = box.querySelector('.gate-captcha-box');
      box.dataset.widget = api.render(slot, {
        sitekey: captcha,
        theme: 'auto',
        // the box is 300 pixels wide; a narrow phone gets the tall, compact one
        size: slot.clientWidth && slot.clientWidth < 300 ? 'compact' : 'normal',
        // passing clears "wait for it"; why a try failed stays until the next one
        callback: () => {
          if (error.textContent === CAPTCHA_WAIT) error.textContent = '';
        },
        'error-callback': () => {
          error.textContent = 'The robot check hit a problem. It’ll try again; if it keeps failing, reload the page.';
        },
      });
    } catch (_) {
      box.dataset.widget = 'failed';
      error.textContent = CAPTCHA_BLOCKED;
    }
  }

  /** the answer Turnstile gave, or '' while it's still checking */
  function captchaAnswer(form) {
    const id = widgetOf(form);
    return id ? window.turnstile.getResponse(id) || '' : '';
  }

  function resetCaptcha(form) {
    const id = widgetOf(form);
    if (id) window.turnstile.reset(id);
  }

  function shake(form) {
    if (!still()) form.animate([{ translate: '0' }, { translate: '-10px' }, { translate: '9px' }, { translate: '-5px' }, { translate: '0' }], { duration: 380, easing: 'ease-out' });
  }

  let busy = false;
  async function submit(name, form) {
    if (busy) return;
    const $ = (sel) => form.querySelector(sel);
    const go = $('.gate-go');
    const msg = $('.gate-msg');
    form.querySelectorAll('.gate-error').forEach((el) => (el.textContent = ''));
    msg.textContent = '';
    const value = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
    const password = $('#g-pass') ? $('#g-pass').value : '';
    const problem = (id, text) => {
      const slot = form.querySelector(`.gate-error[data-for="${id}"]`);
      if (slot) slot.textContent = text;
      else msg.textContent = text;
      shake(form);
      const input = id && $('#' + id);
      if (input) input.focus();
    };

    if (name === 'signup') {
      if (signup === 'invite' && value('g-invite').length !== 6) return problem('g-invite', 'Enter all 6 digits of your invite code.');
      if (!/^[A-Za-z0-9_]{3,20}$/.test(value('g-name'))) return problem('g-name', 'Use 3–20 letters, numbers or underscores.');
      if (password.length < 8) return problem('g-pass', 'Use at least 8 characters.');
      if (!$('#g-age').checked || !$('#g-terms').checked) return problem('', 'Please tick both boxes to continue.');
      if (captcha && !captchaAnswer(form)) return problem('g-captcha', $('#g-captcha').dataset.widget === 'failed' ? CAPTCHA_BLOCKED : CAPTCHA_WAIT);
    } else {
      if (!value('g-name')) return problem('g-name', 'Enter your username.');
      if (name === 'forgot' && !value('g-recovery')) return problem('g-recovery', 'Enter your recovery code.');
      if (!password) return problem('g-pass', name === 'forgot' ? 'Choose a new password.' : 'Enter your password.');
    }

    go.disabled = true;
    busy = true;
    try {
      let result;
      if (name === 'signin') result = await api.post('/api/login', { name: value('g-name'), password });
      if (name === 'signup') result = await api.post('/api/signup', { invite: value('g-invite'), name: value('g-name'), password, age: true, terms: true, captcha: captcha ? captchaAnswer(form) : undefined });
      if (name === 'forgot') result = await api.post('/api/recover', { name: value('g-name'), recovery: value('g-recovery'), password });
      api.setToken(result.token);
      busy = false;
      if (result.recovery) show('recovery', { code: result.recovery });
      else start();
    } catch (error) {
      go.disabled = false;
      busy = false;
      // the owner switched invite codes on since this page opened: show the code boxes and say why
      if (error.field === 'invite' && signup !== 'invite') {
        signup = 'invite';
        return show('signup', { message: error.message });
      }
      if (error.field === 'captcha') {
        // the check was turned on after this page opened, or the answer ran out: a fresh box
        if (error.captcha && !captcha) {
          captcha = error.captcha;
          placeCaptcha(form);
        } else resetCaptcha(form);
      }
      const map = { invite: 'g-invite', name: 'g-name', password: 'g-pass', captcha: 'g-captcha' };
      problem(map[error.field] || '', error.message);
    }
  }

  // ---- starting the app ------------------------------------------------------------------------------

  let booted = false;
  function boot(snapshot) {
    // only ever once: a second start would run every button twice
    if (booted) return;
    booted = true;
    window.NOOK_BOOT = snapshot;
    // what the server can do decides what the app offers, so its version is known before anything draws
    if (snapshot.version) window.Nook.serverVersion = snapshot.version;
    const leave = () => {
      if (gate) gate.remove();
      gate = null;
      if (landing) landing.remove();
      clearInterval(cycle);
      document.documentElement.classList.remove('gated', 'visitor');
      for (const src of APP) {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        document.body.appendChild(script);
      }
    };
    if (!gate || still()) return leave();
    gate.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' }).onfinish = leave;
  }

  let starting = false;
  async function start() {
    if (starting || booted) return;
    if (!api.configured()) return show('offline', { setup: true });
    if (!api.signedIn()) return landing ? welcome() : show('signin');
    starting = true;
    // a quick start shows nothing; a slow one says what's happening
    const slow = setTimeout(() => show('loading'), gate ? 0 : 250);
    try {
      const snapshot = await api.get('/api/bootstrap');
      clearTimeout(slow);
      boot(snapshot);
    } catch (error) {
      clearTimeout(slow);
      starting = false;
      if (error.status === 401 || error.status === 403) {
        api.setToken(null);
        show('signin', { message: error.status === 403 ? error.message : '' });
      } else {
        show('offline', { message: error.offline ? '' : error.message });
      }
    }
  }

  // ---- the welcome page ------------------------------------------------------------------------------

  let wired = false;
  let cycle = 0;

  function welcome() {
    document.documentElement.classList.add('visitor');
    if (gate) gate.remove();
    gate = null;
    if (wired) return;
    wired = true;
    landing.querySelectorAll('[data-gate]').forEach((b) => b.addEventListener('click', () => show(b.dataset.gate)));
    const chips = [...landing.querySelectorAll('.nest-chip')];
    const shape = landing.querySelector('#landing-shape');
    const symbol = landing.querySelector('#landing-symbol');
    const name = landing.querySelector('#landing-name');
    const peekBox = landing.querySelector('#nest-peek');
    let wearing = 0;
    let paused = false;
    // a nest's colour becomes the whole page's, as it does in the app
    async function wear(seed) {
      const mine = ++wearing;
      try {
        const colors = await M3.color.scheme({ seed, dark: matchMedia('(prefers-color-scheme: dark)').matches, variant: 'tonalSpot' });
        if (mine === wearing && landing.isConnected) M3.color.apply(colors, landing);
      } catch (_) {
        /* the page keeps its own colours */
      }
    }
    function pick(chip) {
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const nest = chip.dataset;
      if (shape.transitionTo) shape.transitionTo(nest.shape, { spring: true });
      else shape.setAttribute('shape', nest.shape);
      symbol.textContent = nest.symbol;
      name.textContent = 'n/' + nest.nest;
      if (!still()) symbol.animate([{ scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      peek(nest);
      wear(nest.color);
    }
    // the panel under the nests: the nest's own description, and an example of a first post there
    function peek(nest) {
      if (!peekBox) return;
      const set = (id, text) => (peekBox.querySelector(id).textContent = text);
      set('#peek-title', nest.title);
      set('#peek-id', 'n/' + nest.nest);
      set('#peek-where', 'n/' + nest.nest);
      set('#peek-tag', nest.tagline);
      set('#peek-example', nest.example);
      const icon = peekBox.querySelector('#peek-icon');
      icon.setAttribute('shape', nest.shape);
      icon.setAttribute('symbol', nest.symbol);
      icon.style.setProperty('--m3-shape-icon-color', nest.color);
      if (!still()) peekBox.querySelector('.peek-post').animate([{ opacity: 0.3, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 360, easing: 'cubic-bezier(.2,1,.4,1)' });
    }
    // reading the panel holds the slideshow still
    if (peekBox) {
      const hold = (on) => () => (paused = on);
      ['pointerenter', 'focusin'].forEach((e) => peekBox.addEventListener(e, hold(true)));
      ['pointerleave', 'focusout'].forEach((e) => peekBox.addEventListener(e, hold(false)));
    }
    chips.forEach((chip) =>
      chip.addEventListener('click', () => {
        clearInterval(cycle);
        pick(chip);
      })
    );
    // on its own it shows off a nest every few seconds, until someone picks one
    if (!still()) {
      cycle = setInterval(() => {
        if (document.hidden || paused) return;
        const now = chips.findIndex((c) => c.getAttribute('aria-pressed') === 'true');
        pick(chips[(now + 1) % chips.length]);
      }, 4500);
    }
  }

  api
    .get('/api/health')
    .then((health) => {
      signup = health.signup === 'invite' || !health.signup ? 'invite' : 'open';
      Nook.serverVersion = health.version || '';
      captcha = health.captcha || '';
      if (gate) placeCaptcha(gate.querySelector('form'));
    })
    .catch(() => {});
  start();
})();
