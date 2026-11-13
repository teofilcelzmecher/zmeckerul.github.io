// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nudges, and network bans on the Moderation page (Budgie 1.4).
 *
 * A nudge gets a friend's attention: the Nudge button on their profile (or Nudge in the More menu, there and in a
 * chat with them). A little waving hand flies from the button to their picture, which wobbles and sends out rings,
 * with a rising triple tap on a phone. The button's three dots are the nudges left this hour (the server counts:
 * three per friend), and once they're gone it says when the next one is.
 *
 * On the other end, with Budgie open, the nudge arrives over the live connection (or with the next check for news,
 * within 15 seconds): the screen gives a double shake, the friend's picture pops in at the top in a morphing halo
 * with a waving hand, and the phone buzzes twice. From there it's one tap to say hi, or to nudge them back. Reduced
 * motion and calm mode keep it to a card that fades in (and calm mode to a single soft buzz).
 *
 * For admins: on someone's profile, a Ban account and network button; on the Moderation page, the same by name and
 * the list of network bans, each with how long it has left and a way to lift it early. The server keeps only keyed
 * hashes of addresses, so nobody sees an address here, just how many networks a ban covers.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const store = Nook.store;
  const ui = Nook.ui;
  const api = Nook.api;
  const { esc, icon, avatar } = ui;
  const settings = () => store.state.settings;
  const say = (text) => (Nook.i18n ? Nook.i18n.t(text) : text);
  const fx = () => Nook.fx;
  const app = () => Nook.app;
  const calm = () => !!settings().calm;
  // things that move on their own hold still under reduced motion and in calm mode
  const still = () => ui.motionOff() || calm();
  const haptic = (pattern) => fx() && fx().haptic(pattern);
  const lower = (name) => String(name || '').toLowerCase();
  const nameFont = (u) => (ui.nameFont ? ui.nameFont(u).trim() : '');
  let off = false; // a server from before 1.4: no nudges here

  /** a layer over everything, an open sheet included (the top layer), that taps go through */
  function layer(className = '') {
    const el = document.createElement('div');
    el.className = 'social-layer ' + className;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    if (typeof el.showPopover === 'function') {
      try {
        el.setAttribute('popover', 'manual');
        el.showPopover();
      } catch (_) {
        el.removeAttribute('popover');
      }
    }
    return el;
  }
  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const minutes = (t) => Math.max(1, Math.ceil((t - Date.now()) / 60000));
  const waitWords = (t) => {
    const m = minutes(t);
    return m >= 60 ? 'an hour' : m === 1 ? 'a minute' : `${m} minutes`;
  };

  // ---- the Nudge button ------------------------------------------------------------------------------------

  const allowances = new Map(); // a friend's name in lower case -> { left, max, next, on }
  const sending = new Set();
  const isFriend = (name) => store.friendStatus(name) === 'friends' && !store.isBlocked(name);

  function nudgeButton(name) {
    return (
      `<button type="button" class="m3-btn tonal nudge-btn" data-nudge="${esc(name)}" aria-label="Nudge u/${esc(name)}" data-tooltip="Get their attention">` +
      `<span class="nudge-hand" aria-hidden="true">${icon('waving_hand')}<span class="nudge-done">${icon('check')}</span></span><span class="nudge-word">Nudge</span>` +
      '<span class="nudge-pips" aria-hidden="true"><i></i><i></i><i></i></span><span class="nudge-wait" hidden></span></button>'
    );
  }

  /** every Nudge button for someone shows what's left: dots for this hour's nudges, or when the next one is */
  function paint(name) {
    const a = allowances.get(lower(name));
    for (const btn of document.querySelectorAll('[data-nudge]')) {
      if (lower(btn.dataset.nudge) !== lower(name)) continue;
      if (!a) continue;
      const waiting = a.on !== false && !a.left && a.next && a.next > Date.now();
      const closed = a.on === false || waiting;
      btn.setAttribute('aria-disabled', String(closed));
      btn.classList.toggle('is-off', a.on === false);
      btn.classList.toggle('is-waiting', !!waiting);
      btn.querySelectorAll('.nudge-pips i').forEach((pip, i) => pip.classList.toggle('used', i >= (a.left || 0)));
      btn.querySelector('.nudge-pips').hidden = closed;
      const wait = btn.querySelector('.nudge-wait');
      wait.hidden = !waiting;
      if (waiting) wait.textContent = minutes(a.next) >= 60 ? '1 h' : minutes(a.next) + ' min';
      const tip =
        a.on === false
          ? `u/${name} isn’t taking nudges right now`
          : waiting
          ? `You can nudge u/${name} again in ${waitWords(a.next)}`
          : `Get their attention (${a.left === 1 ? 'one more' : `${a.left} more`} this hour)`;
      btn.dataset.tooltip = say(tip); // an attribute set this way isn't seen by the translator on its own
      btn.setAttribute('aria-label', `Nudge u/${name}. ${tip}.`);
    }
  }

  // while a button is waiting, its minutes count down, and it opens again when the hour is up
  let ticking = 0;
  function tick() {
    clearInterval(ticking);
    ticking = setInterval(() => {
      const waiting = [...document.querySelectorAll('[data-nudge].is-waiting')];
      if (!waiting.length || document.hidden) return clearInterval(ticking);
      for (const btn of waiting) {
        const a = allowances.get(lower(btn.dataset.nudge));
        if (a && a.next && a.next <= Date.now()) load(btn.dataset.nudge);
        else paint(btn.dataset.nudge);
      }
    }, 20000);
  }

  async function load(name) {
    if (off) return;
    try {
      const a = await api.get('/api/nudges/' + encodeURIComponent(name));
      allowances.set(lower(name), a);
      paint(name);
      if (!a.left) tick();
    } catch (error) {
      // a server without nudges answers "nothing here": the buttons go
      if (error.status === 404) {
        off = true;
        document.querySelectorAll('[data-nudge]').forEach((b) => b.remove());
      }
    }
  }

  /** nudges a friend: the hand flies from `from` (the button pressed) to their picture */
  async function nudge(name, from) {
    if (off || sending.has(lower(name))) return;
    const a = allowances.get(lower(name));
    if (a && a.on === false) return M3.toast(`u/${name} isn’t taking nudges right now`, { symbol: 'notifications_paused', shape: 'sunny' });
    if (a && !a.left && a.next > Date.now()) {
      haptic(6);
      wiggle(from);
      return M3.toast(`You can nudge u/${name} again in ${waitWords(a.next)}`, { symbol: 'schedule', shape: 'sunny' });
    }
    sending.add(lower(name));
    if (from && from.classList) from.classList.add('is-sending');
    let r;
    try {
      r = await api.post('/api/nudges', { to: name });
    } catch (error) {
      // the server's count wins: how many are left, and when the next one is
      if (error.left !== undefined || error.off) allowances.set(lower(name), Object.assign({}, a, { left: error.left || 0, next: error.next || null, on: !error.off }));
      paint(name);
      if (error.next) tick();
      return app().showError(error);
    } finally {
      sending.delete(lower(name));
      if (from && from.classList) from.classList.remove('is-sending');
    }
    allowances.set(lower(name), { left: r.left, max: r.max, next: r.next, on: true });
    paint(name);
    if (!r.left) tick();
    celebrate(name, r.left);
    sent(name, from);
    // a toast is one short line (on a 360 px phone, about 28 letters): the button's dots say the rest
    const more = calm() ? '' : r.left ? ` · ${r.left} left` : ' · none left';
    M3.toast(`Nudged u/${name}${more}`, { symbol: 'waving_hand', shape: 'sunny' });
  }

  /** a little no-no shake, for a button that can't do anything right now */
  function wiggle(el) {
    if (!el || !el.animate || still()) return;
    el.animate([{ translate: '0 0' }, { translate: '-5px 0' }, { translate: '4px 0' }, { translate: '-3px 0' }, { translate: '2px 0' }, { translate: '0 0' }], { duration: 360, easing: 'ease-out' });
  }

  /** every Nudge button for them says it went: the hand turns into a tick for a moment, and the dot just used pops */
  function celebrate(name, left) {
    for (const btn of document.querySelectorAll('[data-nudge]')) {
      if (lower(btn.dataset.nudge) !== lower(name)) continue;
      btn.classList.add('is-sent');
      clearTimeout(btn.nudgeSent);
      btn.nudgeSent = setTimeout(() => btn.classList.remove('is-sent'), 1500);
      if (still()) continue;
      btn.animate([{ scale: '1' }, { scale: '0.94', offset: 0.22 }, { scale: '1.04', offset: 0.58 }, { scale: '1' }], { duration: 480, easing: 'ease-out' });
      const pip = btn.querySelectorAll('.nudge-pips i')[left];
      if (pip) pip.animate([{ scale: '1' }, { scale: '2.1', offset: 0.3 }, { scale: '0.85' }], { duration: 520, easing: 'cubic-bezier(0.2, 1.2, 0.4, 1)' });
    }
  }

  /** the friend's picture on the screen, if it's there: on a nudge from them that's open, on their profile, or at the
   * top of a chat with them */
  function faceOf(name) {
    if (current && lower(current.name) === lower(name) && current.el.isConnected) return current.el.querySelector('.nm-face .avatar');
    const route = location.hash;
    if (/^#\/u\//.test(route)) return document.querySelector('.profile-main > .avatar');
    if (/^#\/messages\/(?!g\/)[^/]+$/.test(route)) return document.querySelector('.chat-who .avatar');
    return null;
  }

  /** the sender's side: the hand winds up and is thrown to their picture, leaving sparks behind, and lands with a bump
   * (with their picture nowhere on the screen, it takes off upwards, out of sight) */
  function sent(name, from) {
    // a rising triple tap: light, medium, heavy
    haptic([6, 55, 10, 55, 22]);
    if (still()) return;
    const start = from && visible(from) ? from.querySelector('.nudge-hand') || from : null;
    if (!start) return;
    const to = faceOf(name);
    const box = layer();
    const a = centre(start);
    if (visible(to)) return fly(box, a, centre(to), () => landed(to, box));
    M3.burst(start, 'play', { count: 8 });
    fly(box, a, { x: a.x + (a.x < innerWidth / 2 ? 80 : -80), y: -70 }, null);
  }

  /** a hand thrown from a to b: it winds up the other way first, stretches with its speed, waves and changes shape as
   * it goes, and squashes into whatever it hits (or fades away, with nothing to hit) */
  function fly(box, a, b, land) {
    const size = 46;
    const away = !land;
    const D = away ? 820 : 780;
    const WIND = 0.17; // winding up
    const HIT = away ? 1 : 0.88; // reaching them
    const el = document.createElement('span');
    el.className = 'nudge-flyer';
    el.innerHTML = `<m3-shape class="nudge-flyer-shape" shape="cookie9"></m3-shape>${icon('waving_hand')}`;
    box.appendChild(el);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    // the arc goes up over both ends, higher for a longer throw
    const c = { x: (a.x + b.x) / 2 + (b.x > a.x ? -0.12 : 0.12) * dist, y: Math.min(a.y, b.y) - Math.max(70, dist * 0.3) };
    const at = (t) => {
      const u = 1 - t;
      return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
    };
    const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
    const along = (tau) => ease(Math.min(1, Math.max(0, (tau - WIND) / (HIT - WIND))));
    // it winds up away from where it's going
    const lx = c.x - a.x;
    const ly = c.y - a.y;
    const ll = Math.hypot(lx, ly) || 1;
    const back = { x: a.x - (lx / ll) * 14, y: a.y - (ly / ll) * 14 };
    const STEPS = 32;
    const avg = (dist * 1.25) / (STEPS * (HIT - WIND));
    const frames = [];
    let prev = at(0);
    let angle = Math.atan2(ly, lx);
    const f = (n) => n.toFixed(2);
    for (let i = 0; i <= STEPS; i++) {
      const tau = i / STEPS;
      let p;
      let sx = 1;
      let sy = 1;
      let spin;
      let scale;
      let opacity = 1;
      if (tau <= WIND) {
        const k = tau / WIND;
        const out = 1 - Math.pow(1 - k, 3);
        p = { x: a.x + (back.x - a.x) * out, y: a.y + (back.y - a.y) * out };
        scale = 0.3 + 0.75 * out;
        spin = -30 * out;
      } else if (tau <= HIT) {
        const t = along(tau);
        p = at(t);
        const step = Math.hypot(p.x - prev.x, p.y - prev.y);
        if (step > 0.5) {
          // the way it's going, kept continuous (a stretch looks the same either way along a line)
          let raw = Math.atan2(p.y - prev.y, p.x - prev.x);
          while (raw - angle > Math.PI / 2) raw -= Math.PI;
          while (raw - angle < -Math.PI / 2) raw += Math.PI;
          angle = raw;
        }
        const stretch = Math.min(0.32, (step / (avg || 1)) * 0.14);
        sx = 1 + stretch;
        sy = 1 - stretch * 0.6;
        spin = -14 + Math.sin(t * Math.PI * 5) * 24;
        scale = 1.05 + Math.sin(t * Math.PI) * 0.2 - (away ? t * 0.35 : t * 0.15);
        if (away) opacity = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        prev = p;
      } else {
        // the hit: flattened against them, then gone
        const k = (tau - HIT) / (1 - HIT);
        p = b;
        sx = 1 - 0.45 * k;
        sy = 1 + 0.35 * k;
        spin = 0;
        scale = 0.9 - 0.7 * k;
        opacity = 1 - k;
      }
      const deg = (angle * 180) / Math.PI;
      frames.push({
        transform: `translate(${f(p.x - size / 2)}px, ${f(p.y - size / 2)}px) rotate(${f(deg)}deg) scale(${f(sx)}, ${f(sy)}) rotate(${f(-deg)}deg) rotate(${f(spin)}deg) scale(${f(scale)})`,
        opacity,
        offset: tau,
      });
    }
    const flight = el.animate(frames, { duration: D, easing: 'linear', fill: 'forwards' });
    // the hand changes shape as it's thrown, and once more on the way down
    const shape = el.querySelector('m3-shape');
    setTimeout(() => shape.transitionTo && shape.transitionTo('sunny', { spring: true }), WIND * D);
    setTimeout(() => shape.transitionTo && shape.transitionTo('cookie12', { spring: true }), 0.6 * D);
    // sparks left behind along the way, in the app's colours, drifting down as they fade
    const tones = ['--m3-tertiary', '--m3-primary', '--m3-secondary'];
    const N = away ? 11 : 9;
    for (let i = 0; i < N; i++) {
      const tau = WIND + (HIT - WIND) * (0.1 + (0.82 * i) / (N - 1));
      const p = at(along(tau));
      const spark = document.createElement(i % 2 ? 'span' : 'm3-shape');
      spark.className = 'nudge-spark';
      if (i % 2 === 0) spark.setAttribute('shape', 'sunny');
      const s = 7 + Math.random() * 6;
      spark.style.cssText = `left:${f(p.x)}px;top:${f(p.y)}px;width:${f(s)}px;height:${f(s)}px;color:var(${tones[i % tones.length]})`;
      box.appendChild(spark);
      const dx = (Math.random() - 0.5) * 22;
      const dy = 10 + Math.random() * 14;
      spark.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0) rotate(0deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.1) rotate(40deg)', opacity: 1, offset: 0.2 },
          { transform: `translate(calc(-50% + ${f(dx)}px), calc(-50% + ${f(dy)}px)) scale(0.2) rotate(140deg)`, opacity: 0 },
        ],
        { duration: 560, delay: tau * D, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'both' }
      );
    }
    if (land) setTimeout(land, HIT * D - 20);
    else setTimeout(() => box.remove(), D + 700);
    flight.finished.then(
      () => el.remove(),
      () => box.remove()
    );
  }

  /** a picture that's been nudged takes the hit: squashed, springing back with a wobble, a flash and rings in its own
   * colour, and a little hand waving from its corner */
  function landed(face, box) {
    if (!face.isConnected) return setTimeout(() => box.remove(), 600);
    const c = centre(face);
    const colour = getComputedStyle(face).getPropertyValue('--av').trim() || 'var(--m3-primary)';
    const flash = document.createElement('span');
    flash.className = 'nudge-flash';
    flash.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;color:${colour}`;
    box.appendChild(flash);
    flash.animate([{ transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.5 }, { transform: 'translate(-50%, -50%) scale(1.45)', opacity: 0 }], {
      duration: 520,
      easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      fill: 'both',
    });
    for (let i = 0; i < 3; i++) {
      const ring = document.createElement('span');
      ring.className = 'nudge-ring';
      ring.style.cssText = `left:${c.x}px;top:${c.y}px;width:${c.w}px;height:${c.h}px;color:${colour}`;
      box.appendChild(ring);
      ring.animate([{ transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.7 }, { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 }], {
        duration: 900,
        delay: 40 + i * 140,
        easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
        fill: 'both',
      });
    }
    face.animate(
      [
        { scale: '1 1', rotate: '0deg' },
        { scale: '1.18 0.84', rotate: '0deg', offset: 0.14 },
        { scale: '0.92 1.1', rotate: '-7deg', offset: 0.36 },
        { scale: '1.05 0.97', rotate: '5deg', offset: 0.56 },
        { scale: '0.99 1.01', rotate: '-2deg', offset: 0.76 },
        { scale: '1 1', rotate: '0deg' },
      ],
      { duration: 740, easing: 'ease-out' }
    );
    // on a nudge from them that's open, their picture already has a little hand: it waves harder
    const own = face.closest('.nudge-moment') && face.closest('.nudge-moment').querySelector('.nm-hand');
    if (own) {
      own.animate([{ scale: '1', rotate: '0deg' }, { scale: '1.35', rotate: '-20deg', offset: 0.3 }, { scale: '1.1', rotate: '16deg', offset: 0.6 }, { scale: '1', rotate: '0deg' }], { duration: 640, easing: 'ease-out' });
      M3.burst(face, 'play', { count: 14 });
      setTimeout(() => box.remove(), 1500);
      return;
    }
    const s = Math.max(24, Math.min(38, c.w * 0.42));
    const stamp = document.createElement('span');
    stamp.className = 'nudge-stamp';
    stamp.innerHTML = icon('waving_hand');
    stamp.style.cssText = `left:${c.x + c.w * 0.36}px;top:${c.y + c.h * 0.36}px;width:${s}px;height:${s}px;--s:${s}px`;
    box.appendChild(stamp);
    stamp.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0) rotate(-40deg)', opacity: 1 },
        { transform: 'translate(-50%, -50%) scale(1.2) rotate(14deg)', opacity: 1, offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(-14deg)', opacity: 1, offset: 0.38 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(12deg)', opacity: 1, offset: 0.54 },
        { transform: 'translate(-50%, -50%) scale(1) rotate(0deg)', opacity: 1, offset: 0.78 },
        { transform: 'translate(-50%, -50%) scale(0.6) rotate(0deg)', opacity: 0 },
      ],
      { duration: 1150, easing: 'ease-out', fill: 'both' }
    );
    M3.burst(face, 'play', { count: 14 });
    setTimeout(() => box.remove(), 1500);
  }

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-nudge]') : null;
    if (!btn) return;
    e.preventDefault();
    nudge(btn.dataset.nudge, btn);
  });

  // ---- a nudge arriving ------------------------------------------------------------------------------------

  const shown = new Map(); // a friend's name in lower case -> when their nudge last had its moment here
  const queue = []; // nudges waiting their turn (one moment at a time), or for the page to be looked at again
  let current = null;

  /** someone nudged you: the moment now, or as soon as Budgie is looked at again */
  function arrived(name) {
    if (!name || store.isBlocked(name) || store.isMe(name)) return;
    shown.set(lower(name), Date.now());
    if (current && lower(current.name) === lower(name)) return current.again();
    if (current || document.hidden) {
      const waiting = queue.find((q) => lower(q.name) === lower(name));
      if (waiting) waiting.count++;
      else queue.push({ name, count: 1, at: Date.now() });
      return;
    }
    moment(name);
  }
  function next() {
    // a nudge that waited more than ten minutes for the page to be looked at is old news (the inbox has it)
    while (queue.length && Date.now() - queue[0].at > 10 * 60000) queue.shift();
    if (!queue.length || document.hidden || current) return;
    const q = queue.shift();
    moment(q.name, { count: q.count });
  }
  document.addEventListener('visibilitychange', () => document.hidden || setTimeout(next, 400));

  // the live connection says it at once; the inbox note says it again with the next check for news (or says it
  // first, when there's no live connection): the moment plays once
  Nook.hook('signal', (type, data) => {
    if (type !== 'nudge' || !data || !data.from) return;
    arrived(String(data.from));
    store.sync().catch(() => {});
  });
  store.on('notify', (note) => {
    if (!note || note.kind !== 'nudge') return;
    // the server keeps one unread note per friend that counts their nudges (×2, ×3): the one it replaced goes here too
    const before = store.state.notes.length;
    store.state.notes = store.state.notes.filter((x) => x === note || x.kind !== 'nudge' || x.href !== note.href || x.read);
    if (store.state.notes.length !== before && /^#\/inbox/.test(location.hash)) setTimeout(() => app().render(), 0);
    const m = /^#\/messages\/([^/?#]+)$/.exec(note.href || '');
    const name = m ? decodeURIComponent(m[1]) : '';
    if (!name || (note.createdAt && Date.now() - note.createdAt > 5 * 60000)) return;
    if (shown.get(lower(name)) > Date.now() - 30000) return;
    arrived(name);
  });

  /** the screen gives a soft double knock, in time with the double buzz: the top bar, the page and the bottom bar,
   * each where it is */
  function shake() {
    if (still()) return;
    const parts = [document.getElementById('topbar'), document.getElementById('main'), document.querySelector('.bottom-nav')].filter(Boolean);
    const frames = (k) => [
      { translate: '0 0', rotate: '0deg' },
      { translate: `${-5 * k}px 0`, rotate: `${-0.3 * k}deg`, offset: 0.16 },
      { translate: `${4 * k}px 0`, rotate: `${0.22 * k}deg`, offset: 0.38 },
      { translate: `${-2 * k}px 0`, rotate: '0deg', offset: 0.62 },
      { translate: '0 0', rotate: '0deg' },
    ];
    for (const el of parts) {
      el.animate(frames(1), { duration: 340, easing: 'ease-out' });
      el.animate(frames(0.7), { duration: 320, delay: 200, easing: 'ease-out' });
    }
  }

  const HALO = ['sunny', 'cookie12', 'flower', 'clover8', 'softBurst'];

  /** the moment itself: the friend's picture pops in at the top, waving, with a way to answer */
  function moment(name, { count = 1, preview = false } = {}) {
    const u = store.user(name);
    const quiet = still();
    const el = document.createElement('div');
    el.className = 'nudge-moment' + (quiet ? ' is-still' : '');
    // said out loud by a screen reader, without taking the keyboard from whatever you were typing
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'assertive');
    el.style.setProperty('--av', u.color || 'var(--m3-primary)');
    el.innerHTML =
      '<div class="nm-glow" aria-hidden="true"></div>' +
      '<div class="nm-card">' +
      `<div class="nm-face" aria-hidden="true"><m3-shape class="nm-halo nm-halo-a" shape="${HALO[0]}"></m3-shape><m3-shape class="nm-halo nm-halo-b" shape="${HALO[1]}"></m3-shape>` +
      `<span class="nm-ring"></span><span class="nm-ring"></span>${avatar(u, 68, { moving: true })}<span class="nm-hand">${icon('waving_hand')}</span></div>` +
      `<div class="nm-words"><b class="nm-name"><span class="${esc(nameFont(u))}" translate="no">u/${esc(u.name)}</span><span class="nm-count"${count > 1 ? '' : ' hidden'}>×${count}</span>` +
      `${preview ? '<span class="nm-tag">Preview</span>' : ''}</b><span>wants your attention</span></div>` +
      `<button type="button" class="m3-icon-btn nm-close" aria-label="Close">${icon('close')}</button>` +
      (preview
        ? '<p class="nm-about">This is what your friends see when you nudge them, with a double buzz on their phone.</p>'
        : `<div class="nm-actions"><button type="button" class="m3-btn filled small" data-nm="chat">${icon('chat')}Say hi</button>` +
          `<button type="button" class="m3-btn tonal small" data-nm="back">${icon('waving_hand')}Nudge back</button></div>`) +
      '<span class="nm-timer" aria-hidden="true"></span></div>';
    document.body.appendChild(el);
    if (typeof el.showPopover === 'function') {
      try {
        el.setAttribute('popover', 'manual');
        el.showPopover();
      } catch (_) {
        el.removeAttribute('popover');
      }
    }
    const card = el.querySelector('.nm-card');
    const face = el.querySelector('.nm-face .avatar');
    // the card wears the friend's own colours, in light or dark as the app is
    if (u.color && ui.theme && ui.theme.scheme) ui.theme.scheme(String(u.color).toLowerCase(), 'tonalSpot').then((colors) => el.isConnected && M3.color.apply(colors, card), () => {});
    let closing = false;
    let timer = 0;
    let morph = 0;
    const LIFE = 7000;
    // what's on the card besides their picture, which slides in once it's unfolded
    const PARTS = '.nm-words, .nm-close, .nm-actions, .nm-about, .nm-timer';
    // the card as a circle around their picture, and the card in full (a little bigger than it, so its shadow shows)
    const clips = () => {
      const cr = card.getBoundingClientRect();
      const fr = el.querySelector('.nm-face').getBoundingClientRect();
      const r = Math.min(fr.width, fr.height) / 2;
      const cx = fr.left + fr.width / 2 - cr.left;
      const cy = fr.top + fr.height / 2 - cr.top;
      const px = (v) => v.toFixed(1) + 'px';
      return {
        small: `inset(${px(cy - r)} ${px(cr.width - cx - r)} ${px(cr.height - cy - r)} ${px(cx - r)} round ${px(r)})`,
        full: 'inset(-32px -32px -32px -32px round 64px)',
        origin: `${px(cx)} ${px(cy)}`,
        lift: px(-(cy + r + 24)),
      };
    };
    // two knocks on the card, in time with the double buzz, and the glow pulsing with them
    const knock = () => {
      if (quiet) return;
      const frames = (k) => [
        { transform: 'translateY(0) rotate(0deg)' },
        { transform: `translateY(${3 * k}px) rotate(${-1.4 * k}deg)`, offset: 0.2 },
        { transform: `translateY(0) rotate(${0.8 * k}deg)`, offset: 0.55 },
        { transform: 'translateY(0) rotate(0deg)' },
      ];
      card.animate(frames(1), { duration: 340, easing: 'ease-out', composite: 'add' });
      card.animate(frames(0.7), { duration: 320, delay: 200, easing: 'ease-out', composite: 'add' });
      el.querySelector('.nm-glow').animate([{ opacity: 1 }, { opacity: 0.55, offset: 0.2 }, { opacity: 1, offset: 0.45 }, { opacity: 0.7, offset: 0.7 }, { opacity: 1 }], { duration: 560 });
    };

    const close = () => {
      if (closing) return;
      closing = true;
      clearTimeout(timer);
      clearInterval(morph);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('hashchange', close);
      const done = () => {
        el.remove();
        if (current && current.el === el) current = null;
        setTimeout(next, 250);
      };
      if (quiet) return done();
      el.querySelector('.nm-glow').animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
      if (card.style.transform) {
        // flicked away: it carries on upwards
        card.animate([{ transform: card.style.transform, opacity: card.style.opacity || 1 }, { transform: 'translateY(-120%)', opacity: 0 }], { duration: 200, easing: 'cubic-bezier(0.3, 0, 0.8, 0.15)', fill: 'forwards' }).finished.then(done, done);
        return;
      }
      // it folds back into their picture, which lifts away
      const k = clips();
      for (const part of card.querySelectorAll(PARTS)) part.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 130, fill: 'forwards' });
      card.animate(
        [
          { clipPath: k.full, transform: 'none', transformOrigin: k.origin, opacity: 1 },
          { clipPath: k.small, transform: 'none', transformOrigin: k.origin, opacity: 1, offset: 0.55 },
          { clipPath: k.small, transform: `translateY(${k.lift}) scale(0.6)`, transformOrigin: k.origin, opacity: 0 },
        ],
        { duration: 460, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' }
      ).finished.then(done, done);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(close, LIFE);
      const bar = el.querySelector('.nm-timer');
      bar.getAnimations().forEach((a) => a.cancel());
      bar.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: LIFE, easing: 'linear', fill: 'forwards' });
    };
    const hold = () => {
      clearTimeout(timer);
      el.querySelector('.nm-timer').getAnimations().forEach((a) => a.pause());
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('keydown', onKey);
    card.addEventListener('pointerenter', hold);
    card.addEventListener('pointerleave', () => !closing && schedule());
    card.addEventListener('focusin', hold);
    el.querySelector('.nm-close').addEventListener('click', close);
    if (!preview) {
      el.querySelector('[data-nm="chat"]').addEventListener('click', () => {
        close();
        app().go('#/messages/' + encodeURIComponent(u.name));
      });
      el.querySelector('[data-nm="back"]').addEventListener('click', (e) => {
        hold();
        nudge(u.name, e.currentTarget).then(() => setTimeout(close, still() ? 700 : 1300));
      });
    }
    // going somewhere else puts it away: it was about the page you were on
    window.addEventListener('hashchange', close, { once: true });
    // a flick upwards puts it away
    let startY = null;
    card.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('button')) startY = e.clientY;
    });
    card.addEventListener('pointermove', (e) => {
      if (startY == null) return;
      const dy = Math.min(0, e.clientY - startY);
      card.style.transform = `translateY(${dy}px)`;
      card.style.opacity = String(1 + dy / 160);
    });
    const release = (e) => {
      if (startY == null) return;
      const dy = e.clientY - startY;
      startY = null;
      if (dy < -48) return close();
      card.style.transform = '';
      card.style.opacity = '';
    };
    card.addEventListener('pointerup', release);
    card.addEventListener('pointercancel', release);

    const again = () => {
      count++;
      const c = el.querySelector('.nm-count');
      c.hidden = false;
      c.textContent = '×' + count;
      buzz();
      if (!quiet) {
        c.animate([{ transform: 'translateY(80%) scale(0.6)', opacity: 0 }, { transform: 'translateY(-10%) scale(1.25)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 440, easing: 'cubic-bezier(.2,1.2,.4,1)' });
        face.animate(
          [
            { scale: '1 1', rotate: '0deg' },
            { scale: '1.12 0.88', rotate: '-10deg', offset: 0.2 },
            { scale: '0.95 1.06', rotate: '8deg', offset: 0.45 },
            { scale: '1 1', rotate: '-3deg', offset: 0.7 },
            { scale: '1 1', rotate: '0deg' },
          ],
          { duration: 560, easing: 'ease-out' }
        );
        knock();
        shake();
        M3.burst(face, 'play', { count: 10 });
      }
      schedule();
    };
    // the phone buzzes twice, like a knock (calm mode: one soft tap)
    const buzz = () => haptic(calm() ? 12 : [110, 90, 110]);
    current = { el, name: u.name, again, close };

    if (!quiet) {
      // their picture drops in as a circle, the card unfolds out of it, and what it says slides in after
      const k = clips();
      card.animate(
        [
          { clipPath: k.small, transform: `translateY(${k.lift}) scale(0.6)`, transformOrigin: k.origin, opacity: 0, easing: 'cubic-bezier(0.2, 1.25, 0.4, 1)' },
          { clipPath: k.small, transform: 'none', transformOrigin: k.origin, opacity: 1, offset: 0.4, easing: 'linear' },
          { clipPath: k.small, transform: 'none', transformOrigin: k.origin, opacity: 1, offset: 0.46, easing: 'cubic-bezier(0.2, 0.9, 0.25, 1.04)' },
          { clipPath: k.full, transform: 'none', transformOrigin: k.origin, opacity: 1 },
        ],
        { duration: 900 }
      );
      [...card.querySelectorAll(PARTS)].forEach((part, i) =>
        part.animate(part.classList.contains('nm-timer') ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], {
          duration: 340,
          delay: 470 + i * 55,
          easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)',
          fill: 'backwards',
        })
      );
      el.querySelector('.nm-glow').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 480, easing: 'ease-out' });
      face.animate([{ scale: '0.3', rotate: '-30deg' }, { scale: '1.14', rotate: '8deg', offset: 0.6 }, { scale: '1', rotate: '0deg' }], { duration: 560, delay: 60, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)', fill: 'backwards' });
      // the little hand pops out of the corner, then waves
      el.querySelector('.nm-hand').animate([{ scale: '0', rotate: '-50deg' }, { scale: '1.25', rotate: '12deg', offset: 0.6 }, { scale: '1', rotate: '0deg' }], { duration: 480, delay: 520, easing: 'cubic-bezier(0.2, 1.3, 0.4, 1)', fill: 'backwards' });
      setTimeout(() => {
        if (closing) return;
        buzz();
        knock();
        shake();
      }, 400);
      setTimeout(() => !closing && M3.burst(face, 'play', { count: 12 }), 560);
      // the halo keeps changing shape while it's up
      const halos = [...el.querySelectorAll('.nm-halo')];
      let step = 1;
      morph = setInterval(() => {
        step++;
        halos.forEach((h, i) => h.transitionTo && h.transitionTo(HALO[(step + i * 2) % HALO.length], { spring: true }));
      }, 1100);
    } else {
      buzz();
      card.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200 });
    }
    schedule();
    return current;
  }

  // ---- in someone's More menu, and on their profile ------------------------------------------------------

  Nook.hook('personMenu', (name) =>
    !off && isFriend(name) && !store.isMe(name)
      ? [{ label: `Nudge u/${name}`, symbol: 'waving_hand', onSelect: () => nudge(name, document.querySelector(`[data-act="person-menu"][data-user="${CSS.escape(name)}"]`)) }]
      : []
  );

  Nook.hook('profileActions', (u, who, me) => {
    if (me) return '';
    let html = '';
    if (!off && isFriend(u.name)) html += nudgeButton(u.name);
    // an admin bans an account and the networks it used (an admin can't be banned)
    if (store.isAdmin() && !u.admin && !u.banned)
      html += `<button type="button" class="m3-icon-btn tonal social-ban-btn" data-ipban="${esc(u.name)}" aria-label="Ban u/${esc(u.name)} and their networks" data-tooltip="Ban account and network">${icon('gavel')}</button>`;
    return html;
  });

  Nook.hook('profileMount', (root, u, me) => {
    if (me) return;
    if (root.querySelector('[data-nudge]')) {
      // what's known shows at once, and the server's count follows
      if (allowances.has(lower(u.name))) paint(u.name);
      load(u.name);
    }
    if (store.isAdmin() && u.banned && !u.admin) bannedStrip(root, u);
  });

  // ---- Settings → Nudges -----------------------------------------------------------------------------------

  Nook.hook('settingsSections', (header) =>
    off
      ? ''
      : `<section id="nudge-settings">${header('sunny', 'waving_hand', 'Nudges')}<div class="card setting-card nudge-settings">` +
        '<label class="switch-row"><span class="switch-text"><span>Let friends nudge me</span><small>A friend can nudge you to get your attention, up to 3 times an hour. You get a notification, and if Budgie is open, your screen gives a little shake.</small></span>' +
        '<input type="checkbox" class="m3-switch" role="switch" id="set-nudges" checked disabled></label>' +
        `<div class="toolbar"><button type="button" class="m3-btn tonal" id="nudge-preview">${icon('waving_hand')}See what a nudge looks like</button></div></div></section>`
  );
  Nook.hook('settingsMount', async (root) => {
    const box = root.querySelector('#nudge-settings');
    if (!box) return;
    const input = box.querySelector('#set-nudges');
    box.querySelector('#nudge-preview').addEventListener('click', () => {
      if (current) current.close();
      setTimeout(() => moment(store.state.me.name, { preview: true }), current ? 300 : 0);
    });
    try {
      const s = await api.get('/api/nudges');
      input.checked = s.on !== false;
      input.disabled = false;
    } catch (error) {
      if (error.status === 404) {
        off = true;
        box.remove();
      }
      return;
    }
    input.addEventListener('change', async () => {
      const on = input.checked;
      input.disabled = true;
      try {
        await api.put('/api/nudges', { on });
        haptic(8);
        M3.toast(on ? 'Friends can nudge you' : 'Nudges are off: friends can’t nudge you', { symbol: on ? 'waving_hand' : 'notifications_paused', shape: 'sunny' });
      } catch (error) {
        input.checked = !on;
        app().showError(error);
      } finally {
        input.disabled = false;
      }
    });
  });

  // ---- network bans: banning ----------------------------------------------------------------------------------

  const DAYS = [['1', '1 day'], ['7', '7 days'], ['30', '30 days'], ['0', 'Permanent']];
  const REASONS = ['Spam', 'Ban evasion', 'Harassment or bullying', 'Hate or slurs', 'Threats or violence', 'Sexual content', 'Something else'];
  const segmented = (id, options, value, label) =>
    `<div class="m3-segmented" id="${id}" role="radiogroup" aria-label="${esc(label)}">${options
      .map(([v, text]) => `<button class="m3-segment" role="radio" aria-checked="${v === value}" value="${v}">${esc(text)}</button>`)
      .join('')}</div>`;
  const dateWords = (t) => new Date(t).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long' });
  const forWords = (days) => (days ? (days === 1 ? 'for a day' : `for ${days} days`) : 'for good');

  /** the sheet that bans someone and their networks: what it would do, why, and for how long */
  function banSheet(name) {
    let days = 7;
    let reason = '';
    let look = null;
    const u = store.user(name);
    const after = () =>
      days
        ? `On ${dateWords(Date.now() + days * 86400000)} the ban ends by itself, and u/${name} can come back. You can lift it sooner on the Moderation page.`
        : `It lasts until you lift it, on the Moderation page.`;
    return ui.sheet({
      headline: `Ban u/${name} and their networks?`,
      symbol: 'gavel',
      shape: 'softBoom',
      className: 'wide social-ban-sheet',
      html:
        `<div class="sb-who">${avatar(u, 48)}<div class="row-text"><b class="${esc(nameFont(u))}" translate="no">u/${esc(name)}</b><small id="sb-sub">Their account is banned and signed out everywhere, and nobody can use Budgie from the internet connections they used in the last 90 days.</small></div></div>` +
        '<div class="sb-impact" id="sb-impact" aria-live="polite"><m3-loading aria-label="Looking at their networks"></m3-loading></div>' +
        `<div class="sb-warn" role="note">${icon('warning')}<p>Phone networks, schools and cafés give lots of people the same address. While the ban lasts, everyone on these networks is locked out, not just u/${esc(name)}.</p></div>` +
        `<div class="field"><span class="field-label">Why (they’ll see it)</span><div class="chips sb-reasons">${REASONS.map((r) => `<button type="button" class="chip" data-why="${esc(r)}" aria-pressed="false">${esc(r)}</button>`).join('')}</div>` +
        '<input class="m3-field" id="sb-why" maxlength="200" placeholder="Or say why in your own words"></div>' +
        `<div class="field"><span class="field-label">For how long</span>${segmented('sb-days', DAYS, '7', 'For how long')}</div>` +
        `<p class="muted sb-after" id="sb-after">${esc(after())}</p><span class="error" id="sb-err" role="alert"></span>`,
      async setup(body) {
        body.querySelectorAll('[data-why]').forEach((chip) =>
          chip.addEventListener('click', () => {
            reason = chip.dataset.why;
            body.querySelectorAll('[data-why]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
          })
        );
        body.querySelector('#sb-days').addEventListener('change', (e) => {
          days = Number(e.detail.value);
          body.querySelector('#sb-after').textContent = after();
        });
        const box = body.querySelector('#sb-impact');
        try {
          look = await api.get('/api/admin/ipbans/' + encodeURIComponent(name));
        } catch (error) {
          box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
          return;
        }
        if (!box.isConnected) return;
        const fact = (n, words, cls, symbol) => `<div class="sb-fact ${cls}"><span class="sb-fact-icon">${icon(symbol)}</span><b>${n}</b><span>${words}</span></div>`;
        box.innerHTML =
          '<div class="sb-facts">' +
          fact(look.networks, look.networks === 1 ? 'network they used gets banned' : 'networks they used get banned', 'is-ban', 'wifi_off') +
          (look.guarded ? fact(look.guarded, look.guarded === 1 ? 'network an admin uses too is left alone' : 'networks an admin uses too are left alone', 'is-kept', 'verified_user') : '') +
          fact(look.others, look.others === 1 ? 'other account used these networks lately' : 'other accounts used these networks lately', look.others ? 'is-others' : 'is-none', look.others ? 'group' : 'person') +
          '</div>' +
          (look.networks ? '' : `<p class="muted sb-note">No networks seen for u/${esc(name)} in the last 90 days, so only their account is banned.</p>`) +
          (look.banned ? '<p class="muted sb-note">Their account is already banned: it stays banned however this ends.</p>' : '') +
          (look.active ? '<p class="muted sb-note">Their networks are already banned once; this adds another.</p>' : '');
        if (!still()) fx().stagger(box.querySelectorAll('.sb-fact'), { y: 10, step: 60 });
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Ban',
          variant: 'filled',
          symbol: 'gavel',
          run(close, body) {
            const err = body.querySelector('#sb-err');
            const why = body.querySelector('#sb-why').value.trim() || reason;
            if (!why) {
              err.textContent = 'Say why: they’ll see it.';
              return false;
            }
            const go = body.closest('dialog').querySelector('.m3-dialog-actions .filled');
            if (go) go.disabled = true;
            api
              .post('/api/admin/ipbans', { name, days, reason: why })
              .then(async (done) => {
                close(done);
                haptic([20, 40, 20]);
                M3.toast(`Banned u/${done.name} ${forWords(days)}`, { symbol: 'gavel', shape: 'softBoom' });
                await store.sync().catch(() => {});
                document.dispatchEvent(new CustomEvent('nook-ipbans'));
                if (/^#\/u\//.test(location.hash)) app().render();
              })
              .catch((error) => {
                if (go) go.disabled = false;
                err.textContent = error.message;
              });
            return false;
          },
        },
      ],
    });
  }

  document.addEventListener('click', (e) => {
    const btn = e.target instanceof Element ? e.target.closest('[data-ipban]') : null;
    if (!btn || !store.isAdmin()) return;
    e.preventDefault();
    banSheet(btn.dataset.ipban);
  });

  /** on a banned person's profile, for an admin: ban their networks too, or see that they are */
  async function bannedStrip(root, u) {
    const main = root.querySelector('.profile-main');
    if (!main) return;
    let look;
    try {
      look = await api.get('/api/admin/ipbans/' + encodeURIComponent(u.name));
    } catch (_) {
      return;
    }
    if (!main.isConnected || main.querySelector('.social-banned-strip')) return;
    main.insertAdjacentHTML(
      'beforeend',
      `<div class="toolbar profile-actions social-banned-strip">${
        look.active
          ? `<a class="m3-btn tonal" href="#/admin">${icon('wifi_off')}Networks banned too</a>`
          : `<button type="button" class="m3-btn tonal" data-ipban="${esc(u.name)}">${icon('wifi_off')}Ban their networks too</button>`
      }</div>`
    );
  }

  // ---- network bans: the Moderation page ----------------------------------------------------------------------

  Nook.hook('adminSections', () =>
    store.isAdmin()
      ? '<section class="section social-admin" id="ipbans">' +
        `<header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="softBoom" symbol="wifi_off" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Network bans</h2><m3-wavy-line></m3-wavy-line></header>` +
        '<form class="card sb-form" id="sb-form" novalidate><p class="muted">Ban an account together with the internet connections it used in the last 90 days, so it can’t simply come back with a new one. Budgie never keeps anyone’s address, only a keyed hash of it.</p>' +
        `<div class="toolbar"><input class="m3-field" id="sb-name" placeholder="username" autocapitalize="none" spellcheck="false" maxlength="22" aria-label="Who to ban"><button class="m3-btn filled" type="submit">${icon('gavel')}Ban account and network</button></div>` +
        '<span class="error" id="sb-form-err" role="alert"></span></form>' +
        '<div class="sb-list" id="sb-list"><m3-loading aria-label="Loading network bans"></m3-loading></div></section>'
      : ''
  );

  /** how much of a ban is left, as a ring that empties (and the time in words) */
  function timeLeft(b) {
    if (!b.until) return `<span class="sb-left is-forever" title="Until it’s lifted"><span class="sb-ring">${icon('all_inclusive')}</span><small>Permanent</small></span>`;
    const total = Math.max(1, b.until - b.createdAt);
    const left = Math.max(0, b.until - Date.now());
    const share = Math.min(1, left / total);
    const C = 2 * Math.PI * 15;
    const hours = left / 3600000;
    const words = hours >= 48 ? `${Math.round(hours / 24)} days left` : hours >= 1.5 ? `${Math.round(hours)} h left` : `${Math.max(1, Math.round(hours * 60))} min left`;
    return (
      `<span class="sb-left" title="Until ${esc(new Date(b.until).toLocaleString())}"><svg class="sb-ring" viewBox="0 0 36 36" aria-hidden="true"><circle class="sb-track" cx="18" cy="18" r="15"></circle>` +
      `<circle class="sb-fill" cx="18" cy="18" r="15" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - share)).toFixed(2)}"></circle></svg><small>${words}</small></span>`
    );
  }

  Nook.hook('adminMount', (root) => {
    const section = root.querySelector('#ipbans');
    if (!section) return;
    const list = section.querySelector('#sb-list');
    const form = section.querySelector('#sb-form');
    let bans = [];
    async function paintList() {
      try {
        bans = (await api.get('/api/admin/ipbans')).bans;
      } catch (error) {
        if (error.status === 404) return section.remove();
        list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
        return;
      }
      if (!list.isConnected) return;
      list.innerHTML = bans.length
        ? bans
            .map((b) => {
              const who = b.name ? store.user(b.name) : null;
              const face = who && !who.unknown ? avatar(who, 40) : `<m3-shape-icon shape="pixelCircle" symbol="router" size="40" icon-size="20" aria-hidden="true"></m3-shape-icon>`;
              const title = b.name ? `u/${esc(b.name)}` : 'One network';
              const what = b.name ? (b.networks ? (b.networks === 1 ? 'One network' : `${b.networks} networks`) : 'Account only') : 'Banned with nook ipban';
              return (
                `<article class="card sb-row" data-ban="${b.id}">${face}<div class="row-text"><b translate="no">${title}</b><small><span>${what}</span> · <span>${esc(b.reason)}</span></small>` +
                `<small class="muted">${b.by ? `<span>by u/${esc(b.by)}</span> · ` : ''}<span>${esc(ui.ago(b.createdAt))}</span>${b.account ? ' · <span>account comes back when it ends</span>' : ''}</small></div>` +
                `${timeLeft(b)}<button type="button" class="m3-btn text small" data-lift="${b.id}">${icon('lock_open')}Lift</button></article>`
              );
            })
            .join('')
        : `<div class="card sb-empty"><m3-shape-icon shape="cookie9" symbol="wifi" size="44" icon-size="22" aria-hidden="true"></m3-shape-icon><div><b>No network bans</b><small class="muted">Nobody is locked out of Budgie by their network.</small></div></div>`;
      if (!still()) fx().stagger(list.querySelectorAll('.sb-row'), { y: 12, step: 40 });
    }
    list.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-lift]');
      if (!btn) return;
      const b = bans.find((x) => String(x.id) === btn.dataset.lift);
      if (!b) return;
      const ok = await M3.dialog({
        headline: b.name ? `Lift the ban on u/${b.name}?` : 'Lift this network ban?',
        symbol: 'lock_open',
        iconShape: 'cookie9',
        body: b.name
          ? b.account
            ? b.networks === 1
              ? `Their network can use Budgie again, and u/${b.name} can sign in again.`
              : `Their networks can use Budgie again, and u/${b.name} can sign in again.`
            : b.networks === 1
              ? 'Their network can use Budgie again. Their account stays banned, if it was banned some other way.'
              : 'Their networks can use Budgie again. Their account stays banned, if it was banned some other way.'
          : 'Everyone on that network can use Budgie again.',
        actions: [{ label: 'Cancel', value: false }, { label: 'Lift it', value: true, variant: 'filled' }],
      });
      if (!ok) return;
      btn.disabled = true;
      try {
        const done = await api.del('/api/admin/ipbans/' + b.id);
        M3.toast(done.account ? `Lifted: u/${done.name} can come back` : 'Ban lifted', { symbol: 'lock_open', shape: 'cookie9' });
        const row = btn.closest('.sb-row');
        await (fx() ? fx().collapseOut(row) : row.remove());
        store.sync().catch(() => {});
        paintList();
      } catch (error) {
        btn.disabled = false;
        app().showError(error);
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const err = form.querySelector('#sb-form-err');
      const name = form.querySelector('#sb-name').value.trim().replace(/^u\//i, '');
      err.textContent = '';
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return (err.textContent = 'Type the username of the account to ban.');
      const u = store.user(name);
      if (u.unknown) return (err.textContent = 'There’s nobody by that name.');
      if (u.admin) return (err.textContent = 'Admins can’t be banned, and neither can the networks they use.');
      if (store.isMe(name)) return (err.textContent = 'You can’t ban yourself.');
      banSheet(u.name).then((done) => done && form.reset());
    });
    document.addEventListener('nook-ipbans', paintList);
    app().onLeave(() => document.removeEventListener('nook-ipbans', paintList));
    paintList();
  });

  // a network banned while Budgie is open: every request now says so; it's said once, plainly
  let toldNetwork = false;
  store.on('sync-failed', (error) => {
    if (!error || !error.network || toldNetwork) return;
    toldNetwork = true;
    M3.snackbar(error.message + ' If you think it’s a mistake, contact Budgie.', { timeout: 10000 });
  });

  Nook.social = { nudge, moment, banSheet };
})();
