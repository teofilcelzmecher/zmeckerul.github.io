// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's motion: what makes a tap feel answered. View transitions between
 * pages, staggered arrivals, shapes that fly to where things went, confetti,
 * height that eases instead of jumping, and haptics. Everything here holds
 * still under reduced motion (the system's or Nook's own setting), and the
 * app works the same without any of it.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const store = Nook.store;
  const motion = M3.motion;
  const reduced = () => motion.reducedMotion();
  const TAU = Math.PI * 2;

  // three springs on the design system's own physics: gentle for arrivals,
  // lively for pops, snappy for indicators that slide
  const gentle = motion.springEasing({ spring: 8, damping: 0.42 });
  const lively = motion.springEasing({ spring: 6, damping: 0.28 });
  const snappy = motion.springEasing({ spring: 9, damping: 0.5 });
  const decel = motion.cssEasing('emphasizedDecel');
  const accel = motion.cssEasing('emphasizedAccel');

  // the springs as css tokens too, for transitions in app.css
  const root = document.documentElement;
  root.style.setProperty('--nook-spring-gentle', `${gentle.duration}ms ${gentle.easing}`);
  root.style.setProperty('--nook-spring-lively', `${lively.duration}ms ${lively.easing}`);
  root.style.setProperty('--nook-spring-snappy', `${snappy.duration}ms ${snappy.easing}`);

  // ---- haptics (1.8) ------------------------------------------------------------------------------------------
  // Each moment has its own feel, written once as taps (a knock: how hard, i, and how sharp, s, both 0 to 1) and
  // buzzes (a vibration that lasts d ms, and can rise or fall) at times t in ms. The phone plays it as well as it
  // can: Budgie for iPhone with Core Haptics, Budgie for Android with its vibrator's own effects (clicks, ticks,
  // thuds, spins, rises and falls), a browser on Android as plain buzzes. Every feel has a depth: 1 for the moments
  // that matter (sent, won, a call), 2 for everyday touches, 3 for the small extras; the setting (Off, Subtle,
  // Standard, Strong) says how deep to go, and how hard.
  const T = (t, i, s = 0.5) => ({ t, k: 'tap', i, s });
  const B = (t, d, i, s = 0.3, r = '') => ({ t, k: 'buzz', d, i, s, r });
  const HAPTICS = {
    // touching things
    tap: [2, [T(0, 0.45, 0.6)]],
    select: [2, [T(0, 0.32, 0.9)]],
    tick: [3, [T(0, 0.22, 1)]],
    toggleOn: [2, [T(0, 0.45, 0.6), T(70, 0.75, 0.85)]],
    toggleOff: [2, [T(0, 0.65, 0.6), T(70, 0.35, 0.35)]],
    open: [3, [B(0, 60, 0.3, 0.2, 'rise'), T(60, 0.4, 0.5)]],
    close: [3, [T(0, 0.3, 0.4)]],
    longPress: [2, [B(0, 50, 0.35, 0.3, 'rise'), T(50, 0.8, 0.7)]],
    refresh: [2, [T(0, 0.55, 0.8)]],
    // how things went
    success: [1, [T(0, 0.5, 0.6), T(110, 0.9, 0.7)]],
    warning: [1, [T(0, 0.7, 0.5), T(160, 0.7, 0.5)]],
    error: [1, [T(0, 0.9, 0.9), T(90, 0.7, 0.6), T(180, 0.9, 0.3)]],
    delete: [1, [B(0, 90, 0.7, 0.2, 'fall'), T(90, 0.8, 0.3)]],
    // people and posts
    upvote: [2, [T(0, 0.45, 0.8), T(60, 0.75, 0.95)]],
    downvote: [2, [T(0, 0.6, 0.25)]],
    spark: [2, [T(0, 0.5, 1), T(50, 0.6, 1), T(100, 0.8, 1), B(100, 140, 0.25, 1, 'fall')]],
    save: [2, [T(0, 0.55, 0.5), T(80, 0.4, 0.85)]],
    join: [1, [T(0, 0.6, 0.5), T(90, 0.9, 0.6), B(90, 120, 0.3, 0.3, 'fall')]],
    friend: [1, [T(0, 0.5, 0.5), T(120, 0.6, 0.55), T(240, 0.9, 0.75)]],
    send: [1, [B(0, 70, 0.4, 0.5, 'rise'), T(70, 0.7, 0.9)]],
    receive: [1, [T(0, 0.55, 0.4), T(80, 0.35, 0.6)]],
    post: [1, [B(0, 120, 0.45, 0.4, 'rise'), T(120, 1, 0.8)]],
    react: [2, [T(0, 0.6, 0.9), T(45, 0.4, 1)]],
    // the fun ones
    nudge: [1, [T(0, 1, 0.6), T(150, 1, 0.6), B(320, 260, 0.5, 0.2, 'fall')]],
    blast: [1, [T(0, 1, 0.35), T(35, 0.8, 0.9), T(70, 0.9, 0.5), T(100, 0.7, 1), T(135, 0.85, 0.4), T(170, 0.6, 0.9), T(210, 0.7, 0.6), T(255, 0.5, 1), T(300, 0.55, 0.5), T(350, 0.4, 0.8), B(0, 420, 0.55, 0.6, 'fall')]],
    achievement: [1, [T(0, 0.6, 0.7), T(100, 0.7, 0.8), T(200, 0.8, 0.9), T(300, 1, 1), B(300, 400, 0.4, 0.8, 'fall')]],
    streak: [2, [T(0, 0.7, 0.8), T(90, 0.9, 0.9)]],
    // games
    move: [2, [T(0, 0.6, 0.7)]],
    drop: [2, [T(0, 0.3, 0.5), T(190, 1, 0.15)]],
    shake: [2, [T(0, 0.5, 0.4)]],
    win: [1, [T(0, 0.7, 0.6), T(110, 0.8, 0.7), T(220, 1, 0.9), B(220, 450, 0.45, 0.7, 'fall')]],
    lose: [1, [B(0, 260, 0.6, 0.1, 'fall'), T(260, 0.6, 0.1)]],
    draw: [1, [T(0, 0.5, 0.5), T(140, 0.5, 0.5)]],
    // calls
    ring: [1, [B(0, 300, 0.8, 0.4), B(450, 300, 0.8, 0.4)]],
    connect: [1, [T(0, 0.6, 0.8), T(90, 0.9, 0.9)]],
    hangup: [1, [T(0, 0.8, 0.3), T(100, 0.5, 0.2)]],
    mute: [2, [T(0, 0.5, 0.35)]],
    unmute: [2, [T(0, 0.5, 0.85)]],
  };
  const DEPTH = { off: 0, subtle: 1, standard: 2, strong: 3 };
  /** how deep the haptics go, 0 (off) to 3 (strong): the setting, or Standard; the old on/off switch still says off */
  function hapticLevel() {
    const s = store.state.settings;
    if (s.haptics === false) return 0;
    return DEPTH[s.hapticLevel] != null ? DEPTH[s.hapticLevel] : 2;
  }
  /** a buzz in milliseconds, or a browser's pattern of them, as a feel (what the app asked for before 1.8) */
  function fromMs(pattern) {
    const out = [];
    let at = 0;
    (Array.isArray(pattern) ? pattern : [pattern]).forEach((ms, i) => {
      ms = Math.max(0, Number(ms) || 0);
      if (i % 2 === 0 && ms) out.push(ms > 30 ? B(at, ms, 0.8, 0.3) : T(at, Math.min(1, 0.25 + ms / 16), 0.55));
      at += ms;
    });
    return out;
  }
  /** a feel as a browser's pattern (on, off, on...): it can only buzz, so a harder tap buzzes a little longer */
  function toPattern(events) {
    const spans = events.map((e) => [e.t, e.t + (e.k === 'buzz' ? Math.round(e.d * Math.max(0.4, e.i)) : Math.round(5 + 16 * e.i))]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [a, b] of spans) {
      const last = merged[merged.length - 1];
      if (last && a <= last[1] + 8) last[1] = Math.max(last[1], b);
      else merged.push([a, b]);
    }
    const out = [];
    let at = 0;
    merged.forEach(([a, b], k) => {
      if (k === 0) a > 0 && out.push(0, a);
      else out.push(a - at);
      out.push(b - a);
      at = b;
    });
    return out;
  }
  let lastFeel = { name: '', at: 0 };
  let lastAnyAt = 0;
  /** a light feel that plays only if nothing else was felt for the same touch (on Strong: a button's tick) */
  function hapticIfQuiet(what) {
    const asked = performance.now();
    setTimeout(() => lastAnyAt < asked && haptic(what), 30);
  }
  /**
   * a feel: haptic('send'), haptic('win'), ... (or, as before 1.8, a buzz in ms or a pattern). `level` plays it at
   * that depth instead of the setting's (Settings lets you feel each one).
   */
  function haptic(what = 'tap', { level } = {}) {
    const depth = level != null ? level : hapticLevel();
    if (!depth) return;
    let events;
    if (typeof what === 'string') {
      const feel = HAPTICS[what];
      if (!feel || feel[0] > depth) return;
      // the same feel twice in a moment (a finger running over a row of things) is felt once
      const now = performance.now();
      if (what === lastFeel.name && now - lastFeel.at < 40) return;
      lastFeel = { name: what, at: now };
      events = feel[1];
    } else events = fromMs(what);
    if (!events.length) return;
    lastAnyAt = performance.now();
    // Subtle is softer, Strong harder and its buzzes a little longer
    const hard = [0, 0.7, 1, 1.25][depth];
    const out = events.map((e) => Object.assign({}, e, { i: Math.min(1, e.i * hard) }, e.k === 'buzz' ? { d: Math.round(e.d * (depth === 3 ? 1.15 : 1)) } : {}));
    // the Android and Apple apps play it themselves
    const native = window.BudgieHaptics;
    if (native && native.play) {
      try {
        native.play(out);
      } catch (_) {
        /* not this time */
      }
      return;
    }
    if (!navigator.vibrate) return;
    // the browser only lets a page buzz once you've touched it
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      navigator.vibrate(toPattern(out));
    } catch (_) {
      /* not allowed here */
    }
  }
  /** whether this device can feel anything at all (a phone's browser, or the Android and Apple apps) */
  const canFeel = () => !!((window.BudgieHaptics && window.BudgieHaptics.play) || navigator.vibrate);

  function play(el, keyframes, options) {
    if (!el || !el.animate || reduced()) return null;
    return el.animate(keyframes, options);
  }
  const settled = (animation) => (animation ? animation.finished.then(() => true, () => false) : Promise.resolve(true));

  /** springs el in from `from` of its size, overshooting a little */
  function pop(el, from = 0.8) {
    return play(el, [{ scale: from }, { scale: 1 }], { duration: lively.duration, easing: lively.easing });
  }

  /** a quick nudge along y and back, for an arrow that was just pressed */
  function nudge(el, dy) {
    return play(el, [{ translate: '0 0' }, { translate: `0 ${dy}px`, offset: 0.25 }, { translate: '0 0' }], { duration: 420, easing: 'ease-out' });
  }

  /** each element rises into place a beat after the one before */
  function stagger(els, { y = 18, step = 45, max = 8 } = {}) {
    if (reduced()) return;
    [...els].forEach((el, index) => {
      const delay = Math.min(index, max) * step;
      play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 260, delay, fill: 'backwards', easing: 'ease-out' });
      play(el, [{ transform: `translateY(${y}px) scale(0.985)` }, { transform: 'none' }], { duration: gentle.duration, delay, fill: 'backwards', easing: gentle.easing });
    });
  }

  /** el's height eases from before `change` to after it, instead of jumping */
  function flipHeight(el, change) {
    if (reduced() || !el.isConnected) {
      change();
      return Promise.resolve();
    }
    const before = el.getBoundingClientRect().height;
    change();
    const after = el.getBoundingClientRect().height;
    if (Math.abs(after - before) < 1) return Promise.resolve();
    el.style.overflow = 'clip';
    const animation = el.animate([{ height: before + 'px' }, { height: after + 'px' }], { duration: Math.min(560, 260 + Math.abs(after - before) * 0.4), easing: decel });
    return settled(animation).then(() => (el.style.overflow = ''));
  }

  /** grows a freshly added element open from nothing */
  function expand(el) {
    if (reduced() || !el.isConnected) return Promise.resolve();
    const height = el.getBoundingClientRect().height;
    el.style.overflow = 'clip';
    play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    const animation = el.animate([{ height: '0px' }, { height: height + 'px' }], { duration: Math.min(520, 240 + height * 0.5), easing: decel });
    return settled(animation).then(() => (el.style.overflow = ''));
  }

  /** fades and shrinks el away, then closes the gap it leaves, then removes it */
  function collapseOut(el) {
    if (!el || !el.isConnected) return Promise.resolve();
    if (reduced()) {
      el.remove();
      return Promise.resolve();
    }
    const style = getComputedStyle(el);
    const gap = el.parentElement ? parseFloat(getComputedStyle(el.parentElement).rowGap) || 0 : 0;
    const out = el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.95)' }], { duration: 180, easing: accel, fill: 'forwards' });
    return settled(out)
      .then(() => {
        el.style.overflow = 'hidden';
        const close = el.animate(
          [
            { height: el.offsetHeight + 'px', paddingTop: style.paddingTop, paddingBottom: style.paddingBottom, marginBottom: '0px' },
            { height: '0px', paddingTop: '0px', paddingBottom: '0px', marginBottom: -gap + 'px' },
          ],
          { duration: 300, easing: decel, fill: 'forwards' }
        );
        return settled(close);
      })
      .then(() => el.remove());
  }

  /** the number in el counts from `from` to `to` */
  function countUp(el, to, { from = 0, duration = 900, format = (n) => String(Math.round(n)) } = {}) {
    if (reduced()) {
      el.textContent = format(to);
      return;
    }
    motion.tween({ from, to, duration, ease: 'emphasizedDecel', onUpdate: (value) => (el.textContent = format(value)) });
  }

  // ---- things that fly ---------------------------------------------------------------

  const tone = (el, role) => (el ? getComputedStyle(el).getPropertyValue(role).trim() : '') || getComputedStyle(root).getPropertyValue(role).trim();

  /** a layer over everything, an open modal dialog included */
  function overlay() {
    const layer = document.createElement('div');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;background:none;overflow:visible;pointer-events:none;z-index:1200;width:auto;height:auto';
    document.body.appendChild(layer);
    if (typeof layer.showPopover === 'function') {
      try {
        layer.setAttribute('popover', 'manual');
        layer.showPopover();
      } catch (_) {
        layer.removeAttribute('popover');
      }
    }
    return layer;
  }

  const centre = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  };
  const onScreen = (r) => r.w > 0 && r.h > 0 && r.x >= 0 && r.x <= innerWidth && r.y >= 0 && r.y <= innerHeight;

  /** a shape flown from one element to another on an arc; resolves as it lands */
  function flyTo(from, to, { shape = 'cookie9', color = '', size = 26, lift = 110, duration = 680 } = {}) {
    if (reduced() || !from || !to) return Promise.resolve(false);
    const a = centre(from);
    const b = centre(to);
    if (!onScreen(a) || !onScreen(b)) return Promise.resolve(false);
    const layer = overlay();
    const el = document.createElement('m3-shape');
    el.setAttribute('shape', shape);
    el.style.cssText = `position:absolute;left:0;top:0;width:${size}px;height:${size}px;color:${color || tone(from, '--m3-primary')};will-change:transform`;
    layer.appendChild(el);
    // a quadratic curve through a point lifted above both ends
    const mx = (a.x + b.x) / 2;
    const my = Math.min(a.y, b.y) - lift;
    const frames = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const u = 1 - t;
      const x = u * u * a.x + 2 * u * t * mx + t * t * b.x - size / 2;
      const y = u * u * a.y + 2 * u * t * my + t * t * b.y - size / 2;
      const scale = t < 0.35 ? 0.6 + (t / 0.35) * 0.8 : 1.4 - ((t - 0.35) / 0.65) * 0.9;
      frames.push({ transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${Math.round(t * 300)}deg) scale(${scale.toFixed(3)})`, offset: t });
    }
    const flight = el.animate(frames, { duration, easing: 'cubic-bezier(0.4, 0, 0.25, 1)' });
    return settled(flight).then(() => {
      layer.remove();
      return true;
    });
  }

  /** confetti of shapes from a point or an element, with a little gravity */
  function confetti(at, { shapes = ['cookie9', 'sunny', 'flower', 'heart', 'clover4'], colors = null, count = 22, power = 1, from = null } = {}) {
    // calm mode (1.0): no confetti
    if (reduced() || document.body.classList.contains('calm')) return;
    const point = at && typeof at.getBoundingClientRect === 'function' ? centre(at) : at;
    if (!point || !Number.isFinite(point.x)) return;
    const source = from || (at && at.nodeType === 1 ? at : null);
    const palette = colors || ['--m3-primary', '--m3-tertiary', '--m3-secondary', '--m3-primary-container', '--m3-tertiary-container'].map((role) => tone(source, role));
    const layer = overlay();
    const pieces = [];
    for (let i = 0; i < count; i++) {
      const size = 10 + Math.random() * 14;
      const el = document.createElement('m3-shape');
      el.setAttribute('shape', shapes[i % shapes.length]);
      el.style.cssText = `position:absolute;left:${point.x - size / 2}px;top:${point.y - size / 2}px;width:${size}px;height:${size}px;color:${palette[i % palette.length]};will-change:transform,opacity`;
      layer.appendChild(el);
      // mostly upwards, fanned out
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = (260 + Math.random() * 320) * power;
      pieces.push({ el, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 900 });
    }
    const gravity = 900;
    motion.tween({
      duration: 1150,
      onUpdate: (t) => {
        const s = t * 1.15;
        const fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        for (const p of pieces) {
          const x = p.vx * s * 0.85;
          const y = p.vy * s + 0.5 * gravity * s * s;
          p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(p.spin * s).toFixed(0)}deg) scale(${(t < 0.1 ? t / 0.1 : 1).toFixed(2)})`;
          p.el.style.opacity = fade.toFixed(3);
        }
      },
      onDone: () => layer.remove(),
    });
  }

  // ---- view transitions -----------------------------------------------------------------

  let active = null;
  const named = new Set();

  /** gives el a shared name for the next view transition */
  function share(el, name) {
    if (!el) return;
    el.style.viewTransitionName = name;
    named.add(el);
  }

  function unshare() {
    for (const el of named) el.style.viewTransitionName = '';
    named.clear();
  }

  const supported = () => typeof document.startViewTransition === 'function' && !reduced();

  /** runs `update` inside a view transition of the given kind, or just runs it */
  function transition(kind, update, { direction = '' } = {}) {
    if (!supported()) {
      unshare();
      return { finished: Promise.resolve(update()), ready: Promise.resolve(), skipped: true };
    }
    if (active) active.skipTransition();
    root.dataset.vt = kind;
    if (direction) root.dataset.vtDir = direction;
    else delete root.dataset.vtDir;
    const vt = document.startViewTransition(update);
    active = vt;
    // a transition cut short by the next one is fine: Safari would otherwise report it as an error
    vt.ready.catch(() => {});
    vt.finished.finally(() => {
      if (active !== vt) return;
      active = null;
      delete root.dataset.vt;
      delete root.dataset.vtDir;
      unshare();
    });
    return vt;
  }

  /** a new theme spreads out in a circle from (x, y) */
  function reveal(x, y, update) {
    if (!supported()) return Promise.resolve(update());
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    // the new colours arrive whole inside the circle, not half-way through a fade
    root.classList.add('fx-still');
    const vt = transition('reveal', () => Promise.race([Promise.resolve(update()), new Promise((r) => setTimeout(r, 700))]));
    vt.ready
      .then(() =>
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 640, easing: decel, pseudoElement: '::view-transition-new(root)' }
        )
      )
      .catch(() => {});
    return vt.finished.finally(() => root.classList.remove('fx-still'));
  }

  Nook.fx = {
    gentle, lively, snappy, decel, accel, reduced, haptic, hapticIfQuiet, HAPTICS, hapticLevel, canFeel, play, settled, pop, nudge, stagger, flipHeight, expand,
    collapseOut, countUp, flyTo, confetti, share, unshare, transition, reveal, supported, tone, onScreen, centre,
  };
})();
