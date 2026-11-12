// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Profile rewards (Budgie 1.4): what achievements unlock for a profile, and Customise, where you try them on.
 *
 *   name effects  classes on a name (ui.nameFont adds them): gentle and still in lists, alive on the profile
 *   fonts         more fonts for a name (fonts/name-*.woff2), on top of the free ones
 *   frames        drawn round a picture by ui.avatar where it's big (profiles, chats, calls): CSS shapes that
 *                 follow the picture's own outline, a little behind it and a little in front
 *   scenes        a canvas behind the top of a profile: one shared loop, at most 60 frames a second, that sleeps
 *                 when the scene is off screen or Budgie is in the background, and thins itself out on a slow phone
 *
 * Calm mode and reduced motion keep all of it still: effects keep their colour, frames and scenes stand still.
 * The server (server/rewards.js) says what you've unlocked and only lets you wear that. The catalog of rewards is
 * js/achievements-data.js, shared with the server and with the achievements page.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const { store, ui, fx, api } = Nook;
  const { esc, icon } = ui;
  const CAT = window.NOOK_ACHIEVEMENTS || { rewards: [], families: [], tiers: [] };
  const REWARDS = CAT.rewards || [];
  const REWARD = new Map(REWARDS.map((r) => [r.id, r]));
  const FAMILY = new Map((CAT.families || []).map((f) => [f.id, f]));
  const TIERS = CAT.tiers || ['I', 'II', 'III', 'IV', 'V'];
  const TAU = Math.PI * 2;

  // the four kinds, in the order Customise shows them
  const KINDS = [
    { id: 'effect', label: 'Effects', symbol: 'auto_awesome', none: 'None', word: 'name effect', about: 'Your name comes alive on your profile, and wears a gentle version on posts, comments and chats.' },
    { id: 'font', label: 'Fonts', symbol: 'text_fields', none: 'Budgie', word: 'font', about: 'Your name in this font on your profile, posts, comments and chats.' },
    { id: 'frame', label: 'Frames', symbol: 'account_circle', none: 'None', word: 'frame', about: 'Round your picture on your profile, in chats, and on the screen when you call someone.' },
    { id: 'scene', label: 'Scenes', symbol: 'wallpaper', none: 'None', word: 'scene', about: 'Moves behind the top of your profile, for everyone who visits it.' },
  ];
  const KIND = new Map(KINDS.map((k) => [k.id, k]));
  const ofKind = (kind) => REWARDS.filter((r) => r.kind === kind);

  // calm mode, or reduced motion (the system's or Budgie's own): everything stands still
  const still = () => fx.reduced() || document.body.classList.contains('calm');
  const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  // a number that looks random but is the same every time it's drawn, so a picture drawn again doesn't jump
  const jitter = (i, salt = 1) => {
    const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const r2 = (n) => Math.round(n * 100) / 100;

  // ---- what you've unlocked (the server says) ------------------------------------------------------------

  let mine = null; // { wearing, tiers, unlocked: Set, everything }
  let loading = null;
  let supported = true;
  /** what you wear and have unlocked, fresh from the server (and remembered for the next sheet) */
  function load() {
    if (loading) return loading;
    loading = api
      .get('/api/rewards')
      .then((d) => {
        mine = { wearing: d.wearing || {}, tiers: d.tiers || {}, unlocked: new Set(d.unlocked || []), everything: !!d.everything };
        supported = true;
        markNew();
        return mine;
      })
      .catch((error) => {
        // a server from before 1.4 has no rewards: Customise isn't offered
        if (error && error.status === 404) supported = false;
        throw error;
      })
      .finally(() => (loading = null));
    return loading;
  }
  const isUnlocked = (r) => !r || !r.needs || (mine ? mine.unlocked.has(r.id) : false);
  const needsName = (r) => {
    const f = FAMILY.get(r.needs.family);
    return `${f ? f.name : r.needs.family} ${TIERS[r.needs.tier - 1] || r.needs.tier}`;
  };
  /** what the achievement tier asks for: "Kept a 30-day visit streak" */
  function needsWhat(r) {
    const f = FAMILY.get(r.needs.family);
    if (!f || !f.desc) return '';
    const n = (f.tiers || [])[r.needs.tier - 1];
    const say = (text) => (Nook.i18n ? Nook.i18n.t(text) : text); // the catalog's sentences are English: say them in the language
    return n === 1 && f.one ? say(f.one) : say(f.desc).replace('{n}', n == null ? '' : n.toLocaleString());
  }
  const tierNow = (r) => (mine && r.needs ? mine.tiers[r.needs.family] || 0 : 0);

  // rewards unlocked since you last looked at Customise get a "New" mark, and the button a dot
  const seenKey = () => 'nook-rw-seen-' + String(store.state.me.name || '').toLowerCase();
  let fresh = new Set();
  function markNew() {
    let seen = null;
    try {
      seen = JSON.parse(localStorage.getItem(seenKey()) || 'null');
    } catch (_) {
      seen = null;
    }
    fresh = new Set([...mine.unlocked].filter((id) => !(seen || []).includes(id)));
    // the dots that say so: on the pencil on your profile, and on Edit profile's Effects tab
    document.querySelectorAll('[data-rw-dot]').forEach((dot) => (dot.hidden = !fresh.size));
  }
  function sawAll() {
    if (!mine) return;
    try {
      localStorage.setItem(seenKey(), JSON.stringify([...mine.unlocked]));
    } catch (_) {
      /* private mode: they'll just see "New" again */
    }
  }

  // ---- frames --------------------------------------------------------------------------------------------

  // A frame's box is 140% of the picture (20% more on every side), and the outlines that follow the picture's shape
  // are SVG masks drawn in that box: the shape, made a little bigger, as a stroke. Kept per shape and size.
  const masks = new Map();
  function outline(shape, scale, width) {
    const key = `${shape}|${scale}|${width}`;
    if (!masks.has(key)) {
      let d = '';
      try {
        d = M3Shapes.path(shape || 'circle', 100);
      } catch (_) {
        d = 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z';
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 140 140"><path d="${d}" fill="none" stroke="#000" stroke-width="${width}" stroke-linejoin="round" transform="translate(50 50) scale(${scale}) translate(-50 -50)"/></svg>`;
      masks.set(key, `url('data:image/svg+xml,${encodeURIComponent(svg)}')`);
    }
    return masks.get(key);
  }
  // the picture's own shape, filled (for what moves over the picture itself)
  function filled(shape) {
    const key = 'fill|' + shape;
    if (!masks.has(key)) {
      let d = '';
      try {
        d = M3Shapes.path(shape || 'circle', 100);
      } catch (_) {
        d = 'M50 0A50 50 0 1 1 50 100A50 50 0 1 1 50 0Z';
      }
      masks.set(key, `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`)}')`);
    }
    return masks.get(key);
  }

  const CROWN =
    '<svg viewBox="0 0 64 46" aria-hidden="true" focusable="false"><defs><linearGradient id="rw-gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffc93c"/><stop offset="1" stop-color="#c98a0e"/></linearGradient></defs>' +
    '<path d="M6 40 L3 12 L18 25 L32 4 L46 25 L61 12 L58 40 Z" fill="url(#rw-gold)" stroke="#8f5f00" stroke-width="2.2" stroke-linejoin="round"/>' +
    '<rect x="5" y="37" width="54" height="7.5" rx="3" fill="url(#rw-gold)" stroke="#8f5f00" stroke-width="2.2"/>' +
    '<circle cx="3" cy="11" r="3.2" fill="#ffe680" stroke="#8f5f00" stroke-width="1.6"/><circle cx="32" cy="4" r="3.4" fill="#ffe680" stroke="#8f5f00" stroke-width="1.6"/><circle cx="61" cy="11" r="3.2" fill="#ffe680" stroke="#8f5f00" stroke-width="1.6"/>' +
    '<circle cx="32" cy="28" r="4.6" fill="#e53950" stroke="#7a1020" stroke-width="1.4"/><circle cx="17" cy="33" r="3" fill="#3d8bff" stroke="#123e85" stroke-width="1.2"/><circle cx="47" cy="33" r="3" fill="#2ec27e" stroke="#0e5b35" stroke-width="1.2"/>' +
    '<path d="M29.5 26.2 l2 -1.4" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity=".8"/></svg>';
  // the tonearm resting on the record, drawn in the record's box (140 × 140, the picture's middle at 70, 70)
  const ARM =
    '<svg viewBox="0 0 140 140" aria-hidden="true" focusable="false"><circle cx="129" cy="13" r="7" fill="#9aa0a6" stroke="#5f6368" stroke-width="2"/><circle cx="129" cy="13" r="2.6" fill="#e8eaed"/>' +
    '<path d="M129 13 L129 58 L121 85" fill="none" stroke="#dadce0" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M129 13 L129 58 L121 85" fill="none" stroke="#80868b" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" opacity=".7"/>' +
    '<rect x="115" y="82" width="11" height="8" rx="2" fill="#5f6368" transform="rotate(-24 120 86)"/></svg>';
  const ORBITS = (half) =>
    `<svg viewBox="0 0 140 140" aria-hidden="true" focusable="false"><g fill="none" stroke-width="1.3" stroke-linecap="round">` +
    `<path class="o1" d="${half ? 'M4 70 A66 19 0 0 0 136 70' : 'M4 70 A66 19 0 1 0 136 70 A66 19 0 1 0 4 70'}" transform="rotate(-22 70 70)"/>` +
    `<path class="o2" d="${half ? 'M12 70 A58 15 0 0 0 128 70' : 'M12 70 A58 15 0 1 0 128 70 A58 15 0 1 0 12 70'}" transform="rotate(26 70 70)"/></g></svg>`;

  /**
   * The frame someone wears, for ui.avatar: { back, front } markup to go behind and in front of the picture, or
   * null. Small pictures (under 56 px) get a lighter version with fewer moving parts.
   */
  function frame(u, size) {
    const r = REWARD.get(u && u.frame);
    if (!r || r.kind !== 'frame') return null;
    const sm = size < 56;
    const cls = (name) => `rw-frame ${name}${sm ? ' rw-sm' : ''}`;
    const ring = (scale, width) => `--rw-mask:${outline(u.shape, scale, width)}`;
    switch (r.id) {
      case 'ring':
        return { back: '', front: `<span class="${cls('rw-ring')}" style="${ring(1.1, 4.2)}"><i></i></span>` };
      case 'rainbow-ring':
        return {
          back: `<span class="${cls('rw-rainbow rw-glow')}" style="${ring(1.12, 12)}"><i></i></span>`,
          front: `<span class="${cls('rw-rainbow')}" style="${ring(1.1, 4.8)}"><i></i></span>`,
        };
      case 'flames': {
        const n = sm ? 11 : 15;
        const tongues = rep(n, (i) => `<i style="--a:${r2((360 / n) * i + jitter(i) * 10)}deg;--h:${r2(0.75 + jitter(i, 2) * 0.5)};--d:${r2(-jitter(i, 3) * 1.4)}s;--t:${r2(0.9 + jitter(i, 4) * 0.6)}s"><b></b></i>`);
        const embers = sm ? '' : rep(6, (i) => `<s style="--x:${r2(18 + jitter(i, 5) * 64)}%;--d:${r2(-jitter(i, 6) * 3)}s;--t:${r2(2.2 + jitter(i, 7) * 1.6)}s"></s>`);
        return { back: `<span class="${cls('rw-flames')}"><span class="rw-flames-glow"></span>${tongues}${embers}</span>`, front: '' };
      }
      case 'vinyl':
        return { back: `<span class="${cls('rw-vinyl')}"><i></i></span>`, front: sm ? '' : `<span class="rw-frame rw-vinyl-arm">${ARM}</span>` };
      case 'pixels': {
        const n = sm ? 16 : 24;
        const squares = rep(n, (i) => `<i style="--a:${r2((360 / n) * i)}deg;--d:${r2((i / n) * 1.6)}s;--c:var(${['--m3-primary', '--m3-tertiary', '--m3-secondary'][i % 3]})"></i>`);
        const pluses = sm ? '' : rep(4, (i) => `<b style="--a:${45 + 90 * i}deg;--d:${r2(i * 0.45)}s"></b>`);
        return { back: '', front: `<span class="${cls('rw-pixels')}">${squares}${pluses}</span>` };
      }
      case 'orbit':
        return {
          back: `<span class="${cls('rw-orbit-lines')}">${ORBITS(false)}</span>`,
          front:
            `<span class="${cls('rw-orbit-lines rw-front')}">${ORBITS(true)}</span>` +
            `<span class="${cls('rw-orbit')}"><span class="rw-plane p1"><i><b><s></s></b></i></span>${sm ? '' : '<span class="rw-plane p2"><i><b><s></s></b></i></span>'}</span>`,
        };
      case 'petals': {
        const ring1 = rep(10, (i) => `<i style="--a:${36 * i}deg;--d:${r2(-i * 0.4)}s"><b></b></i>`);
        const ring2 = sm ? '' : rep(10, (i) => `<i class="in" style="--a:${36 * i + 18}deg;--d:${r2(-i * 0.4 - 2)}s"><b></b></i>`);
        const falling = sm ? '' : rep(3, (i) => `<s style="--x:${r2(55 + jitter(i, 8) * 40)}%;--d:${r2(-i * 2.3)}s"></s>`);
        return { back: `<span class="${cls('rw-petals')}"><span class="rw-flower">${ring1}${ring2}</span></span>`, front: falling ? `<span class="${cls('rw-petals-fall')}">${falling}</span>` : '' };
      }
      case 'holo':
        return {
          back: `<span class="${cls('rw-holo rw-glow')}" style="${ring(1.12, 12)}"><i></i></span>`,
          front:
            `<span class="${cls('rw-holo')}" style="${ring(1.1, 3.8)}"><i></i></span>` +
            `<span class="rw-holo-scan" style="--rw-fill:${filled(u.shape)}"><i></i></span>`,
        };
      case 'crown':
        return {
          back: `<span class="${cls('rw-gold-ring')}" style="${ring(1.1, 3.6)}"><i></i></span>`,
          front: `<span class="rw-crown${sm ? ' rw-sm' : ''}">${CROWN}<i class="rw-twinkle"></i></span>`,
        };
      default:
        return null;
    }
  }

  // ---- name effects ----------------------------------------------------------------------------------------

  /**
   * A name drawn big (the profile's, Customise's) gets its effect in full: `rw-live`, and for some effects a little
   * more markup — letters that wave one after another, sparkles that twinkle round it.
   */
  function liven(el) {
    if (!el || el.classList.contains('rw-live')) return;
    el.classList.add('rw-live');
    if (el.classList.contains('name-fx-wave')) {
      const text = el.textContent;
      const letters = [...text];
      el.innerHTML =
        `<span class="sr-only">${esc(text)}</span><span aria-hidden="true">` +
        letters.map((ch, i) => `<span class="rw-l" style="--i:${i};--p:${Math.round((i / Math.max(1, letters.length - 1)) * 100)}%">${esc(ch)}</span>`).join('') +
        '</span>';
    }
    if (el.classList.contains('name-fx-sparkle')) {
      el.insertAdjacentHTML('beforeend', rep(5, (i) => `<i class="rw-spark" aria-hidden="true" style="--x:${r2(-4 + jitter(i, 11) * 100)}%;--y:${r2(-30 + jitter(i, 12) * 120)}%;--d:${r2(i * 0.55)}s;--z:${r2(0.6 + jitter(i, 13) * 0.7)}"></i>`));
    }
  }
  /**
   * Shrinks the names drawn in tiles until each fits its tile: the wide fonts (Arcade, Royal) and long usernames
   * would otherwise be cut off. Measured, as how wide a name comes out depends on the font and the letters in it.
   */
  function fit(root) {
    const samples = [...root.querySelectorAll('.rw-sample')];
    for (const el of samples) el.style.fontSize = '';
    // all the reading first, then all the writing, so the page is laid out once
    const sizes = samples.map((el) => {
      const room = el.parentElement.clientWidth - 6;
      const need = el.scrollWidth;
      return room > 0 && need > room ? Math.max(11, (parseFloat(getComputedStyle(el).fontSize) * room) / need) : 0;
    });
    samples.forEach((el, i) => sizes[i] && (el.style.fontSize = sizes[i].toFixed(1) + 'px'));
    // a locked tile's "On fire IV" that would take two lines shows the achievement's badge and tier instead
    const chips = [...root.querySelectorAll('.rw-chip.locked')].filter((c) => c.querySelector('.rw-need-short'));
    for (const c of chips) c.classList.remove('tight');
    const tight = chips.map((c) => c.offsetHeight > 27);
    chips.forEach((c, i) => tight[i] && c.classList.add('tight'));
  }
  /** a name's classes for what it wears: { font, effect } */
  const nameClasses = (style) => ui.nameFont({ font: style.font, effect: style.effect }).trim();

  // ---- scenes --------------------------------------------------------------------------------------------

  const rnd = (a, b) => a + Math.random() * (b - a);
  const count = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));
  const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`;

  // the page's colours, as numbers a canvas can use (a scene takes the colours of the profile it's on)
  const probe = document.createElement('canvas').getContext('2d');
  function toRGB(value, fallback) {
    probe.fillStyle = fallback;
    probe.fillStyle = (value || '').trim() || fallback;
    const s = probe.fillStyle;
    if (s[0] === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
    const m = s.match(/[\d.]+/g) || [0, 0, 0];
    return [+m[0], +m[1], +m[2]];
  }
  function palette(el, into) {
    const css = getComputedStyle(el);
    const v = (name, fallback) => toRGB(css.getPropertyValue(name), fallback);
    const surface = v('--m3-surface', '#fef7ff');
    const dark = (0.2126 * surface[0] + 0.7152 * surface[1] + 0.0722 * surface[2]) / 255 < 0.45;
    return Object.assign(into || {}, {
      dark,
      tones: [v('--m3-primary', '#6750a4'), v('--m3-tertiary', '#7d5260'), v('--m3-secondary', '#625b71')],
      ink: v('--m3-on-surface', '#1d1b20'),
      shine: dark ? [255, 255, 255] : [255, 255, 255],
      key: `${dark}|${css.getPropertyValue('--m3-primary')}|${css.getPropertyValue('--m3-tertiary')}`,
    });
  }

  // a soft round glow, drawn once and stamped wherever it's needed
  const glows = new Map();
  function glow(c, radius) {
    const key = c.join(',') + '|' + radius;
    if (!glows.has(key)) {
      const g = document.createElement('canvas');
      g.width = g.height = radius * 4;
      const x = g.getContext('2d');
      const grad = x.createRadialGradient(radius * 2, radius * 2, 0, radius * 2, radius * 2, radius * 2);
      grad.addColorStop(0, rgba(c, 1));
      grad.addColorStop(0.25, rgba(c, 0.55));
      grad.addColorStop(1, rgba(c, 0));
      x.fillStyle = grad;
      x.fillRect(0, 0, g.width, g.height);
      if (glows.size > 40) glows.clear();
      glows.set(key, g);
    }
    return glows.get(key);
  }

  /*
   * Each scene is made for a size and a palette (which it reads as it draws, so it follows the page's colours) and
   * has step(dt) to move on by dt seconds, draw(ctx) to paint itself, and thin() to drop some of what it draws when a
   * phone struggles. `res` is how sharp its canvas is (a soft one can be drawn at half size and look the same).
   */
  const SCENES = {
    bubbles: (w, h, pal) => {
      const make = (below) => ({ x: rnd(0, w), y: below ? h + rnd(8, 60) : rnd(0, h), r: 3 + Math.pow(Math.random(), 1.7) * 17, v: rnd(12, 28), ph: rnd(0, TAU), wob: rnd(4, 14), c: (Math.random() * 3) | 0 });
      const ps = Array.from({ length: count((w * h) / 6500, 10, 42) }, () => make(false));
      return {
        thin: () => (ps.length = Math.ceil(ps.length * 0.6)),
        step(dt) {
          for (const p of ps) {
            p.y -= p.v * dt * (0.7 + p.r / 28);
            p.ph += dt * 1.3;
            if (p.y < -p.r * 2) Object.assign(p, make(true));
          }
        },
        draw(ctx) {
          ctx.lineWidth = 1.2;
          for (const p of ps) {
            const fade = Math.min(1, Math.max(0, (p.y + p.r) / (h * 0.3)));
            const x = p.x + Math.sin(p.ph) * p.wob;
            const c = pal.tones[p.c];
            ctx.beginPath();
            ctx.arc(x, p.y, p.r, 0, TAU);
            ctx.fillStyle = rgba(c, (pal.dark ? 0.12 : 0.09) * fade);
            ctx.fill();
            ctx.strokeStyle = rgba(c, (pal.dark ? 0.55 : 0.4) * fade);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x - p.r * 0.36, p.y - p.r * 0.36, Math.max(0.8, p.r * 0.2), 0, TAU);
            ctx.fillStyle = rgba(pal.shine, (pal.dark ? 0.7 : 0.9) * fade);
            ctx.fill();
          }
        },
      };
    },

    confetti: (w, h, pal) => {
      const extra = () => (pal.dark ? [[255, 214, 102], [255, 128, 170], [110, 210, 255]] : [[226, 160, 0], [214, 51, 108], [0, 130, 200]]);
      const make = (above) => ({
        x: rnd(0, w), y: above ? rnd(-40, -8) : rnd(-10, h), vy: rnd(20, 44), sway: rnd(10, 30), ph: rnd(0, TAU), ps: rnd(0.8, 2.2),
        rot: rnd(0, TAU), vr: rnd(-2.6, 2.6), flip: rnd(0, TAU), fs: rnd(3, 7), w: rnd(4, 7), h: rnd(7, 11), c: (Math.random() * 6) | 0, round: Math.random() < 0.2,
      });
      const ps = Array.from({ length: count((w * h) / 7000, 12, 48) }, () => make(false));
      return {
        thin: () => (ps.length = Math.ceil(ps.length * 0.6)),
        step(dt) {
          for (const p of ps) {
            p.y += p.vy * dt;
            p.ph += p.ps * dt;
            p.rot += p.vr * dt;
            p.flip += p.fs * dt;
            if (p.y > h + 14) Object.assign(p, make(true));
          }
        },
        draw(ctx) {
          const colors = pal.tones.concat(extra());
          ctx.globalAlpha = pal.dark ? 0.8 : 0.75;
          for (const p of ps) {
            ctx.save();
            ctx.translate(p.x + Math.sin(p.ph) * p.sway, p.y);
            ctx.rotate(p.rot);
            ctx.scale(1, Math.cos(p.flip));
            ctx.fillStyle = rgba(colors[p.c], 1);
            if (p.round) {
              ctx.beginPath();
              ctx.arc(0, 0, p.w * 0.6, 0, TAU);
              ctx.fill();
            } else ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    fireflies: (w, h, pal) => {
      const make = () => ({ x: rnd(0, w), y: rnd(h * 0.1, h), a: rnd(0, TAU), sp: rnd(8, 20), ph: rnd(0, TAU), fq: rnd(0.35, 0.9) });
      const ps = Array.from({ length: count((w * h) / 7500, 10, 34) }, make);
      return {
        thin: () => (ps.length = Math.ceil(ps.length * 0.6)),
        step(dt) {
          for (const p of ps) {
            p.a += (Math.random() - 0.5) * dt * 3.2;
            p.x += Math.cos(p.a) * p.sp * dt;
            p.y += Math.sin(p.a) * p.sp * 0.6 * dt;
            p.ph += p.fq * dt * TAU;
            if (p.x < -20) p.x = w + 20;
            if (p.x > w + 20) p.x = -20;
            if (p.y < -20) p.y = h + 20;
            if (p.y > h + 20) p.y = -20;
          }
        },
        draw(ctx) {
          const col = pal.dark ? [226, 255, 128] : [176, 132, 0];
          const sprite = glow(col, 14);
          ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
          for (const p of ps) {
            let b = 0.5 + 0.5 * Math.sin(p.ph);
            b *= b;
            const z = 0.55 + 0.6 * b;
            ctx.globalAlpha = (pal.dark ? 0.15 : 0.1) + (pal.dark ? 0.85 : 0.55) * b;
            ctx.drawImage(sprite, p.x - 14 * z, p.y - 14 * z, 28 * z, 28 * z);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.4, 0, TAU);
            ctx.fillStyle = rgba(pal.dark ? [250, 255, 210] : [130, 96, 0], 0.4 + 0.6 * b);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },

    equalizer: (w, h, pal) => {
      const bars = count(w / 16, 12, 56);
      const level = new Float32Array(bars);
      const target = new Float32Array(bars);
      const peak = new Float32Array(bars);
      const next = new Float32Array(bars);
      let t = rnd(0, 20);
      let n = bars;
      return {
        thin: () => (n = Math.ceil(n * 0.7)),
        step(dt) {
          t += dt;
          for (let i = 0; i < bars; i++) {
            if ((next[i] -= dt) <= 0) {
              next[i] = rnd(0.08, 0.24);
              // a beat that rolls along the bars, so it looks like music rather than noise
              const beat = 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.42) * Math.sin(t * 0.83 + i * 0.13);
              target[i] = 0.1 + 0.78 * beat * rnd(0.55, 1);
            }
            level[i] += (target[i] - level[i]) * Math.min(1, dt * 13);
            peak[i] = Math.max(peak[i] - dt * 0.32, level[i]);
          }
        },
        draw(ctx) {
          const step = w / n;
          const gap = Math.max(2, step * 0.3);
          const bw = step - gap;
          const top = h * 0.52;
          const grad = ctx.createLinearGradient(0, h, 0, h - top);
          grad.addColorStop(0, rgba(pal.tones[0], pal.dark ? 0.5 : 0.36));
          grad.addColorStop(1, rgba(pal.tones[1], pal.dark ? 0.16 : 0.1));
          ctx.fillStyle = grad;
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const bh = Math.max(bw, level[i % bars] * top);
            const x = i * step + gap / 2;
            if (ctx.roundRect) ctx.roundRect(x, h - bh, bw, bh + bw, bw / 2);
            else ctx.rect(x, h - bh, bw, bh);
          }
          ctx.fill();
          ctx.fillStyle = rgba(pal.tones[1], pal.dark ? 0.6 : 0.45);
          ctx.beginPath();
          for (let i = 0; i < n; i++) {
            const y = h - peak[i % bars] * top - 7;
            const x = i * step + gap / 2;
            if (ctx.roundRect) ctx.roundRect(x, y, bw, 3, 1.5);
            else ctx.rect(x, y, bw, 3);
          }
          ctx.fill();
        },
      };
    },

    'pixel-rain': (w, h, pal) => {
      // columns of square pixels falling, each with a fading tail, on Budgie's grid
      const cell = w < 520 ? 8 : 10;
      const cols = Math.ceil(w / cell);
      const make = (anywhere) => ({ col: (Math.random() * cols) | 0, y: anywhere ? rnd(-h, h) : rnd(-h * 0.6, -cell), v: rnd(36, 96), len: 4 + ((Math.random() * 7) | 0), c: (Math.random() * 3) | 0 });
      const drops = Array.from({ length: count(cols * 0.45, 12, 70) }, () => make(true));
      return {
        thin: () => (drops.length = Math.ceil(drops.length * 0.6)),
        step(dt) {
          for (const d of drops) {
            d.y += d.v * dt;
            if (d.y - d.len * cell > h) Object.assign(d, make(false));
          }
        },
        draw(ctx) {
          for (const d of drops) {
            const row = Math.floor(d.y / cell);
            const c = pal.tones[d.c];
            for (let k = 0; k < d.len; k++) {
              const y = (row - k) * cell;
              if (y < -cell || y > h) continue;
              const a = (1 - k / d.len) * (pal.dark ? 0.55 : 0.4);
              ctx.fillStyle = k === 0 ? rgba(pal.dark ? [255, 255, 255] : c, pal.dark ? 0.75 : 0.6) : rgba(c, a);
              ctx.fillRect(d.col * cell + 1, y + 1, cell - 2, cell - 2);
            }
          }
        },
      };
    },

    sakura: (w, h, pal) => {
      // petals are drawn once each in a few pinks, then turned and flipped as they fall
      const pinks = pal.dark ? ['#ffc1d3', '#ffadc6', '#ffd9e4'] : ['#f48fb1', '#ec6f9b', '#f7a8c4'];
      const sprites = pinks.map((pink) => {
        const s = document.createElement('canvas');
        s.width = s.height = 64;
        const x = s.getContext('2d');
        x.scale(2, 2);
        const grad = x.createLinearGradient(16, 2, 16, 30);
        grad.addColorStop(0, pink);
        grad.addColorStop(1, '#ffffff');
        x.fillStyle = grad;
        x.beginPath();
        x.moveTo(16, 30);
        x.bezierCurveTo(3, 22, 3, 8, 12, 3);
        x.lineTo(16, 7.5);
        x.lineTo(20, 3);
        x.bezierCurveTo(29, 8, 29, 22, 16, 30);
        x.closePath();
        x.fill();
        return s;
      });
      const make = (above) => ({ x: rnd(-w * 0.2, w), y: above ? rnd(-40, -10) : rnd(0, h), vy: rnd(16, 34), vx: rnd(8, 22), ph: rnd(0, TAU), rot: rnd(0, TAU), vr: rnd(-1.6, 1.6), flip: rnd(0, TAU), fs: rnd(1.5, 3.5), s: rnd(0.32, 0.55), k: (Math.random() * 3) | 0 });
      const ps = Array.from({ length: count((w * h) / 8000, 10, 36) }, () => make(false));
      return {
        thin: () => (ps.length = Math.ceil(ps.length * 0.6)),
        step(dt) {
          for (const p of ps) {
            p.ph += dt * 1.1;
            p.x += (p.vx + Math.sin(p.ph) * 14) * dt;
            p.y += p.vy * dt;
            p.rot += p.vr * dt;
            p.flip += p.fs * dt;
            if (p.y > h + 20 || p.x > w + 30) Object.assign(p, make(true));
          }
        },
        draw(ctx) {
          ctx.globalAlpha = pal.dark ? 0.85 : 0.8;
          for (const p of ps) {
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.scale(p.s * (0.3 + 0.7 * Math.abs(Math.cos(p.flip))), p.s);
            ctx.drawImage(sprites[p.k], -16, -16, 32, 32);
            ctx.restore();
          }
          ctx.globalAlpha = 1;
        },
      };
    },

    starfield: (w, h, pal) => {
      // stars drifting towards you, the odd shooting star
      const make = (far) => ({ x: rnd(-1, 1), y: rnd(-1, 1), z: far ? 1 : rnd(0.08, 1), tw: rnd(0, TAU), ts: rnd(1, 3) });
      const stars = Array.from({ length: count((w * h) / 2000, 40, 150) }, () => make(false));
      let shooting = null;
      let wait = rnd(1.5, 4);
      return {
        thin: () => (stars.length = Math.ceil(stars.length * 0.6)),
        step(dt) {
          for (const s of stars) {
            s.z -= dt * 0.045;
            s.tw += dt * s.ts;
            if (s.z < 0.06) Object.assign(s, make(true));
          }
          if (shooting) {
            shooting.t += dt;
            if (shooting.t > shooting.life) shooting = null;
          } else if ((wait -= dt) <= 0) {
            wait = rnd(4, 9);
            const left = Math.random() < 0.5;
            shooting = { x: left ? rnd(0, w * 0.4) : rnd(w * 0.6, w), y: rnd(0, h * 0.35), vx: (left ? 1 : -1) * rnd(260, 380), vy: rnd(90, 150), t: 0, life: 0.85 };
          }
        },
        draw(ctx) {
          const cx = w / 2;
          const cy = h / 2;
          const f = Math.max(w, h) * 0.5;
          const col = pal.dark ? [255, 255, 255] : pal.tones[0];
          for (const s of stars) {
            const sx = cx + (s.x / s.z) * f;
            const sy = cy + (s.y / s.z) * f;
            if (sx < -4 || sx > w + 4 || sy < -4 || sy > h + 4) {
              Object.assign(s, make(true));
              continue;
            }
            const near = 1 - s.z;
            const size = near * 2.4 + (pal.dark ? 0.6 : 0.9);
            ctx.fillStyle = rgba(col, Math.min(1, near * 1.5 + (pal.dark ? 0.12 : 0.3)) * (0.6 + 0.4 * Math.sin(s.tw)) * (pal.dark ? 0.95 : 0.7));
            ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
          }
          if (shooting) {
            const k = shooting.t / shooting.life;
            const x = shooting.x + shooting.vx * shooting.t;
            const y = shooting.y + shooting.vy * shooting.t;
            const tail = 0.16;
            const grad = ctx.createLinearGradient(x, y, x - shooting.vx * tail, y - shooting.vy * tail);
            grad.addColorStop(0, rgba(col, (1 - k) * (pal.dark ? 0.95 : 0.7)));
            grad.addColorStop(1, rgba(col, 0));
            ctx.strokeStyle = grad;
            ctx.lineWidth = 1.8;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - shooting.vx * tail, y - shooting.vy * tail);
            ctx.stroke();
          }
        },
      };
    },

    'northern-lights': (w, h, pal) => {
      // curtains of light: a strip of colour drawn once per curtain, stamped column by column along a slow wave
      const hues = pal.dark
        ? [[70, 255, 170], [60, 200, 255], [190, 130, 255]]
        : [[0, 150, 110], [0, 120, 190], [120, 70, 200]];
      const strips = hues.map((c) => {
        const s = document.createElement('canvas');
        s.width = 2;
        s.height = 128;
        const x = s.getContext('2d');
        const grad = x.createLinearGradient(0, 0, 0, 128);
        grad.addColorStop(0, rgba(c, 0));
        grad.addColorStop(0.6, rgba(c, 0.35));
        grad.addColorStop(0.9, rgba(c, 1));
        grad.addColorStop(1, rgba(c, 0));
        x.fillStyle = grad;
        x.fillRect(0, 0, 2, 128);
        return s;
      });
      const curtains = [
        { k: 0, base: 0.42, amp: 0.1, f: 0.0055, s: 0.33, f2: 0.015, s2: 0.52, tall: 0.42, a: pal.dark ? 0.42 : 0.26, seed: rnd(0, 9) },
        { k: 1, base: 0.3, amp: 0.08, f: 0.007, s: -0.27, f2: 0.012, s2: 0.41, tall: 0.3, a: pal.dark ? 0.3 : 0.18, seed: rnd(0, 9) },
        { k: 2, base: 0.58, amp: 0.09, f: 0.0045, s: 0.22, f2: 0.019, s2: -0.37, tall: 0.3, a: pal.dark ? 0.3 : 0.18, seed: rnd(0, 9) },
      ];
      let t = rnd(0, 30);
      // the canvas is a quarter as sharp as the screen (see SOFT): one of its pixels is a column of light 4 wide,
      // and the browser's smoothing as it's stretched to size blends the columns into soft curtains
      const stepX = 4;
      return {
        thin: () => {},
        step(dt) {
          t += dt;
        },
        draw(ctx) {
          ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
          for (const c of curtains) {
            const tall = c.tall * h;
            for (let x = 0; x < w; x += stepX) {
              const y = h * c.base + c.amp * h * Math.sin(x * c.f + t * c.s + c.seed) + 0.5 * c.amp * h * Math.sin(x * c.f2 - t * c.s2);
              const shimmer = 0.5 + 0.5 * Math.sin(x * 0.012 + t * 0.9 + c.seed * 2);
              ctx.globalAlpha = c.a * (0.35 + 0.65 * shimmer);
              ctx.drawImage(strips[c.k], x, y - tall * 0.9, stepX, tall);
            }
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },

    embers: (w, h, pal) => {
      const hot = () => (pal.dark ? [[255, 214, 128], [255, 150, 60], [255, 92, 42]] : [[236, 132, 0], [224, 84, 18], [196, 40, 20]]);
      const make = (anywhere) => ({ x: rnd(0, w), y: anywhere ? rnd(h * 0.2, h) : h + rnd(0, 20), vy: rnd(18, 50), ph: rnd(0, TAU), ps: rnd(1, 2.6), life: anywhere ? rnd(0.3, 1) : 1, decay: rnd(0.18, 0.45), s: rnd(0.6, 1.4), c: (Math.random() * 3) | 0 });
      const ps = Array.from({ length: count((w * h) / 6500, 14, 46) }, () => make(true));
      return {
        thin: () => (ps.length = Math.ceil(ps.length * 0.6)),
        step(dt) {
          for (const p of ps) {
            p.y -= p.vy * dt;
            p.ph += p.ps * dt;
            p.x += Math.sin(p.ph) * 16 * dt;
            p.life -= p.decay * dt;
            if (p.life <= 0 || p.y < -10) Object.assign(p, make(false));
          }
        },
        draw(ctx) {
          const colors = hot();
          ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
          for (const p of ps) {
            const c = colors[p.c];
            const a = Math.min(1, p.life * 1.6) * (0.75 + 0.25 * Math.sin(p.ph * 7));
            ctx.globalAlpha = a * (pal.dark ? 0.8 : 0.5);
            const r = 9 * p.s;
            ctx.drawImage(glow(c, 10), p.x - r, p.y - r, r * 2, r * 2);
            ctx.globalAlpha = a;
            ctx.fillStyle = rgba(c, 1);
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.1 * p.s, 0, TAU);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
        },
      };
    },
  };
  // the soft scenes don't need a sharp canvas (fewer pixels to fill on a phone): how many canvas pixels to a CSS one
  const SOFT = { 'northern-lights': 0.25, embers: 1, fireflies: 1 };

  // every scene on the screen, moved on by one loop
  const running = new Set();
  let frameId = 0;
  let last = 0;
  function loop(now) {
    frameId = 0;
    // at most 60 frames a second, even on a 120 Hz screen
    if (now - last >= 15.5) {
      const dt = Math.min(0.05, (now - last) / 1000) || 1 / 60;
      last = now;
      for (const s of running) {
        if (!s.layer.isConnected) s.destroy();
        else if (s.shown) s.render(dt);
      }
    }
    wake();
  }
  function wake() {
    if (frameId || document.hidden) return;
    for (const s of running) {
      if (s.shown && s.layer.isConnected) {
        if (!last) last = performance.now();
        frameId = requestAnimationFrame(loop);
        return;
      }
    }
    last = 0;
  }
  document.addEventListener('visibilitychange', () => {
    last = 0;
    wake();
  });

  /**
   * Puts a scene behind `host`'s content (as its first child), filling it. Moves while on the screen, unless
   * everything should be still, then it's painted once as it would look a few seconds in. Returns { layer, destroy }.
   */
  function mountScene(host, id, { thumb = false } = {}) {
    const make = SCENES[id];
    if (!make || !host) return null;
    for (const s of running) if (!s.layer.isConnected) s.destroy();
    const layer = document.createElement('div');
    layer.className = 'rw-scene rw-scene-' + id;
    layer.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    layer.appendChild(canvas);
    host.insertBefore(layer, host.firstChild);
    const ctx = canvas.getContext('2d');
    const pal = palette(host);
    const res = SOFT[id] || Math.min(window.devicePixelRatio || 1, 2);
    let dpr = res;
    // a tile's still picture is the scene as it looks on a profile, made small (so it isn't nearly empty)
    let zoom = 1;
    let sim = null;
    let w = 0;
    let h = 0;
    let ticks = 0;
    let cost = 0;
    let thinned = 0;
    const size = () => {
      const nw = layer.clientWidth;
      const nh = layer.clientHeight;
      if (!nw || !nh) return false;
      if (nw !== w || nh !== h || !sim) {
        const remake = !sim || Math.abs(nw - w) > w * 0.2 || Math.abs(nh - h) > h * 0.2;
        w = nw;
        h = nh;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        if (thumb) zoom = Math.min(1, w / 340);
        if (remake) {
          sim = make(w / zoom, h / zoom, pal);
          // a few seconds in already, so it doesn't start empty
          for (let i = 0; i < 90; i++) sim.step(1 / 30);
          for (let i = 0; i < thinned; i++) sim.thin();
        }
      }
      return true;
    };
    const paint = () => {
      ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, 0, 0);
      ctx.clearRect(0, 0, w / zoom, h / zoom);
      sim.draw(ctx);
    };
    const inst = {
      layer,
      shown: false,
      render(dt) {
        if (!size()) return;
        const t0 = performance.now();
        // the page's colours can change under it (a profile puts on its owner's colours a moment after it's drawn)
        if (++ticks % 45 === 0) palette(host, pal);
        sim.step(dt);
        paint();
        // a phone that can't keep up gets fewer pieces, and then a softer canvas
        cost = cost * 0.92 + (performance.now() - t0) * 0.08;
        if (ticks > 40 && cost > 7 && thinned < 2) {
          thinned++;
          sim.thin();
          if (thinned === 2 && dpr > 1) {
            dpr = 1;
            w = 0;
          }
          cost = 0;
          ticks = 1;
        }
      },
      destroy() {
        running.delete(inst);
        if (inst.io) inst.io.disconnect();
        if (inst.ro) inst.ro.disconnect();
        layer.remove();
      },
    };
    const still1 = () => {
      if (!size()) return;
      palette(host, pal);
      paint();
    };
    if (thumb || still()) {
      // painted once (and again if its box changes size)
      requestAnimationFrame(still1);
      if (!thumb && 'ResizeObserver' in window) {
        inst.ro = new ResizeObserver(() => {
          w = 0;
          still1();
        });
        inst.ro.observe(layer);
      }
      inst.still = true;
      return inst;
    }
    running.add(inst);
    if ('IntersectionObserver' in window) {
      inst.io = new IntersectionObserver((entries) => {
        inst.shown = entries[entries.length - 1].isIntersecting;
        wake();
      });
      inst.io.observe(layer);
    } else inst.shown = true;
    wake();
    return inst;
  }

  // ---- wearing things -------------------------------------------------------------------------------------

  const wearingNow = () => {
    const me = store.state.me;
    return { effect: me.effect || '', font: me.font || '', frame: me.frame || '', scene: me.scene || '' };
  };
  /** wears what's in `changes` ({ effect, frame, scene, font }: '' takes one off), and tells whoever's listening */
  async function wearAll(changes) {
    const { style } = await api.put('/api/me/style', changes);
    Object.assign(store.state.me, style);
    if (mine) mine.wearing = style;
    document.dispatchEvent(new CustomEvent('nook:style', { detail: style }));
    // everyone else's copy of you (and your own in the people list) catches up on the next sync
    store.sync();
    return style;
  }
  /** wears one thing (or takes it off with '') */
  const wear = (kind, id) => wearAll({ [kind]: id });

  // ---- what a reward is called, and what unlocks it (Customise and Edit profile's Effects tab) ----------------

  const NAME_FONTS = () => ui.NAME_FONTS || [['', 'Budgie']];
  const label = (k, id) => (id ? (REWARD.get(id) || { name: (NAME_FONTS().find(([f]) => f === id) || [id, id])[1] }).name : KIND.get(k).none);
  // what unlocks a locked one: "On fire IV". Where that doesn't fit on a line, it's the achievement's own badge and
  // the tier instead (fit() decides; Customise's bar says it in full when the tile's tapped)
  const lockChip = (r) => {
    const f = FAMILY.get(r.needs.family);
    const full = needsName(r);
    const badge = f
      ? `<span class="rw-need-short" aria-hidden="true"><m3-shape-icon shape="${esc(f.shape || 'circle')}" symbol="${esc(f.symbol || 'emoji_events')}" size="18" icon-size="12"></m3-shape-icon>${TIERS[r.needs.tier - 1] || r.needs.tier}</span>`
      : '';
    return `<span class="rw-chip locked">${icon('lock')}<span class="rw-need-full">${esc(full)}</span>${badge}</span>`;
  };

  // ---- Customise -----------------------------------------------------------------------------------------

  let sheetOpen = false;

  /** Customise: every reward tried on your own name and picture. `rewardId` opens it on that one, tried on. */
  function open(rewardId) {
    if (sheetOpen) return Promise.resolve(null);
    if (!supported) {
      M3.snackbar('Customising your profile needs a newer Budgie server.');
      return Promise.resolve(null);
    }
    const me = store.state.me;
    // opened on a reward (trying it on), or on one kind of them ('font' opens on the fonts)
    const want = REWARD.get(rewardId);
    let kind = want ? want.kind : KIND.has(rewardId) ? rewardId : 'effect';
    const trying = Object.assign(wearingNow(), want ? { [want.kind]: want.id } : {});
    let changed = false;
    let busy = false;
    let stageScene = null;
    let stageSceneId = '';
    sheetOpen = true;
    const newAtOpen = new Set(fresh);

    const shortName = esc(me.name);

    const stage =
      '<div class="rw-stage" id="rw-stage">' +
      `<div class="rw-stage-av" id="rw-av"></div>` +
      `<div class="rw-stage-text"><b class="rw-stage-name" id="rw-name"></b><small class="rw-stage-cap" id="rw-cap"></small></div>` +
      '</div>';
    const tabs =
      `<div class="m3-segmented rw-tabs" id="rw-tabs" role="radiogroup" aria-label="What to customise">${KINDS.map(
        (k) => `<button class="m3-segment" role="radio" aria-checked="${k.id === kind}" value="${k.id}">${esc(k.label)}</button>`
      ).join('')}</div>`;

    // one tile: what it looks like on you, its name, and whether it's yours
    const tile = (k, id, art) => {
      const r = REWARD.get(id);
      const locked = r && !isUnlocked(r);
      const pending = r && r.needs && !mine;
      const on = wearingNow()[k] === id;
      const chip = on
        ? `<span class="rw-chip on">${icon('check')}Wearing</span>`
        : pending
        ? '<span class="rw-chip">…</span>'
        : locked
        ? lockChip(r)
        : r && newAtOpen.has(id)
        ? '<span class="rw-chip new">New</span>'
        : '';
      return (
        `<button type="button" class="rw-tile${locked ? ' locked' : ''}${on ? ' on' : ''}" role="radio" aria-checked="${trying[k] === id}" data-rw-try="${esc(id)}" ` +
        `aria-label="${locked ? `${esc(label(k, id))}, locked: unlock with ${esc(needsName(r))}` : on ? `${esc(label(k, id))}, wearing` : esc(label(k, id))}" data-m3-ripple>` +
        `<span class="rw-tile-art">${art}</span><span class="rw-tile-label"><span class="rw-tile-name" translate="no">${esc(label(k, id))}</span>${chip}</span></button>`
      );
    };
    const arts = {
      effect: (id) => `<span class="rw-sample ${ui.nameFont({ font: trying.font, effect: id }).trim()}" translate="no">${shortName}</span>`,
      font: (id) => `<span class="rw-sample${id ? ' name-font-' + id : ''}" translate="no">${shortName}</span>`,
      frame: (id) => ui.avatar(Object.assign({}, me, { frame: id }), 50, { moving: true }),
      scene: (id) => (id ? `<span class="rw-thumb" data-rw-thumb="${id}"></span>` : `<span class="rw-thumb none">${icon('block')}</span>`),
    };
    const panelHTML = () => {
      const k = KIND.get(kind);
      const list = ofKind(kind);
      const have = list.filter(isUnlocked).length;
      let tiles = '';
      if (kind === 'font') {
        tiles =
          `<p class="rw-group">${icon('workspace_premium')}Unlocked by achievements</p>` +
          list.map((r) => tile('font', r.id, arts.font(r.id))).join('') +
          `<p class="rw-group">${icon('text_fields')}Everyone’s</p>` +
          NAME_FONTS().map(([id]) => tile('font', id, arts.font(id))).join('');
      } else {
        tiles = tile(kind, '', kind === 'frame' ? ui.avatar(me, 50) : kind === 'effect' ? `<span class="rw-sample ${ui.nameFont({ font: trying.font }).trim()}" translate="no">${shortName}</span>` : arts.scene('')) + list.map((r) => tile(kind, r.id, arts[kind](r.id))).join('');
      }
      return (
        `<div class="rw-panel-head"><p>${esc(k.about)}</p><span class="rw-count">${mine ? `${have} of ${list.length} unlocked` : 'Checking what you’ve unlocked…'}</span></div>` +
        `<div class="rw-grid rw-grid-${kind}" role="radiogroup" aria-label="${esc(k.label)}">${tiles}</div>`
      );
    };

    return ui
      .sheet({
        headline: 'Customise',
        symbol: 'auto_awesome',
        shape: 'sunny',
        className: 'wide rw-sheet',
        html: stage + tabs + '<div class="rw-panel" id="rw-panel"></div><div class="rw-bar" id="rw-bar" aria-live="polite"></div>',
        setup(body, close) {
          const $ = (sel) => body.querySelector(sel);
          // Done sits in the header, so the tiles get the room an actions row would take
          const header = body.parentElement.querySelector('.m3-dialog-header');
          if (header) {
            header.insertAdjacentHTML('beforeend', '<button type="button" class="m3-btn tonal small rw-done">Done</button>');
            const done = header.querySelector('.rw-done');
            done.addEventListener('click', () => close(true));
            // on a phone a press on the header starts dragging the sheet down, which captures the pointer and would
            // swallow the tap: a press on Done is only ever a tap
            done.addEventListener('pointerdown', (e) => e.stopPropagation());
          }
          const panel = $('#rw-panel');
          const bar = $('#rw-bar');

          // the preview at the top: your picture and name wearing what you're trying, the scene behind
          const paintStage = (what) => {
            const st = $('#rw-stage');
            if (!what || what === 'frame') {
              $('#rw-av').innerHTML = ui.avatar(Object.assign({}, me, { frame: trying.frame }), 84, { moving: true });
              if (what) fx.pop($('#rw-av'), 0.85);
            }
            if (!what || what === 'effect' || what === 'font') {
              $('#rw-name').innerHTML = `<span class="${nameClasses(trying)}" translate="no">${shortName}</span>`;
              liven($('#rw-name').firstElementChild);
              if (what) fx.pop($('#rw-name'), 0.9);
            }
            if ((!what || what === 'scene') && trying.scene !== stageSceneId) {
              const old = stageScene;
              stageSceneId = trying.scene;
              stageScene = trying.scene ? mountScene(st, trying.scene) : null;
              // the new one fades in over the old
              if (stageScene && old && !still()) fx.play(stageScene.layer, [{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
              if (old) setTimeout(() => old.destroy(), still() ? 0 : 380);
            }
            const tried = KINDS.filter((k) => trying[k.id] !== wearingNow()[k.id]).map((k) => label(k.id, trying[k.id]));
            $('#rw-cap').textContent = tried.length ? `Trying on ${tried.join(' · ')}` : 'What you wear now';
          };

          // scene tiles: each a still picture of its scene, painted once it's on the screen
          const paintThumbs = () => {
            panel.querySelectorAll('[data-rw-thumb]').forEach((el) => {
              if (!el.firstChild) mountScene(el, el.dataset.rwThumb, { thumb: true });
            });
          };
          const paintPanel = (animate) => {
            panel.innerHTML = panelHTML();
            body.querySelectorAll('.rw-grid .name-fx').forEach(liven);
            fit(panel);
            paintThumbs();
            if (animate) fx.stagger(panel.querySelectorAll('.rw-tile'), { y: 10, step: 22, max: 12 });
          };

          // the bar at the bottom: what you're trying, and Wear (or how to unlock it)
          const paintBar = (note = '') => {
            const id = trying[kind];
            const r = REWARD.get(id);
            const on = wearingNow()[kind] === id;
            const name = label(kind, id);
            let text = '';
            let button = '';
            if (r && r.needs && !mine) {
              text = `<b translate="no">${esc(name)}</b><small>Checking whether you’ve unlocked it…</small>`;
            } else if (on) {
              text = `<b translate="no">${esc(name)}</b><small>${id ? 'You’re wearing it' : `No ${KIND.get(kind).word}`}</small>`;
              button = id ? `<button type="button" class="m3-btn text" data-rw-wear="">${icon('close')}Take off</button>` : '';
            } else if (!isUnlocked(r)) {
              // the whole bar is the way to the achievement: a card with its badge, what it takes, and how far
              // you've got (the width of a phone is all needed for a name like "Conversationalist III")
              const at = tierNow(r);
              const f = FAMILY.get(r.needs.family) || {};
              const what = needsWhat(r);
              bar.innerHTML =
                `<button type="button" class="rw-how" data-rw-how="${esc(r.id)}" data-m3-ripple>` +
                `<m3-shape-icon shape="${esc(f.shape || 'burst')}" symbol="${esc(f.symbol || 'emoji_events')}" size="40" icon-size="20" aria-hidden="true"></m3-shape-icon>` +
                `<span class="rw-how-text"><b>${icon('lock')}Unlock with ${esc(needsName(r))}</b>` +
                `<small>${what ? `<span>${esc(what)}</span> · ` : ''}<span>${at ? `you’re at ${esc(f.name || '')} ${TIERS[at - 1]}` : 'not started yet'}</span></small>` +
                (note ? `<small class="rw-error" role="alert">${esc(note)}</small>` : '') +
                `</span><span class="rw-how-go">${icon('emoji_events')}<span>How to unlock</span>${icon('chevron_right')}</span></button>`;
              return;
            } else {
              text = `<b translate="no">${esc(name)}</b><small>${id ? (r && r.needs ? `Unlocked with ${esc(needsName(r))}` : 'Everyone has this one') : `Take off your ${KIND.get(kind).word}`}</small>`;
              button = `<button type="button" class="m3-btn filled" data-rw-wear="${esc(id)}">${icon(id ? 'checkroom' : 'close')}${id ? 'Wear' : 'Take off'}</button>`;
            }
            bar.innerHTML = `<div class="rw-bar-text">${text}${note ? `<small class="rw-error" role="alert">${esc(note)}</small>` : ''}</div>${button}`;
          };

          const select = (id, tileEl) => {
            trying[kind] = id;
            panel.querySelectorAll('[data-rw-try]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.rwTry === id)));
            if (tileEl) fx.pop(tileEl.querySelector('.rw-tile-art'), 0.86);
            // the effect tiles show your name in the font you're trying
            if (kind === 'font') panel.querySelectorAll('.rw-sample.name-fx').forEach(liven);
            paintStage(kind);
            paintBar();
            fx.haptic(5);
          };

          panel.addEventListener('click', (e) => {
            const b = e.target.closest('[data-rw-try]');
            if (b) select(b.dataset.rwTry, b);
          });
          // arrow keys move between tiles, as in any group of choices
          panel.addEventListener('keydown', (e) => {
            if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
            const tiles = [...panel.querySelectorAll('[data-rw-try]')];
            const at = tiles.indexOf(document.activeElement);
            if (at < 0) return;
            e.preventDefault();
            const next = tiles[(at + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + tiles.length) % tiles.length];
            next.focus();
            select(next.dataset.rwTry, next);
          });

          bar.addEventListener('click', async (e) => {
            const how = e.target.closest('[data-rw-how]');
            if (how) {
              const r = REWARD.get(how.dataset.rwHow);
              if (Nook.achievements && typeof Nook.achievements.open === 'function') Nook.achievements.open(r.needs.family, me.name);
              else M3.snackbar(`${needsName(r)}: ${needsWhat(r)}.`);
              return;
            }
            const go = e.target.closest('[data-rw-wear]');
            if (!go || busy) return;
            busy = true;
            go.disabled = true;
            const id = go.dataset.rwWear;
            try {
              await wear(kind, id);
              changed = true;
              trying[kind] = id;
              paintPanel(false);
              paintBar();
              paintStage(kind);
              if (id) {
                // a little party for putting it on
                const art = panel.querySelector(`[data-rw-try="${CSS.escape(id)}"] .rw-tile-art`);
                if (!still()) M3.burst($('#rw-av'), kind === 'frame' ? 'playlist' : 'play', { count: 12 });
                if (art) fx.pop(art, 0.7);
                fx.haptic([8, 40, 14]);
              } else fx.haptic(8);
            } catch (error) {
              paintBar(error.message || 'Couldn’t wear that. Try again.');
              // something unlocked or locked since: what the server says now
              if (error.status === 403) load().then(() => paintPanel(false), () => {});
            } finally {
              busy = false;
            }
          });

          $('#rw-tabs').addEventListener('change', (e) => {
            kind = e.detail.value;
            paintPanel(true);
            paintBar();
          });

          paintStage();
          paintPanel(false);
          paintBar();
          // the reward fonts arrive a moment after their tiles are drawn (each only once something shows it): the
          // names are measured again in them
          const refit = () => (body.isConnected ? fit(panel) : document.fonts.removeEventListener('loadingdone', refit));
          if (document.fonts) {
            document.fonts.addEventListener('loadingdone', refit);
            document.fonts.ready.then(refit);
          }
          // and once the sheet is open (it's laid out only then)
          requestAnimationFrame(refit);
          // straight to the reward it was opened on
          if (want) {
            requestAnimationFrame(() => {
              const t = panel.querySelector(`[data-rw-try="${CSS.escape(want.id)}"]`);
              if (t) {
                t.scrollIntoView({ block: 'nearest' });
                fx.pop(t, 0.8);
              }
            });
          }
          // what you've unlocked, fresh: the tiles and the bar catch up when it comes
          load().then(
            () => {
              if (!body.isConnected) return;
              paintPanel(false);
              paintBar();
            },
            () => {
              if (body.isConnected) $('#rw-panel .rw-count').textContent = 'Couldn’t check what you’ve unlocked. Try again in a moment.';
            }
          );
        },
        actions: [],
      })
      .then(() => {
        sheetOpen = false;
        if (stageScene) stageScene.destroy();
        sawAll();
        markNew();
        // the page behind wears what you put on
        if (changed) store.emit('changed');
      });
  }

  // ---- in the profile editor: the fonts achievements unlock, and a way into Customise -----------------------

  const fontTile = (r, name, current) =>
    isUnlocked(r)
      ? `<button type="button" data-font="${r.id}" aria-pressed="${r.id === current}" class="rw-font-tile"><span class="font-sample name-font-${r.id}" translate="no">${esc(name)}</span><small>${icon('workspace_premium')}${esc(r.name)}</small></button>`
      : `<button type="button" class="rw-font-tile locked" data-rw-locked="${r.id}" aria-label="${esc(r.name)}, locked: unlock with ${esc(needsName(r))}"><span class="font-sample name-font-${r.id}" translate="no">${esc(name)}</span><small>${icon('lock')}${esc(needsName(r))}</small></button>`;
  /**
   * the reward fonts for the editor's font grid (they go in once the server says which are yours): the ones you have,
   * and one tile for the rest, which opens Customise on its fonts (where each says what unlocks it)
   */
  function fontTiles(name, current) {
    if (!supported) return '';
    const fonts = ofKind('font');
    const tiles = (sample, pressed) => {
      const yours = fonts.filter(isUnlocked);
      const more = fonts.length - yours.length;
      return (
        yours.map((r) => fontTile(r, sample, pressed)).join('') +
        (more
          ? `<button type="button" class="rw-font-tile more" data-rw-open="font"><span class="font-sample">${icon('auto_awesome')}</span><small><b>More fonts</b><span>Unlock them with achievements</span></small></button>`
          : '')
      );
    };
    if (mine) return tiles(name, current);
    load().then(
      () => {
        const box = document.getElementById('rw-ep-fonts');
        if (!box) return;
        const sample = (box.closest('.sheet-body') || document).querySelector('#ep-input');
        const pressed = box.closest('.font-grid').querySelector('[data-font][aria-pressed="true"]');
        box.outerHTML = tiles(sample ? sample.value || name : name, pressed ? pressed.dataset.font : current);
      },
      () => {
        const box = document.getElementById('rw-ep-fonts');
        if (box) box.remove();
      }
    );
    return '<span id="rw-ep-fonts" class="rw-ep-fonts"></span>';
  }
  // ---- Edit profile's Effects tab: name effects, frames and scenes, worn when Edit profile saves --------------

  const EDITOR_KINDS = [
    ['effect', 'Name effects'],
    ['frame', 'Frames'],
    ['scene', 'Scenes'],
  ];
  /** the Effects tab: a section for each kind, its tiles drawn by mountEditor */
  function editorPanel() {
    if (!supported) return '';
    return (
      '<p class="muted rw-ep-lead">Achievements unlock these. Tap a locked one to see how to get it.</p>' +
      EDITOR_KINDS.map(
        ([kind, title]) =>
          `<div class="field"><span class="field-label">${title} <small class="rw-count" data-rw-count="${kind}"></small></span>` +
          `<div class="rw-grid rw-grid-${kind} rw-ep-grid" role="group" aria-label="${title}" data-rw-kind="${kind}"></div>` +
          `<small class="muted">${esc(KIND.get(kind).about)}</small></div>`
      ).join('') +
      '<span class="error" id="rw-ep-err"></span>'
    );
  }
  /**
   * Draws and wires the Effects tab. `look` is Edit profile's own copy of you (your colour, shape, picture and font,
   * and the effect, frame and scene picked so far), `name()` your name as typed, and `picked(kind)` is told when
   * something's picked. What you've unlocked can be picked (it's tried on in the preview until Save); a locked one
   * opens Customise on it, which says how to get it. Returns { paint }: the tiles again, in how you look now.
   */
  function mountEditor(panel, look, { name, picked }) {
    if (!panel || !supported) return null;
    const isNew = new Set(fresh);
    const me = () => store.state.me;
    const art = (kind, id) => {
      if (kind === 'effect') return `<span class="rw-sample ${ui.nameFont({ font: look.font, effect: id }).trim()}" translate="no">${esc(name())}</span>`;
      if (kind === 'frame') return ui.avatar(Object.assign({}, me(), look, { name: name(), frame: id }), 50, { moving: true });
      return id ? `<span class="rw-thumb" data-rw-thumb="${esc(id)}"></span>` : `<span class="rw-thumb none">${icon('block')}</span>`;
    };
    const tile = (kind, id) => {
      const r = REWARD.get(id);
      const title = label(kind, id);
      const named = `<span class="rw-tile-name"${id ? ' translate="no"' : ''}>${esc(title)}</span>`;
      if (r && !isUnlocked(r)) {
        return (
          `<button type="button" class="rw-tile locked" data-rw-locked="${esc(id)}" aria-label="${esc(title)}, locked: unlock with ${esc(needsName(r))}" data-m3-ripple>` +
          `<span class="rw-tile-art">${art(kind, id)}</span><span class="rw-tile-label">${named}${lockChip(r)}</span></button>`
        );
      }
      const chip = (me()[kind] || '') === id ? `<span class="rw-chip on">${icon('check')}Wearing</span>` : r && isNew.has(id) ? '<span class="rw-chip new">New</span>' : '';
      return (
        `<button type="button" class="rw-tile" data-rw-pick="${esc(id)}" aria-pressed="${(look[kind] || '') === id}" aria-label="${esc(title)}" data-m3-ripple>` +
        `<span class="rw-tile-art">${art(kind, id)}</span><span class="rw-tile-label">${named}${chip}</span></button>`
      );
    };
    const paint = () => {
      if (!mine) {
        panel.querySelectorAll('[data-rw-kind]').forEach((grid) => grid.firstChild || (grid.innerHTML = '<p class="muted">Checking what you’ve unlocked…</p>'));
        load().then(
          () => panel.isConnected && paint(),
          () => {
            const lead = panel.querySelector('.rw-ep-lead');
            if (lead) lead.textContent = 'Couldn’t check what you’ve unlocked. Try again in a moment.';
          }
        );
        return;
      }
      for (const [kind] of EDITOR_KINDS) {
        const list = ofKind(kind);
        panel.querySelector(`[data-rw-kind="${kind}"]`).innerHTML = tile(kind, '') + list.map((r) => tile(kind, r.id)).join('');
        const have = list.filter(isUnlocked).length;
        panel.querySelector(`[data-rw-count="${kind}"]`).textContent = `${have} of ${list.length} unlocked`;
      }
      panel.querySelectorAll('.rw-sample.name-fx').forEach(liven);
      fit(panel);
      panel.querySelectorAll('[data-rw-thumb]').forEach((el) => el.firstChild || mountScene(el, el.dataset.rwThumb, { thumb: true }));
    };
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-rw-pick]');
      if (!b) return;
      const kind = b.closest('[data-rw-kind]').dataset.rwKind;
      look[kind] = b.dataset.rwPick;
      b.parentElement.querySelectorAll('[data-rw-pick]').forEach((t) => t.setAttribute('aria-pressed', String(t === b)));
      fx.pop(b.querySelector('.rw-tile-art'), 0.86);
      fx.haptic(5);
      picked(kind);
    });
    return { paint };
  }
  /** a dot for something to say what's newly unlocked (the pencil on your profile, the Effects tab) */
  const dot = () => (supported ? `<span class="rw-dot" data-rw-dot aria-hidden="true"${fresh.size ? '' : ' hidden'}></span>` : '');
  /** you've seen what's new (the Effects tab was opened): the dots go */
  function seen() {
    if (!mine) return;
    sawAll();
    markNew();
  }

  // anything marked to open Customise does, anywhere (a locked reward in Edit profile, "More fonts", achievements)
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const opener = t.closest('[data-rw-open], [data-rw-locked]');
    if (!opener) return;
    e.preventDefault();
    open(opener.dataset.rwLocked || opener.dataset.rwOpen || null);
  });

  // ---- on profiles -----------------------------------------------------------------------------------------

  /**
   * A long name in a wide font (Graffiti, Arcade, Royal) would break in the middle of a word: it's made a little
   * smaller instead, as far as about two thirds of its size, so it stays on one line where it can.
   */
  function fitName(h1) {
    const span = h1 && h1.querySelector('span[translate="no"]');
    if (!span || !/\bname-(font|fx)-/.test(span.className) || document.body.classList.contains('plain-names')) return;
    const measure = () => {
      if (!span.isConnected) return;
      span.style.fontSize = '';
      span.style.whiteSpace = 'nowrap';
      let others = 0;
      for (const el of h1.children) if (el !== span) others += el.getBoundingClientRect().width + 6;
      const room = h1.clientWidth - others;
      const need = span.getBoundingClientRect().width;
      span.style.whiteSpace = '';
      if (room > 0 && need > room) span.style.fontSize = Math.max(0.64, (room / need) * 0.98).toFixed(3) + 'em';
    };
    measure();
    // again once the font has come (it can arrive after the page is drawn)
    if (document.fonts) document.fonts.ready.then(measure);
  }

  Nook.hook('profileMount', (root, u, me) => {
    const hero = root.querySelector('.profile-hero');
    if (!hero) return;
    const who = me ? Object.assign({}, u, store.state.me) : u;
    // the scene behind the header, in place of the floating shapes
    if (who.scene && SCENES[who.scene] && !u.banned) {
      hero.classList.add('rw-scened');
      const scene = mountScene(hero, who.scene);
      if (scene && Nook.app && Nook.app.onLeave) Nook.app.onLeave(() => scene.destroy());
    }
    // the name in full, with its effect alive
    const name = hero.querySelector('h1 .name-fx');
    if (name) liven(name);
    fitName(hero.querySelector('.who h1'));
    // your own: the pencil (Edit profile, with its Effects tab) gets a dot when something new is unlocked
    const edit = me && supported && hero.querySelector('[data-act="edit-profile"]');
    if (edit) {
      if (!edit.querySelector('[data-rw-dot]')) edit.insertAdjacentHTML('beforeend', dot());
      if (!mine) load().catch(() => {});
    }
  });

  // an achievement just unlocked something: what's yours is checked again (and Customise's button gets its dot)
  store.on('achievements', () => {
    mine = null;
    load().catch(() => {});
  });

  // ---- for the achievements page: what a tier unlocks, shown off -------------------------------------------

  /** the rewards an achievement's tier unlocks (catalog entries) */
  const unlocks = (family, tier) => REWARDS.filter((r) => r.needs && r.needs.family === family && (tier == null || r.needs.tier === tier));
  /**
   * A small picture of a reward, for wherever an achievement shows what it unlocks: a name (yours, or `who`'s) in
   * the effect or font, the picture in the frame, or a still of the scene. Call paint(root) once it's in the page:
   * that brings the names to life and paints the scenes.
   */
  function preview(id, who) {
    const r = REWARD.get(id);
    if (!r) return '';
    const u = who || store.state.me;
    const name = esc(u.name || '');
    switch (r.kind) {
      case 'effect':
        return `<span class="rw-preview rw-sample ${ui.nameFont({ font: u.font, effect: r.id }).trim()}" translate="no">${name}</span>`;
      case 'font':
        return `<span class="rw-preview rw-sample name-font-${r.id}" translate="no">${name}</span>`;
      case 'frame':
        return `<span class="rw-preview rw-preview-frame">${ui.avatar(Object.assign({}, u, { frame: r.id }), 44, { moving: true })}</span>`;
      default:
        return `<span class="rw-preview rw-thumb" data-rw-thumb="${esc(r.id)}"></span>`;
    }
  }
  function paint(root) {
    if (!root) return;
    root.querySelectorAll('.rw-preview.name-fx').forEach(liven);
    root.querySelectorAll('[data-rw-thumb]').forEach((el) => el.firstChild || mountScene(el, el.dataset.rwThumb, { thumb: true }));
  }

  Nook.rewards = { open, frame, liven, mountScene, load, wear, wearAll, fontTiles, editorPanel, mountEditor, dot, seen, unlocks, preview, paint, SCENES: Object.keys(SCENES), KINDS };
})();
