// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * The way in: sign in, create an account with an invite code, or get back in
 * with a recovery code. Once signed in, it fetches everything the app needs
 * from the server and only then starts the app's own scripts.
 */
(function () {
  'use strict';

  const api = window.Nook.api;
  const APP = ['js/data.js', 'js/store.js', 'js/ui.js', 'js/moderation.js', 'js/fx.js', 'js/views.js', 'js/app.js'];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (name) => `<span class="m3-icon" aria-hidden="true">${name}</span>`;

  let gate = null;

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

    signup: () =>
      `<form class="gate-card" novalidate>${head('Join Budgie', 'Budgie is invite-only for now. You’ll need the 6-digit code a friend gave you.')}` +
      '<div class="gate-field"><span id="g-invite-label">Invite code</span><label class="gate-code">' +
      '<input id="g-invite" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="6" aria-labelledby="g-invite-label" spellcheck="false">' +
      '<span class="gate-cells" aria-hidden="true">' + '<span></span>'.repeat(6) + '</span></label><small class="gate-error" data-for="g-invite"></small></div>' +
      field('g-name', 'Pick a username', 'text', 'autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="20" required aria-describedby="g-name-hint"') +
      '<small class="gate-hint" id="g-name-hint">3–20 letters, numbers or underscores. Everyone on Budgie sees it.</small>' +
      passwordField('g-pass', 'Password (at least 8 characters)', 'new-password') +
      '<label class="gate-check"><input type="checkbox" id="g-age"><span>I’m at least 13. Where my country requires it, a parent or guardian has said yes.</span></label>' +
      '<label class="gate-check"><input type="checkbox" id="g-terms"><span>I agree to the <a href="terms.html" target="_blank">Terms of Use</a> and the <a href="privacy.html" target="_blank">Privacy Policy</a>.</span></label>' +
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
    document.title = 'Budgie · Early access';
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
    if (name === 'signup') wireCode(root);
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
      if (value('g-invite').length !== 6) return problem('g-invite', 'Enter all 6 digits of your invite code.');
      if (!/^[A-Za-z0-9_]{3,20}$/.test(value('g-name'))) return problem('g-name', 'Use 3–20 letters, numbers or underscores.');
      if (password.length < 8) return problem('g-pass', 'Use at least 8 characters.');
      if (!$('#g-age').checked || !$('#g-terms').checked) return problem('', 'Please tick both boxes to continue.');
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
      if (name === 'signup') result = await api.post('/api/signup', { invite: value('g-invite'), name: value('g-name'), password, age: true, terms: true });
      if (name === 'forgot') result = await api.post('/api/recover', { name: value('g-name'), recovery: value('g-recovery'), password });
      api.setToken(result.token);
      busy = false;
      if (result.recovery) show('recovery', { code: result.recovery });
      else start();
    } catch (error) {
      go.disabled = false;
      busy = false;
      const map = { invite: 'g-invite', name: 'g-name', password: 'g-pass' };
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
    const leave = () => {
      if (gate) gate.remove();
      gate = null;
      document.documentElement.classList.remove('gated');
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
    if (!api.signedIn()) return show('signin');
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

  start();
})();
