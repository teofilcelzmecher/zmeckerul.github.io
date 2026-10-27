/*
 * Early access: Nook opens only for people with an invite code. This file
 * holds salted hashes of the codes, never the codes themselves, and starts
 * the app once a code matches. A device that has been let in stays in until
 * its code is taken off the list. It keeps casual visitors out; it is not a
 * lock against someone determined, so nothing secret should sit behind it.
 */
(function () {
  'use strict';

  const SALT = 'nook-early-access:';
  const INVITES = [
    '7580ebc9df02d92cb9a8ccd74fb5d1bd4e500cca6ad389d43767c55fe9d9e99d',
    'bb88f0fcb381bf4dace717308cdf3203a197a8c493323c25e3b4f415fb19d08f',
    '7617ea9e0054673d99eee8a9ac4df99482cdb99d361c300d0df8221aa1c16276',
    '7e652a8edd658fae10343a650f33c7ed655e6307558151fffcd7bd9bb48fb994',
    'eb34ada67a08ab54b073a30d4bd682addf0bc15ba0a2097c694d3b6da659ec0a',
    'f1108836d453aaf470c488891272c4cc34223da6f79320671747be802208924c',
    '6705cabfd0cff4795cdd95fff56f825ef7c891eab1719ceee75cd610a821fbd4',
    '4744902e99db7fdc884ca8d2065746035b315e86a18e1873e417f9adbe9ac906',
  ];
  const KEY = 'nook-access';
  const APP = ['js/data.js', 'js/store.js', 'js/ui.js', 'js/fx.js', 'js/views.js', 'js/app.js'];
  const LENGTH = 6;
  const TRIES = 5; // wrong codes in a row before a short wait
  const WAIT = 30;

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch (_) {}
  };
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  async function hash(code) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT + code));
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // the app's scripts run in order, as if they had been on the page all along
  function boot() {
    document.documentElement.classList.remove('gated');
    for (const src of APP) {
      const script = document.createElement('script');
      script.src = src;
      script.async = false;
      document.body.appendChild(script);
    }
  }

  if (INVITES.includes(read(KEY))) {
    boot();
    return;
  }

  const gate = document.createElement('div');
  gate.className = 'gate';
  gate.setAttribute('role', 'dialog');
  gate.setAttribute('aria-modal', 'true');
  gate.setAttribute('aria-labelledby', 'gate-title');
  gate.innerHTML =
    '<form class="gate-card" novalidate>' +
    '<m3-shape class="gate-shape" shape="cookie9" aria-hidden="true"></m3-shape>' +
    '<span class="gate-tag">Early access</span>' +
    '<h1 class="m3-title" id="gate-title">Welcome to nook</h1>' +
    '<p class="gate-text">Nook is invite-only for now. Enter the 6-digit code a friend gave you.</p>' +
    '<label class="gate-code">' +
    `<input id="gate-input" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="${LENGTH}" aria-label="Invite code" aria-describedby="gate-msg" spellcheck="false">` +
    '<span class="gate-cells" aria-hidden="true">' + '<span></span>'.repeat(LENGTH) + '</span></label>' +
    '<p class="gate-msg" id="gate-msg" role="status"></p>' +
    '<button class="m3-btn filled gate-go" type="submit" disabled><span class="m3-icon">arrow_forward</span>Enter Nook</button>' +
    '</form>';
  document.body.prepend(gate);
  document.title = 'Nook · Early access';

  const form = gate.querySelector('form');
  const input = gate.querySelector('#gate-input');
  const cells = [...gate.querySelectorAll('.gate-cells span')];
  const msg = gate.querySelector('#gate-msg');
  const go = gate.querySelector('.gate-go');
  const shape = gate.querySelector('.gate-shape');
  let wrong = 0;
  let waitUntil = 0;
  let checking = false;

  function paint() {
    const value = input.value;
    cells.forEach((cell, i) => {
      cell.textContent = value[i] || '';
      cell.classList.toggle('filled', i < value.length);
      cell.classList.toggle('here', document.activeElement === input && i === Math.min(value.length, LENGTH - 1));
    });
    go.disabled = value.length !== LENGTH || checking || Date.now() < waitUntil;
  }

  function shake() {
    if (still()) return;
    form.animate(
      [{ translate: '0' }, { translate: '-10px' }, { translate: '9px' }, { translate: '-6px' }, { translate: '4px' }, { translate: '0' }],
      { duration: 420, easing: 'ease-out' }
    );
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
      try {
        navigator.vibrate([20, 40, 20]);
      } catch (_) {}
    }
  }

  function countdown() {
    const left = Math.ceil((waitUntil - Date.now()) / 1000);
    if (left > 0) {
      msg.textContent = `Too many tries. Try again in ${left}s.`;
      setTimeout(countdown, 1000);
    } else {
      msg.textContent = '';
      wrong = 0;
      paint();
    }
  }

  async function check() {
    if (input.value.length !== LENGTH || checking || Date.now() < waitUntil) return;
    if (!window.crypto || !crypto.subtle) {
      msg.textContent = 'This page needs a secure (https) connection to check codes.';
      return;
    }
    checking = true;
    paint();
    const digest = await hash(input.value);
    checking = false;
    if (INVITES.includes(digest)) {
      write(KEY, digest);
      letIn();
      return;
    }
    wrong += 1;
    input.value = '';
    shake();
    if (wrong >= TRIES) {
      waitUntil = Date.now() + WAIT * 1000;
      countdown();
    } else {
      msg.textContent = 'That code doesn’t work. Check it and try again.';
    }
    paint();
    input.focus();
  }

  // let in: the shape blooms, the gate lifts, and Nook starts behind it
  function letIn() {
    msg.textContent = 'You’re in!';
    gate.classList.add('open');
    input.blur();
    if (shape.transitionTo) shape.transitionTo('heart', { spring: true });
    if (window.M3 && M3.burst) M3.burst(shape, 'play', { count: 12 });
    const done = () => {
      gate.remove();
      boot();
    };
    if (still()) return done();
    setTimeout(() => {
      const fade = gate.animate([{ opacity: 1 }, { opacity: 0, scale: 1.04 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
      fade.onfinish = done;
    }, 650);
  }

  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, LENGTH);
    if (msg.textContent && Date.now() >= waitUntil) msg.textContent = '';
    paint();
    if (input.value.length === LENGTH) check();
  });
  input.addEventListener('focus', paint);
  input.addEventListener('blur', paint);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    check();
  });
  paint();
  input.focus({ preventScroll: true });
})();
