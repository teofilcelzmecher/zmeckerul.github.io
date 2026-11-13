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
  const APP = ['js/data.js', 'js/achievements-data.js', 'js/hooks.js', 'js/store.js', 'js/ui.js', 'js/ads.js', 'js/moderation.js', 'js/fx.js', 'js/views.js', 'js/pickers.js', 'js/calls.js',
    'js/presence.js', 'js/achievements.js', 'js/rewards.js', 'js/stickers.js', 'js/social.js', 'js/blasts.js', 'js/channels.js', 'js/intro.js', 'js/app.js'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (name) => `<span translate="no" class="m3-icon" aria-hidden="true">${name}</span>`;

  // a symbol's name isn't words: whatever makes an icon, a page translator (like Google Translate) leaves it alone
  const untranslatable = (node) => {
    if (node.nodeType !== 1) return;
    if (node.classList.contains('m3-icon')) node.setAttribute('translate', 'no');
    for (const el of node.querySelectorAll('.m3-icon:not([translate])')) el.setAttribute('translate', 'no');
  };
  untranslatable(document.body);

  // the welcome page's language button (1.0): each language named in its own words
  const langBtn = document.getElementById('lang-btn');
  if (langBtn && Nook.i18n) {
    document.getElementById('lang-name').textContent = Nook.i18n.LANGS[Nook.i18n.lang];
    langBtn.addEventListener('click', () =>
      M3.menu(
        langBtn,
        Object.entries(Nook.i18n.LANGS).map(([code, name]) => ({ label: name, checked: code === Nook.i18n.lang, onSelect: () => Nook.i18n.choose(code) })),
        { placement: 'bottom-end' }
      )
    );
  }
  new MutationObserver((records) => {
    for (const r of records) for (const node of r.addedNodes) untranslatable(node);
  }).observe(document.body, { childList: true, subtree: true });

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

  const field = (id, label, type, extra = '', lead = '') =>
    `<label class="gate-field" for="${id}"><span>${label}</span><span class="gate-input">${lead ? icon(lead) : ''}<input class="m3-field" id="${id}" type="${type}" ${extra}></span><small class="gate-error" data-for="${id}"></small></label>`;
  const passwordField = (id, label, autocomplete, after = '') =>
    `<label class="gate-field" for="${id}"><span>${label}</span><span class="gate-input gate-pass">${icon('lock')}<input class="m3-field" id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" maxlength="200" required>` +
    `<button type="button" class="m3-icon-btn small" data-show="${id}" aria-label="Show password">${icon('visibility')}</button></span>${after}<small class="gate-error" data-for="${id}"></small></label>`;
  // up top, Budgie's shape, alive: it turns, and every few seconds becomes another (js: liven)
  const head = (title, text, shape = 'cookie9') =>
    `<div class="gate-hero" aria-hidden="true"><m3-shape class="gate-blob" shape="${shape}"></m3-shape><m3-shape class="gate-orbit o1" shape="flower"></m3-shape><m3-shape class="gate-orbit o2" shape="gem"></m3-shape></div>` +
    `<h1 class="m3-title" id="gate-title">${title}</h1>${text ? `<p class="gate-text">${text}</p>` : ''}`;
  const legal = '<p class="gate-legal"><a href="terms.html">Terms of Use</a> · <a href="privacy.html">Privacy Policy</a></p>';
  // signing in and joining are one tap apart
  const tabs = (on) =>
    `<div class="gate-switch" role="tablist" aria-label="Sign in or join"><button type="button" role="tab" aria-selected="${on === 'signin'}" data-go="signin">Sign in</button><button type="button" role="tab" aria-selected="${on === 'signup'}" data-go="signup">Join</button></div>`;
  const codeBoxes = (id, label) =>
    `<div class="gate-field"><span id="${id}-label">${label}</span><label class="gate-code">` +
    `<input id="${id}" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" aria-labelledby="${id}-label" spellcheck="false">` +
    '<span class="gate-cells" aria-hidden="true">' + '<span></span>'.repeat(6) + `</span></label><small class="gate-error" data-for="${id}"></small></div>`;

  const SCREENS = {
    signin: (o) =>
      `<form class="gate-card" novalidate>${head('Welcome back', o.message ? esc(o.message) : 'Good to see you again.')}${tabs('signin')}` +
      field('g-name', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required', 'alternate_email') +
      passwordField('g-pass', 'Password', 'current-password') +
      '<button type="button" class="gate-forgot" data-go="forgot">Forgot your password?</button>' +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('login')}Sign in</button>` +
      legal + '</form>',

    signup: (o) =>
      `<form class="gate-card" novalidate>${head('Join Budgie', o.message ? esc(o.message) : signup === 'invite' ? 'Budgie is invite-only right now. You’ll need the 6-digit code a friend gave you.' : 'Free, and no email needed. Pick a name and you’re in.', 'flower')}${tabs('signup')}` +
      (signup === 'invite' ? codeBoxes('g-invite', 'Invite code') : '') +
      field('g-name', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required aria-describedby="g-name-hint"', 'alternate_email') +
      '<small class="gate-hint" id="g-name-hint">3–20 letters, numbers or underscores. Everyone on Budgie sees it.</small>' +
      passwordField('g-pass', 'Password', 'new-password', '<span class="gate-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></span><small class="gate-meter-text" id="g-meter" aria-live="polite"></small>') +
      '<label class="gate-check"><input type="checkbox" id="g-terms"><span>I’m 13 or older (with a parent’s OK where my country asks for it), and I agree to the <a href="terms.html" target="_blank">Terms of Use</a> and the <a href="privacy.html" target="_blank">Privacy Policy</a>.</span></label>' +
      '<div class="gate-captcha" id="g-captcha" hidden><div class="gate-captcha-box"></div><small class="gate-error" data-for="g-captcha"></small></div>' +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('person_add')}Create account</button>` +
      '</form>',

    // two-step sign-in (1.6): the password was right; now the code from the authenticator app
    code: () =>
      `<form class="gate-card" novalidate>${head('Two-step sign-in', 'Open your authenticator app and type the 6-digit code it shows for Budgie.', 'gem')}` +
      codeBoxes('g-code', 'Code') +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('verified_user')}Sign in</button>` +
      '<p class="gate-links"><button type="button" class="link" data-go="forgot">Lost your phone? Use your recovery code</button><button type="button" class="link" data-go="signin">Back</button></p></form>',

    forgot: () =>
      `<form class="gate-card" novalidate>${head('Forgot your password?', 'Use the recovery code you saved when you joined. You’ll get a new one after.', 'clover4')}` +
      field('g-name', 'Username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required', 'alternate_email') +
      field('g-recovery', 'Recovery code', 'text', 'autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="XXXX-XXXX-XXXX-XXXX" maxlength="24" required', 'key') +
      passwordField('g-pass', 'New password', 'new-password') +
      '<p class="gate-msg" role="status"></p>' +
      `<button class="m3-btn filled gate-go" type="submit">${icon('lock_reset')}Reset password</button>` +
      '<p class="gate-links"><button type="button" class="link" data-go="signin">Back to sign in</button></p>' +
      '<p class="gate-hint">Lost the code too? Ask the person who runs Budgie to reset your password.</p></form>',

    recovery: (o) =>
      `<form class="gate-card" novalidate>${head('Save your recovery code', 'If you ever forget your password, this code gets you back in. It’s shown only now, so write it down or keep it in your password manager.', 'gem')}` +
      (o.twofaOff ? '<p class="gate-hint gate-note">Two-step sign-in is off now. You can turn it on again in Settings.</p>' : '') +
      `<output class="gate-recovery" id="g-code">${esc(o.code)}</output>` +
      `<button type="button" class="m3-btn tonal" data-copy>${icon('content_copy')}Copy code</button>` +
      '<label class="gate-check"><input type="checkbox" id="g-saved"><span>I’ve saved it somewhere safe.</span></label>' +
      `<button class="m3-btn filled gate-go" type="submit" disabled>${icon('arrow_forward')}Continue</button></form>`,

    offline: (o) =>
      o.network
        ? // the network is banned (1.4), not necessarily the person: they stay signed in, for when they're elsewhere
          `<div class="gate-card gate-network">${head('Not from this network', esc(o.message), 'softBoom')}<p class="gate-hint">This can happen on a network many people share, like mobile data, a school’s or a café’s. If you think it’s a mistake, contact Budgie.</p>` +
          `<button class="m3-btn filled gate-go" type="button" data-retry>${icon('refresh')}Try again</button>${legal}</div>`
        : `<div class="gate-card">${head(o.setup ? 'Almost there' : 'Can’t reach Budgie', o.setup ? 'Budgie’s server hasn’t been connected yet. Check back soon.' : esc(o.message || 'Budgie’s server isn’t answering. It may be restarting, or your connection may be down.'), 'pixelCircle')}` +
          (o.setup ? '' : `<button class="m3-btn filled gate-go" type="button" data-retry>${icon('refresh')}Try again</button>`) + legal + '</div>',
  };

  let shown = '';
  function show(name, options = {}) {
    const root = frame();
    const was = shown;
    shown = name;
    root.innerHTML = SCREENS[name](options);
    // the pill slides across when you switch between signing in and joining
    const pill = root.querySelector('.gate-switch');
    if (pill && (was === 'signin' || was === 'signup') && was !== name) pill.classList.add('from-' + was);
    liven(root);
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
    if (name === 'signup' && signup === 'invite') wireCode(root, '#g-invite');
    if (name === 'code') wireCode(root, '#g-code', () => submit('code', form));
    if (name === 'signup') {
      placeCaptcha(form);
      wireMeter(root);
    }
    if (name === 'recovery') wireRecovery(root, options);
    if (form && name !== 'recovery') form.addEventListener('submit', (e) => (e.preventDefault(), submit(name, form)));
    const first = root.querySelector('input:not([type=checkbox])');
    if (first && name !== 'recovery') first.focus({ preventScroll: true });
  }

  // Budgie's shape on these screens becomes another every few seconds (not for anyone who'd rather things kept still)
  const BLOBS = ['cookie9', 'flower', 'gem', 'clover4', 'softBurst', 'puffy', 'pixelCircle', 'heart'];
  function liven(root) {
    const blob = root.querySelector('.gate-blob');
    if (!blob || still()) return;
    let from = blob.getAttribute('shape');
    const morph = () => {
      if (!blob.isConnected) return;
      const to = BLOBS[(BLOBS.indexOf(from) + 1) % BLOBS.length];
      blob.setAttribute('morph-to', to);
      const t0 = performance.now();
      const frame = (t) => {
        if (!blob.isConnected) return;
        const k = Math.min(1, (t - t0) / 900);
        blob.morph = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        if (k < 1) return requestAnimationFrame(frame);
        blob.setAttribute('shape', to);
        blob.removeAttribute('morph-to');
        blob.morph = 0;
        from = to;
        setTimeout(morph, 2200);
      };
      requestAnimationFrame(frame);
    };
    setTimeout(morph, 1400);
  }

  // how hard a new password would be to guess, as you type it (the server also refuses the most used ones)
  function strength(pw, name) {
    if (!pw) return 0;
    if (pw.length < 8) return 1;
    const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
    let score = 1 + (pw.length >= 12 ? 1 : 0) + (pw.length >= 16 || (pw.length >= 12 && kinds >= 3) ? 1 : 0) + (kinds >= 3 && pw.length >= 10 ? 1 : 0);
    if (/^(.)\1+$/.test(pw) || /^(?:0123|1234|abcd|qwer|asdf|pass|budgie)/i.test(pw) || (name && name.length >= 3 && pw.toLowerCase().includes(name.toLowerCase()))) score = 1;
    return Math.min(4, Math.max(1, score));
  }
  const LEVELS = ['', 'Too easy to guess. A few random words work well.', 'Okay. A few random words work well.', 'Good', 'Strong'];
  function wireMeter(root) {
    const input = root.querySelector('#g-pass');
    const meter = root.querySelector('.gate-meter');
    const words = root.querySelector('#g-meter');
    const name = root.querySelector('#g-name');
    const paint = () => {
      const level = strength(input.value, name.value.trim());
      meter.dataset.level = level;
      words.textContent = !input.value ? '' : input.value.length < 8 ? 'At least 8 characters' : LEVELS[level];
    };
    input.addEventListener('input', paint);
    name.addEventListener('input', paint);
  }

  // a 6-digit code (an invite, or two-step sign-in): one real input over six boxes; done() once all six are in
  function wireCode(root, sel, done) {
    const input = root.querySelector(sel);
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
      if (done && input.value.length === 6) done();
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
  // the name and password while the code is asked for (only in memory, and only until signing in ends)
  let pending = null;
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
      if (!$('#g-terms').checked) return problem('', 'Tick the box to say you’re 13 or older and agree, to continue.');
      if (captcha && !captchaAnswer(form)) return problem('g-captcha', $('#g-captcha').dataset.widget === 'failed' ? CAPTCHA_BLOCKED : CAPTCHA_WAIT);
    } else if (name === 'code') {
      if (value('g-code').length !== 6) return problem('g-code', 'Type all 6 digits.');
    } else {
      if (!value('g-name')) return problem('g-name', 'Enter your username.');
      if (name === 'forgot' && !value('g-recovery')) return problem('g-recovery', 'Enter your recovery code.');
      if (!password) return problem('g-pass', name === 'forgot' ? 'Choose a new password.' : 'Enter your password.');
    }

    go.disabled = true;
    go.classList.add('busy');
    const glyph = go.querySelector('.m3-icon');
    const was = glyph ? glyph.textContent : '';
    if (glyph) glyph.textContent = 'progress_activity';
    busy = true;
    try {
      let result;
      if (name === 'signin') {
        pending = { name: value('g-name'), password };
        result = await api.post('/api/login', pending);
      }
      if (name === 'code') result = await api.post('/api/login', Object.assign({ code: value('g-code') }, pending));
      if (name === 'signup') result = await api.post('/api/signup', { invite: value('g-invite'), name: value('g-name'), password, age: true, terms: true, captcha: captcha ? captchaAnswer(form) : undefined });
      if (name === 'forgot') result = await api.post('/api/recover', { name: value('g-name'), recovery: value('g-recovery'), password });
      api.setToken(result.token);
      busy = false;
      pending = null;
      // a new account gets the welcome (js/intro.js) once the app is showing
      if (name === 'signup')
        try {
          localStorage.setItem('nook-intro', '1');
        } catch (_) {
          /* no welcome, then */
        }
      if (result.recovery) show('recovery', { code: result.recovery, twofaOff: result.twofaOff });
      else start();
    } catch (error) {
      go.disabled = false;
      go.classList.remove('busy');
      if (glyph) glyph.textContent = was;
      busy = false;
      // the password was right, and the account wants a code from its authenticator app
      if (error.twofa && name === 'signin') return show('code');
      if (name === 'code') {
        const box = $('#g-code');
        box.value = '';
        box.dispatchEvent(new Event('focus'));
      }
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
      const map = { invite: 'g-invite', name: 'g-name', password: 'g-pass', captcha: 'g-captcha', code: 'g-code' };
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
    // straight in (1.6): the skeleton is showing already, and stays until the app has drawn its first page
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
  }

  // the app's own files start coming the moment we know someone's signed in, alongside the request for what's on
  // Budgie (each was otherwise only asked for once that had arrived); they're then ready when it has
  let warmed = false;
  function warm() {
    if (warmed) return;
    warmed = true;
    for (const src of APP) fetch(src, { credentials: 'same-origin', priority: 'low' }).catch(() => {});
  }

  let starting = false;
  async function start() {
    if (starting || booted) return;
    if (!api.configured()) return show('offline', { setup: true });
    if (!api.signedIn()) return landing ? welcome() : show('signin');
    starting = true;
    // (1.6) the skeleton of the app shows meanwhile: from the first frame, or now, after signing in
    if (gate) gate.remove();
    gate = null;
    warm();
    try {
      const snapshot = await api.get('/api/bootstrap');
      boot(snapshot);
    } catch (error) {
      starting = false;
      if (error.network) show('offline', { network: true, message: error.message });
      else if (error.status === 401 || error.status === 403) {
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
