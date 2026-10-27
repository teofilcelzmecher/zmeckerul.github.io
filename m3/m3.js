/*!
 * m3.js: Material 3 Expressive for the web, ported from Swiftify's design language
 * (https://github.com/swiftify-org/swiftify), which follows end-4's dots-hyprland.
 * Load m3-shapes.js first. Colour schemes come from Google's
 * material-color-utilities (Apache 2.0), served from vendor/ when first needed.
 *
 * Copyright (C) 2026 shredos67, thefoxyydev and the Swiftify contributors
 * Copyright (C) 2026 teofilcelzmecher
 *
 * This program is free software: you can redistribute it and/or modify it under the
 * terms of the GNU General Public License as published by the Free Software
 * Foundation, either version 3 of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY
 * WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
 * PARTICULAR PURPOSE. See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this
 * program (LICENSE, beside this file). If not, see <https://www.gnu.org/licenses/>.
 */

// ==== core.js ====
// core: colour, motion, the shared spin, wavy geometry and <m3-shape>. everything
// else in m3.js is built on these.
(function (global) {
  'use strict';

  const doc = global.document;
  const M3 = (global.M3 = global.M3 || {});
  M3.version = '1.0.0';

  // ---- util ---------------------------------------------------------------

  const clamp = (value, lo, hi) => Math.min(hi, Math.max(lo, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const now = () => (global.performance ? global.performance.now() : Date.now());
  const raf = global.requestAnimationFrame
    ? (fn) => global.requestAnimationFrame(fn)
    : (fn) => setTimeout(() => fn(now()), 16);
  const caf = global.cancelAnimationFrame ? (id) => global.cancelAnimationFrame(id) : (id) => clearTimeout(id);
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function onReady(fn) {
    if (!doc) return;
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => fn(), { once: true });
    else fn();
  }

  // each enhancer runs once per element: for what is on the page now, and for
  // whatever is added later
  const enhancers = [];
  let mutations = null;

  function runEnhancer(entry, root) {
    const visit = (el) => {
      if (entry.done.has(el)) return;
      entry.done.add(el);
      try {
        entry.fn(el);
      } catch (error) {
        console.error('m3: enhancing', entry.selector, error);
      }
    };
    if (root.nodeType === 1 && root.matches(entry.selector)) visit(root);
    if (root.querySelectorAll) root.querySelectorAll(entry.selector).forEach(visit);
  }

  function enhance(selector, fn) {
    const entry = { selector, fn, done: new WeakSet() };
    enhancers.push(entry);
    onReady(() => {
      runEnhancer(entry, doc);
      if (!mutations && global.MutationObserver) {
        mutations = new MutationObserver((records) => {
          for (const record of records) {
            for (const node of record.addedNodes) {
              if (node.nodeType !== 1) continue;
              for (const each of enhancers) runEnhancer(each, node);
            }
          }
        });
        mutations.observe(doc.documentElement, { childList: true, subtree: true });
      }
    });
  }

  /** cb(isVisible) as the element comes and goes from view; returns a stop function */
  function observeVisible(el, cb) {
    if (!global.IntersectionObserver) {
      cb(true);
      return () => {};
    }
    const observer = new IntersectionObserver((entries) => cb(entries[entries.length - 1].isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }

  /** a string to a 32-bit seed (fnv-1a), as Stickers.qml does */
  function hash(text) {
    let value = 2166136261;
    for (let index = 0; index < text.length; index++) {
      value ^= text.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  /** mulberry32: the same seed always gives the same sequence */
  function rng(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function svg(tag, attrs) {
    const el = doc.createElementNS(SVG_NS, tag);
    if (attrs) for (const name in attrs) el.setAttribute(name, attrs[name]);
    return el;
  }

  M3.util = { clamp, lerp, now, raf, caf, onReady, enhance, observeVisible, hash, rng, svg };

  // ---- colour -------------------------------------------------------------

  // material's 49 roles, in Swiftify's order (MaterialScheme.cpp)
  const ROLES = [
    'background', 'onBackground', 'surface', 'surfaceDim', 'surfaceBright', 'surfaceContainerLowest',
    'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest', 'onSurface',
    'surfaceVariant', 'onSurfaceVariant', 'inverseSurface', 'inverseOnSurface', 'outline', 'outlineVariant',
    'shadow', 'scrim', 'surfaceTint', 'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
    'inversePrimary', 'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer', 'tertiary',
    'onTertiary', 'tertiaryContainer', 'onTertiaryContainer', 'error', 'onError', 'errorContainer',
    'onErrorContainer', 'primaryFixed', 'primaryFixedDim', 'onPrimaryFixed', 'onPrimaryFixedVariant',
    'secondaryFixed', 'secondaryFixedDim', 'onSecondaryFixed', 'onSecondaryFixedVariant', 'tertiaryFixed',
    'tertiaryFixedDim', 'onTertiaryFixed', 'onTertiaryFixedVariant',
  ];

  function parse(value) {
    if (value && typeof value === 'object') return value;
    let hex = String(value).trim().replace(/^#/, '');
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    const int = parseInt(hex.slice(0, 6), 16);
    return {
      r: ((int >> 16) & 255) / 255,
      g: ((int >> 8) & 255) / 255,
      b: (int & 255) / 255,
      a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }

  function css(color) {
    const c = parse(color);
    const channel = (v) => Math.round(clamp(v, 0, 1) * 255);
    if (c.a >= 0.999) return '#' + [c.r, c.g, c.b].map((v) => channel(v).toString(16).padStart(2, '0')).join('');
    return `rgb(${channel(c.r)} ${channel(c.g)} ${channel(c.b)} / ${Math.round(c.a * 1000) / 1000})`;
  }

  /** end4's ColorUtils.mix: `amount` of a, the rest of b, alpha included */
  function mix(a, b, amount) {
    const x = parse(a);
    const y = parse(b);
    const t = clamp(amount, 0, 1);
    return {
      r: x.r * t + y.r * (1 - t),
      g: x.g * t + y.g * (1 - t),
      b: x.b * t + y.b * (1 - t),
      a: x.a * t + y.a * (1 - t),
    };
  }

  function withAlpha(color, alpha) {
    const c = parse(color);
    return { r: c.r, g: c.g, b: c.b, a: clamp(alpha, 0, 1) };
  }

  // the layer, hover and pressed colours end4 derives from the roles, in
  // order: later ones read earlier ones (MaterialScheme::derive)
  const DERIVED = [
    ['subtext', (c) => c.outline],
    ['layer0', (c) => c.background],
    ['onLayer0', (c) => c.onBackground],
    ['layer0Hover', (c) => mix(c.background, c.onBackground, 0.9)],
    ['layer0Active', (c) => mix(c.background, c.onBackground, 0.8)],
    ['layer0Border', (c) => mix(c.outlineVariant, c.background, 0.4)],
    ['layer1', (c) => c.surfaceContainerLow],
    ['onLayer1', (c) => c.onSurfaceVariant],
    ['onLayer1Inactive', (c) => mix(c.onSurfaceVariant, c.surfaceContainerLow, 0.45)],
    ['layer1Hover', (c) => mix(c.surfaceContainerLow, c.onSurfaceVariant, 0.92)],
    ['layer1Active', (c) => mix(c.surfaceContainerLow, c.onSurfaceVariant, 0.85)],
    ['layer2', (c) => c.surfaceContainer],
    ['onLayer2', (c) => c.onSurface],
    ['layer2Hover', (c) => mix(c.surfaceContainer, c.onSurface, 0.9)],
    ['layer2Active', (c) => mix(c.surfaceContainer, c.onSurface, 0.8)],
    ['layer2Disabled', (c) => mix(c.surfaceContainer, c.background, 0.8)],
    ['onLayer2Disabled', (c) => mix(c.onSurface, c.background, 0.4)],
    ['layer3', (c) => c.surfaceContainerHigh],
    ['onLayer3', (c) => c.onSurface],
    ['layer3Hover', (c) => mix(c.surfaceContainerHigh, c.onSurface, 0.9)],
    ['layer3Active', (c) => mix(c.surfaceContainerHigh, c.onSurface, 0.8)],
    ['layer4', (c) => c.surfaceContainerHighest],
    ['onLayer4', (c) => c.onSurface],
    ['layer4Hover', (c) => mix(c.surfaceContainerHighest, c.onSurface, 0.9)],
    ['layer4Active', (c) => mix(c.surfaceContainerHighest, c.onSurface, 0.8)],
    ['primaryHover', (c) => mix(c.primary, c.layer1Hover, 0.87)],
    ['primaryActive', (c) => mix(c.primary, c.layer1Active, 0.7)],
    ['primaryContainerHover', (c) => mix(c.primaryContainer, c.onPrimaryContainer, 0.9)],
    ['primaryContainerActive', (c) => mix(c.primaryContainer, c.onPrimaryContainer, 0.8)],
    ['secondaryHover', (c) => mix(c.secondary, c.layer1Hover, 0.85)],
    ['secondaryActive', (c) => mix(c.secondary, c.layer1Active, 0.4)],
    ['secondaryContainerHover', (c) => mix(c.secondaryContainer, c.onSecondaryContainer, 0.9)],
    ['secondaryContainerActive', (c) => mix(c.secondaryContainer, c.onSecondaryContainer, 0.54)],
    ['tertiaryHover', (c) => mix(c.tertiary, c.layer1Hover, 0.85)],
    ['tertiaryActive', (c) => mix(c.tertiary, c.layer1Active, 0.4)],
    ['tertiaryContainerHover', (c) => mix(c.tertiaryContainer, c.onTertiaryContainer, 0.9)],
    ['tertiaryContainerActive', (c) => mix(c.tertiaryContainer, c.layer1Active, 0.54)],
    ['surfaceContainerHighestHover', (c) => mix(c.surfaceContainerHighest, c.onSurface, 0.95)],
    ['surfaceContainerHighestActive', (c) => mix(c.surfaceContainerHighest, c.onSurface, 0.85)],
    ['tooltip', (c) => c.inverseSurface],
    ['onTooltip', (c) => c.inverseOnSurface],
    ['scrimOverlay', (c) => withAlpha(c.scrim, 0.5)],
    ['shadowColor', (c) => withAlpha(c.shadow, 0.3)],
    ['errorHover', (c) => mix(c.error, c.layer1Hover, 0.85)],
    ['errorActive', (c) => mix(c.error, c.layer1Active, 0.7)],
    ['errorContainerHover', (c) => mix(c.errorContainer, c.onErrorContainer, 0.9)],
    ['errorContainerActive', (c) => mix(c.errorContainer, c.onErrorContainer, 0.7)],
  ];

  /** the 49 roles (hex strings or {r,g,b,a}) plus everything derived from them */
  function derive(roles) {
    const colors = {};
    for (const role of ROLES) colors[role] = parse(roles[role]);
    for (const [name, make] of DERIVED) colors[name] = make(colors);
    return colors;
  }

  const variableName = (role) => '--m3-' + role.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());

  function variables(colors) {
    const out = {};
    for (const role of Object.keys(colors)) out[variableName(role)] = css(colors[role]);
    return out;
  }

  // relative luminance on the gamma-encoded channels, as Swiftify compares it
  function isDark(colors) {
    const b = parse(colors.background);
    return 0.2126 * b.r + 0.7152 * b.g + 0.0722 * b.b < 0.5;
  }

  const SCHEMES = {
    tonalSpot: 'SchemeTonalSpot', // Swiftify's default
    content: 'SchemeContent', // Swiftify's "fidelity" choice, for album art
    fidelity: 'SchemeFidelity',
    expressive: 'SchemeExpressive',
    vibrant: 'SchemeVibrant',
    neutral: 'SchemeNeutral',
    monochrome: 'SchemeMonochrome',
    rainbow: 'SchemeRainbow',
    fruitSalad: 'SchemeFruitSalad',
  };
  // served beside this file, so no request leaves the site
  const COLOR_UTILITIES_URL = new URL('vendor/material-color-utilities.js', (doc.currentScript && doc.currentScript.src) || location.href).href;
  let colorUtilities = null;

  function loadColorUtilities() {
    if (!colorUtilities) {
      colorUtilities = import(COLOR_UTILITIES_URL);
      // a failed load (offline) can be tried again later
      colorUtilities.catch(() => (colorUtilities = null));
    }
    return colorUtilities;
  }

  /** a derived scheme from an already loaded material-color-utilities module */
  function schemeFrom(utilities, { seed = '#6750a4', dark = false, variant = 'tonalSpot', contrast = 0 } = {}) {
    const Scheme = utilities[SCHEMES[variant]] || utilities.SchemeTonalSpot;
    const scheme = new Scheme(utilities.Hct.fromInt(utilities.argbFromHex(css(seed))), !!dark, contrast);
    const roles = {};
    for (const role of ROLES) roles[role] = utilities.hexFromArgb(scheme[role]);
    return derive(roles);
  }

  async function scheme(options) {
    return schemeFrom(await loadColorUtilities(), options);
  }

  function apply(colors, target) {
    const el = target || doc.documentElement;
    const vars = variables(colors);
    for (const name in vars) el.style.setProperty(name, vars[name]);
    el.style.colorScheme = isDark(colors) ? 'dark' : 'light';
    el.dispatchEvent(new CustomEvent('m3-themechange', { bubbles: true, detail: { colors } }));
  }

  async function setTheme(options = {}) {
    const colors = await scheme(options);
    apply(colors, options.target);
    return colors;
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('m3: could not load ' + url));
      image.src = url;
    });
  }

  /** the colour material would theme an image with (needs a same-origin or data url image) */
  async function seedFromImage(image) {
    const utilities = await loadColorUtilities();
    const source = typeof image === 'string' ? await loadImage(image) : image;
    if (source.decode) await source.decode().catch(() => {});
    return utilities.hexFromArgb(await utilities.sourceColorFromImage(source));
  }

  M3.color = {
    ROLES,
    DERIVED_ROLES: DERIVED.map(([name]) => name),
    VARIANTS: Object.keys(SCHEMES),
    parse,
    css,
    mix,
    withAlpha,
    derive,
    variables,
    isDark,
    loadColorUtilities,
    schemeFrom,
    scheme,
    apply,
    setTheme,
    seedFromImage,
  };

  // ---- motion -------------------------------------------------------------

  const reduceQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;

  /** nothing moves of its own accord, over and over; what answers a click still moves */
  function reducedMotion() {
    return !!(reduceQuery && reduceQuery.matches) || !!(doc && doc.documentElement.hasAttribute('data-m3-reduce-motion'));
  }

  // end4's animation curves, as Qt BezierSpline lists: (c1, c2, end) per segment
  const curves = {
    expressiveFastSpatial: [0.42, 1.67, 0.21, 0.9, 1, 1],
    expressiveDefaultSpatial: [0.38, 1.21, 0.22, 1.0, 1, 1],
    expressiveSlowSpatial: [0.39, 1.29, 0.35, 0.98, 1, 1],
    expressiveEffects: [0.34, 0.8, 0.34, 1.0, 1, 1],
    emphasized: [0.05, 0, 2 / 15, 0.06, 1 / 6, 0.4, 5 / 24, 0.82, 0.25, 1, 1, 1],
    emphasizedAccel: [0.3, 0, 0.8, 0.15, 1, 1],
    emphasizedDecel: [0.05, 0.7, 0.1, 1, 1, 1],
    standard: [0.2, 0, 0, 1, 1, 1],
    standardAccel: [0.3, 0, 1, 1, 1, 1],
    standardDecel: [0, 0, 0, 1, 1, 1],
  };

  const bezier = (p0, p1, p2, p3, s) => {
    const u = 1 - s;
    return u * u * u * p0 + 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s * p3;
  };

  /** a Qt BezierSpline curve as an easing function */
  function bezierSpline(points) {
    const segments = [];
    let x0 = 0;
    let y0 = 0;
    for (let index = 0; index + 5 < points.length; index += 6) {
      const [c1x, c1y, c2x, c2y, x, y] = points.slice(index, index + 6);
      segments.push([x0, y0, c1x, c1y, c2x, c2y, x, y]);
      x0 = x;
      y0 = y;
    }
    return (x) => {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      const seg = segments.find((s) => x <= s[6]) || segments[segments.length - 1];
      // x rises monotonically along each segment, so bisection finds the parameter
      let lo = 0;
      let hi = 1;
      let s = 0.5;
      for (let step = 0; step < 32; step++) {
        s = (lo + hi) / 2;
        if (bezier(seg[0], seg[2], seg[4], seg[6], s) < x) lo = s;
        else hi = s;
      }
      return bezier(seg[1], seg[3], seg[5], seg[7], s);
    };
  }

  const ease = {
    linear: (t) => t,
    inCubic: (t) => t * t * t,
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    inSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  };
  for (const name of Object.keys(curves)) ease[name] = bezierSpline(curves[name]);

  const backs = new Map();
  /** Qt's Easing.OutBack with easing.overshoot */
  function outBack(overshoot = 1.70158) {
    if (!backs.has(overshoot)) {
      backs.set(overshoot, (t) => {
        const u = t - 1;
        return u * u * ((overshoot + 1) * u + overshoot) + 1;
      });
    }
    return backs.get(overshoot);
  }

  function linearEasing(fn, samples = 48) {
    const points = [];
    for (let index = 0; index <= samples; index++) points.push(+fn(index / samples).toFixed(4));
    return 'linear(' + points.join(', ') + ')';
  }

  const cssCache = new Map();
  /** a curve's name, an easing function or a css easing, as a css easing */
  function cssEasing(value) {
    if (typeof value === 'function') {
      if (!cssCache.has(value)) cssCache.set(value, linearEasing(value));
      return cssCache.get(value);
    }
    if (typeof value !== 'string') return 'linear';
    const points = curves[value];
    if (points && points.length === 6) return `cubic-bezier(${points[0]}, ${points[1]}, ${points[2]}, ${points[3]})`;
    if (ease[value]) return cssEasing(ease[value]);
    return value;
  }

  const resolveEase = (value) => (typeof value === 'function' ? value : ease[value] || ease.linear);

  // end4's named motions (qml/motion)
  const presets = {
    elementMove: { duration: 500, ease: 'expressiveDefaultSpatial' },
    elementMoveEnter: { duration: 400, ease: 'emphasizedDecel' },
    elementMoveExit: { duration: 200, ease: 'emphasizedAccel' },
    elementMoveFast: { duration: 200, ease: 'expressiveEffects' },
    elementMoveSmall: { duration: 350, ease: 'expressiveFastSpatial' },
    elementResize: { duration: 300, ease: 'emphasized' },
    clickBounce: { duration: 400, ease: 'expressiveDefaultSpatial' },
    hoverFade: { duration: 350, ease: 'standard' },
    sidebarSlideEnter: { duration: 300, ease: 'standardDecel' },
    sidebarSlideExit: { duration: 250, ease: 'standardAccel' },
  };

  // Swiftify's SpringAnimations
  const springs = {
    bounce: { spring: 7, damping: 0.24 }, // Bounce.qml: a press squishes, a release springs back
    morph: { spring: 3.5, damping: 0.3 }, // ShapeButton.qml's shape morph
    flight: { spring: 3.4, damping: 0.27 }, // HeroFlight.qml
    kick: { spring: 3, damping: 0.3, epsilon: 0.05 }, // LoadingSpinner.qml's quarter turns
    tilt: { spring: 4, damping: 0.3, epsilon: 0.01 }, // MediaCard.qml's lean toward the pointer
  };

  // Qt's SpringAnimation integrates in 16 ms steps: the velocity gains
  // spring * distance less damping * velocity each step, and the value moves by
  // velocity * 16 ms. the same steps here give the same feel
  const STEP_MS = 16;
  const springDefaults = { spring: 7, damping: 0.24, mass: 1, epsilon: 0.002 };

  function springStep(state, target, p) {
    state.velocity += (p.spring * (target - state.x) - p.damping * state.velocity) / p.mass;
    state.x += (state.velocity * STEP_MS) / 1000;
    return Math.abs(state.velocity) < p.epsilon && Math.abs(target - state.x) < p.epsilon;
  }

  class Spring {
    constructor(value = 0, params = springs.bounce, onUpdate = null) {
      this.params = Object.assign({}, springDefaults, params);
      this.onUpdate = onUpdate;
      this.value = value;
      this.target = value;
      this.velocity = 0;
      this.x = value;
      this._previous = value;
      this._frame = 0;
      this._last = 0;
      this._carry = 0;
      this._tick = this._tick.bind(this);
    }

    get running() {
      return this._frame !== 0;
    }

    to(target) {
      this.target = target;
      if (!this._frame) {
        this.x = this._previous = this.value;
        this._last = now();
        this._carry = 0;
        this._frame = raf(this._tick);
      }
      return this;
    }

    jump(value) {
      this.stop();
      this.value = this.target = this.x = this._previous = value;
      this.velocity = 0;
      if (this.onUpdate) this.onUpdate(value);
      return this;
    }

    stop() {
      if (this._frame) caf(this._frame);
      this._frame = 0;
      return this;
    }

    _tick(time) {
      let elapsed = clamp(time - this._last, 0, 100) + this._carry;
      this._last = time;
      while (elapsed >= STEP_MS) {
        elapsed -= STEP_MS;
        this._previous = this.x;
        if (springStep(this, this.target, this.params)) {
          this.value = this.x = this.target;
          this.velocity = 0;
          this._frame = 0;
          if (this.onUpdate) this.onUpdate(this.value);
          return;
        }
      }
      this._carry = elapsed;
      // drawn part way between steps, so it stays smooth on fast displays
      this.value = lerp(this._previous, this.x, elapsed / STEP_MS);
      this._frame = raf(this._tick);
      if (this.onUpdate) this.onUpdate(this.value);
    }
  }

  /** a spring from 0 to 1 as a css linear() easing and the time it takes to settle */
  function springEasing(params) {
    const p = Object.assign({}, springDefaults, params);
    const state = { x: 0, velocity: 0 };
    const xs = [0];
    for (let step = 0; step < 1000; step++) {
      const settled = springStep(state, 1, p);
      xs.push(state.x);
      if (settled) break;
    }
    xs[xs.length - 1] = 1;
    const count = Math.min(64, xs.length - 1);
    const points = [];
    for (let index = 0; index <= count; index++) {
      const f = (index / count) * (xs.length - 1);
      const a = Math.floor(f);
      const b = Math.min(xs.length - 1, a + 1);
      points.push(+lerp(xs[a], xs[b], f - a).toFixed(4));
    }
    return { duration: (xs.length - 1) * STEP_MS, easing: 'linear(' + points.join(', ') + ')' };
  }

  function tween({ from = 0, to = 1, duration = 300, ease: easing = 'linear', onUpdate = null, onDone = null } = {}) {
    const fn = resolveEase(easing);
    let frame = 0;
    const handle = {
      stop() {
        if (frame) caf(frame);
        frame = 0;
      },
      get running() {
        return frame !== 0;
      },
    };
    if (!(duration > 0)) {
      if (onUpdate) onUpdate(to);
      if (onDone) onDone();
      return handle;
    }
    const start = now();
    const step = (time) => {
      const t = clamp((time - start) / duration, 0, 1);
      if (t < 1) frame = raf(step);
      else frame = 0;
      if (onUpdate) onUpdate(lerp(from, to, fn(t)));
      if (t >= 1 && onDone) onDone();
    };
    frame = raf(step);
    return handle;
  }

  /** a value that eases to each new target from wherever it is (a QML Behavior) */
  class Tweened {
    constructor(value = 0, { duration = 200, ease: easing = 'linear' } = {}, onUpdate = null) {
      this.value = value;
      this.target = value;
      this.duration = duration;
      this.ease = easing;
      this.onUpdate = onUpdate;
      this._animation = null;
    }

    get running() {
      return !!(this._animation && this._animation.running);
    }

    to(target) {
      if (target === this.target) return this;
      this.target = target;
      if (this._animation) this._animation.stop();
      this._animation = tween({
        from: this.value,
        to: target,
        duration: this.duration,
        ease: this.ease,
        onUpdate: (value) => {
          this.value = value;
          if (this.onUpdate) this.onUpdate(value);
        },
      });
      return this;
    }

    jump(value) {
      if (this._animation) this._animation.stop();
      this.value = this.target = value;
      if (this.onUpdate) this.onUpdate(value);
      return this;
    }
  }

  // Drift.qml: a phase that runs while active, easing up to speed and back down
  // to rest instead of starting and stopping dead, carrying on from wherever it
  // stopped. it asks for frames only while it moves
  class Drift {
    constructor({ speed = 1, period = Math.PI * 2, onUpdate = null } = {}) {
      this.speed = speed;
      this.period = period;
      this.onUpdate = onUpdate;
      this.value = 0;
      this.rate = 0;
      this._active = false;
      this._goal = 0;
      this._rate = null;
      this._frame = 0;
      this._last = 0;
      this._tick = this._tick.bind(this);
    }

    get active() {
      return this._active;
    }

    set active(on) {
      this._active = !!on;
      const goal = this._active && !reducedMotion() ? this.speed : 0;
      if (goal === this._goal) return;
      this._goal = goal;
      if (this._rate) this._rate.stop();
      this._rate = tween({
        from: this.rate,
        to: goal,
        duration: 650,
        ease: 'inOutSine',
        onUpdate: (rate) => {
          this.rate = rate;
          this._run();
        },
      });
    }

    stop() {
      this._active = false;
      this._goal = 0;
      if (this._rate) this._rate.stop();
      this.rate = 0;
      if (this._frame) caf(this._frame);
      this._frame = 0;
    }

    _run() {
      if (!this._frame && Math.abs(this.rate) > 1e-4) {
        this._last = now();
        this._frame = raf(this._tick);
      }
    }

    _tick(time) {
      const dt = clamp((time - this._last) / 1000, 0, 0.1);
      this._last = time;
      this.value = (this.value + this.rate * dt) % this.period;
      const moving = Math.abs(this.rate) > 1e-4 || (this._rate && this._rate.running);
      this._frame = moving ? raf(this._tick) : 0;
      if (this.onUpdate) this.onUpdate(this.value);
    }
  }

  /** the web animations api with the curves above by name */
  // Safari before 17.2 has no linear() easing and throws when an animation asks
  // for one: there a curve that overshoots becomes a back-out, the rest a decel
  if (global.Element && Element.prototype.animate && global.CSS && CSS.supports && !CSS.supports('transition-timing-function', 'linear(0, 1)')) {
    const native = Element.prototype.animate;
    const plain = (easing) => {
      if (typeof easing !== 'string' || easing.indexOf('linear(') < 0) return easing;
      const peak = Math.max(...(easing.match(/-?\d*\.?\d+/g) || ['1']).map(Number));
      return peak > 1.001 ? 'cubic-bezier(0.34, 1.4, 0.64, 1)' : 'cubic-bezier(0.2, 0, 0, 1)';
    };
    Element.prototype.animate = function (keyframes, options) {
      if (options && typeof options === 'object' && options.easing) options = Object.assign({}, options, { easing: plain(options.easing) });
      if (Array.isArray(keyframes)) keyframes = keyframes.map((k) => (k && k.easing ? Object.assign({}, k, { easing: plain(k.easing) }) : k));
      return native.call(this, keyframes, options);
    };
  }

  function animate(el, keyframes, { duration = 300, ease: easing = 'linear', fill = 'none', delay = 0, composite } = {}) {
    if (!el || !el.animate) return null;
    const options = { duration, easing: cssEasing(easing), fill, delay };
    if (composite) options.composite = composite;
    return el.animate(keyframes, options);
  }

  M3.motion = {
    reducedMotion,
    curves,
    ease,
    outBack,
    bezierSpline,
    cssEasing,
    linearEasing,
    presets,
    springs,
    Spring,
    springEasing,
    tween,
    Tweened,
    Drift,
    animate,
  };

  // ---- the shared spin ----------------------------------------------------

  // UiState.spin: one turn shared by everything that spins, so it all moves
  // together. it runs while any owner holds it (Swiftify: while music plays),
  // easing up and down over 900 ms; a spring here overshot and made it lurch
  const spin = {
    value: 0,
    speed: 0,
    _holders: new Set(),
    _listeners: new Set(),
    _goal: 0,
    _ease: null,
    _frame: 0,
    _last: 0,
    hold(owner, on) {
      if (on) this._holders.add(owner);
      else this._holders.delete(owner);
      this._retarget();
    },
    subscribe(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    },
    _retarget() {
      const goal = this._holders.size > 0 && !reducedMotion() ? 0.9 : 0;
      if (goal === this._goal) return;
      this._goal = goal;
      if (this._ease) this._ease.stop();
      this._ease = tween({
        from: this.speed,
        to: goal,
        duration: 900,
        ease: 'inOutSine',
        onUpdate: (speed) => {
          this.speed = speed;
          if (!this._frame && speed > 1e-5) {
            this._last = now();
            this._frame = raf(spinTick);
          }
        },
      });
    },
  };

  function spinTick(time) {
    const dt = clamp((time - spin._last) / 1000, 0, 0.1);
    spin._last = time;
    spin.value += spin.speed * dt;
    const moving = spin.speed > 1e-5 || (spin._ease && spin._ease.running);
    spin._frame = moving ? raf(spinTick) : 0;
    for (const fn of spin._listeners) {
      try {
        fn(spin.value);
      } catch (error) {
        console.error('m3: spin listener', error);
      }
    }
  }

  if (reduceQuery && reduceQuery.addEventListener) reduceQuery.addEventListener('change', () => spin._retarget());
  M3.spin = spin;

  // ---- geometry -----------------------------------------------------------

  const fmt = (value) => String(Math.round(value * 100) / 100);
  let warnedShapes = false;

  /** a material shape, or a shape part way to another, as svg path data in a size box */
  function shapePath(from, to = '', progress = 0, size = 100) {
    const shapes = global.M3Shapes;
    if (!shapes) {
      if (!warnedShapes) console.warn('m3: load m3-shapes.js before m3.js to draw shapes');
      warnedShapes = true;
      return '';
    }
    try {
      if (!to || to === from || progress === 0) return shapes.path(from, size);
      if (progress === 1) return shapes.path(to, size);
      return shapes.morphPath(from, to, progress, size);
    } catch (error) {
      console.warn('m3:', error.message);
      return shapes.path('circle', size);
    }
  }

  // a point and its outward normal on a rounded box (straight halves sx, sy,
  // corner radius r, quarter-arc length q), `s` along the outline clockwise from
  // the top middle, as wavy_pill.frag measures it
  function outlinePoint(s, sx, sy, r, q) {
    const hx = sx + r;
    const hy = sy + r;
    const arc = (cx, cy, start, length) => {
      const a = start + (r > 0 ? length / r : 0);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a), Math.cos(a), Math.sin(a)];
    };
    if (s < sx) return [s, -hy, 0, -1];
    s -= sx;
    if (s < q) return arc(sx, -sy, -Math.PI / 2, s);
    s -= q;
    if (s < 2 * sy) return [hx, -sy + s, 1, 0];
    s -= 2 * sy;
    if (s < q) return arc(sx, sy, 0, s);
    s -= q;
    if (s < 2 * sx) return [sx - s, hy, 0, 1];
    s -= 2 * sx;
    if (s < q) return arc(-sx, sy, Math.PI / 2, s);
    s -= q;
    if (s < 2 * sy) return [-hx, sy - s, -1, 0];
    s -= 2 * sy;
    if (s < q) return arc(-sx, -sy, Math.PI, s);
    s -= q;
    return [-sx + s, -hy, 0, -1];
  }

  /**
   * wavy_pill.frag's outline: a rounded box inset by the amplitude, pushed out by
   * a wave measured along its own outline, so the scallops run evenly down the
   * straight sides and round the ends alike and meet without a seam
   */
  function wavyRoundedRect(w, h, { amplitude = 2.2, wavelength = 15, phase = 0, radius = Infinity } = {}) {
    const inset = amplitude + 0.75;
    const hx = Math.max(0, w / 2 - inset);
    const hy = Math.max(0, h / 2 - inset);
    const r = Math.min(hx, hy, Math.max(0, radius - inset));
    const sx = hx - r;
    const sy = hy - r;
    const q = (Math.PI / 2) * r;
    const perimeter = 4 * (sx + sy) + 4 * q;
    if (!(perimeter > 0)) return '';
    // counted round the full-size outline, so the count holds while the
    // amplitude springs about and a press never makes the edge jump
    const ox = w / 2 - 0.75;
    const oy = h / 2 - 0.75;
    const or = Math.min(ox, oy, Math.max(0, radius - 0.75));
    const outerPerimeter = 4 * (ox - or + (oy - or)) + 2 * Math.PI * or;
    const scallops = Math.max(1, Math.round(outerPerimeter / Math.max(wavelength, 1)));
    const samples = clamp(Math.max(Math.ceil(perimeter / 1.5), scallops * 12), 48, 2000);
    let d = '';
    for (let index = 0; index < samples; index++) {
      const s = (index / samples) * perimeter;
      const [x, y, nx, ny] = outlinePoint(s, sx, sy, r, q);
      const push = amplitude * (0.5 + 0.5 * Math.cos((2 * Math.PI * scallops * s) / perimeter - phase));
      d += (index ? 'L' : 'M') + fmt(w / 2 + x + nx * push) + ' ' + fmt(h / 2 + y + ny * push);
    }
    return d + 'Z';
  }

  /** a sine along y from x0 to x1, measured from x = 0 (wavy_progress.frag) */
  function sineLine(x0, x1, y, { amplitude = 2, wavelength = 16, phase = 0, step = 1.5 } = {}) {
    if (!(x1 > x0)) return '';
    const count = Math.max(1, Math.ceil((x1 - x0) / step));
    let d = '';
    for (let index = 0; index <= count; index++) {
      const x = lerp(x0, x1, index / count);
      d += (index ? 'L' : 'M') + fmt(x) + ' ' + fmt(y + amplitude * Math.sin((2 * Math.PI * x) / wavelength + phase));
    }
    return d;
  }

  /** a ring that waves as it goes round, from 12 o'clock clockwise (squiggle_ring.frag) */
  function wavyRing(cx, cy, radius, { amplitude = 2, waves = 12, phase = 0, from = 0, to = Math.PI * 2 } = {}) {
    const span = to - from;
    if (!(span > 0)) return '';
    const full = span >= Math.PI * 2 - 1e-6;
    const count = Math.max(24, Math.ceil((span * (radius + amplitude)) / 1.5), Math.ceil((waves * 16 * span) / (Math.PI * 2)));
    let d = '';
    const last = full ? count - 1 : count;
    for (let index = 0; index <= last; index++) {
      const t = from + (span * index) / count;
      const r = radius + amplitude * Math.sin(waves * t - phase);
      d += (index ? 'L' : 'M') + fmt(cx + r * Math.sin(t)) + ' ' + fmt(cy - r * Math.cos(t));
    }
    return full ? d + 'Z' : d;
  }

  M3.geometry = { shapePath, wavyRoundedRect, sineLine, wavyRing };

  // ---- <m3-shape> ---------------------------------------------------------

  if (global.customElements && !global.customElements.get('m3-shape')) {
    // a material shape in currentColor: `shape`, part way (`morph`) to `morph-to`,
    // turned by `angle` degrees and drawn at `extent` of its box
    class M3Shape extends HTMLElement {
      static get observedAttributes() {
        return ['shape', 'morph-to', 'morph', 'angle', 'extent'];
      }

      constructor() {
        super();
        this._shape = 'circle';
        this._to = '';
        this._morph = 0;
        this._angle = 0;
        this._extent = 1;
        this._animation = null;
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML =
          '<style>:host{display:inline-block;width:40px;height:40px;flex:none;color:var(--m3-primary);' +
          'line-height:0;vertical-align:middle}svg{display:block;width:100%;height:100%;overflow:visible}' +
          'path{transform-box:view-box;transform-origin:50px 50px}</style>' +
          '<svg viewBox="0 0 100 100" aria-hidden="true" part="svg"><path part="path" fill="currentColor"></path></svg>';
        this._path = root.querySelector('path');
      }

      connectedCallback() {
        this._draw();
        this._place();
      }

      disconnectedCallback() {
        this.stop();
      }

      attributeChangedCallback(name, old, value) {
        if (old === value) return;
        if (name === 'shape') this._shape = value || 'circle';
        else if (name === 'morph-to') this._to = value || '';
        else if (name === 'morph') this._morph = parseFloat(value) || 0;
        else if (name === 'angle') this._angle = parseFloat(value) || 0;
        else if (name === 'extent') this._extent = value == null ? 1 : parseFloat(value) || 0;
        if (name === 'angle' || name === 'extent') this._place();
        else this._draw();
      }

      get shape() {
        return this._shape;
      }
      set shape(value) {
        this._shape = value || 'circle';
        this._draw();
      }
      get morphTo() {
        return this._to;
      }
      set morphTo(value) {
        this._to = value || '';
        this._draw();
      }
      get morph() {
        return this._morph;
      }
      set morph(value) {
        this._morph = +value || 0;
        this._draw();
      }
      get angle() {
        return this._angle;
      }
      set angle(value) {
        this._angle = +value || 0;
        this._place();
      }
      get extent() {
        return this._extent;
      }
      set extent(value) {
        this._extent = +value;
        this._place();
      }

      /** the shape showing most */
      get showing() {
        return this._to && this._morph >= 0.5 ? this._to : this._shape;
      }

      /** morphs from the shape showing most into `name` (ShapeIcon.qml) */
      transitionTo(name, { spring = null, duration = 460, ease: easing = null } = {}) {
        this.stop();
        const from = this.showing;
        this._shape = from;
        this._to = '';
        this._morph = 0;
        if (!name || name === from) {
          this._draw();
          return this;
        }
        this._to = name;
        const settle = () => {
          this._shape = name;
          this._to = '';
          this._morph = 0;
          this._animation = null;
          this._draw();
        };
        const update = (value) => {
          this._morph = value;
          this._draw();
        };
        if (spring) {
          const animation = new Spring(0, spring === true ? springs.morph : spring, (value) => {
            update(value);
            if (!animation.running && value === 1) settle();
          });
          this._animation = animation.to(1);
        } else {
          this._animation = tween({ duration, ease: easing || outBack(2.2), onUpdate: update, onDone: settle });
        }
        this._draw();
        return this;
      }

      stop() {
        if (this._animation) this._animation.stop();
        this._animation = null;
        return this;
      }

      _draw() {
        if (this._path) this._path.setAttribute('d', shapePath(this._shape, this._to, this._morph));
      }

      _place() {
        if (!this._path) return;
        const parts = [];
        if (this._angle) parts.push(`rotate(${this._angle}deg)`);
        if (this._extent !== 1) parts.push(`scale(${this._extent})`);
        this._path.style.transform = parts.join(' ');
      }
    }

    global.customElements.define('m3-shape', M3Shape);
  }
})(typeof window !== 'undefined' ? window : globalThis);

// ==== components.js ====
// components: the press ripple and squish, tooltips, toggles, the toolbar and
// transport buttons' effects, <m3-slider>, segmented buttons, the search field,
// menus, snackbars, toasts, dialogs and rolling text, as Swiftify's qml
// components do them. styles.css draws the classes made here; the slider draws
// itself in its shadow root.
(function (global) {
  'use strict';

  const M3 = global.M3;
  const doc = global.document;
  if (!M3 || !M3.util || !M3.motion || !doc) {
    if (global.console) global.console.error('m3: components.js needs core.js loaded before it');
    return;
  }
  const { util, motion } = M3;
  const { clamp } = util;

  // ---- helpers --------------------------------------------------------------

  /** the element an event happened on (a text node counts as its parent) */
  const elementOf = (node) => (node && node.nodeType === 1 ? node : (node && node.parentElement) || null);

  const isDisabled = (el) => el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';

  function make(tag, className, attributes) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (attributes) for (const name in attributes) el.setAttribute(name, attributes[name]);
    return el;
  }

  /** a decorative material symbol */
  function glyph(name) {
    const span = make('span', 'm3-icon', { 'aria-hidden': 'true' });
    span.textContent = name || '';
    return span;
  }

  /** web animations with core's curves by name; null where there are none */
  const play = (el, keyframes, duration, ease, options) =>
    motion.animate(el, keyframes, Object.assign({ duration, ease }, options));

  /** settles once an animation is over, finished or cancelled */
  const ended = (animation) => (animation ? animation.finished.then(() => true, () => false) : Promise.resolve(true));

  /** where opacity and transform have got to, so an exit carries on from a running entry */
  function caught(el) {
    const style = getComputedStyle(el);
    return { opacity: style.opacity, transform: style.transform === 'none' ? 'none' : style.transform };
  }

  /** cancels what this file animates on el; css transitions are styles.css's */
  function cancelOwn(el) {
    if (!el.getAnimations) return;
    for (const animation of el.getAnimations()) {
      if (global.CSSTransition && animation instanceof global.CSSTransition) continue;
      if (global.CSSAnimation && animation instanceof global.CSSAnimation) continue;
      animation.cancel();
    }
  }

  const viewport = () => ({
    width: doc.documentElement.clientWidth || global.innerWidth,
    height: doc.documentElement.clientHeight || global.innerHeight,
  });

  let counter = 0;
  const uniqueId = (prefix) => `${prefix}-${++counter}`;

  /** overlays opened from inside an open dialog go in it: outside a modal dialog
   *  everything is inert and drawn beneath it */
  const overlayHost = (anchor) =>
    (anchor && anchor.closest ? anchor.closest('dialog[open]') : null) || doc.body || doc.documentElement;

  /** a box centred above `rect`, `gap` away, flipped below where there is no
   *  room (tooltips may) and kept `margin` inside the viewport */
  function placeAbove(rect, width, height, gap, margin) {
    const view = viewport();
    let top = rect.top - gap - height;
    const below = top < margin;
    if (below) top = rect.bottom + gap;
    top = clamp(top, margin, Math.max(margin, view.height - margin - height));
    const centre = rect.left + rect.width / 2;
    const left = clamp(centre - width / 2, margin, Math.max(margin, view.width - margin - width));
    return { left: Math.round(left), top: Math.round(top), below, originX: Math.round(clamp(centre - left, 0, width)) };
  }

  // keyboard or pointer, whichever came last: a menu opened from the keyboard
  // puts focus on its first item, one opened by a click only on the menu
  let keyboardLast = false;
  doc.addEventListener(
    'keydown',
    (e) => {
      if (!e.ctrlKey && !e.metaKey && !e.altKey) keyboardLast = true;
    },
    true
  );
  doc.addEventListener('pointerdown', () => (keyboardLast = false), true);

  // attribute changes on enhanced elements, all through one observer
  const watchers = new WeakMap();
  const attributeObserver = global.MutationObserver
    ? new MutationObserver((records) => {
        const seen = new Set();
        for (const record of records) {
          if (seen.has(record.target)) continue;
          seen.add(record.target);
          const entry = watchers.get(record.target);
          if (entry) entry.fns.forEach((fn) => fn());
        }
      })
    : null;

  function watch(el, attributes, fn) {
    let entry = watchers.get(el);
    if (!entry) watchers.set(el, (entry = { filter: new Set(), fns: [] }));
    attributes.forEach((name) => entry.filter.add(name));
    entry.fns.push(fn);
    if (attributeObserver) attributeObserver.observe(el, { attributes: true, attributeFilter: [...entry.filter] });
  }

  // ---- ripple and press squish (Ripple.qml, RippleButton.qml) ---------------

  const RIPPLE_HOSTS = '.m3-btn:not(.wavy), .m3-icon-btn:not(.has-shape), .m3-menu-item, [data-m3-ripple]';
  // a press ripples the nearest control it lands in, never a host around that control
  const CONTROLS = RIPPLE_HOSTS + ', .m3-segment, button, a[href], input, select, textarea, label, [role="button"]';
  const SQUISH_HOSTS = '.m3-btn, .m3-icon-btn, [data-m3-bounce]';
  // a segment ripples in its tint, which lies under the sliding pill
  const segmentTints = new WeakMap();
  const pointerWaves = new Map(); // pointer id -> the waves it holds down
  const keyWaves = new Set();

  /** a small button squishes properly, a wide row barely moves */
  const pressScale = (el) => String(+(1 - Math.min(0.1, 5 / Math.max(el.offsetWidth, 1))).toFixed(4));

  function rippleLayer(host) {
    let layer = null;
    for (const child of host.children) {
      if (child.classList.contains('m3-ripple')) {
        layer = child;
        break;
      }
    }
    if (!layer) layer = make('span', 'm3-ripple', { 'aria-hidden': 'true' });
    // first, so it paints under everything else the host holds
    if (host.firstChild !== layer) host.insertBefore(layer, host.firstChild);
    return layer;
  }

  /** a wave from a client point, or from the middle without one */
  function startWave(host, clientX, clientY) {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return null;
    const layer = rippleLayer(host);
    // in the host's own pixels, whatever its squish or hover scale
    const box = host.getBoundingClientRect();
    const sx = box.width ? host.offsetWidth / box.width : 1;
    const sy = box.height ? host.offsetHeight / box.height : 1;
    const x = clientX == null ? width / 2 : clamp((clientX - box.left) * sx - host.clientLeft, 0, width);
    const y = clientY == null ? height / 2 : clamp((clientY - box.top) * sy - host.clientTop, 0, height);
    // big enough to reach the farthest corner
    const radius = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
    const wave = make('span', 'm3-ripple-wave');
    wave.style.cssText = `left:${x - radius}px;top:${y - radius}px;width:${2 * radius}px;height:${2 * radius}px`;
    layer.appendChild(wave);
    play(wave, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], 1200, 'standardDecel', { fill: 'forwards' });
    return wave;
  }

  // it keeps spreading as it fades
  function releaseWave(wave) {
    const fade = play(wave, [{ opacity: 0 }], 700, 'standardDecel', { fill: 'forwards' });
    ended(fade).then(() => wave.remove());
  }

  function rippleHostFor(target) {
    const control = target.closest(CONTROLS);
    if (!control) return null;
    if (control.classList.contains('m3-segment')) {
      const tint = segmentTints.get(control);
      return tint && !isDisabled(control) ? tint : null;
    }
    return control.matches(RIPPLE_HOSTS) && !isDisabled(control) ? control : null;
  }

  doc.addEventListener(
    'pointerdown',
    (e) => {
      if (e.button !== 0) return;
      const target = elementOf(e.target);
      if (!target) return;
      const squish = target.closest(SQUISH_HOSTS);
      if (squish) squish.style.setProperty('--m3-press-scale', pressScale(squish));
      const host = rippleHostFor(target);
      const wave = host && startWave(host, e.clientX, e.clientY);
      if (!wave) return;
      const held = pointerWaves.get(e.pointerId) || [];
      held.push(wave);
      pointerWaves.set(e.pointerId, held);
    },
    true
  );

  // the release may come anywhere: the pointer can have left the button by then
  function releasePointer(e) {
    const held = pointerWaves.get(e.pointerId);
    if (!held) return;
    pointerWaves.delete(e.pointerId);
    held.forEach(releaseWave);
  }
  global.addEventListener('pointerup', releasePointer, true);
  global.addEventListener('pointercancel', releasePointer, true);
  global.addEventListener('blur', () => {
    for (const held of pointerWaves.values()) held.forEach(releaseWave);
    pointerWaves.clear();
  });

  // enter and space ripple from the middle, and space squishes as a press does
  doc.addEventListener(
    'keydown',
    (e) => {
      if ((e.key !== 'Enter' && e.key !== ' ') || e.repeat) return;
      const target = elementOf(e.target);
      if (!target || isDisabled(target)) return;
      if (target.matches(SQUISH_HOSTS)) target.style.setProperty('--m3-press-scale', pressScale(target));
      const host = target.classList.contains('m3-segment')
        ? segmentTints.get(target)
        : target.matches(RIPPLE_HOSTS)
          ? target
          : null;
      const wave = host && startWave(host);
      if (wave) keyWaves.add(wave);
    },
    true
  );
  function releaseKeys() {
    keyWaves.forEach(releaseWave);
    keyWaves.clear();
  }
  doc.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && releaseKeys(), true);
  doc.addEventListener('focusout', releaseKeys, true);

  // ---- tooltips (StyledToolTip.qml) ----------------------------------------

  const TIP_GAP = 8; // from what it describes
  const TIP_MARGIN = 6; // from the viewport's edges
  const TIP_TIMEOUT = 6000;

  const tip = {
    el: null,
    anchor: null, // what it describes while shown
    source: '', // hover, focus or api
    shown: false,
    hovered: null, // the tooltip owner under the pointer
    muted: null, // pressed while hovered: no tooltip again until the pointer leaves it
    linked: null, // the anchor whose aria-describedby names it
    wait: 0,
    timeout: 0,
    animations: [],
  };

  function tipElement(host) {
    if (!tip.el) {
      tip.el = make('div', 'm3-tooltip', { role: 'tooltip', id: uniqueId('m3-tooltip') });
      tip.el.style.display = 'none';
    }
    if (tip.el.parentNode !== host) host.appendChild(tip.el);
    return tip.el;
  }

  function placeTip() {
    const el = tip.el;
    const spot = placeAbove(tip.anchor.getBoundingClientRect(), el.offsetWidth, el.offsetHeight, TIP_GAP, TIP_MARGIN);
    el.style.left = spot.left + 'px';
    el.style.top = spot.top + 'px';
    el.classList.toggle('is-below', spot.below);
    // it springs in from the edge that faces what it describes
    el.style.transformOrigin = `${spot.originX}px ${spot.below ? '0' : '100%'}`;
  }

  function linkTip(anchor, label) {
    // a tooltip saying what the label already says needn't be read twice
    if (label === anchor.getAttribute('aria-label')) return;
    const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
    if (!ids.includes(tip.el.id)) anchor.setAttribute('aria-describedby', ids.concat(tip.el.id).join(' '));
    tip.linked = anchor;
  }

  function unlinkTip() {
    const anchor = tip.linked;
    tip.linked = null;
    if (!anchor) return;
    const ids = (anchor.getAttribute('aria-describedby') || '').split(/\s+/).filter((id) => id && id !== tip.el.id);
    if (ids.length) anchor.setAttribute('aria-describedby', ids.join(' '));
    else anchor.removeAttribute('aria-describedby');
  }

  function animateTip(entering) {
    const el = tip.el;
    const from = caught(el);
    tip.animations.forEach((animation) => animation.cancel());
    tip.animations = (
      entering
        ? [
            play(el, [{ opacity: 0 }, { opacity: 1 }], 150, 'outCubic'),
            play(el, [{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], 380, motion.outBack(2.2)),
          ]
        : [
            play(el, [{ opacity: from.opacity }, { opacity: 0 }], 120, 'linear', { fill: 'forwards' }),
            play(el, [{ transform: from.transform }, { transform: 'scale(0.8)' }], 120, 'inCubic', { fill: 'forwards' }),
          ]
    ).filter(Boolean);
    return tip.animations;
  }

  function showTip(anchor, text, source) {
    clearTimeout(tip.wait);
    tip.wait = 0;
    const label = text != null ? String(text) : anchor.getAttribute('data-tooltip');
    if (!label || !anchor.isConnected) return;
    const el = tipElement(overlayHost(anchor));
    const fresh = !tip.shown || tip.anchor !== anchor;
    if (tip.linked && tip.linked !== anchor) unlinkTip();
    tip.anchor = anchor;
    tip.source = source;
    el.textContent = label;
    el.style.display = '';
    placeTip();
    linkTip(anchor, label);
    if (fresh) animateTip(true);
    tip.shown = true;
    clearTimeout(tip.timeout);
    tip.timeout = setTimeout(hideTip, TIP_TIMEOUT);
  }

  function hideTip() {
    clearTimeout(tip.wait);
    clearTimeout(tip.timeout);
    tip.wait = tip.timeout = 0;
    if (!tip.shown) return;
    tip.shown = false;
    unlinkTip();
    tip.anchor = null;
    const el = tip.el;
    const animations = animateTip(false);
    Promise.all(animations.map(ended)).then(() => {
      if (tip.shown) return;
      el.style.display = 'none';
      animations.forEach((animation) => animation.cancel());
    });
  }

  function scheduleTip(anchor) {
    clearTimeout(tip.wait);
    const delay = parseInt(anchor.getAttribute('data-tooltip-delay'), 10);
    tip.wait = setTimeout(
      () => {
        tip.wait = 0;
        if (tip.hovered === anchor) showTip(anchor, null, 'hover');
      },
      Number.isFinite(delay) ? Math.max(0, delay) : 600
    );
  }

  const tipOwner = (node) => {
    const el = elementOf(node);
    return el ? el.closest('[data-tooltip]') : null;
  };

  doc.addEventListener('pointerover', (e) => {
    // a finger has no hover to wait on
    const anchor = e.pointerType === 'touch' ? null : tipOwner(e.target);
    if (anchor === tip.hovered) return;
    tip.hovered = anchor;
    if (tip.muted !== anchor) tip.muted = null;
    clearTimeout(tip.wait);
    tip.wait = 0;
    if (tip.shown && tip.source === 'hover' && tip.anchor !== anchor) hideTip();
    if (anchor && anchor !== tip.muted && !(tip.shown && tip.anchor === anchor)) scheduleTip(anchor);
  });

  doc.addEventListener('pointerout', (e) => {
    if (e.relatedTarget) return; // still on the page: pointerover sees to it
    tip.hovered = tip.muted = null;
    clearTimeout(tip.wait);
    tip.wait = 0;
    if (tip.shown && tip.source === 'hover') hideTip();
  });

  doc.addEventListener(
    'pointerdown',
    () => {
      tip.muted = tip.hovered;
      hideTip();
    },
    true
  );

  // keyboard focus shows it at once
  doc.addEventListener('focusin', (e) => {
    const anchor = elementOf(e.target);
    if (!anchor || !anchor.hasAttribute('data-tooltip')) return;
    let visible = false;
    try {
      visible = anchor.matches(':focus-visible');
    } catch (_) {
      visible = keyboardLast;
    }
    if (visible) showTip(anchor, null, 'focus');
  });

  doc.addEventListener('focusout', (e) => {
    if (tip.shown && e.target === tip.anchor && tip.source !== 'hover') hideTip();
  });

  // focus scrolls what it lands on into view: that tooltip follows rather than going
  doc.addEventListener(
    'scroll',
    () => {
      if (tip.shown && tip.source === 'focus') placeTip();
      else hideTip();
    },
    { capture: true, passive: true }
  );
  doc.addEventListener('keydown', (e) => e.key === 'Escape' && tip.shown && hideTip(), true);
  global.addEventListener('blur', hideTip);

  M3.tooltip = {
    /** shows el's tooltip now (its data-tooltip, or `text`) */
    show(el, text) {
      if (el) showTip(el, text, 'api');
    },
    hide() {
      hideTip();
    },
  };

  // ---- toggles (IconButton.qml's toggleable) -------------------------------

  util.enhance('[data-toggle]', (el) => {
    if (!el.hasAttribute('aria-pressed')) el.setAttribute('aria-pressed', 'false');
  });

  doc.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    const target = elementOf(e.target);
    const el = target && target.closest('[data-toggle]');
    if (!el || isDisabled(el)) return;
    const pressed = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(pressed));
    el.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { pressed } }));
  });

  // ---- click effects (ToolbarButton.qml, TransportButton.qml) ---------------

  // they run on the button's own transform, so they never fight the hover and
  // press springs styles.css runs on `scale`
  const effects = new WeakMap();

  /** transform keyframes, the first from wherever the last effect had got to, as qml's restart() */
  function effect(el, keyframes, duration, fill) {
    if (!el.animate) return null;
    const from = getComputedStyle(el).transform;
    const previous = effects.get(el);
    if (previous) previous.cancel();
    if (keyframes[0].transform == null) keyframes[0].transform = from === 'none' ? 'none' : from;
    const animation = el.animate(keyframes, { duration, fill: fill || 'none' });
    effects.set(el, animation);
    return animation;
  }

  function step(transform, ease, offset) {
    const frame = { transform, easing: motion.cssEasing(ease) };
    if (offset != null) frame.offset = offset;
    return frame;
  }

  /** out to `peak` and home again, each leg with its own time and curve */
  const outAndBack = (el, peak, home, outMs, outEase, backMs, backEase) =>
    effect(el, [step(null, outEase), step(peak, backEase, outMs / (outMs + backMs)), { transform: home }], outMs + backMs);

  const TOOLBAR_EFFECTS = {
    'nudge-left': (el) => outAndBack(el, 'translateX(-6px)', 'translateX(0px)', 90, 'outCubic', 420, motion.outBack(2.4)),
    'nudge-right': (el) => outAndBack(el, 'translateX(6px)', 'translateX(0px)', 90, 'outCubic', 420, motion.outBack(2.4)),
    // it ends turned, as qml leaves it; the next spin starts again from 0
    spin: (el) => effect(el, [step('rotate(0deg)', motion.outBack(1.6)), { transform: 'rotate(180deg)' }], 520, 'forwards'),
    pop: (el) => outAndBack(el, 'scale(1.22)', 'scale(1)', 100, 'outCubic', 420, motion.outBack(2.6)),
  };

  const TRANSPORT_EFFECTS = {
    'nudge-left': (el) => outAndBack(el, 'translateX(-4px)', 'translateX(0px)', 90, 'outCubic', 350, 'expressiveFastSpatial'),
    'nudge-right': (el) => outAndBack(el, 'translateX(4px)', 'translateX(0px)', 90, 'outCubic', 350, 'expressiveFastSpatial'),
    bounce: (el) => outAndBack(el, 'scale(1.15)', 'scale(1)', 110, 'outCubic', 400, 'expressiveDefaultSpatial'),
  };

  doc.addEventListener('click', (e) => {
    const target = elementOf(e.target);
    const button = target && target.closest('.m3-toolbar-btn, .m3-icon-btn[data-effect]');
    if (!button || isDisabled(button)) return;
    const name = button.getAttribute('data-effect');
    const run = button.classList.contains('m3-toolbar-btn') ? TOOLBAR_EFFECTS[name || 'pop'] : TRANSPORT_EFFECTS[name];
    if (run) run(button);
  });

  // ---- toolbar buttons (ToolbarButton.qml) ---------------------------------

  // each sits on a shape of its own, its state layer, that slowly turns while
  // hovered (data-shape-still keeps it still, as the back arrow is)
  util.enhance('.m3-toolbar-btn', (button) => {
    let backing = button.querySelector(':scope > .m3-toolbar-backing');
    if (!backing) {
      backing = make('m3-shape', 'm3-toolbar-backing', { shape: 'cookie9', 'aria-hidden': 'true' });
      button.insertBefore(backing, button.firstChild);
    }
    let hovered = false;
    const baseAngle = () => parseFloat(button.getAttribute('data-shape-angle')) || 0;
    // eases into its turn and out of it, carrying on from wherever it stopped
    const drift = new motion.Drift({
      speed: 40,
      period: 360,
      onUpdate: (value) => {
        if (!button.isConnected) return drift.stop();
        backing.angle = baseAngle() + value;
      },
    });
    const update = () => {
      const shape = button.getAttribute('data-shape') || 'cookie9';
      if (backing.getAttribute('shape') !== shape) backing.setAttribute('shape', shape);
      backing.angle = baseAngle() + drift.value;
      drift.active = hovered && !isDisabled(button) && !button.hasAttribute('data-shape-still');
    };
    button.addEventListener('pointerenter', () => {
      hovered = true;
      update();
    });
    button.addEventListener('pointerleave', () => {
      hovered = false;
      update();
    });
    watch(button, ['data-shape', 'data-shape-angle', 'data-shape-still', 'disabled', 'aria-disabled'], update);
    update();
  });

  // ---- transport buttons (TransportButton.qml) -----------------------------

  // a shape springs in behind it while it is on (data-toggled-shape), or while
  // it is hovered (data-hover-shape, turned to data-hover-angle: an arrow
  // pointing the way it goes). the shape is then its hover and press
  util.enhance('.m3-icon-btn[data-toggled-shape], .m3-icon-btn[data-hover-shape]', (button) => {
    let shape = button.querySelector(':scope > .m3-transport-shape');
    if (!shape) {
      shape = make('m3-shape', 'm3-transport-shape', { extent: '0.9', 'aria-hidden': 'true' });
      button.insertBefore(shape, button.firstChild);
    }
    button.classList.add('has-shape');
    let hovered = false;
    const update = () => {
      const toggledShape = button.getAttribute('data-toggled-shape') || '';
      const hoverShape = button.getAttribute('data-hover-shape') || '';
      const onToggled = button.getAttribute('aria-pressed') === 'true' && !!toggledShape;
      const showsHover = !!hoverShape && !onToggled;
      const name = showsHover ? hoverShape : toggledShape || 'circle';
      const angle = showsHover ? String(parseFloat(button.getAttribute('data-hover-angle')) || 0) : '0';
      if (shape.getAttribute('shape') !== name) shape.setAttribute('shape', name);
      if (shape.getAttribute('angle') !== angle) shape.setAttribute('angle', angle);
      const shown = onToggled || (hovered && !isDisabled(button) && !!(toggledShape || hoverShape));
      shape.classList.toggle('is-shown', shown);
    };
    button.addEventListener('pointerenter', () => {
      hovered = true;
      update();
    });
    button.addEventListener('pointerleave', () => {
      hovered = false;
      update();
    });
    watch(button, ['aria-pressed', 'data-toggled-shape', 'data-hover-shape', 'data-hover-angle', 'disabled', 'aria-disabled'], update);
    update();
  });

  // ---- <m3-slider> (StyledSlider.qml) --------------------------------------

  const TRACK = 16; // trackThickness
  const HANDLE = TRACK + 14; // handleLength
  const GAP = 4; // between the handle and each part of the track
  const OUTER = Math.min(TRACK / 2, 8); // the track's ends
  const INNER = 2; // Appearance.rounding.unsharpen, the corners by the handle

  const SLIDER_CSS = `
:host {
  position: relative;
  display: inline-block;
  flex: none;
  box-sizing: border-box;
  width: 200px;
  height: ${HANDLE}px;
  vertical-align: middle;
  outline: none;
  cursor: pointer;
  touch-action: pan-y;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}
:host([orientation='vertical']) { width: ${HANDLE}px; height: 200px; touch-action: pan-x; }
:host(:active) { cursor: grabbing; }
:host([disabled]) { opacity: 0.38; cursor: default; pointer-events: none; }
:host([hidden]) { display: none; }
[hidden] { display: none !important; }
.part { position: absolute; }
.active { background: var(--m3-slider-active, var(--m3-primary)); }
.inactive { background: var(--m3-slider-inactive, var(--m3-secondary-container)); }
.stop { position: absolute; width: 4px; height: 4px; border-radius: 2px; background: var(--m3-on-secondary-container); }
.handle {
  position: absolute;
  border-radius: 9999px;
  background: var(--m3-slider-active, var(--m3-primary));
  transform: translate(-50%, -50%);
  transition:
    width 200ms var(--m3-ease-expressive-effects, cubic-bezier(0.34, 0.8, 0.34, 1)),
    height 200ms var(--m3-ease-expressive-effects, cubic-bezier(0.34, 0.8, 0.34, 1));
}
:host(:focus-visible) .handle { outline: 2px solid var(--m3-secondary); outline-offset: 2px; }
.tip {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1000;
  display: none;
  box-sizing: border-box;
  max-width: 280px;
  padding: 6px 10px;
  border-radius: var(--m3-r-very-small, 8px);
  background: var(--m3-tooltip);
  color: var(--m3-on-tooltip);
  font: 400 var(--m3-fs-smaller, 12px) / 16px var(--m3-font, system-ui, sans-serif);
  white-space: nowrap;
  pointer-events: none;
  -webkit-font-smoothing: antialiased;
}`;

  const numberAttribute = (el, name, fallback) => {
    const value = parseFloat(el.getAttribute(name));
    return Number.isFinite(value) ? value : fallback;
  };

  const decimals = (value) => {
    const text = String(value);
    if (text.includes('e')) return 12;
    const dot = text.indexOf('.');
    return dot < 0 ? 0 : text.length - dot - 1;
  };

  function setAttr(el, name, value) {
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }

  let sliderObserver = null;
  const sliderSizes = () =>
    sliderObserver ||
    (sliderObserver = global.ResizeObserver
      ? new ResizeObserver((entries) => entries.forEach((entry) => entry.target.isConnected && entry.target._layout()))
      : { observe() {}, unobserve() {} });

  class M3Slider extends HTMLElement {
    static get observedAttributes() {
      return ['value', 'min', 'max', 'step', 'orientation', 'disabled', 'label', 'value-tip', 'show-stop'];
    }

    constructor() {
      super();
      this._raw = null; // the value asked for; the one shown is it clamped and snapped
      this._value = 0;
      this._format = null;
      this._pressed = false; // dragged, or a key held: the handle thins and the tip shows
      this._drag = null;
      this._keyHeld = false;
      this._tipShown = false;
      this._tipAnimations = [];
      this._rtl = false;
      this._ownsTabIndex = null;
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML =
        `<style>${SLIDER_CSS}</style>` +
        '<div class="part active"></div><div class="part inactive"><div class="stop"></div></div>' +
        '<div class="handle"></div><div class="tip" aria-hidden="true"></div>';
      this._activePart = root.querySelector('.active');
      this._inactivePart = root.querySelector('.inactive');
      this._stopDot = root.querySelector('.stop');
      this._handle = root.querySelector('.handle');
      this._tip = root.querySelector('.tip');
      this.addEventListener('pointerdown', (e) => this._pointerDown(e));
      this.addEventListener('pointermove', (e) => this._pointerMove(e));
      this.addEventListener('pointerup', (e) => this._pointerUp(e, true));
      this.addEventListener('pointercancel', (e) => this._pointerUp(e, false));
      this.addEventListener('lostpointercapture', (e) => this._pointerUp(e, false));
      this.addEventListener('keydown', (e) => this._keyDown(e));
      this.addEventListener('keyup', () => this._keyUp());
      this.addEventListener('blur', () => this._keyUp());
    }

    connectedCallback() {
      // a property set before the element was defined hides the accessors: hand it over
      for (const name of ['value', 'min', 'max', 'step', 'orientation', 'disabled', 'format']) {
        if (Object.prototype.hasOwnProperty.call(this, name)) {
          const value = this[name];
          delete this[name];
          this[name] = value;
        }
      }
      if (this._ownsTabIndex === null) this._ownsTabIndex = !this.hasAttribute('tabindex');
      if (!this.hasAttribute('role')) this.setAttribute('role', 'slider');
      if (this.hasAttribute('label') && !this.hasAttribute('aria-label')) this.setAttribute('aria-label', this.getAttribute('label'));
      this._syncFocusable();
      this._rtl = getComputedStyle(this).direction === 'rtl';
      this._refresh();
      sliderSizes().observe(this);
      this._render();
    }

    disconnectedCallback() {
      sliderSizes().unobserve(this);
      this._drag = null;
      this._keyHeld = false;
      this._pressed = false;
      this._tipShown = false;
      this._tipAnimations.forEach((animation) => animation.cancel());
      this._tip.style.display = 'none';
    }

    attributeChangedCallback(name, old, value) {
      if (old === value) return;
      if (name === 'value') {
        if (value != null) this._raw = parseFloat(value);
        this._refresh();
      } else if (name === 'min' || name === 'max' || name === 'step') {
        this._refresh();
      } else if (name === 'label' && this.isConnected) {
        if (value == null) this.removeAttribute('aria-label');
        else this.setAttribute('aria-label', value);
      } else if (name === 'disabled') {
        this._syncFocusable();
        if (value != null) this._release();
      }
      this._render();
    }

    get value() {
      return this._value;
    }
    set value(value) {
      this._raw = Number(value);
      this._refresh();
      this._render();
    }
    get min() {
      return numberAttribute(this, 'min', 0);
    }
    set min(value) {
      this.setAttribute('min', value);
    }
    get max() {
      return Math.max(this.min, numberAttribute(this, 'max', 1));
    }
    set max(value) {
      this.setAttribute('max', value);
    }
    get step() {
      return Math.max(0, numberAttribute(this, 'step', 0));
    }
    set step(value) {
      this.setAttribute('step', value);
    }
    get orientation() {
      return this.getAttribute('orientation') === 'vertical' ? 'vertical' : 'horizontal';
    }
    set orientation(value) {
      this.setAttribute('orientation', value);
    }
    get disabled() {
      return this.hasAttribute('disabled');
    }
    set disabled(value) {
      this.toggleAttribute('disabled', !!value);
    }
    /** v => the tip's and aria-valuetext's text; Math.round(position * 100) + '%' without one */
    get format() {
      return this._format;
    }
    set format(fn) {
      this._format = typeof fn === 'function' ? fn : null;
      this._render();
    }

    _snap(value) {
      const min = this.min;
      const max = this.max;
      const step = this.step;
      let v = clamp(Number.isFinite(value) ? value : min, min, max);
      if (step > 0) {
        v = min + Math.round((v - min) / step) * step;
        if (v > max + 1e-9) v -= step;
        // so 0.1 + 0.2 stays 0.3
        v = +v.toFixed(Math.min(12, Math.max(decimals(step), decimals(min))));
      } else {
        v = +v.toFixed(10);
      }
      return clamp(v, min, max);
    }

    _refresh() {
      this._value = this._snap(this._raw == null ? this.min : this._raw);
    }

    _position() {
      const range = this.max - this.min;
      return range > 0 ? (this._value - this.min) / range : 0;
    }

    /** a value the user asked for: shown, and `input` if it changed anything */
    _input(value) {
      const before = this._value;
      this._raw = value;
      this._refresh();
      if (this._value === before) return false;
      this._render();
      this.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      return true;
    }

    _text() {
      if (this._format) {
        try {
          return String(this._format(this._value, this._position()));
        } catch (error) {
          console.error('m3-slider: format', error);
        }
      }
      return Math.round(this._position() * 100) + '%';
    }

    _syncFocusable() {
      if (!this.isConnected || !this._ownsTabIndex) return;
      if (this.disabled) {
        this.removeAttribute('tabindex');
        if (doc.activeElement === this) this.blur();
      } else {
        setAttr(this, 'tabindex', '0');
      }
    }

    _render() {
      if (!this.isConnected) return;
      const text = this._text();
      setAttr(this, 'aria-valuemin', String(this.min));
      setAttr(this, 'aria-valuemax', String(this.max));
      setAttr(this, 'aria-valuenow', String(this._value));
      setAttr(this, 'aria-valuetext', text);
      setAttr(this, 'aria-orientation', this.orientation);
      if (this.disabled) setAttr(this, 'aria-disabled', 'true');
      else this.removeAttribute('aria-disabled');
      this._layout();
      if (this._tipShown) this._placeTip(text);
    }

    // the track splits round a slim handle: the filled part from the start
    // (left, right in rtl, or the bottom) to the handle, the rest after it
    _layout() {
      const vertical = this.orientation === 'vertical';
      const length = vertical ? this.clientHeight : this.clientWidth;
      const cross = vertical ? this.clientWidth : this.clientHeight;
      const flipped = vertical || this._rtl; // the value grows from the far end
      const position = this._position();
      const at = (flipped ? 1 - position : position) * length;
      const thickness = this._pressed ? 2 : 4;
      const lowLength = Math.max(0, at - GAP - thickness / 2);
      const highStart = at + GAP + thickness / 2;
      const highLength = Math.max(0, length - highStart);
      const crossStart = (cross - TRACK) / 2;
      const low = [0, lowLength, 'low'];
      const high = [highStart, highLength, 'high'];
      const [active, inactive] = flipped ? [high, low] : [low, high];
      this._placePart(this._activePart, vertical, crossStart, ...active);
      this._placePart(this._inactivePart, vertical, crossStart, ...inactive);
      // a stop dot 6 px from the inactive part's far end, while there's room for it
      const stopShown = this.hasAttribute('show-stop') && inactive[1] > 12;
      this._stopDot.hidden = !stopShown;
      if (stopShown) {
        const along = (inactive[2] === 'high' ? inactive[1] - 6 : 6) - 2;
        const across = (TRACK - 4) / 2;
        this._stopDot.style.left = (vertical ? across : along) + 'px';
        this._stopDot.style.top = (vertical ? along : across) + 'px';
      }
      const handle = this._handle.style;
      handle.left = (vertical ? cross / 2 : at) + 'px';
      handle.top = (vertical ? at : cross / 2) + 'px';
      handle.width = (vertical ? HANDLE : thickness) + 'px';
      handle.height = (vertical ? thickness : HANDLE) + 'px';
    }

    _placePart(el, vertical, crossStart, start, length, end) {
      el.hidden = !(length > 0.5);
      // round at the track's ends, barely rounded by the handle
      const radii = vertical
        ? end === 'low'
          ? [OUTER, OUTER, INNER, INNER]
          : [INNER, INNER, OUTER, OUTER]
        : end === 'low'
          ? [OUTER, INNER, INNER, OUTER]
          : [INNER, OUTER, OUTER, INNER];
      const style = el.style;
      style.borderRadius = radii.map((r) => r + 'px').join(' ');
      style.left = (vertical ? crossStart : start) + 'px';
      style.top = (vertical ? start : crossStart) + 'px';
      style.width = (vertical ? TRACK : length) + 'px';
      style.height = (vertical ? length : TRACK) + 'px';
    }

    _placeTip(text) {
      const tipEl = this._tip;
      tipEl.textContent = text;
      const spot = placeAbove(this._handle.getBoundingClientRect(), tipEl.offsetWidth, tipEl.offsetHeight, TIP_GAP, TIP_MARGIN);
      tipEl.style.left = spot.left + 'px';
      tipEl.style.top = spot.top + 'px';
      tipEl.style.transformOrigin = `${spot.originX}px ${spot.below ? '0' : '100%'}`;
    }

    // the value tip springs in as a tooltip does (StyledToolTip with no delay)
    _showTip(on) {
      const show = on && this.hasAttribute('value-tip') && this.isConnected;
      if (show === this._tipShown) return;
      this._tipShown = show;
      const tipEl = this._tip;
      const from = caught(tipEl);
      this._tipAnimations.forEach((animation) => animation.cancel());
      if (show) {
        tipEl.style.display = 'block';
        this._placeTip(this._text());
        this._tipAnimations = [
          play(tipEl, [{ opacity: 0 }, { opacity: 1 }], 150, 'outCubic'),
          play(tipEl, [{ transform: 'scale(0.6)' }, { transform: 'scale(1)' }], 380, motion.outBack(2.2)),
        ].filter(Boolean);
        return;
      }
      const out = [
        play(tipEl, [{ opacity: from.opacity }, { opacity: 0 }], 120, 'linear', { fill: 'forwards' }),
        play(tipEl, [{ transform: from.transform }, { transform: 'scale(0.8)' }], 120, 'inCubic', { fill: 'forwards' }),
      ].filter(Boolean);
      this._tipAnimations = out;
      Promise.all(out.map(ended)).then(() => {
        if (this._tipShown) return;
        tipEl.style.display = 'none';
        out.forEach((animation) => animation.cancel());
      });
    }

    _press(on) {
      if (this._pressed === on) return;
      this._pressed = on;
      this._layout();
      this._showTip(on);
    }

    _release() {
      this._drag = null;
      this._keyHeld = false;
      this._press(false);
    }

    /** where along the track a pointer is, 0 at the minimum's end */
    _along(e, rect) {
      if (this.orientation === 'vertical') return (rect.bottom - e.clientY) / (rect.height || 1);
      const t = (e.clientX - rect.left) / (rect.width || 1);
      return this._rtl ? 1 - t : t;
    }

    _follow(e) {
      const position = clamp(this._along(e, this.getBoundingClientRect()) + this._drag.grip, 0, 1);
      this._input(this.min + position * (this.max - this.min));
    }

    _pointerDown(e) {
      if (this.disabled || this._drag || e.button !== 0) return;
      this._rtl = getComputedStyle(this).direction === 'rtl';
      const rect = this.getBoundingClientRect();
      const length = this.orientation === 'vertical' ? rect.height : rect.width;
      const offset = this._position() - this._along(e, rect);
      // taken by the handle, it keeps its grip; anywhere else, it jumps there
      const grip = Math.abs(offset) * length <= 12 ? offset : 0;
      this._drag = { id: e.pointerId, grip, start: this._value, touch: e.pointerType === 'touch', moved: false };
      try {
        this.setPointerCapture(e.pointerId);
      } catch (_) {
        // a synthetic pointer can't be captured; its own events still come here
      }
      // a touch may yet be a scroll: it waits until it moves, or lifts as a tap
      if (this._drag.touch) return;
      this._press(true);
      this._follow(e);
    }

    _pointerMove(e) {
      const drag = this._drag;
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.touch && !drag.moved) this._press(true);
      drag.moved = true;
      this._follow(e);
    }

    _pointerUp(e, commit) {
      const drag = this._drag;
      if (!drag || e.pointerId !== drag.id) return;
      if (commit && drag.touch && !drag.moved) this._follow(e);
      this._drag = null;
      try {
        if (this.hasPointerCapture(e.pointerId)) this.releasePointerCapture(e.pointerId);
      } catch (_) {
        // already gone
      }
      if (!this._keyHeld) this._press(false);
      if (this._value !== drag.start) this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _keyDown(e) {
      if (this.disabled || e.altKey || e.ctrlKey || e.metaKey) return;
      const range = this.max - this.min;
      const small = this.step || range / 100;
      const page = Math.max(this.step, range / 10);
      this._rtl = getComputedStyle(this).direction === 'rtl';
      const forward = this._rtl && this.orientation !== 'vertical' ? -1 : 1;
      let value = this._value;
      switch (e.key) {
        case 'ArrowRight':
          value += small * forward;
          break;
        case 'ArrowLeft':
          value -= small * forward;
          break;
        case 'ArrowUp':
          value += small;
          break;
        case 'ArrowDown':
          value -= small;
          break;
        case 'PageUp':
          value += page;
          break;
        case 'PageDown':
          value -= page;
          break;
        case 'Home':
          value = this.min;
          break;
        case 'End':
          value = this.max;
          break;
        default:
          return;
      }
      e.preventDefault();
      // a held key presses the slider as a drag does (qt's keyPressEvent)
      this._keyHeld = true;
      this._press(true);
      if (this._input(value)) this.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _keyUp() {
      if (!this._keyHeld) return;
      this._keyHeld = false;
      if (!this._drag) this._press(false);
    }
  }

  if (global.customElements && !global.customElements.get('m3-slider')) global.customElements.define('m3-slider', M3Slider);

  // ---- segmented buttons (SegmentedControl.qml) ----------------------------

  const fontsSettled = () => (doc.fonts && doc.fonts.ready ? doc.fonts.ready.then(() => {}, () => {}) : Promise.resolve());

  util.enhance('.m3-segmented', (group) => {
    const indicator = make('span', 'm3-segmented-indicator', { 'aria-hidden': 'true' });
    const tints = [];
    const adopted = new WeakSet();
    let placed = null; // the segment the pill sits on
    let ready = 0; // 0 never placed, 1 waiting on the fonts, 2 sliding
    const resize = global.ResizeObserver ? new ResizeObserver(() => place()) : null;

    const segments = () => Array.prototype.filter.call(group.children, (child) => child.classList.contains('m3-segment'));
    const chosen = (list) => list.find((segment) => segment.getAttribute('aria-checked') === 'true') || null;
    const manual = () => group.hasAttribute('data-manual');

    if (!group.hasAttribute('role')) group.setAttribute('role', 'radiogroup');

    function hover(segment, on) {
      const tint = segmentTints.get(segment);
      if (tint) tint.classList.toggle('is-hovered', on && !isDisabled(segment));
    }

    function adopt(segment) {
      if (adopted.has(segment)) return;
      adopted.add(segment);
      if (segment.tagName === 'BUTTON' && !segment.hasAttribute('type')) segment.type = 'button';
      if (!segment.hasAttribute('role')) segment.setAttribute('role', 'radio');
      if (!segment.hasAttribute('aria-checked')) segment.setAttribute('aria-checked', 'false');
      const symbol = segment.getAttribute('data-symbol');
      if (symbol && !segment.querySelector(':scope > .m3-icon')) segment.insertBefore(glyph(symbol), segment.firstChild);
      segment.addEventListener('pointerenter', () => hover(segment, true));
      segment.addEventListener('pointerleave', () => hover(segment, false));
      if (resize) resize.observe(segment);
    }

    // the checked segment is where tab stops; with none, the first that can take it
    function rove(list) {
      const stop = chosen(list) || list.find((segment) => !isDisabled(segment));
      for (const segment of list) segment.tabIndex = segment === stop ? 0 : -1;
    }

    // a tint per segment, then the pill, all before the segments so those paint above
    function sync() {
      const list = segments();
      list.forEach(adopt);
      while (tints.length < list.length) tints.push(make('span', 'm3-segmented-tint', { 'aria-hidden': 'true' }));
      while (tints.length > list.length) tints.pop().remove();
      const order = tints.concat(indicator);
      let next = list[0] || null;
      for (let index = order.length - 1; index >= 0; index--) {
        const node = order[index];
        if (node.parentNode !== group || node.nextSibling !== next) group.insertBefore(node, next);
        next = node;
      }
      list.forEach((segment, index) => segmentTints.set(segment, tints[index]));
      rove(list);
    }

    // layout pixels, untouched by any scale the group is shown at
    function measure(segment) {
      if (segment.offsetParent === group) return { left: segment.offsetLeft, width: segment.offsetWidth };
      const a = segment.getBoundingClientRect();
      const b = group.getBoundingClientRect();
      return { left: a.left - b.left - group.clientLeft, width: a.width };
    }

    function place() {
      const list = segments();
      list.forEach((segment, index) => {
        const tint = tints[index];
        if (!tint) return;
        const box = measure(segment);
        tint.style.left = box.left + 'px';
        tint.style.width = box.width + 'px';
      });
      const target = chosen(list);
      if (!target) {
        indicator.style.visibility = 'hidden';
        placed = null;
        return;
      }
      const box = measure(target);
      // its first placement jumps straight there, and so does a choice made from none
      const jump = ready < 2 || !placed;
      if (jump) indicator.style.transition = 'none';
      indicator.style.left = box.left + 'px';
      indicator.style.width = box.width + 'px';
      indicator.style.visibility = '';
      if (jump) {
        void indicator.offsetWidth;
        indicator.style.transition = '';
      }
      placed = target;
      if (ready === 0 && box.width > 0) {
        // laid out at last: once the fonts have settled the widths, choices slide
        ready = 1;
        fontsSettled().then(() => {
          place();
          ready = 2;
          group.classList.add('is-ready');
        });
      }
    }

    function select(index) {
      const list = segments();
      const target = list[index] || null;
      if (target && isDisabled(target)) return false;
      for (const segment of list) segment.setAttribute('aria-checked', String(segment === target));
      rove(list);
      place();
      return true;
    }

    function emit(index) {
      const segment = segments()[index];
      const value = segment && segment.hasAttribute('value') ? segment.getAttribute('value') : null;
      group.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { index, value } }));
    }

    // a click or an arrow key picks a segment; with data-manual the owner decides
    function activate(segment) {
      const index = segments().indexOf(segment);
      if (index < 0 || isDisabled(segment)) return;
      if (manual()) return emit(index);
      if (segment.getAttribute('aria-checked') === 'true') return;
      select(index);
      emit(index);
    }

    group.addEventListener('click', (e) => {
      const target = elementOf(e.target);
      const segment = target && target.closest('.m3-segment');
      if (segment && segment.parentElement === group) activate(segment);
    });

    // a radio group: arrows move through it, choosing as they go
    group.addEventListener('keydown', (e) => {
      const segment = elementOf(e.target);
      if (!segment || segment.parentElement !== group || !segment.classList.contains('m3-segment')) return;
      const list = segments().filter((each) => !isDisabled(each));
      if (!list.length) return;
      const rtl = getComputedStyle(group).direction === 'rtl';
      let index = list.indexOf(segment);
      switch (e.key) {
        case 'ArrowRight':
          index += rtl ? -1 : 1;
          break;
        case 'ArrowLeft':
          index += rtl ? 1 : -1;
          break;
        case 'ArrowDown':
          index += 1;
          break;
        case 'ArrowUp':
          index -= 1;
          break;
        case 'Home':
          index = 0;
          break;
        case 'End':
          index = list.length - 1;
          break;
        default:
          return;
      }
      e.preventDefault();
      const next = list[(index + list.length) % list.length];
      next.focus();
      if (!manual()) activate(next);
      else for (const each of segments()) each.tabIndex = each === next ? 0 : -1;
    });

    // segments added or taken away, or checked from outside
    if (global.MutationObserver) {
      new MutationObserver((records) => {
        let restructured = false;
        let checked = false;
        let picked = null;
        for (const record of records) {
          if (record.type === 'childList') {
            for (const node of [...record.addedNodes, ...record.removedNodes]) {
              if (node.nodeType === 1 && node.classList.contains('m3-segment')) restructured = true;
            }
          } else if (record.target.parentElement === group && record.target.classList.contains('m3-segment')) {
            checked = true;
            if (record.attributeName === 'aria-checked' && record.target.getAttribute('aria-checked') === 'true') picked = record.target;
          }
        }
        if (restructured) sync();
        if (picked && picked.getAttribute('aria-checked') === 'true') {
          // the newest choice wins, as a new currentIndex would
          for (const segment of segments()) if (segment !== picked) setAttr(segment, 'aria-checked', 'false');
        }
        if (restructured || checked) {
          rove(segments());
          place();
        }
      }).observe(group, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-checked', 'disabled'] });
    }
    if (resize) resize.observe(group);

    /** selects a segment by index (-1 for none), without a change event */
    group.m3Select = (index) => {
      select(index);
    };

    sync();
    place();
  });

  // ---- search field (SearchField.qml) --------------------------------------

  util.enhance('.m3-search', (field) => {
    const input = field.querySelector('input');
    if (!input) return;
    const clear = field.querySelector('.m3-search-clear');
    const magnifier = field.querySelector(':scope > .m3-icon');
    if (magnifier) magnifier.setAttribute('aria-hidden', 'true');
    // named by its placeholder rather than by the glyph names inside the label
    if (!input.hasAttribute('aria-label') && !input.hasAttribute('aria-labelledby')) {
      input.setAttribute('aria-label', input.getAttribute('placeholder') || 'Search');
    }
    const sync = () => field.classList.toggle('has-text', input.value.length > 0);
    const empty = () => {
      input.value = '';
      sync();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    for (const type of ['input', 'change', 'focus', 'blur']) input.addEventListener(type, sync);
    if (input.form) input.form.addEventListener('reset', () => setTimeout(sync));
    if (clear) {
      if (!clear.hasAttribute('type')) clear.type = 'button';
      clear.addEventListener('click', (e) => {
        e.preventDefault();
        input.focus();
        empty();
      });
    }
    // escape belongs to the field while it is typed in, before anything around it
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      if (input.value) empty();
      else input.blur();
    });
    sync();
  });

  // ---- menus (StyledMenu.qml, StyledMenuItem.qml) --------------------------

  let openMenu = null;

  /** an element's box, or an empty one at a point ({ clientX, clientY } or { x, y }) */
  function anchorBox(anchor) {
    if (anchor && typeof anchor.getBoundingClientRect === 'function') return anchor.getBoundingClientRect();
    const x = anchor ? +(anchor.clientX != null ? anchor.clientX : anchor.x) || 0 : 0;
    const y = anchor ? +(anchor.clientY != null ? anchor.clientY : anchor.y) || 0 : 0;
    return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
  }

  M3.menu = function menu(anchor, items, { placement = 'bottom-start' } = {}) {
    // asked again for the menu open there, it closes, as a second click on a
    // menu button does (MenuLoader.popupAt)
    if (openMenu && openMenu.anchor === anchor) {
      const again = openMenu;
      again.close(true);
      return again.handle;
    }
    if (openMenu) openMenu.close(false);

    const anchorEl = anchor && anchor.nodeType === 1 ? anchor : null;
    const returnTo = anchorEl && anchorEl.tabIndex >= 0 ? anchorEl : doc.activeElement;
    const el = make('div', 'm3-menu', { role: 'menu', tabindex: '-1' });
    if (anchorEl && anchorEl.id) el.setAttribute('aria-labelledby', anchorEl.id);
    const buttons = [];
    const labels = new Map();
    const state = { anchor, closing: false, close };
    state.handle = { close: () => close(true), element: el };

    for (const item of items || []) {
      if (!item) continue;
      if (item.separator) {
        const separator = make('div', 'm3-menu-separator', { role: 'separator' });
        separator.appendChild(make('m3-wavy-line', '', { amplitude: '1.4', wavelength: '12', 'aria-hidden': 'true' }));
        el.appendChild(separator);
        continue;
      }
      const checkable = typeof item.checked === 'boolean';
      const button = make('button', 'm3-menu-item' + (item.destructive ? ' is-destructive' : ''), {
        type: 'button',
        role: checkable ? 'menuitemcheckbox' : 'menuitem',
        tabindex: '-1',
      });
      if (checkable) button.setAttribute('aria-checked', String(item.checked));
      if (item.disabled) button.disabled = true;
      // a tick for a choice the owner keeps; its room stays when unticked
      if (checkable || item.symbol) button.appendChild(glyph(checkable ? (item.checked ? 'check' : '') : item.symbol));
      const label = make('span', 'm3-menu-label');
      label.textContent = item.label == null ? '' : String(item.label);
      button.appendChild(label);
      labels.set(button, label.textContent.trim().toLowerCase());
      button.addEventListener('click', () => {
        close(true);
        if (typeof item.onSelect === 'function') item.onSelect(item);
      });
      // the pointer carries the highlight, so the keys carry on from there
      button.addEventListener('pointermove', () => {
        if (!button.disabled && doc.activeElement !== button) button.focus({ preventScroll: true });
      });
      el.appendChild(button);
      buttons.push(button);
    }

    overlayHost(anchorEl).appendChild(el);

    // 4 px under the anchor, above it where there's no room below, 8 px inside the window
    const view = viewport();
    const rect = anchorBox(anchor);
    const width = el.offsetWidth;
    const height = el.offsetHeight;
    const rtl = getComputedStyle(anchorEl || doc.documentElement).direction === 'rtl';
    let left = (placement === 'bottom-end') !== rtl ? rect.right - width : rect.left;
    let top = rect.bottom + 4;
    if (top + height > view.height - 8 && rect.top - 4 - height >= 8) top = rect.top - 4 - height;
    left = clamp(left, 8, Math.max(8, view.width - 8 - width));
    top = clamp(top, 8, Math.max(8, view.height - 8 - height));
    el.style.left = Math.round(left) + 'px';
    el.style.top = Math.round(top) + 'px';

    const enabled = () => buttons.filter((button) => !button.disabled);
    const focusItem = (button) => button && button.focus({ preventScroll: true });
    if (keyboardLast && enabled().length) focusItem(enabled()[0]);
    else el.focus({ preventScroll: true });
    if (anchorEl) anchorEl.setAttribute('aria-expanded', 'true');

    let typed = '';
    let typedAt = 0;
    el.addEventListener('keydown', (e) => {
      const list = enabled();
      const index = list.indexOf(doc.activeElement);
      switch (e.key) {
        case 'ArrowDown':
          focusItem(list[(index + 1) % list.length]);
          break;
        case 'ArrowUp':
          focusItem(list[index <= 0 ? list.length - 1 : index - 1]);
          break;
        case 'Home':
        case 'PageUp':
          focusItem(list[0]);
          break;
        case 'End':
        case 'PageDown':
          focusItem(list[list.length - 1]);
          break;
        case 'Escape':
          e.stopPropagation();
          close(true);
          break;
        case 'Tab':
          // focus goes back to the anchor first, so tab moves on from there
          close(true);
          return;
        case 'Enter':
        case ' ':
          if (index >= 0) return; // the item's own click
          break;
        default: {
          if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
          // typing jumps to the next item that starts that way
          const time = util.now();
          typed = (time - typedAt > 600 ? '' : typed) + e.key.toLowerCase();
          typedAt = time;
          const start = typed.length === 1 ? index + 1 : Math.max(index, 0);
          for (let offset = 0; offset < list.length; offset++) {
            const button = list[(start + offset) % list.length];
            if (labels.get(button).startsWith(typed)) {
              focusItem(button);
              break;
            }
          }
        }
      }
      e.preventDefault();
    });

    const onPointerDown = (e) => {
      const target = elementOf(e.target);
      // a press on the anchor is left to its click, which closes it again
      if (target && (el.contains(target) || (anchorEl && anchorEl.contains(target)))) return;
      close(false);
    };
    const onScroll = (e) => {
      if (e.target === el || (e.target.nodeType === 1 && el.contains(e.target))) return;
      close(false);
    };
    const onResize = () => close(false);
    doc.addEventListener('pointerdown', onPointerDown, true);
    doc.addEventListener('scroll', onScroll, true);
    global.addEventListener('resize', onResize);

    function close(refocus) {
      if (state.closing) return;
      state.closing = true;
      if (openMenu === state) openMenu = null;
      doc.removeEventListener('pointerdown', onPointerDown, true);
      doc.removeEventListener('scroll', onScroll, true);
      global.removeEventListener('resize', onResize);
      if (anchorEl) anchorEl.setAttribute('aria-expanded', 'false');
      if (refocus && el.contains(doc.activeElement) && returnTo && returnTo.isConnected && returnTo.focus) {
        returnTo.focus({ preventScroll: true });
      }
      el.inert = true;
      const from = caught(el).opacity;
      cancelOwn(el);
      ended(play(el, [{ opacity: from }, { opacity: 0 }], 100, 'linear', { fill: 'forwards' })).then(() => el.remove());
    }

    play(el, [{ opacity: 0 }, { opacity: 1 }], 150, 'outCubic');
    openMenu = state;
    return state.handle;
  };

  // ---- snackbars and toasts (Snackbar.qml, Toast.qml) ----------------------

  let toaster = null;
  function toasterElement() {
    if (!toaster || !toaster.isConnected) {
      toaster = make('div', 'm3-toaster');
      overlayHost(null).appendChild(toaster);
    }
    return toaster;
  }

  /** fades and shrinks el out, from wherever its entry got to; gone once unseen */
  function leave(el, fadeMs, fadeEase, scale) {
    const from = caught(el);
    cancelOwn(el);
    el.style.pointerEvents = 'none';
    const fade = play(el, [{ opacity: from.opacity }, { opacity: 0 }], fadeMs, fadeEase, { fill: 'forwards' });
    play(el, [{ transform: from.transform }, { transform: `scale(${scale})` }], 350, 'expressiveFastSpatial', { fill: 'forwards' });
    return ended(fade).then(() => el.remove());
  }

  /** a timeout that waits while the pointer rests on el or focus is in it */
  function heldTimer(el, onDone) {
    let ms = 0;
    let left = 0;
    let since = 0;
    let id = 0;
    const holds = new Set();
    const sync = () => {
      if (!(ms > 0 && ms < Infinity)) return; // 0 or Infinity: it stays until closed
      if (holds.size) {
        if (id) {
          clearTimeout(id);
          id = 0;
          left -= util.now() - since;
        }
      } else if (!id) {
        since = util.now();
        id = setTimeout(() => {
          id = 0;
          onDone();
        }, Math.max(0, left));
      }
    };
    const hold = (why, on) => {
      if (on) holds.add(why);
      else holds.delete(why);
      sync();
    };
    el.addEventListener('pointerenter', () => hold('pointer', true));
    el.addEventListener('pointerleave', () => hold('pointer', false));
    el.addEventListener('focusin', () => hold('focus', true));
    el.addEventListener('focusout', (e) => !el.contains(e.relatedTarget) && hold('focus', false));
    return {
      restart(duration) {
        clearTimeout(id);
        id = 0;
        ms = left = duration;
        sync();
      },
      stop() {
        clearTimeout(id);
        id = 0;
        ms = 0;
      },
    };
  }

  let snackbarState = null;

  M3.snackbar = function snackbar(message, { timeout = 8000, action = null } = {}) {
    let state = snackbarState;
    if (!state) {
      const el = make('div', 'm3-snackbar', { role: 'alert' });
      const text = make('span', 'm3-snackbar-text');
      const dismiss = make('button', 'm3-icon-btn small m3-snackbar-close', { type: 'button', 'aria-label': 'Dismiss' });
      dismiss.appendChild(glyph('close'));
      const badge = make('m3-shape-icon', '', { shape: 'softBoom', symbol: 'warning', size: '32', 'icon-size': '18', 'aria-hidden': 'true' });
      el.append(badge, text, dismiss);
      state = { el, text, dismiss, action: null, serial: 0, closing: false };
      state.close = () => {
        if (state.closing) return;
        state.closing = true;
        state.timer.stop();
        if (snackbarState === state) snackbarState = null;
        leave(el, 150, 'linear', 0.94);
      };
      state.timer = heldTimer(el, state.close);
      dismiss.addEventListener('click', state.close);
      toasterElement().appendChild(el);
      play(el, [{ opacity: 0 }, { opacity: 1 }], 200, 'linear');
      play(el, [{ transform: 'scale(0.94)' }, { transform: 'scale(1)' }], 350, 'expressiveFastSpatial');
      snackbarState = state;
    }
    // one at a time: a newer message takes the place of the one showing
    const serial = ++state.serial;
    state.text.textContent = message == null ? '' : String(message);
    if (state.action) state.action.remove();
    state.action = null;
    if (action && action.label) {
      const button = make('button', 'm3-btn text', { type: 'button' });
      button.textContent = action.label;
      button.addEventListener('click', () => {
        if (typeof action.onClick === 'function') action.onClick();
        state.close();
      });
      state.el.insertBefore(button, state.dismiss);
      state.action = button;
    }
    state.timer.restart(timeout);
    return {
      close() {
        if (state.serial === serial) state.close();
      },
    };
  };

  let toastState = null;

  M3.toast = function toast(text, { symbol = 'auto_awesome', shape = 'softBurst', timeout = 2200 } = {}) {
    let state = toastState;
    const words = text == null ? '' : String(text);
    if (!state) {
      const el = make('div', 'm3-toast', { role: 'status' });
      const badge = make('m3-shape-icon', '', { shape, symbol, size: '30', 'icon-size': '17', 'aria-hidden': 'true' });
      const label = make('span', 'm3-toast-text');
      el.append(badge, label);
      state = { el, badge, label, words, serial: 0, timer: 0, born: false, closing: false };
      state.close = () => {
        if (state.closing) return;
        state.closing = true;
        clearTimeout(state.timer);
        if (toastState === state) toastState = null;
        leave(el, 250, 'outCubic', 0.9);
      };
      toasterElement().appendChild(el);
      play(el, [{ opacity: 0 }, { opacity: 1 }], 250, 'outCubic');
      play(el, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], 350, 'expressiveFastSpatial');
      toastState = state;
      // a status region reads out what changes in it, not what it was born with
      util.raf(() => {
        state.born = true;
        label.textContent = state.words;
      });
    } else {
      // showing already: the new phrase takes its place, as Toast.show() does
      state.words = words;
      if (state.born) state.label.textContent = words;
      setAttr(state.badge, 'shape', shape);
      setAttr(state.badge, 'symbol', symbol);
    }
    const serial = ++state.serial;
    clearTimeout(state.timer);
    if (timeout > 0 && timeout < Infinity) state.timer = setTimeout(state.close, timeout);
    return {
      close() {
        if (state.serial === serial) state.close();
      },
    };
  };

  // ---- dialogs (StyledDialog.qml) ------------------------------------------

  function animateBackdrop(el, keyframes, duration, fill) {
    try {
      return el.animate(keyframes, { duration, fill: fill || 'none', pseudoElement: '::backdrop' });
    } catch (_) {
      return null; // no animating pseudo-elements here: the scrim just appears
    }
  }

  /** resolves with the chosen action's value (its label without one), or null when dismissed */
  M3.dialog = function dialog({ headline = '', symbol = '', iconShape = 'cookie9', body = '', content = null, actions = [] } = {}) {
    return new Promise((resolve) => {
      const el = make('dialog', 'm3-dialog');
      if (headline) {
        const header = make('div', 'm3-dialog-header');
        if (symbol) {
          header.appendChild(
            make('m3-shape-icon', '', { shape: iconShape || 'cookie9', symbol, size: '40', 'icon-size': '21', 'aria-hidden': 'true' })
          );
        }
        const title = make('h2', 'm3-title m3-dialog-headline', { id: uniqueId('m3-dialog-headline') });
        title.textContent = headline;
        header.appendChild(title);
        el.appendChild(header);
        el.setAttribute('aria-labelledby', title.id);
      }
      const text = make('p', 'm3-dialog-body', { id: uniqueId('m3-dialog-body') });
      text.textContent = body || '';
      el.appendChild(text);
      if (body) el.setAttribute('aria-describedby', text.id);
      const extra = make('div', 'm3-dialog-content');
      if (content != null) {
        if (Array.isArray(content)) extra.append(...content);
        else extra.append(content);
      }
      el.appendChild(extra);

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
        const from = caught(el).opacity;
        cancelOwn(el);
        const fade = play(el, [{ opacity: from }, { opacity: 0 }], 120, 'linear', { fill: 'forwards' });
        animateBackdrop(el, [{ opacity: 1 }, { opacity: 0 }], 120, 'forwards');
        ended(fade).then(() => {
          if (el.open) el.close();
          el.remove();
        });
      };

      if (actions && actions.length) {
        const row = make('div', 'm3-dialog-actions');
        for (const action of actions) {
          if (!action) continue;
          const button = make('button', `m3-btn ${action.variant || 'text'}`, { type: 'button' });
          if (action.symbol) button.appendChild(glyph(action.symbol));
          button.appendChild(doc.createTextNode(action.label == null ? '' : String(action.label)));
          button.addEventListener('click', () => finish('value' in action ? action.value : action.label));
          row.appendChild(button);
        }
        el.appendChild(row);
      }

      // esc dismisses it, fading out rather than vanishing
      el.addEventListener('cancel', (e) => {
        e.preventDefault();
        finish(null);
      });
      // closed some other way (a form, el.close(), an esc the browser wouldn't let wait)
      el.addEventListener('close', () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
        el.remove();
      });

      (doc.body || doc.documentElement).appendChild(el);
      el.showModal();
      play(el, [{ opacity: 0 }, { opacity: 1 }], 150, 'linear');
      play(el, [{ transform: 'scale(0.9)' }, { transform: 'scale(1)' }], 350, 'expressiveFastSpatial');
      animateBackdrop(el, [{ opacity: 0 }, { opacity: 1 }], 150);
    });
  };

  // ---- rolling text (StyledText.qml's animateChange) -----------------------

  const rolls = new WeakMap();

  /** the old text slides out to (-dx, -dy) and fades, the new comes in from (dx, dy) */
  M3.rollText = function rollText(el, text, { dx = 0, dy = 6 } = {}) {
    const next = text == null ? '' : String(text);
    const running = rolls.get(el);
    if (running) {
      // mid-roll, the newest text is the one that rolls in
      Object.assign(running, { text: next, dx, dy });
      return running.done;
    }
    if (el.textContent === next) return Promise.resolve();
    if (!el.animate) {
      el.textContent = next;
      return Promise.resolve();
    }
    const job = { text: next, dx, dy };
    rolls.set(el, job);
    // a transform moves nothing laid out inline
    const inline = getComputedStyle(el).display === 'inline';
    if (inline) el.style.display = 'inline-block';
    job.done = (async () => {
      try {
        while (el.textContent !== job.text) {
          const { dx: x, dy: y } = job;
          const away = play(
            el,
            [
              { transform: 'translate(0px, 0px)', opacity: 1 },
              { transform: `translate(${-x}px, ${-y}px)`, opacity: 0 },
            ],
            150,
            'inSine',
            { fill: 'forwards' }
          );
          await ended(away);
          el.textContent = job.text;
          const back = play(
            el,
            [
              { transform: `translate(${x}px, ${y}px)`, opacity: 0 },
              { transform: 'translate(0px, 0px)', opacity: 1 },
            ],
            150,
            'outSine'
          );
          if (away) away.cancel();
          await ended(back);
        }
      } finally {
        rolls.delete(el);
        if (inline) el.style.display = '';
      }
    })();
    return job.done;
  };
})(window);

// ==== shaped.js ====
// shaped: what is drawn from material shapes and wavy outlines. the shape icon,
// the loading indicator, squiggles, wavy lines and the wavy seek line, the play
// button, wavy buttons, bursts, stickers, empty states and media cards, all on
// the core's <m3-shape>, M3.geometry, M3.motion and the shared spin.
(function (global) {
  'use strict';

  const M3 = global.M3;
  const doc = global.document;
  if (!M3 || !M3.util || !doc || !global.customElements) return;

  const { util, motion, geometry, spin } = M3;
  const { clamp } = util;
  const TAU = Math.PI * 2;
  const fmt = (value) => String(Math.round(value * 100) / 100);
  // scales want a finer step than lengths, or a settling spring visibly ticks
  const fmt3 = (value) => String(Math.round(value * 1000) / 1000);
  const EFFECTS = motion.cssEasing('expressiveEffects');

  // ---- plumbing -------------------------------------------------------------

  /** a number from an attribute, or the fallback when it is missing or not one */
  function numberAttr(el, name, fallback) {
    const raw = el.getAttribute(name);
    const value = raw === null || raw.trim() === '' ? NaN : parseFloat(raw);
    return Number.isFinite(value) ? value : fallback;
  }

  function make(tag, className, parent) {
    const el = doc.createElement(tag);
    if (className) el.className = className;
    if (parent) parent.appendChild(el);
    return el;
  }

  /** retargets a spring only when the target moves, so a settled one stays asleep */
  function springTo(spring, target) {
    if (spring.target !== target) spring.to(target);
  }

  function define(name, constructor) {
    if (!global.customElements.get(name)) global.customElements.define(name, constructor);
  }

  // every shadow root of a kind shares one constructed sheet, and has one of
  // its own after it for what its attributes size, which so wins the cascade.
  // (adopted sheets come after a root's <style>s, so a <style> would lose)
  const sheets = new Map();
  let constructable = false;
  try {
    constructable = 'adoptedStyleSheets' in Document.prototype && typeof new CSSStyleSheet().replaceSync === 'function';
  } catch (error) {
    constructable = false;
  }

  /** a shadow root with the shared css, and size(cssText) for the instance's own */
  function shadow(host, cssText, options) {
    const root = host.attachShadow(Object.assign({ mode: 'open' }, options));
    if (constructable) {
      let sheet = sheets.get(cssText);
      if (!sheet) {
        sheet = new CSSStyleSheet();
        sheet.replaceSync(cssText);
        sheets.set(cssText, sheet);
      }
      const own = new CSSStyleSheet();
      root.adoptedStyleSheets = [sheet, own];
      return { root, size: (text) => own.replaceSync(text) };
    }
    make('style', '', root).textContent = cssText;
    const own = make('style', '', root);
    return { root, size: (text) => (own.textContent = text) };
  }

  // material symbols, which a shadow root has to style for itself
  const ICON_CSS =
    ".icon{font-family:var(--m3-font-icon,'Material Symbols Rounded');font-weight:normal;font-style:normal;" +
    'line-height:1;letter-spacing:normal;text-transform:none;white-space:nowrap;word-wrap:normal;direction:ltr;' +
    "font-feature-settings:'liga';-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;" +
    'user-select:none;-webkit-user-select:none;pointer-events:none;' +
    "font-variation-settings:'FILL' var(--_fill,1),'wght' 400,'GRAD' 0,'opsz' var(--_opsz,24)}";

  // what animation asks to have drawn, drawn once a frame however many ask
  const dirty = new Set();
  let flushing = 0;
  function redraw(el) {
    dirty.add(el);
    if (!flushing) flushing = util.raf(flush);
  }
  function flush() {
    flushing = 0;
    const batch = Array.from(dirty);
    dirty.clear();
    for (const el of batch) {
      try {
        el._draw();
      } catch (error) {
        console.error('m3:', error);
      }
    }
  }

  // one resize observer for everything here
  const sizeHandlers = new WeakMap();
  const resizer = global.ResizeObserver
    ? new ResizeObserver((entries) => {
        for (const entry of entries) {
          const handler = sizeHandlers.get(entry.target);
          if (!handler) continue;
          const box = entry.borderBoxSize && entry.borderBoxSize[0];
          handler(box ? box.inlineSize : entry.contentRect.width, box ? box.blockSize : entry.contentRect.height);
        }
      })
    : null;

  /** handler(width, height) once laid out and whenever the border box changes */
  function watchSize(el, handler) {
    sizeHandlers.set(el, handler);
    if (resizer) resizer.observe(el);
    else handler(el.offsetWidth, el.offsetHeight);
    return () => {
      if (resizer) resizer.unobserve(el);
      sizeHandlers.delete(el);
    };
  }

  // whether anything rules it out of sight that an intersection observer
  // cannot see: an opacity of 0 or visibility: hidden somewhere above it
  function shownNow(el) {
    if (typeof el.checkVisibility !== 'function') return true;
    return el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true });
  }

  // controls whose own state speaks for an indicator inside them
  const CONTROLS = 'button, [role="button"], a[href]';

  // what loops holds still under reduced motion, which can change while it
  // runs: the system setting, or data-m3-reduce-motion on <html>
  const motionWatchers = new Set();
  function motionChanged() {
    for (const fn of Array.from(motionWatchers)) fn();
  }
  const media = (query) => (global.matchMedia ? global.matchMedia(query) : null);
  const reduceQuery = media('(prefers-reduced-motion: reduce)');
  const darkQuery = media('(prefers-color-scheme: dark)');
  if (reduceQuery && reduceQuery.addEventListener) reduceQuery.addEventListener('change', motionChanged);
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => retoneStickers());
  if (global.MutationObserver) {
    new MutationObserver((records) => {
      for (const record of records) {
        if (record.attributeName === 'data-m3-reduce-motion') motionChanged();
        else retoneStickers();
      }
    }).observe(doc.documentElement, { attributes: true, attributeFilter: ['data-m3-reduce-motion', 'data-m3-theme'] });
  }
  doc.addEventListener('m3-themechange', () => retoneStickers());

  // an element that moves only while it is on the page and in view: _sync()
  // runs whenever either changes, and when reduced motion does
  class Live extends HTMLElement {
    constructor() {
      super();
      this._connected = false;
      this._shown = false;
      this._unwatch = null;
      this._motionChanged = () => this._sync();
    }

    connectedCallback() {
      this._connected = true;
      if (!this._unwatch) {
        this._unwatch = util.observeVisible(this, (shown) => {
          this._shown = shown;
          this._sync();
        });
      }
      motionWatchers.add(this._motionChanged);
      this._sync();
    }

    disconnectedCallback() {
      this._connected = false;
      this._shown = false;
      if (this._unwatch) this._unwatch();
      this._unwatch = null;
      motionWatchers.delete(this._motionChanged);
      this._sync();
    }

    _sync() {}
  }

  // ---- <m3-shape-icon> ------------------------------------------------------

  // a symbol on a material shape (ShapeIcon.qml). a new shape morphs in with a
  // springy overshoot; hovered, the shape turns a little and the symbol leans
  // the other way, or it morphs into hover-shape if it has one
  const SHAPE_ICON_CSS =
    ICON_CSS +
    ':host{display:inline-block;position:relative;flex:none;width:40px;height:40px;line-height:0;vertical-align:middle}' +
    ':host([hidden]){display:none}' +
    'm3-shape{position:absolute;inset:0;width:100%;height:100%;' +
    `color:var(--m3-shape-icon-color,var(--m3-secondary-container));transition:color 200ms ${EFFECTS}}` +
    '.icon{position:absolute;left:50%;top:50%;translate:-50% -50%;' +
    `color:var(--m3-shape-icon-on-color,var(--m3-on-secondary-container));transition:color 200ms ${EFFECTS}}`;

  class ShapeIcon extends HTMLElement {
    static get observedAttributes() {
      return ['shape', 'hover-shape', 'symbol', 'size', 'icon-size', 'fill', 'hovered'];
    }

    constructor() {
      super();
      const { root, size } = shadow(this, SHAPE_ICON_CSS);
      this._size = size;
      this._body = make('m3-shape', '', root);
      // room for the overshoot
      this._body.setAttribute('extent', '0.92');
      this._body.setAttribute('part', 'shape');
      this._icon = make('span', 'icon', root);
      this._icon.setAttribute('part', 'icon');
      this._icon.setAttribute('aria-hidden', 'true');
      this._target = '';
      // it arrives as it is; only later changes morph
      this._settled = false;
      this._pointerIn = false;
      this._hoverRoot = null;
      this._turn = new motion.Spring(0, motion.springs.bounce, (value) => (this._body.angle = value));
      this._lean = new motion.Spring(0, motion.springs.bounce, (value) => {
        this._icon.style.rotate = fmt(value) + 'deg';
      });
      this._enter = () => {
        this._pointerIn = true;
        this._sync();
      };
      this._leave = () => {
        this._pointerIn = false;
        this._sync();
      };
      this._layout();
      this._sync();
    }

    connectedCallback() {
      // hovered with whatever it heads, as a section header's shape turns
      this._hoverRoot = this.closest('[data-m3-hover-root]') || this;
      this._hoverRoot.addEventListener('pointerenter', this._enter);
      this._hoverRoot.addEventListener('pointerleave', this._leave);
      this._pointerIn = this._hoverRoot.matches(':hover');
      this._sync();
      // what it is given in the task that adds it shows as it is
      if (!this._settled) util.raf(() => (this._settled = true));
    }

    disconnectedCallback() {
      if (this._hoverRoot) {
        this._hoverRoot.removeEventListener('pointerenter', this._enter);
        this._hoverRoot.removeEventListener('pointerleave', this._leave);
      }
      this._hoverRoot = null;
      this._pointerIn = false;
      this._sync();
    }

    attributeChangedCallback(name) {
      if (name === 'shape' || name === 'hover-shape' || name === 'hovered') this._sync();
      else this._layout();
    }

    _layout() {
      const size = Math.max(0, numberAttr(this, 'size', 40));
      const iconSize = Math.max(0, numberAttr(this, 'icon-size', Math.round(size * 0.5)));
      const fill = clamp(numberAttr(this, 'fill', 1), 0, 1);
      this._size(
        `:host{width:${fmt(size)}px;height:${fmt(size)}px}` +
          `.icon{font-size:${fmt(iconSize)}px;--_opsz:${fmt(clamp(iconSize, 20, 48))};--_fill:${fmt(fill)}}`
      );
      this._icon.textContent = this.getAttribute('symbol') || '';
    }

    _sync() {
      const hovered = this.hasAttribute('hovered') || this._pointerIn;
      const hoverShape = this.getAttribute('hover-shape') || '';
      const target = hovered && hoverShape ? hoverShape : this.getAttribute('shape') || 'cookie9';
      if (target !== this._target) {
        this._target = target;
        // from whichever shape shows most, 460 ms of outBack(2.2)
        if (this._settled) this._body.transitionTo(target);
        else {
          const body = this._body;
          body.stop();
          if (body.morph) body.morph = 0;
          if (body.morphTo) body.morphTo = '';
          body.shape = target;
        }
      }
      springTo(this._turn, hovered ? 24 : 0);
      springTo(this._lean, hovered ? -10 : 0);
    }
  }
  define('m3-shape-icon', ShapeIcon);

  // ---- <m3-loading> ---------------------------------------------------------

  // material 3 expressive's loading indicator (LoadingSpinner.qml): a shape
  // that morphs through the library with a spring, kicking round a quarter
  // turn each time, while it slowly turns. `contained` sits it in a round
  // container. under reduced motion it stays one shape and breathes
  const LOADING_SEQUENCE = ['softBurst', 'heart', 'cookie9', 'ghostish', 'flower', 'bun', 'sunny', 'clover4', 'pixelCircle'];
  const LOADING_STEP = 650;
  const LOADING_TURN = 4800;
  const loadingMorph = motion.outBack(2);
  const LOADING_CSS =
    ':host{display:inline-block;position:relative;flex:none;width:40px;height:40px;line-height:0;vertical-align:middle}' +
    ':host([hidden]){display:none}' +
    '.container{position:absolute;inset:0;border-radius:50%;display:none;' +
    'background:var(--m3-loading-container,var(--m3-primary-container))}' +
    ':host([contained]) .container{display:block}' +
    'm3-shape{position:absolute;left:7%;top:7%;width:86%;height:86%;color:var(--m3-loading-color,var(--m3-primary))}' +
    ':host([contained]) m3-shape{left:19%;top:19%;width:62%;height:62%;' +
    'color:var(--m3-loading-color,var(--m3-on-primary-container))}' +
    `.pulsing{animation:m3-loading-pulse 700ms ${motion.cssEasing('inOutSine')} infinite alternate}` +
    '.pulsing.paused{animation-play-state:paused}' +
    '@keyframes m3-loading-pulse{from{opacity:1}to{opacity:.35}}';

  class Loading extends Live {
    static get observedAttributes() {
      return ['size'];
    }

    constructor() {
      super();
      const { root, size } = shadow(this, LOADING_CSS);
      this._size = size;
      make('span', 'container', root).setAttribute('part', 'container');
      this._body = make('m3-shape', '', root);
      this._body.setAttribute('part', 'shape');
      this._step = 0;
      // ms into the current morph, and degrees of the slow turn
      this._elapsed = 0;
      this._turn = 0;
      this._kicks = 0;
      this._kick = new motion.Spring(0, motion.springs.kick);
      this._frame = 0;
      this._poll = 0;
      this._last = 0;
      this._checked = 0;
      this._tick = this._tick.bind(this);
      this._pair();
    }

    connectedCallback() {
      if (!this.hasAttribute('role') && !this.hasAttribute('aria-hidden')) {
        // in a busy button the button speaks for it (aria-busy), and a label
        // here would only join the button's name
        if (this.closest(CONTROLS)) this.setAttribute('aria-hidden', 'true');
        else {
          this.setAttribute('role', 'progressbar');
          if (!this.hasAttribute('aria-label') && !this.hasAttribute('aria-labelledby')) this.setAttribute('aria-label', 'Loading');
        }
      }
      super.connectedCallback();
    }

    attributeChangedCallback() {
      const size = numberAttr(this, 'size', NaN);
      this._size(Number.isFinite(size) ? `:host{width:${fmt(size)}px;height:${fmt(size)}px}` : '');
    }

    _sync() {
      const live = this._connected && this._shown;
      const still = motion.reducedMotion();
      this._body.classList.toggle('pulsing', still);
      this._body.classList.toggle('paused', !live);
      if (live && !still) {
        this._start();
      } else {
        this._stop();
        // held still, it rests as a whole shape
        if (still && this._body.morph !== 0) this._body.morph = 0;
      }
    }

    // the shape it shows and the next. morph goes to 0 first, so no draw
    // ever morphs between two shapes that are not neighbours in the sequence
    _pair() {
      const body = this._body;
      body.morph = 0;
      body.morphTo = LOADING_SEQUENCE[(this._step + 1) % LOADING_SEQUENCE.length];
      body.shape = LOADING_SEQUENCE[this._step];
    }

    _kickOn() {
      this._kicks += 90;
      this._kick.to(this._kicks);
    }

    _start() {
      if (this._frame || this._poll) return;
      // each morph sets off with its quarter-turn kick
      if (this._elapsed === 0) this._kickOn();
      this._last = this._checked = util.now();
      this._frame = util.raf(this._tick);
    }

    _stop() {
      if (this._frame) util.caf(this._frame);
      if (this._poll) clearTimeout(this._poll);
      this._frame = this._poll = 0;
      // unseen, the kick has nothing to settle for
      this._kick.jump(this._kicks);
    }

    // hidden by opacity or visibility (a busy button's spinner at rest), it
    // stops drawing and looks again now and then
    _waitUntilShown() {
      this._poll = setTimeout(() => {
        this._poll = 0;
        if (!this._connected || !this._shown || motion.reducedMotion()) return;
        if (shownNow(this)) this._start();
        else this._waitUntilShown();
      }, 400);
    }

    _tick(time) {
      this._frame = 0;
      if (time - this._checked > 500) {
        this._checked = time;
        if (!shownNow(this)) {
          this._kick.jump(this._kicks);
          this._waitUntilShown();
          return;
        }
      }
      const dt = clamp(time - this._last, 0, 100);
      this._last = time;
      this._turn = (this._turn + (dt * 360) / LOADING_TURN) % 360;
      this._elapsed += dt;
      if (this._elapsed >= LOADING_STEP) {
        this._elapsed %= LOADING_STEP;
        this._step = (this._step + 1) % LOADING_SEQUENCE.length;
        this._pair();
        this._kickOn();
      }
      this._body.morph = loadingMorph(this._elapsed / LOADING_STEP);
      this._body.angle = (this._turn + this._kick.value) % 360;
      this._frame = util.raf(this._tick);
    }
  }
  define('m3-loading', Loading);

  // ---- <m3-squiggle> --------------------------------------------------------

  // a ring that waves as it goes round (SquiggleRing.qml, squiggle_ring.frag):
  // the stroke wanders either side of a circle a whole number of times and the
  // shared spin sends the waves round. under progress 1 only that share is
  // wavy, clockwise from 12 o'clock, over a thin plain track
  const SQUIGGLE_CSS =
    ':host{display:inline-block;position:relative;flex:none;width:48px;height:48px;line-height:0;vertical-align:middle}' +
    ':host([hidden]){display:none}' +
    'svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}' +
    'path{fill:none;stroke-linejoin:round}' +
    '.wave{stroke:var(--m3-squiggle-color,var(--m3-primary))}' +
    '.track{stroke:var(--m3-squiggle-track,color-mix(in srgb,var(--m3-squiggle-color,var(--m3-primary)) 24%,transparent))}';

  /** a plain arc, angles from 12 o'clock clockwise */
  function arcPath(cx, cy, r, from, to) {
    if (!(to - from > 1e-3) || !(r > 0)) return '';
    const point = (angle) => fmt(cx + r * Math.sin(angle)) + ' ' + fmt(cy - r * Math.cos(angle));
    return `M${point(from)}A${fmt(r)} ${fmt(r)} 0 ${to - from > Math.PI ? 1 : 0} 1 ${point(to)}`;
  }

  class Squiggle extends Live {
    static get observedAttributes() {
      return ['progress', 'thickness', 'amplitude', 'wavelength', 'speed', 'playing', 'free'];
    }

    constructor() {
      super();
      const { root } = shadow(this, SQUIGGLE_CSS);
      const svg = util.svg('svg', { 'aria-hidden': 'true', part: 'svg' });
      this._trackPath = util.svg('path', { class: 'track' });
      this._wavePath = util.svg('path', { class: 'wave' });
      svg.append(this._trackPath, this._wavePath);
      root.appendChild(svg);
      this._w = this._h = 0;
      this._unsize = null;
      this._unsubscribe = null;
      // its own turn, for a free-running spinner
      this._own = 0;
      this._frame = 0;
      this._last = 0;
      this._ownRole = null;
      this._tick = this._tick.bind(this);
      this._follow = () => redraw(this);
      this._read();
    }

    get progress() {
      return this._progress;
    }

    set progress(value) {
      this.setAttribute('progress', String(value));
    }

    connectedCallback() {
      // its role is its own to keep unless the page set one, or it sits in a
      // control that speaks for it
      if (this._ownRole === null) this._ownRole = !this.hasAttribute('role') && !this.closest(CONTROLS);
      if (!this._unsize) {
        this._unsize = watchSize(this, (w, h) => {
          this._w = w;
          this._h = h;
          this._draw();
        });
      }
      super.connectedCallback();
      this._aria();
    }

    disconnectedCallback() {
      if (this._unsize) this._unsize();
      this._unsize = null;
      super.disconnectedCallback();
    }

    attributeChangedCallback(name) {
      if (name === 'playing' || name === 'free') this._sync();
      else this._read();
      this._aria();
      this._draw();
    }

    _read() {
      this._progress = numberAttr(this, 'progress', 1);
      this._thickness = Math.max(0, numberAttr(this, 'thickness', 2.5));
      this._amplitude = numberAttr(this, 'amplitude', 2);
      this._wavelength = Math.max(1, numberAttr(this, 'wavelength', 16));
      this._speed = numberAttr(this, 'speed', 0.35);
    }

    _sync() {
      const live = this._connected && this._shown;
      const free = this.hasAttribute('free');
      spin.hold(this, live && this.hasAttribute('playing'));
      // the shared turn, or with `free` a turn of its own
      const follow = live && !free;
      if (follow && !this._unsubscribe) {
        this._unsubscribe = spin.subscribe(this._follow);
        redraw(this);
      } else if (!follow && this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
      const own = live && free && !motion.reducedMotion();
      if (own && !this._frame) {
        this._last = util.now();
        this._frame = util.raf(this._tick);
      } else if (!own && this._frame) {
        util.caf(this._frame);
        this._frame = 0;
      }
    }

    _tick(time) {
      // the spin's full speed, 0.9 rad/s
      this._own += (clamp(time - this._last, 0, 100) / 1000) * 0.9;
      this._last = time;
      this._draw();
      this._frame = util.raf(this._tick);
    }

    _aria() {
      if (!this._connected || !this._ownRole) return;
      const free = this.hasAttribute('free');
      const value = clamp(this._progress, 0, 1);
      if (free || value < 1) {
        this.setAttribute('role', 'progressbar');
        if (free) {
          for (const name of ['aria-valuemin', 'aria-valuemax', 'aria-valuenow']) this.removeAttribute(name);
        } else {
          this.setAttribute('aria-valuemin', '0');
          this.setAttribute('aria-valuemax', '100');
          this.setAttribute('aria-valuenow', String(Math.round(value * 100)));
        }
      } else {
        // a whole ring says nothing; it is decoration
        for (const name of ['role', 'aria-valuemin', 'aria-valuemax', 'aria-valuenow']) this.removeAttribute(name);
      }
    }

    _draw() {
      const w = this._w;
      const h = this._h;
      if (!(w > 0 && h > 0)) return;
      const thickness = this._thickness;
      const amplitude = this._amplitude;
      const radius = Math.max(1, Math.min(w, h) / 2 - amplitude - thickness / 2 - 0.5);
      const waves = Math.max(5, Math.round((TAU * radius) / this._wavelength));
      const clock = this.hasAttribute('free') ? this._own : spin.value;
      // the spin grows without end; wrapped, the phase keeps its precision
      const phase = (waves * this._speed * clock) % TAU;
      const progress = clamp(this._progress, 0, 1);
      const cx = w / 2;
      const cy = h / 2;
      let wave = '';
      let track = '';
      if (progress >= 0.999) {
        wave = geometry.wavyRing(cx, cy, radius, { amplitude, waves, phase });
      } else {
        const end = progress * TAU;
        if (end > 0) wave = geometry.wavyRing(cx, cy, radius, { amplitude, waves, phase, from: 0, to: end });
        // the track keeps a gap from each end of the wave, measured along the ring
        const gap = (thickness * 1.5 + amplitude) / radius;
        track = arcPath(cx, cy, radius, end + gap, TAU - gap);
      }
      this._wavePath.setAttribute('d', wave);
      this._wavePath.setAttribute('stroke-width', fmt(thickness));
      this._trackPath.setAttribute('d', track);
      this._trackPath.setAttribute('stroke-width', fmt(thickness * 0.8));
    }
  }
  define('m3-squiggle', Squiggle);

  // ---- <m3-wavy-line> -------------------------------------------------------

  // a squiggly divider (WavyLine): the seek line's wave the whole way across,
  // through its middle. it holds still
  const WAVY_LINE_CSS =
    ':host{display:block;position:relative;height:8px;line-height:0}' +
    ':host([hidden]){display:none}' +
    'svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}' +
    'path{fill:none;stroke:var(--m3-wavy-line-color,var(--m3-outline-variant));stroke-linecap:round;stroke-linejoin:round}';

  class WavyLine extends HTMLElement {
    static get observedAttributes() {
      return ['amplitude', 'wavelength', 'thickness'];
    }

    constructor() {
      super();
      const { root } = shadow(this, WAVY_LINE_CSS);
      const svg = util.svg('svg', { 'aria-hidden': 'true', part: 'svg' });
      this._path = util.svg('path', {});
      svg.appendChild(this._path);
      root.appendChild(svg);
      this._w = this._h = 0;
      this._unsize = null;
    }

    connectedCallback() {
      if (!this._unsize) {
        this._unsize = watchSize(this, (w, h) => {
          this._w = w;
          this._h = h;
          this._draw();
        });
      }
    }

    disconnectedCallback() {
      if (this._unsize) this._unsize();
      this._unsize = null;
    }

    attributeChangedCallback() {
      this._draw();
    }

    _draw() {
      const thickness = Math.max(0, numberAttr(this, 'thickness', 2));
      const amplitude = numberAttr(this, 'amplitude', 2);
      const wavelength = Math.max(1, numberAttr(this, 'wavelength', 16));
      const w = this._w;
      // round ends, both inside its box
      const d = w > thickness ? geometry.sineLine(thickness / 2, w - thickness / 2, this._h / 2, { amplitude, wavelength }) : '';
      this._path.setAttribute('d', d);
      this._path.setAttribute('stroke-width', fmt(thickness));
    }
  }
  define('m3-wavy-line', WavyLine);

  // ---- <m3-wavy-progress> ---------------------------------------------------

  // the seek line (SeekBar.qml, wavy_progress.frag): the played part runs as a
  // wave while playing, the rest is a straight track, thicker and with a handle
  // while hovered or dragged. `interactive` makes it a slider
  const PROGRESS_WAVELENGTH = 34;
  const PROGRESS_GAP = 4;
  const PROGRESS_CSS =
    ':host{display:block;position:relative;height:24px;min-width:48px;line-height:0;outline:none;' +
    '-webkit-tap-highlight-color:transparent}' +
    ':host([hidden]){display:none}' +
    // a drag across it seeks; one up or down still scrolls the page
    ':host([interactive]:not([disabled])){cursor:pointer;touch-action:pan-y;user-select:none;-webkit-user-select:none}' +
    ':host([disabled]){opacity:.45}' +
    ':host(:focus-visible){outline:2px solid var(--m3-secondary);outline-offset:2px;border-radius:12px}' +
    'svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;pointer-events:none}' +
    'path{fill:none;stroke-linecap:round;stroke-linejoin:round}' +
    '.track{stroke:var(--m3-progress-track,var(--m3-secondary-container))}' +
    '.played{stroke:var(--m3-progress-active,var(--m3-primary))}' +
    '.handle{fill:var(--m3-progress-active,var(--m3-primary))}';

  class WavyProgress extends Live {
    static get observedAttributes() {
      return ['value', 'playing', 'interactive', 'disabled'];
    }

    constructor() {
      super();
      const { root } = shadow(this, PROGRESS_CSS);
      const svg = util.svg('svg', { 'aria-hidden': 'true', part: 'svg' });
      this._trackPath = util.svg('path', { class: 'track', part: 'track' });
      this._playedPath = util.svg('path', { class: 'played', part: 'played' });
      this._handleRect = util.svg('rect', { class: 'handle', part: 'handle', width: '0', height: '0' });
      svg.append(this._trackPath, this._playedPath, this._handleRect);
      root.appendChild(svg);
      this._w = this._h = 0;
      this._unsize = null;
      this._unsubscribe = null;
      this._value = 0;
      this._scrub = 0;
      this._dragging = false;
      this._pointer = null;
      this._hover = false;
      this._ring = false;
      this._reflecting = false;
      this._ownTab = false;
      // the first state shows as it is; changes after it ease
      this._ready = false;
      const draw = () => redraw(this);
      this._follow = draw;
      this._amplitude = new motion.Tweened(0, { duration: 400, ease: 'outCubic' }, draw);
      this._thickness = new motion.Tweened(4, motion.presets.elementMoveFast, draw);
      this._handleWidth = new motion.Tweened(0, motion.presets.elementMoveFast, draw);

      this.addEventListener('pointerenter', () => {
        this._hover = true;
        this._sync();
      });
      this.addEventListener('pointerleave', () => {
        this._hover = false;
        this._sync();
      });
      this.addEventListener('pointerdown', (event) => this._press(event));
      this.addEventListener('pointermove', (event) => this._move(event));
      this.addEventListener('pointerup', (event) => this._release(event, true));
      this.addEventListener('pointercancel', (event) => this._release(event, false));
      this.addEventListener('lostpointercapture', (event) => this._release(event, false));
      // grown with its handle for the keyboard too, so it shows where it is:
      // focused from the keyboard, or used from it once focused
      this.addEventListener('keydown', (event) => {
        if (!this._ring) {
          this._ring = true;
          this._sync();
        }
        this._key(event);
      });
      this.addEventListener('focus', () => {
        this._ring = this.matches(':focus-visible');
        this._sync();
      });
      this.addEventListener('blur', () => {
        this._ring = false;
        this._sync();
      });
    }

    /** 0 to 1; while dragged, where the drag is */
    get value() {
      return this._dragging ? this._scrub : this._value;
    }

    set value(value) {
      this._setValue(+value, true);
    }

    connectedCallback() {
      if (!this._unsize) {
        this._unsize = watchSize(this, (w, h) => {
          this._w = w;
          this._h = h;
          this._draw();
        });
      }
      super.connectedCallback();
      this._aria();
      if (!this._ready) util.raf(() => (this._ready = true));
    }

    disconnectedCallback() {
      if (this._unsize) this._unsize();
      this._unsize = null;
      this._dragging = false;
      super.disconnectedCallback();
    }

    attributeChangedCallback(name, old, value) {
      if (name === 'value') {
        if (!this._reflecting) this._setValue(parseFloat(value), false);
        return;
      }
      this._sync();
      this._aria();
    }

    _setValue(value, reflect) {
      this._value = clamp(Number.isFinite(value) ? value : 0, 0, 1);
      if (reflect) {
        this._reflecting = true;
        this.setAttribute('value', String(Math.round(this._value * 1e5) / 1e5));
        this._reflecting = false;
      }
      this._aria();
      redraw(this);
    }

    _interactive() {
      return this.hasAttribute('interactive') && !this.hasAttribute('disabled');
    }

    _sync() {
      const expanded = this._interactive() && (this._hover || this._dragging || this._ring);
      const playing = this.hasAttribute('playing');
      // flat when it is not playing, and under reduced motion, as the wave would run
      const amplitude = playing && !motion.reducedMotion() ? (expanded ? 2.4 : 1.6) : 0;
      const how = this._ready ? 'to' : 'jump';
      this._amplitude[how](amplitude);
      this._thickness[how](expanded ? 6 : 4);
      this._handleWidth[how](expanded ? 4 : 0);
      spin.hold(this, playing && this._connected);
      const follow = this._connected && this._shown;
      if (follow && !this._unsubscribe) {
        this._unsubscribe = spin.subscribe(this._follow);
        redraw(this);
      } else if (!follow && this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
    }

    _aria() {
      if (!this._connected) return;
      const interactive = this.hasAttribute('interactive');
      const set = (name, value) => {
        if (this.getAttribute(name) !== value) this.setAttribute(name, value);
      };
      set('role', interactive ? 'slider' : 'progressbar');
      set('aria-valuemin', '0');
      set('aria-valuemax', '100');
      set('aria-valuenow', String(Math.round(this.value * 100)));
      if (this.hasAttribute('disabled')) set('aria-disabled', 'true');
      else this.removeAttribute('aria-disabled');
      if (this._interactive()) {
        if (!this.hasAttribute('tabindex')) {
          this.setAttribute('tabindex', '0');
          this._ownTab = true;
        }
      } else if (this._ownTab) {
        this.removeAttribute('tabindex');
        this._ownTab = false;
      }
    }

    _emit(type) {
      this.dispatchEvent(new Event(type, { bubbles: true }));
    }

    _fraction(clientX) {
      const box = this.getBoundingClientRect();
      return box.width > 0 ? clamp((clientX - box.left) / box.width, 0, 1) : 0;
    }

    // the press focuses it as any click does (a mouse focus, so no ring); its
    // css keeps a drag from selecting text
    _press(event) {
      if (!this._interactive() || event.button !== 0 || this._dragging) return;
      try {
        this.setPointerCapture(event.pointerId);
      } catch (error) {
        // a synthetic pointer cannot be captured; the drag still works over it
      }
      this._dragging = true;
      this._pointer = event.pointerId;
      this._scrub = this._fraction(event.clientX);
      this._sync();
      this._aria();
      redraw(this);
      this._emit('input');
    }

    _move(event) {
      if (!this._dragging || event.pointerId !== this._pointer) return;
      const next = this._fraction(event.clientX);
      if (next === this._scrub) return;
      this._scrub = next;
      this._aria();
      redraw(this);
      this._emit('input');
    }

    // a release commits where the drag got to; a cancelled drag goes back
    _release(event, commit) {
      if (!this._dragging || event.pointerId !== this._pointer) return;
      this._dragging = false;
      this._pointer = null;
      if (commit) this._setValue(this._scrub, true);
      this._sync();
      this._aria();
      redraw(this);
      if (commit) this._emit('change');
    }

    _key(event) {
      if (!this._interactive() || event.altKey || event.ctrlKey || event.metaKey) return;
      let value = this._value;
      switch (event.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          value += 0.01;
          break;
        case 'ArrowLeft':
        case 'ArrowDown':
          value -= 0.01;
          break;
        case 'PageUp':
          value += 0.1;
          break;
        case 'PageDown':
          value -= 0.1;
          break;
        case 'Home':
          value = 0;
          break;
        case 'End':
          value = 1;
          break;
        default:
          return;
      }
      event.preventDefault();
      this._setValue(Math.round(value * 1e4) / 1e4, true);
      this._emit('input');
      this._emit('change');
    }

    _draw() {
      const w = this._w;
      const h = this._h;
      if (!(w > 0 && h > 0)) return;
      const cy = h / 2;
      const thickness = Math.max(0, this._thickness.value);
      const half = thickness / 2;
      const handleWidth = Math.max(0, this._handleWidth.value);
      const amplitude = this._amplitude.value;
      const x = clamp(this.value, 0, 1) * w;
      const handleSpace = handleWidth > 0 ? PROGRESS_GAP + handleWidth / 2 : 0;

      // the played part, its round ends inside the line
      const playedEnd = x - handleSpace;
      let played = '';
      if (playedEnd > half) {
        if (Math.abs(amplitude) > 0.01) {
          // a wavelength every 1.6 s, on the shared spin that turns with the music
          const phase = -(spin.value * 4.36) % TAU;
          played = geometry.sineLine(half, playedEnd, cy, { amplitude, wavelength: PROGRESS_WAVELENGTH, phase });
        } else {
          played = `M${fmt(half)} ${fmt(cy)}H${fmt(playedEnd)}`;
        }
      }

      // what is left to play
      const trackStart = x + (handleWidth > 0 ? handleSpace : PROGRESS_GAP);
      const trackEnd = w - half;
      const track = trackStart < trackEnd ? `M${fmt(trackStart)} ${fmt(cy)}H${fmt(trackEnd)}` : '';

      this._playedPath.setAttribute('d', played);
      this._playedPath.setAttribute('stroke-width', fmt(thickness));
      this._trackPath.setAttribute('d', track);
      this._trackPath.setAttribute('stroke-width', fmt(thickness));

      const handle = this._handleRect;
      if (handleWidth > 0.01) {
        handle.setAttribute('x', fmt(x - handleWidth / 2));
        handle.setAttribute('y', fmt(cy - 9));
        handle.setAttribute('width', fmt(handleWidth));
        handle.setAttribute('height', '18');
        handle.setAttribute('rx', fmt(handleWidth / 2));
      } else {
        handle.setAttribute('width', '0');
      }
    }
  }
  define('m3-wavy-progress', WavyProgress);

  // ---- <m3-play-button> -----------------------------------------------------

  // the play button wherever music starts (PlayButton.qml, ShapeButton.qml): a
  // soft five-bump cookie while paused that springs into a nine-scallop one,
  // turning with the shared spin, while it plays. the glyph pops as it changes
  // and starting music throws out a little burst of cookies
  const PLAY_CSS =
    ICON_CSS +
    ':host{display:inline-block;position:relative;flex:none;width:56px;height:56px;line-height:0;vertical-align:middle;' +
    '-webkit-tap-highlight-color:transparent}' +
    ':host([hidden]){display:none}' +
    ':host([disabled]){opacity:.38;pointer-events:none}' +
    'button{all:unset;position:absolute;inset:0;display:block;box-sizing:border-box;border-radius:50%;cursor:pointer;' +
    '-webkit-tap-highlight-color:transparent}' +
    'button:focus-visible{outline:2px solid var(--m3-secondary);outline-offset:2px}' +
    '.body{position:absolute;inset:0;pointer-events:none}' +
    'm3-shape{position:absolute;inset:-9px;width:auto;height:auto;color:var(--m3-play-color,var(--m3-primary))}' +
    '.icon{position:absolute;left:50%;top:50%;translate:-50% -50%;font-size:29px;' +
    'color:var(--m3-play-on-color,var(--m3-on-primary))}';

  class PlayButton extends Live {
    static get observedAttributes() {
      return ['playing', 'size', 'disabled'];
    }

    constructor() {
      super();
      const { root, size } = shadow(this, PLAY_CSS, { delegatesFocus: true });
      this._size = size;
      this._button = make('button', '', root);
      this._button.type = 'button';
      this._button.setAttribute('part', 'button');
      this._body = make('span', 'body', this._button);
      this._shape = make('m3-shape', '', this._body);
      this._shape.setAttribute('shape', 'softCookie');
      this._shape.setAttribute('morph-to', 'cookie9');
      this._shape.setAttribute('aria-hidden', 'true');
      this._glyph = make('span', 'icon', this._body);
      this._glyph.setAttribute('aria-hidden', 'true');
      this._playing = null;
      this._ready = false;
      this._ownTip = null;
      this._unsize = null;
      this._unsubscribe = null;
      this._morph = new motion.Spring(0, motion.springs.morph, (value) => (this._shape.morph = value));
      this._squish = new motion.Spring(1, motion.springs.bounce, (value) => {
        this._body.style.scale = fmt3(value);
      });
      // 25 degrees per radian of the shared spin
      this._follow = (value) => (this._shape.angle = (25 * value) % 360);

      const press = (down) => springTo(this._squish, down ? 0.88 : 1);
      const button = this._button;
      button.addEventListener('pointerdown', (event) => {
        if (event.button === 0) press(true);
      });
      for (const type of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) button.addEventListener(type, () => press(false));
      button.addEventListener('keydown', (event) => {
        if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) press(true);
      });
      button.addEventListener('keyup', (event) => {
        if (event.key === ' ' || event.key === 'Enter') press(false);
      });
      button.addEventListener('click', () => this._toggle());
      this._fit(56);
      this._sync();
    }

    get playing() {
      return this.hasAttribute('playing');
    }

    set playing(on) {
      this.toggleAttribute('playing', !!on);
    }

    connectedCallback() {
      // its tooltip says what a click does, unless the page gave it one
      if (this._ownTip === null) this._ownTip = !this.hasAttribute('data-tooltip');
      if (!this._unsize) this._unsize = watchSize(this, (w) => this._fit(w));
      super.connectedCallback();
      if (!this._ready) util.raf(() => (this._ready = true));
    }

    disconnectedCallback() {
      if (this._unsize) this._unsize();
      this._unsize = null;
      super.disconnectedCallback();
    }

    attributeChangedCallback(name) {
      if (name === 'size') {
        const size = numberAttr(this, 'size', NaN);
        this._size(Number.isFinite(size) ? `:host{width:${fmt(size)}px;height:${fmt(size)}px}` : '');
        if (Number.isFinite(size)) this._fit(size);
      } else if (name === 'disabled') {
        this._button.disabled = this.hasAttribute('disabled');
      } else {
        this._sync();
      }
    }

    // the shape is drawn in a box 16% bigger each side and reaches only the
    // button's size, so a spring past its size never has a lobe cut off
    _fit(width) {
      if (!(width > 0)) return;
      const room = Math.round(width * 0.16);
      this._shape.style.inset = -room + 'px';
      this._shape.extent = width / Math.max(1, width + 2 * room);
      const iconSize = Math.round(width * 0.52);
      this._glyph.style.fontSize = iconSize + 'px';
      this._glyph.style.setProperty('--_opsz', fmt(clamp(iconSize, 20, 48)));
    }

    _sync() {
      const playing = this.hasAttribute('playing');
      if (playing !== this._playing) {
        const animate = this._playing !== null && this._ready;
        this._playing = playing;
        this._glyph.textContent = playing ? 'pause' : 'play_arrow';
        this._button.setAttribute('aria-pressed', String(playing));
        this._button.setAttribute('aria-label', playing ? 'Pause' : 'Play');
        if (animate) {
          this._morph.to(playing ? 1 : 0);
          motion.animate(this._glyph, [{ scale: 0.55 }, { scale: 1 }], { duration: 480, ease: motion.outBack(2.6) });
        } else {
          this._morph.jump(playing ? 1 : 0);
        }
      }
      if (this._connected && this._ownTip) {
        const tip = playing ? 'Pause' : 'Play';
        if (this.getAttribute('data-tooltip') !== tip) this.setAttribute('data-tooltip', tip);
      }
      // music plays while it says so, whether or not it is in view
      spin.hold(this, playing && this._connected);
      const follow = this._connected && this._shown;
      if (follow && !this._unsubscribe) {
        this._unsubscribe = spin.subscribe(this._follow);
        this._follow(spin.value);
      } else if (!follow && this._unsubscribe) {
        this._unsubscribe();
        this._unsubscribe = null;
      }
    }

    _toggle() {
      if (this.hasAttribute('disabled')) return;
      const playing = !this.hasAttribute('playing');
      this.toggleAttribute('playing', playing);
      this.dispatchEvent(new CustomEvent('toggle', { bubbles: true, detail: { playing } }));
      if (playing && !this.hasAttribute('no-burst')) burst(this, 'play');
    }
  }
  define('m3-play-button', PlayButton);

  // ---- wavy buttons -----------------------------------------------------------

  // a pill with a scalloped edge for the buttons that play things
  // (WavyPill.qml, wavy_pill.frag): the scallops deepen on hover and further
  // on a press, and run round the edge while hovered
  util.enhance('.m3-btn.wavy', (button) => {
    const svg = util.svg('svg', { class: 'm3-wavy-bg', 'aria-hidden': 'true', focusable: 'false' });
    const path = util.svg('path', {});
    svg.appendChild(path);
    button.insertBefore(svg, button.firstChild);

    let w = 0;
    let h = 0;
    let hovered = false;
    let pressed = false;
    const draw = () => {
      if (!(w > 0 && h > 0)) return;
      const d = geometry.wavyRoundedRect(w, h, {
        amplitude: depth.value,
        wavelength: 15,
        phase: drift.value,
        radius: Math.min(w, h) / 2,
      });
      path.setAttribute('d', d);
    };
    const depth = new motion.Spring(2.2, motion.springs.bounce, draw);
    // the scallops start running on hover and slow to a stop where they are
    const drift = new motion.Drift({ speed: TAU / 1.6, onUpdate: draw });
    const update = () => {
      springTo(depth, pressed ? 4 : hovered ? 3.2 : 2.2);
      drift.active = hovered;
    };
    const release = () => {
      if (!pressed) return;
      pressed = false;
      update();
    };

    button.addEventListener('pointerenter', () => {
      hovered = true;
      update();
    });
    // a press held while the pointer wanders off stays a press, as :active does
    button.addEventListener('pointerleave', () => {
      hovered = false;
      update();
    });
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      pressed = true;
      update();
      // let go anywhere
      global.addEventListener('pointerup', release, { once: true });
      global.addEventListener('pointercancel', release, { once: true });
    });
    button.addEventListener('keydown', (event) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
        pressed = true;
        update();
      }
    });
    button.addEventListener('keyup', (event) => {
      if (event.key === ' ' || event.key === 'Enter') release();
    });
    button.addEventListener('blur', release);
    watchSize(button, (bw, bh) => {
      w = bw;
      h = bh;
      svg.setAttribute('viewBox', `0 0 ${fmt(w)} ${fmt(h)}`);
      draw();
    });
  });

  // ---- bursts -----------------------------------------------------------------

  // a little burst of material shapes from an element (ShapeBurst.qml): hearts
  // for a favourite, cookies for play, clovers for a pin, flowers for a
  // playlist. they fly out, tumble, fall a little and fade inside 720 ms, and
  // the burst takes itself away
  const BURST_SHAPES = {
    hearts: ['heart'],
    play: ['cookie9', 'sunny', 'cookie6', 'softBurst'],
    pin: ['clover4', 'clover8'],
    playlist: ['flower', 'puffy', 'cookie7'],
  };

  function burst(target, kind = 'play', { count = 10 } = {}) {
    let x;
    let y;
    let source = null;
    if (target && typeof target.getBoundingClientRect === 'function') {
      const box = target.getBoundingClientRect();
      // hidden or not on the page: nowhere to burst from
      if (!box.width && !box.height) return null;
      x = box.left + box.width / 2;
      y = box.top + box.height / 2;
      source = target;
    } else if (target && Number.isFinite(target.x) && Number.isFinite(target.y)) {
      x = target.x;
      y = target.y;
    } else {
      return null;
    }
    const shapes = BURST_SHAPES[kind] || BURST_SHAPES.play;
    const tones = ['--m3-primary', '--m3-tertiary', kind === 'hearts' ? '--m3-error' : '--m3-secondary'];

    const layer = make('div', 'm3-burst');
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText =
      'position:fixed;inset:auto;left:' + fmt(x) + 'px;top:' + fmt(y) + 'px;width:0;height:0;margin:0;padding:0;' +
      'border:0;background:none;overflow:visible;pointer-events:none;z-index:1100;contain:layout style';
    // in the colours of where it came from, should that be themed apart
    if (source) {
      const style = getComputedStyle(source);
      for (const name of tones) {
        const value = style.getPropertyValue(name).trim();
        if (value) layer.style.setProperty(name, value);
      }
    }

    const pieces = [];
    const total = Math.max(1, Math.round(count));
    for (let index = 0; index < total; index++) {
      const angle = (TAU * (index + 0.6 * Math.random())) / total - Math.PI / 2;
      const size = 9 + 10 * Math.random();
      const el = make('m3-shape', '', layer);
      el.setAttribute('shape', shapes[Math.floor(Math.random() * shapes.length)]);
      el.style.cssText =
        `position:absolute;left:${fmt(-size / 2)}px;top:${fmt(-size / 2)}px;width:${fmt(size)}px;height:${fmt(size)}px;` +
        `color:var(${tones[Math.floor(Math.random() * tones.length)]});transform:scale(.3);will-change:transform,opacity`;
      pieces.push({
        el,
        dx: Math.cos(angle),
        dy: Math.sin(angle),
        reach: 34 + 46 * Math.random(),
        turn: (Math.random() < 0.5 ? -1 : 1) * (120 + 260 * Math.random()),
      });
    }

    (doc.body || doc.documentElement).appendChild(layer);
    // over everything, an open modal dialog included: the top layer, where
    // the browser has one
    if (typeof layer.showPopover === 'function') {
      try {
        layer.setAttribute('popover', 'manual');
        layer.showPopover();
      } catch (error) {
        layer.removeAttribute('popover');
      }
    }

    motion.tween({
      duration: 720,
      ease: 'linear',
      onUpdate: (t) => {
        // out fast and easing off, with a little gravity
        const travel = 1 - Math.pow(1 - t, 3);
        const scale = t < 0.18 ? 0.3 + (0.7 * t) / 0.18 : 1 - (0.45 * (t - 0.18)) / 0.82;
        const opacity = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
        for (const piece of pieces) {
          const px = piece.dx * piece.reach * travel;
          const py = piece.dy * piece.reach * travel + 46 * t * t;
          piece.el.style.transform = `translate(${fmt(px)}px,${fmt(py)}px) rotate(${fmt(piece.turn * t)}deg) scale(${fmt3(scale)})`;
          piece.el.style.opacity = fmt3(opacity);
        }
      },
      onDone: () => layer.remove(),
    });
    return layer;
  }
  M3.burst = burst;

  // [data-burst="hearts|play|pin|playlist"] bursts on click. a toggle
  // (aria-pressed) bursts only as it turns on, as a saved song's star does;
  // that is read once every click handler has had its turn
  doc.addEventListener('click', (event) => {
    const origin = event.target && event.target.closest ? event.target.closest('[data-burst]') : null;
    if (!origin || origin.matches(':disabled, [aria-disabled="true"]')) return;
    const kind = origin.getAttribute('data-burst') || 'play';
    if (!origin.hasAttribute('aria-pressed')) {
      burst(origin, kind);
      return;
    }
    setTimeout(() => {
      if (origin.getAttribute('aria-pressed') === 'true' && origin.isConnected) burst(origin, kind);
    }, 0);
  });

  // ---- stickers ---------------------------------------------------------------

  // big, faint material shapes scattered behind something (Stickers.qml): the
  // same key always lays them out the same way, each turns at its own pace
  // with the shared spin, and they are tonal and quiet
  const STICKER_SHAPES = [
    'heart', 'ghostish', 'bun', 'flower', 'sunny', 'cookie9', 'clover4', 'softBoom', 'puffy', 'pixelCircle',
    'softBurst', 'clamShell', 'arch', 'fan', 'gem', 'cookie6', 'clover8', 'verySunny', 'puffyDiamond', 'burst',
  ];
  const STICKER_TONES = ['--m3-primary-container', '--m3-tertiary-container', '--m3-secondary-container'];
  const retoners = new WeakMap();

  /** each sticker's place, size, shape, tone and turn, from the key alone */
  function stickerLayout(key, count, min, max) {
    const next = util.rng(util.hash(key));
    const list = [];
    for (let index = 0; index < count; index++) {
      // a slot each across the width, jittered within it
      list.push({
        x: (index + 0.15 + 0.7 * next()) / count,
        y: -0.15 + 1.25 * next(),
        size: min + (max - min) * next(),
        shape: STICKER_SHAPES[Math.floor(next() * STICKER_SHAPES.length)],
        tone: Math.floor(next() * 3),
        angle: next() * 360,
        // degrees per radian of the spin, either way round
        pace: (next() < 0.5 ? -1 : 1) * (12 + 26 * next()),
      });
    }
    return list;
  }

  // the theme's darkness where an element is, as M3.color.isDark judges it
  function darkAt(el) {
    const style = getComputedStyle(el);
    const background = style.getPropertyValue('--m3-background').trim();
    if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(background)) return M3.color.isDark({ background });
    return /\bdark\b/.test(style.colorScheme) && !/\blight\b/.test(style.colorScheme);
  }

  // once for however many changes come together, as soon as they are in
  let retoning = false;
  function retoneStickers() {
    if (retoning) return;
    retoning = true;
    Promise.resolve().then(() => {
      retoning = false;
      doc.querySelectorAll('.m3-stickers').forEach((layer) => {
        const retone = retoners.get(layer);
        if (retone) retone();
      });
    });
  }

  function stickers(container, options) {
    if (!container || container.nodeType !== 1) return null;
    const o = Object.assign({ key: 'swiftify' }, options);
    const number = (value, fallback) => (value != null && Number.isFinite(+value) ? +value : fallback);
    const count = Math.max(0, Math.floor(number(o.count, 4)));
    const min = number(o.min, 70);
    const max = number(o.max, 200);
    const strength = number(o.strength, 1);
    const clipRadius = number(o.clipRadius, -1);

    const layer = doc.createElement('div');
    layer.className = 'm3-stickers';
    layer.setAttribute('aria-hidden', 'true');
    layer.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:-1' +
      // cut to its own bounds as the rounded card it sits in looks, if asked
      (clipRadius >= 0 ? `;overflow:hidden;border-radius:${fmt(clipRadius)}px` : '');
    // behind the container's content but over its background
    const look = getComputedStyle(container);
    if (look.position === 'static') container.style.position = 'relative';
    if (look.isolation === 'auto') container.style.isolation = 'isolate';

    const specs = stickerLayout(String(o.key), count, min, max);
    const shapes = specs.map((spec) => {
      const el = make('m3-shape', '', layer);
      el.setAttribute('shape', spec.shape);
      const size = fmt(spec.size);
      const offset = fmt(spec.size / 2);
      el.style.cssText =
        `position:absolute;width:${size}px;height:${size}px;` +
        `left:calc(${fmt(spec.x * 100)}% - ${offset}px);top:calc(${fmt(spec.y * 100)}% - ${offset}px)`;
      return el;
    });
    container.insertBefore(layer, container.firstChild);

    const retone = () => {
      const alpha = clamp((darkAt(layer) ? 0.32 : 0.5) * strength, 0, 1);
      shapes.forEach((el, index) => {
        el.style.color = `color-mix(in srgb, var(${STICKER_TONES[specs[index].tone]}) ${fmt(alpha * 100)}%, transparent)`;
      });
    };
    retone();
    retoners.set(layer, retone);

    // they turn with the music while in view, and not at all under reduced motion
    const turn = (value) => {
      const still = motion.reducedMotion();
      shapes.forEach((el, index) => {
        const spec = specs[index];
        el.angle = (spec.angle + (still ? 0 : spec.pace * value)) % 360;
      });
    };
    turn(spin.value);
    let unsubscribe = null;
    const unwatch = util.observeVisible(layer, (shown) => {
      if (shown && !unsubscribe) {
        unsubscribe = spin.subscribe(turn);
        turn(spin.value);
      } else if (!shown && unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    });

    return {
      element: layer,
      destroy() {
        unwatch();
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
        retoners.delete(layer);
        layer.remove();
      },
    };
  }
  M3.stickers = stickers;

  util.enhance('[data-m3-stickers]', (el) => {
    const data = el.dataset;
    const number = (value, fallback) => {
      const parsed = parseFloat(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    stickers(el, {
      key: el.getAttribute('data-m3-stickers') || 'swiftify',
      count: number(data.count, 4),
      min: number(data.min, 70),
      max: number(data.max, 200),
      strength: number(data.strength, 1),
      clipRadius: number(data.clipRadius, -1),
    });
  });

  // ---- empty states -----------------------------------------------------------

  // what a page shows with nothing in it (EmptyState.qml): a symbol on a tonal
  // shape picked for what it says, over a title and a line of explanation. the
  // shape springs in with a twist each time it comes into view
  const EMPTY_SHAPES = {
    search_off: 'ghostish',
    music_note: 'heart',
    lyrics: 'bun',
    queue_music: 'clamShell',
    push_pin: 'clover4',
    album: 'sunny',
    star: 'heart',
    cloud_off: 'pixelCircle',
    wifi_off: 'pixelCircle',
  };

  util.enhance('.m3-empty', (el) => {
    const badge = make('div', 'm3-empty-badge');
    // its layers stack inside it: stickers, then the shape, then the symbol
    badge.style.isolation = 'isolate';
    const scatter = make('div', '', badge);
    scatter.style.cssText =
      'position:absolute;left:50%;top:50%;width:190px;height:120px;margin:-60px 0 0 -95px;z-index:-2;pointer-events:none';
    const shape = make('m3-shape', '', badge);
    shape.setAttribute('aria-hidden', 'true');
    shape.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:-1;color:var(--m3-secondary-container)';
    const icon = make('span', 'm3-icon', badge);
    icon.setAttribute('aria-hidden', 'true');
    const title = make('div', 'm3-title m3-empty-title');
    const description = make('p', 'm3-empty-description');
    // the badge is positioned, so it would paint over the words below it,
    // stickers and all; positioned too, they paint after it
    title.style.position = description.style.position = 'relative';
    el.prepend(badge, title, description);

    let scattered = null;
    let key = null;
    const render = () => {
      const symbol = el.getAttribute('data-symbol') || 'music_note';
      shape.shape = el.getAttribute('data-shape') || EMPTY_SHAPES[symbol] || 'cookie9';
      icon.textContent = symbol;
      const heading = el.getAttribute('data-title') || '';
      title.textContent = heading;
      const text = el.getAttribute('data-description') || '';
      description.textContent = text;
      description.style.display = text ? '' : 'none';
      // little shapes about the badge, laid out from the title
      if (heading !== key) {
        key = heading;
        if (scattered) scattered.destroy();
        scattered = stickers(scatter, { key, count: 3, min: 16, max: 30, strength: 1.8 });
      }
    };
    render();
    if (global.MutationObserver) {
      new MutationObserver(render).observe(el, {
        attributes: true,
        attributeFilter: ['data-symbol', 'data-title', 'data-description', 'data-shape'],
      });
    }

    let shown = false;
    util.observeVisible(el, (visible) => {
      if (visible && !shown) {
        motion.animate(badge, [{ scale: 0.4 }, { scale: 1 }], { duration: 700, ease: motion.outBack(2.2) });
        motion.animate(badge, [{ rotate: '-60deg' }, { rotate: '0deg' }], { duration: 900, ease: motion.outBack(1.4) });
      }
      shown = visible;
    });
  });

  // ---- media cards ------------------------------------------------------------

  // a shelf or grid card (MediaCard.qml, MediaArtwork.qml, WavyClip.qml):
  // artwork, a title and a subtitle. hovered, it leans toward the pointer on
  // springs, and a square cover's edge turns to running scallops
  function artImage(value) {
    const art = (value || '').trim();
    if (!art) return '';
    if (/^(url|image-set|-webkit-image-set|image|cross-fade)\(/i.test(art) || /gradient\(/i.test(art)) return art;
    return `url("${art.replace(/["\\\n]/g, (c) => (c === '\n' ? '' : '\\' + c))}")`;
  }

  util.enhance('.m3-media-card', (card) => {
    const art = make('div', 'm3-media-art');
    const placeholder = make('span', 'm3-icon');
    placeholder.setAttribute('aria-hidden', 'true');
    const badge = make('span', 'm3-media-badge', art);
    badge.setAttribute('aria-hidden', 'true');
    make('m3-shape', '', badge).setAttribute('shape', 'cookie9');
    make('span', 'm3-icon', badge).textContent = 'arrow_forward';
    const title = make('span', 'm3-media-title');
    const subtitle = make('span', 'm3-media-subtitle');
    card.prepend(art, title, subtitle);

    const render = () => {
      const image = artImage(card.getAttribute('data-art'));
      art.style.backgroundImage = image;
      if (image) placeholder.remove();
      else {
        placeholder.textContent = card.getAttribute('data-symbol') || 'music_note';
        if (placeholder.parentNode !== art) art.prepend(placeholder);
      }
      const circular = card.hasAttribute('data-circular');
      art.classList.toggle('is-circular', circular);
      card.classList.toggle('is-circular', circular);
      title.textContent = card.getAttribute('data-title') || '';
      subtitle.textContent = card.getAttribute('data-subtitle') || '';
      // inline, as the card's css may well give it a display of its own
      subtitle.style.display = subtitle.textContent ? '' : 'none';
    };
    render();
    if (global.MutationObserver) {
      new MutationObserver(render).observe(card, {
        attributes: true,
        attributeFilter: ['data-title', 'data-subtitle', 'data-art', 'data-symbol', 'data-circular'],
      });
    }

    // the lean, about the cover's centre: the turn moves there from the
    // card's transform-origin and back, inside the transform, so the card's
    // own hover `scale` keeps whatever origin its css gives it
    let pivot = 0;
    const lean = () => {
      const across = acrossSpring.value;
      const down = downSpring.value;
      const resting = !acrossSpring.running && !downSpring.running && Math.abs(across) < 0.01 && Math.abs(down) < 0.01;
      card.style.transform = resting
        ? ''
        : `translateY(${fmt(pivot)}px) perspective(700px) rotateX(${fmt(down)}deg) rotateY(${fmt(across)}deg) translateY(${fmt(-pivot)}px)`;
    };
    const acrossSpring = new motion.Spring(0, motion.springs.tilt, lean);
    const downSpring = new motion.Spring(0, motion.springs.tilt, lean);

    // the wavy edge: depth springs in on a bounce, the scallops drift round
    let clipW = 0;
    let clipH = 0;
    let radius = 12;
    const clip = () => {
      const amplitude = depthSpring.value;
      if (Math.abs(amplitude) <= 0.01 || !(clipW > 0 && clipH > 0)) {
        art.style.clipPath = '';
        return;
      }
      // the corner given as it would be before the inset, so it stays the cover's own
      const d = geometry.wavyRoundedRect(clipW, clipH, {
        amplitude,
        wavelength: 22,
        phase: wave.value,
        radius: radius + amplitude + 0.75,
      });
      art.style.clipPath = `path('${d}')`;
    };
    const depthSpring = new motion.Spring(0, motion.springs.bounce, clip);
    const wave = new motion.Drift({ speed: TAU / 2.4, onUpdate: clip });

    let hovering = false;
    card.addEventListener('pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hovering = true;
      const box = card.getBoundingClientRect();
      const cover = art.getBoundingClientRect();
      const zoom = box.height / Math.max(1, card.offsetHeight) || 1;
      const origin = parseFloat(getComputedStyle(card).transformOrigin.split(' ')[1]);
      pivot = (cover.top + cover.height / 2 - box.top) / zoom - (Number.isFinite(origin) ? origin : card.offsetHeight / 2);
      const wavy = !card.hasAttribute('data-circular');
      if (wavy) {
        clipW = art.offsetWidth;
        clipH = art.offsetHeight;
        radius = parseFloat(getComputedStyle(art).borderTopLeftRadius) || 12;
      }
      springTo(depthSpring, wavy ? 3.5 : 0);
      wave.active = wavy;
    });
    card.addEventListener('pointermove', (event) => {
      if (!hovering) return;
      const box = card.getBoundingClientRect();
      const cover = art.getBoundingClientRect();
      springTo(acrossSpring, (clamp((event.clientX - box.left) / Math.max(1, box.width), 0, 1) - 0.5) * 12);
      springTo(downSpring, (0.5 - (event.clientY - cover.top) / Math.max(1, cover.height)) * 10);
    });
    card.addEventListener('pointerleave', () => {
      if (!hovering) return;
      hovering = false;
      springTo(acrossSpring, 0);
      springTo(downSpring, 0);
      springTo(depthSpring, 0);
      wave.active = false;
    });
  });
})(window);
