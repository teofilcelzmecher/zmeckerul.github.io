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

  function haptic(pattern = 8) {
    if (store.state.settings.haptics === false || !navigator.vibrate) return;
    // the browser only lets a page buzz once you've touched it
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* not allowed here */
    }
  }

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
    gentle, lively, snappy, decel, accel, reduced, haptic, play, settled, pop, nudge, stagger, flipHeight, expand,
    collapseOut, countUp, flyTo, confetti, share, unshare, transition, reveal, supported, tone, onScreen, centre,
  };
})();
