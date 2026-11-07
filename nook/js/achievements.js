// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Achievements with tiers, the visit streak, and flexing them (Budgie 1.4).
 *
 * The server counts everything (server/achievements.js); this file shows it:
 *   - on profiles: the streak's flame and featured achievements under the name, a streak card, and a grid of
 *     achievements, each a shaped badge in its tier's metal (I bronze, II silver, III gold, IV platinum, V a
 *     shimmering prismatic), with a sheet of all five tiers and what each unlocks
 *   - the streak's moment: once a day when it grows, a full-screen flame made of Material shapes, the number
 *     rolling up, embers, a ring filling to the next milestone and a pattern of haptic taps (an icy one when a
 *     freeze saves the day; a bigger one at milestones, with the rewards unlocked)
 *   - a juicy little celebration when a tier is reached
 *   - flexing: up to three achievements featured on your profile (and, tiny, by your name), and a Flex card, a
 *     picture of your streak and achievements to share, save, send to a friend or post
 *   - special achievements Budgie's admins make and give (Moderation page, and a button on profiles)
 * Under reduced motion everything holds still (the moments become simple cards); calm mode has no streaks, numbers
 * or celebrations at all.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const CAT = window.NOOK_ACHIEVEMENTS;
  if (!Nook || !Nook.store || !CAT) return;
  const store = Nook.store;
  const ui = Nook.ui;
  const fx = Nook.fx;
  const api = Nook.api;
  const { esc, icon, num } = ui;
  const S = () => store.state.settings;
  const app = () => Nook.app;
  const tr = (s) => (Nook.i18n ? Nook.i18n.t(s) : s);
  const lang = () => (Nook.i18n && Nook.i18n.lang) || 'en';
  const DAY = 86400000;

  // the catalog's names are Budgie's own words: this copy of it speaks the language (the server's copy stays English)
  for (const f of CAT.families) f.name = tr(f.name);
  for (const r of CAT.rewards) r.name = tr(r.name);
  const ROMAN = CAT.tiers;
  const TIER_NAMES = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Prismatic'];
  const FAMILY = new Map(CAT.families.map((f) => [f.id, f]));
  const REWARD = new Map(CAT.rewards.map((r) => [r.id, r]));
  const REWARD_KIND = { effect: ['Name effect', 'auto_awesome'], font: ['Name font', 'text_fields'], frame: ['Picture frame', 'account_circle'], scene: ['Profile scene', 'wallpaper'] };
  const FEATURED_MAX = 3;

  // calm mode: no streaks, no numbers, no fanfare. Reduced motion (the system's or Budgie's): nothing moves on its own
  const calm = () => !!S().calm;
  const still = () => fx.reduced() || calm();
  // the Android and Apple apps: their own haptics and share sheet (which shares words and links, not pictures)
  const nativeApp = () => !!((window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) || window.BUDGIE_APPLE);

  /** a haptic pattern. In the apps it works straight away (a browser only lets a page buzz once it's been touched) */
  function buzz(pattern) {
    if (S().haptics === false || !navigator.vibrate) return;
    if (!nativeApp()) return fx.haptic(pattern);
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* not here */
    }
  }

  const store_ = (key, value) => {
    try {
      if (value === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* a private window: celebrations may repeat, that's all */
    }
    return null;
  };
  const meName = () => store.state.me.name;
  const meKey = (what) => `nook-ach-${what}:${meName().toLowerCase()}`;

  // ---- shapes as masks, the flame's outline ---------------------------------------------------------------------

  const masks = new Map();
  function mask(shape) {
    if (!masks.has(shape)) {
      let d = '';
      try {
        d = M3Shapes.path(shape, 100);
      } catch (_) {
        d = M3Shapes.path('circle', 100);
      }
      masks.set(shape, `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`)}')`);
    }
    return masks.get(shape);
  }

  /*
   * The flame's outline, in a 100×100 box: a tip, two shoulders, a round bottom and a tongue licking up on the left.
   * t moves it (each point sways on its own few sines), so a flame drawn over and over flickers like a real one.
   */
  const FLAME = [
    [50, 4],
    [56, 18, 70, 28, 77, 40],
    [85, 52, 88, 62, 86, 74],
    [83, 90, 68, 99, 50, 99],
    [32, 99, 16, 90, 14, 74],
    [12, 60, 18, 50, 27, 41],
    [27, 50, 31, 56, 37, 59],
    [33, 44, 40, 24, 50, 4],
  ];
  function flamePath(t = 0, seed = 0) {
    const s = (a, b) => Math.sin(t * a + seed * b);
    const tipX = 3.6 * s(1.7, 1.3) + 1.6 * s(3.3, 2.1);
    const tipY = 2.4 * s(2.3, 0.7);
    const sh = 1.6 * s(2.1, 3.1);
    const lx = 2.2 * s(2.9, 1.9);
    const ly = 2.4 * s(1.9, 2.7);
    const p = FLAME.map((seg) => seg.slice());
    p[0][0] += tipX;
    p[0][1] += tipY;
    p[7][4] += tipX;
    p[7][5] += tipY;
    p[1][0] += tipX * 0.6;
    p[7][2] += tipX * 0.6;
    p[1][4] += sh;
    p[2][0] += sh;
    p[6][4] += lx;
    p[6][5] += ly;
    p[6][2] += lx * 0.6;
    p[7][0] += lx * 0.5;
    const f = (n) => Math.round(n * 10) / 10;
    return `M${f(p[0][0])} ${f(p[0][1])}` + p.slice(1).map((c) => `C${c.map(f).join(' ')}`).join('') + 'Z';
  }
  const FLAME_MASK = `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${flamePath(0)}"/></svg>`)}')`;
  document.documentElement.style.setProperty('--ach-flame-mask', FLAME_MASK);

  /** a little flame: three layers that flicker (held still under reduced motion and calm) */
  const flameHTML = (cls = '') => `<span class="ach-flame ${cls}" aria-hidden="true"><i class="o"></i><i class="m"></i><i class="c"></i></span>`;

  // ---- what someone has reached ------------------------------------------------------------------------------------

  const descOf = (fam, tier) => {
    const n = fam.tiers[Math.max(0, Math.min(fam.tiers.length - 1, tier - 1))];
    return n === 1 && fam.one ? tr(fam.one) : tr(fam.desc).replace('{n}', num(n));
  };
  const unitOf = (fam) => (fam.count.startsWith('minutes:') ? 'hours' : fam.count === 'streak' ? 'days' : '');
  const rewardsAt = (id, tier) => CAT.rewards.filter((r) => r.needs && r.needs.family === id && r.needs.tier === tier);

  /** one achievement as the app uses it: a family from the catalog, or a special one, with how far they've got */
  function entryOf(item) {
    if (String(item.id).startsWith('custom:')) {
      return Object.assign({ special: true, tier: item.tier || 0, has: true }, item);
    }
    const fam = FAMILY.get(item.id);
    if (!fam) return null;
    return Object.assign({ fam, name: fam.name, symbol: fam.symbol, shape: fam.shape, has: item.tier > 0 }, item);
  }
  function entriesOf(data) {
    const list = [];
    for (const item of data.achievements || []) {
      const e = entryOf(item);
      if (e) list.push(e);
    }
    for (const item of data.custom || []) list.push(entryOf(item));
    return list;
  }
  const tierClass = (e) => (e.special && !e.tier ? 'ach-sp' : 'ach-t' + (e.has ? e.tier : 0));
  const tierLabel = (e) => (e.special && !e.tier ? 'Special' : e.has ? `${TIER_NAMES[e.tier - 1]} · Tier ${ROMAN[e.tier - 1]}` : 'Not yet');
  const progressOf = (e) => {
    if (e.special || e.value == null || e.next == null) return e.has ? 1 : 0;
    const from = e.tier ? e.fam.tiers[e.tier - 1] : 0;
    return Math.max(0, Math.min(1, (e.value - from) / Math.max(1, e.next - from)));
  };

  /** a shaped badge in its tier's metal, the achievement's symbol on it and the tier in Roman numerals */
  function badgeHTML(e, size = 56, { roman = true, lock = true } = {}) {
    const cls = tierClass(e);
    const color = e.special && e.color ? `;--ach-color:${esc(e.color)}` : '';
    const mark = e.has ? (e.special && !e.tier ? icon('auto_awesome') : roman ? `<b>${ROMAN[e.tier - 1]}</b>` : '') : lock ? icon('lock') : '';
    return (
      `<span class="ach-badge ${cls}${e.special ? ' special' : ''}" style="--ach-size:${size}px;--ach-mask:${mask(e.shape)}${color}" aria-hidden="true">` +
      `<span class="ach-fill"></span>${icon(e.has ? e.symbol : e.symbol)}${mark ? `<span class="ach-mark">${mark}</span>` : ''}</span>`
    );
  }

  // ---- loading, and noticing what's new ----------------------------------------------------------------------------

  const cache = new Map(); // name (lower case) → { data, at, pending }
  function load(name, { fresh = false } = {}) {
    const key = String(name).toLowerCase();
    const had = cache.get(key);
    const mine = store.isMe(name);
    if (had && had.pending) return had.pending;
    if (had && had.data && !fresh && Date.now() - had.at < (mine ? 90000 : 45000)) return Promise.resolve(had.data);
    const pending = api
      .get('/api/achievements/' + encodeURIComponent(name))
      .then((data) => {
        cache.set(key, { data, at: Date.now() });
        if (mine) absorb(data);
        return data;
      })
      .catch((error) => {
        cache.set(key, had ? { data: had.data, at: had.at } : { data: null, at: Date.now() });
        throw error;
      });
    cache.set(key, Object.assign({}, had, { pending }));
    return pending;
  }
  const cached = (name) => (cache.get(String(name).toLowerCase()) || {}).data || null;
  let refreshTimer = 0;
  /** your own, again from the server (after anything might have changed): new tiers get celebrated */
  function refreshMine(delay = 250) {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => load(meName(), { fresh: true }).catch(() => {}), delay);
  }

  /**
   * your achievements as the server has them: whatever is new since this device last looked gets celebrated (the
   * first time ever, nothing is: it's all just there). Your profile, if it's showing, is drawn again.
   */
  let skip = new Set(); // tiers already celebrated another way (the streak's moment shows its own)
  function absorb(data) {
    const now = {};
    const entries = entriesOf(data);
    for (const e of entries) if (e.has) now[e.id] = e.special ? Math.max(1, e.tier) : e.tier;
    let known = store_(meKey('known'));
    // a brand-new account's very first look: what it reached in the last few minutes (Hello, Budgie I…) still gets
    // its moment. Anyone else on a new device has it all there already, without a parade of old news
    const me = store.state.me || {};
    if (!known && me.joinedAt && Date.now() - me.joinedAt < DAY) {
      known = {};
      for (const e of entries) if (e.has && !(e.at && Date.now() - e.at < 10 * 60000)) known[e.id] = now[e.id];
    }
    if (known) {
      const fresh = [];
      for (const [id, tier] of Object.entries(now)) {
        if (tier > (known[id] || 0) && !skip.has(id + ':' + tier)) fresh.push({ e: entries.find((x) => x.id === id), from: known[id] || 0 });
      }
      if (fresh.length) celebrate(fresh);
    }
    store_(meKey('known'), now);
    repaintMine(data);
  }

  // ---- celebrating a new tier: a pill that springs up, its badge morphing into shape, a burst, a buzz ---------

  const queue = [];
  let popping = false;
  let momentDone = Promise.resolve();
  function celebrate(list) {
    if (calm()) return;
    // two at a time at most, then one that says how many more
    const sorted = list.filter((x) => x.e).sort((a, b) => b.e.tier - a.e.tier);
    queue.push(...sorted.slice(0, 2).map((x) => Object.assign({ kind: 'one' }, x)));
    if (sorted.length > 2) queue.push({ kind: 'more', count: sorted.length - 2 });
    pump();
  }
  async function pump() {
    if (popping) return;
    popping = true;
    try {
      while (queue.length) {
        await momentDone;
        // not over a page that's still drawing itself at start
        await new Promise((r) => setTimeout(r, 350));
        await popOne(queue.shift());
      }
    } finally {
      popping = false;
    }
  }

  let gradientIds = 0;
  /** an SVG badge whose shape can morph (for the celebrations, where it springs from a circle into its own shape) */
  function morphBadge(e, size) {
    const id = 'achg' + ++gradientIds;
    const stops = e.has && e.tier === 5 && !e.special
      ? ['#ff7eb3', '#ffb46b', '#fff176', '#7dffb0', '#6fd3ff', '#b98bff'].map((c, i, a) => `<stop offset="${(i / (a.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')
      : '<stop offset="0" style="stop-color:var(--ach-a)"/><stop offset="0.5" style="stop-color:var(--ach-b)"/><stop offset="1" style="stop-color:var(--ach-c)"/>';
    return (
      `<span class="ach-morph ${tierClass(e)}" style="--ach-size:${size}px${e.special && e.color ? `;--ach-color:${esc(e.color)}` : ''}" aria-hidden="true">` +
      `<svg viewBox="-4 -4 108 108"><defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${stops}</linearGradient></defs>` +
      `<path fill="url(#${id})" d="${M3Shapes.path('circle', 100)}"/></svg>${icon(e.symbol)}</span>`
    );
  }
  /** springs a morph badge's path from a circle into its shape */
  function morphIn(el, shape, { from = 'circle', delay = 0 } = {}) {
    const path = el.querySelector('path');
    if (!path) return;
    if (still()) return path.setAttribute('d', M3Shapes.path(shape, 100));
    setTimeout(() => {
      const spring = new M3.motion.Spring(0, { spring: 3.2, damping: 0.22 }, (v) => {
        path.setAttribute('d', M3Shapes.morphPath(from, shape, v, 100));
        path.style.transform = `rotate(${((1 - v) * -120).toFixed(1)}deg)`;
      });
      spring.to(1);
    }, delay);
  }

  /** a layer over everything, an open dialog too (the top layer, where the browser has one) */
  function topLayer(el) {
    document.body.appendChild(el);
    if (typeof el.showPopover === 'function') {
      try {
        el.setAttribute('popover', 'manual');
        el.showPopover();
      } catch (_) {
        el.removeAttribute('popover');
      }
    }
  }

  function popOne(item) {
    return new Promise((resolve) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'ach-pop';
      if (item.kind === 'more') {
        el.innerHTML =
          `<span class="ach-pop-more">${icon('military_tech')}</span><span class="ach-pop-text"><small>And more</small><b>${item.count === 1 ? '1 more achievement' : `${item.count} more achievements`}</b><span class="ach-pop-sub">See them on your profile</span></span>${icon('chevron_right')}`;
      } else {
        const e = item.e;
        const rewards = [];
        if (!e.special) for (let n = item.from + 1; n <= e.tier; n++) rewards.push(...rewardsAt(e.id, n));
        el.classList.add(tierClass(e));
        el.innerHTML =
          morphBadge(e, 52) +
          `<span class="ach-pop-text"><small>${e.special ? 'Special achievement' : 'Achievement unlocked'}</small>` +
          `<b><span translate="no">${esc(e.name)}</span>${e.tier ? ` <i>${ROMAN[e.tier - 1]}</i>` : ''}</b>` +
          (rewards.length ? `<span class="ach-pop-sub">${icon('redeem')}<span>New: ${rewards.map((r) => esc(r.name)).join(', ')}</span></span>` : `<span class="ach-pop-sub">${esc(e.special ? e.desc || '' : descOf(e.fam, e.tier))}</span>`) +
          `</span>${icon('chevron_right')}<span class="ach-pop-shine" aria-hidden="true"></span>`;
      }
      el.setAttribute('aria-label', el.textContent.replace(/chevron_right|military_tech|redeem/g, ' ').replace(/\s+/g, ' ').trim());
      topLayer(el);
      let gone = false;
      const leave = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        const out = fx.play(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(24px) scale(0.92)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
        fx.settled(out).then(() => el.remove());
        setTimeout(resolve, 120);
      };
      el.addEventListener('click', () => {
        leave();
        if (item.kind === 'more') app().go('#/u/' + encodeURIComponent(meName()));
        else openAchievement(item.e.id, meName());
      });
      const timer = setTimeout(leave, item.kind === 'more' ? 3200 : 4600);
      if (!still()) {
        const lively = fx.lively;
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
        el.animate([{ transform: 'translateY(40px) scale(0.8)' }, { transform: 'none' }], { duration: lively.duration, easing: lively.easing });
      }
      if (item.kind === 'one') {
        const badge = el.querySelector('.ach-morph');
        morphIn(badge, item.e.shape, { delay: 120 });
        setTimeout(() => {
          if (gone) return;
          // the burst in the tier's own metal
          const tone = getComputedStyle(badge);
          const metal = ['--ach-a', '--ach-b', '--ach-c'].map((v) => tone.getPropertyValue(v).trim()).filter(Boolean);
          if (metal.length === 3) [['--m3-primary', 1], ['--m3-tertiary', 0], ['--m3-secondary', 2]].forEach(([role, i]) => badge.style.setProperty(role, metal[i]));
          M3.burst(badge, item.e.tier >= 4 ? 'pin' : 'play', { count: 12 });
          if (item.e.tier >= 3) {
            const top = el.getBoundingClientRect();
            fx.confetti({ x: top.left + top.width / 2, y: top.top }, { shapes: [item.e.shape, 'sunny', item.e.shape], colors: item.e.tier === 5 ? ['#ff7eb3', '#ffb46b', '#fff176', '#7dffb0', '#6fd3ff', '#b98bff'] : metal, count: 18, power: 0.8 });
          }
        }, 380);
        buzz([8, 60, 12, 60, item.e.tier >= 4 ? 40 : 24]);
      } else buzz(10);
    });
  }

  // ---- the streak's moment ----------------------------------------------------------------------------------------

  const SPARK_SHAPES = ['softBurst', 'sunny', 'flower', 'cookie7', 'heart', 'clover4', 'burst'];
  const FIRE = ['#ff3d00', '#ff6d00', '#ff9100', '#ffab00', '#ffd54f', '#fff3c4'];
  const ICE = ['#e1f5fe', '#b3e5fc', '#81d4fa', '#4fc3f7', '#ffffff'];
  const paths = new Map();
  const shapePath2D = (shape) => {
    if (!paths.has(shape)) paths.set(shape, new Path2D(M3Shapes.path(shape, 100)));
    return paths.get(shape);
  };
  const dayLabel = (count) => (count === 1 ? 'day streak' : 'day streak');

  /** the digits roll up into place, each on its own spring */
  function odometerHTML(from, to) {
    const a = String(Math.max(0, from));
    const b = String(to);
    const len = Math.max(a.length, b.length);
    const pa = a.padStart(len, ' ');
    const pb = b.padStart(len, ' ');
    let html = '';
    for (let i = 0; i < len; i++) {
      const x = pa[i] === ' ' ? -1 : Number(pa[i]);
      const y = pb[i] === ' ' ? -1 : Number(pb[i]);
      const seq = [];
      if (x === y) seq.push(y);
      else {
        let d = x < 0 ? 0 : x;
        if (x < 0) seq.push(-1);
        seq.push(d);
        while (d !== y && seq.length < 12) {
          d = (d + 1) % 10;
          seq.push(d);
        }
        if (y < 0) seq.push(-1);
      }
      const digits = seq.map((d) => `<i>${d < 0 ? '&nbsp;' : d}</i>`).join('');
      html += `<span class="odo-col${y < 0 ? ' gone' : ''}"><span class="odo-strip" data-steps="${seq.length - 1}">${digits}</span></span>`;
    }
    return `<span class="odo" aria-hidden="true">${html}</span>`;
  }
  function rollOdometer(el, delay) {
    const cols = [...el.querySelectorAll('.odo-strip')];
    const spring = M3.motion.springEasing({ spring: 4.5, damping: 0.32 });
    cols.forEach((strip, i) => {
      const steps = Number(strip.dataset.steps) || 0;
      const end = `translateY(${-steps * 1.1}em)`;
      if (!steps) return;
      if (still()) return (strip.style.transform = end);
      strip.style.transform = 'translateY(0)';
      const anim = strip.animate([{ transform: 'translateY(0)' }, { transform: end }], { duration: spring.duration + steps * 40, delay: delay + (cols.length - 1 - i) * 90, easing: spring.easing, fill: 'forwards' });
      anim.finished.then(() => (strip.style.transform = end), () => {});
    });
  }

  /**
   * the next milestone and how far along the ring is: the whole way there (7 of 14 is half full, not empty just after
   * the 7-day milestone), and `at` full on the day a milestone is reached
   */
  const ringOf = (count) => {
    const ms = CAT.streak.milestones;
    const next = ms.find((m) => m > count) || count + 1;
    const prev = [...ms].reverse().find((m) => m <= count) || 0;
    const p = Math.max(0, Math.min(1, count / next));
    return { next, prev, p, at: count && count === prev ? 1 : p };
  };

  let momentOpen = false;
  /**
   * the full-screen moment: r is what POST /api/streak said. A growing streak gets the flame; a milestone a bigger one
   * with what it unlocked; a freeze that saved the day starts in ice; a streak that ran out says welcome back.
   */
  function streakMoment(r) {
    if (momentOpen) return Promise.resolve();
    momentOpen = true;
    const before = r.lost ? 0 : Math.max(0, r.count - 1);
    const icy = r.usedFreeze > 0;
    const big = !!r.milestone;
    const ring = ringOf(r.count);
    const ringBefore = ringOf(before);
    // what the streak's tiers unlocked today: shown here, and not again as a pill
    const unlocked = (r.unlocked || []).filter((u) => u.id === 'streak');
    for (const u of unlocked) skip.add('streak:' + u.tier);
    const rewards = unlocked.flatMap((u) => u.rewards.map((id) => REWARD.get(id)).filter(Boolean));
    const streakTier = unlocked.length ? Math.max(...unlocked.map((u) => u.tier)) : 0;
    const left = ring.next - r.count;
    const title = r.lost ? 'Welcome back!' : r.count === 1 ? 'Your streak starts today' : icy ? 'Saved by a freeze!' : big ? `${r.count}-day milestone!` : 'Streak extended!';
    const sub = r.lost
      ? `Your ${r.lost}-day streak ended, but a new one starts now. Best so far: ${r.best} days.`
      : r.count === 1
        ? 'Open Budgie tomorrow to keep it going.'
        : icy
          ? r.usedFreeze === 1 ? 'You missed a day, and a freeze kept your streak alive.' : `You missed ${r.usedFreeze} days, and your freezes kept your streak alive.`
          : left === 1 ? `1 more day to a ${ring.next}-day streak` : `${left} more days to a ${ring.next}-day streak`;
    const extras = [];
    if (icy && !r.earnedFreeze) extras.push(`<span class="ach-m-chip ice">${icon('ac_unit')}<span>${r.freezes ? (r.freezes === 1 ? '1 freeze left' : `${r.freezes} freezes left`) : `No freezes left: you earn one every ${r.freezeEvery || CAT.streak.freezeEvery} days`}</span></span>`);
    if (r.earnedFreeze) extras.push(`<span class="ach-m-chip ice">${icon('ac_unit')}<span>You earned a freeze: it saves your streak on a day you miss.</span></span>`);
    if (streakTier) extras.push(`<span class="ach-m-chip">${icon('military_tech')}<span translate="no">${esc(FAMILY.get('streak').name)}</span> <b>${ROMAN[streakTier - 1]}</b></span>`);
    // a milestone that unlocked nothing new says what the next one will
    if (big && !rewards.length) {
      const fam = FAMILY.get('streak');
      const t = fam.tiers.findIndex((need) => need > r.count);
      const upcoming = t >= 0 ? rewardsAt('streak', t + 1) : [];
      if (upcoming.length) extras.push(`<span class="ach-m-chip">${icon('redeem')}<span>${`At ${fam.tiers[t]} days: `}<b translate="no">${esc(upcoming.map((x) => x.name).join(', '))}</b></span></span>`);
    }

    const dlg = document.createElement('dialog');
    dlg.className = `ach-moment${icy ? ' icy' : ''}${big ? ' big' : ''}${still() ? ' still' : ''}`;
    dlg.setAttribute('aria-label', `${r.count}-day streak. ${title}`);
    const R = 46;
    const C = 2 * Math.PI * R;
    dlg.innerHTML =
      '<div class="ach-m-bg" aria-hidden="true"><div class="ach-m-glow"></div><canvas class="ach-m-sparks"></canvas></div>' +
      '<div class="ach-m-body">' +
      `<div class="ach-m-stage"><svg class="ach-m-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="${R}"/><circle class="arc" cx="50" cy="50" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - (r.lost ? 0 : ringBefore.p))).toFixed(2)}"/></svg>` +
      '<svg class="ach-m-flame" viewBox="0 0 100 100" aria-hidden="true"><defs>' +
      `<linearGradient id="achfo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${icy ? '#0277bd' : '#ff3d00'}"/><stop offset="0.55" stop-color="${icy ? '#4fc3f7' : '#ff7a00'}"/><stop offset="1" stop-color="${icy ? '#e1f5fe' : '#ffc400'}"/></linearGradient>` +
      `<linearGradient id="achfm" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${icy ? '#29b6f6' : '#ff9100'}"/><stop offset="1" stop-color="${icy ? '#ffffff' : '#ffe082'}"/></linearGradient>` +
      '<clipPath id="achfclip"><path class="clip"/></clipPath></defs>' +
      '<g class="flame-all"><path class="fo" fill="url(#achfo)"/><g clip-path="url(#achfclip)" class="tongues"></g>' +
      '<path class="fm" fill="url(#achfm)" opacity="0.9"/><path class="fc" fill="#fffbe6"/></g></svg>' +
      `<span class="ach-m-spark">${'<m3-shape shape="sunny"></m3-shape>'}</span></div>` +
      `<div class="ach-m-count">${odometerHTML(before, r.count)}<span class="sr-only">${r.count}</span></div>` +
      `<div class="ach-m-label">${dayLabel(r.count)}</div>` +
      `<h2 class="ach-m-title">${esc(title)}</h2>` +
      `<p class="ach-m-sub">${esc(sub)}</p>` +
      (extras.length ? `<div class="ach-m-extras">${extras.join('')}</div>` : '') +
      (rewards.length
        ? `<div class="ach-m-rewards"><span class="ach-m-rewards-title">${icon('redeem')}Unlocked</span>${rewards
            .map((rw) => `<button type="button" class="ach-m-reward" data-reward="${esc(rw.id)}">${icon(REWARD_KIND[rw.kind][1])}<span class="txt"><b translate="no">${esc(rw.name)}</b><small>${REWARD_KIND[rw.kind][0]}</small></span>${hasRewards() ? '<span class="try">Try it</span>' : ''}</button>`)
            .join('')}</div>`
        : '') +
      `<button type="button" class="m3-btn filled ach-m-go">${icon(r.lost ? 'local_fire_department' : 'check')}${r.lost || r.count === 1 ? 'Let’s go' : 'Keep it going'}</button>` +
      '<span class="ach-m-hint">Tap anywhere to carry on</span>' +
      '</div>';
    document.body.appendChild(dlg);

    let done;
    const finished = new Promise((resolve) => (done = resolve));
    momentDone = finished;
    const timers = [];
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    let raf = 0;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      timers.forEach(clearTimeout);
      const out = fx.play(dlg, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(1.04)' }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
      fx.settled(out).then(() => {
        cancelAnimationFrame(raf);
        if (dlg.open) dlg.close();
        dlg.remove();
        momentOpen = false;
        done();
      });
    };
    const openedAt = performance.now();
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      close();
    });
    dlg.addEventListener('click', (e) => {
      const reward = e.target.closest('[data-reward]');
      if (reward && hasRewards()) {
        close();
        setTimeout(() => Nook.rewards.open(reward.dataset.reward), 300);
        return;
      }
      // a tap anywhere carries on (not the one that might still be landing as it opened)
      if (performance.now() - openedAt > 450 || e.target.closest('.ach-m-go')) {
        buzz(6);
        close();
      }
    });
    dlg.showModal();
    dlg.querySelector('.ach-m-go').focus({ preventScroll: true });

    // the flame: drawn every frame from its swaying outline, three layers, with Material shapes rising inside it
    const svg = dlg.querySelector('.ach-m-flame');
    const fo = svg.querySelector('.fo');
    const fm = svg.querySelector('.fm');
    const fc = svg.querySelector('.fc');
    const clip = svg.querySelector('.clip');
    const tongues = svg.querySelector('.tongues');
    const TONGUES = (icy ? ICE : FIRE).slice(0, 5).map((color, i) => {
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('fill', color);
      p.setAttribute('opacity', '0.55');
      tongues.appendChild(p);
      return { el: p, a: SPARK_SHAPES[i % SPARK_SHAPES.length], b: SPARK_SHAPES[(i + 3) % SPARK_SHAPES.length], x: 22 + i * 14, size: 26 + (i % 3) * 10, speed: 0.22 + i * 0.05, phase: i * 0.37 };
    });
    const drawFlame = (time) => {
      const tt = time / 1000;
      const outer = flamePath(tt, 0);
      fo.setAttribute('d', outer);
      clip.setAttribute('d', outer);
      fm.setAttribute('d', flamePath(tt * 1.3, 2));
      fm.setAttribute('transform', 'translate(50 99) scale(0.72) translate(-50 -99)');
      fc.setAttribute('d', flamePath(tt * 1.7, 5));
      fc.setAttribute('transform', 'translate(50 99) scale(0.42) translate(-50 -99)');
      for (const tg of TONGUES) {
        // each rises through the flame, growing and morphing between two shapes, then starts again at the bottom
        const k = (tt * tg.speed + tg.phase) % 1;
        const m = 0.5 - 0.5 * Math.cos(k * Math.PI * 2);
        const size = tg.size * (0.6 + k * 0.7);
        const y = 100 - k * 90;
        tg.el.setAttribute('d', M3Shapes.morphPath(tg.a, tg.b, m, 100));
        tg.el.setAttribute('transform', `translate(${(tg.x - size / 2 + Math.sin(tt * 2 + tg.phase * 9) * 4).toFixed(1)} ${(y - size / 2).toFixed(1)}) scale(${(size / 100).toFixed(3)}) rotate(${(k * 140).toFixed(0)} 50 50)`);
        tg.el.setAttribute('opacity', (0.6 * Math.sin(k * Math.PI)).toFixed(2));
      }
    };
    drawFlame(0);

    // embers and bursts on a canvas behind it all
    const canvas = dlg.querySelector('.ach-m-sparks');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, devicePixelRatio || 1);
    const fit = () => {
      canvas.width = Math.round(innerWidth * dpr);
      canvas.height = Math.round(innerHeight * dpr);
    };
    fit();
    const parts = [];
    const palette = (icy ? ICE : FIRE).slice();
    const stage = dlg.querySelector('.ach-m-stage');
    const origin = () => {
      const b = stage.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height * 0.58, r: b.width / 2 };
    };
    const ember = (o, burst) => {
      const angle = burst ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 0.9;
      const speed = burst ? 260 + Math.random() * 520 : 40 + Math.random() * 90;
      parts.push({
        x: o.x + (burst ? 0 : (Math.random() - 0.5) * o.r * 0.9), y: o.y + (burst ? 0 : o.r * 0.2),
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, g: burst ? 420 : -30,
        size: burst ? 8 + Math.random() * 16 : 4 + Math.random() * 9, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 8,
        life: 0, max: burst ? 1.1 + Math.random() * 0.7 : 1.6 + Math.random() * 1.6,
        color: Math.random() < 0.25 ? 'primary' : palette[Math.floor(Math.random() * palette.length)], shape: SPARK_SHAPES[Math.floor(Math.random() * SPARK_SHAPES.length)],
      });
    };
    const primary = fx.tone(null, '--m3-primary') || '#ffffff';
    const tertiary = fx.tone(null, '--m3-tertiary') || '#ffffff';
    let emberRate = 0;
    let last = performance.now();
    let acc = 0;
    const frame = (time) => {
      if (closed) return;
      const dt = Math.min(0.05, (time - last) / 1000);
      last = time;
      if (!document.hidden) {
        drawFlame(time);
        acc += dt * emberRate;
        const o = origin();
        while (acc >= 1 && parts.length < 160) {
          acc -= 1;
          ember(o, false);
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = parts.length - 1; i >= 0; i--) {
          const p = parts[i];
          p.life += dt;
          if (p.life >= p.max) {
            parts.splice(i, 1);
            continue;
          }
          p.vy += p.g * dt;
          p.vx *= 1 - dt * 0.8;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.rot += p.spin * dt;
          const k = p.life / p.max;
          ctx.save();
          ctx.globalAlpha = Math.min(1, (1 - k) * 1.4) * (k < 0.08 ? k / 0.08 : 1);
          ctx.fillStyle = p.color === 'primary' ? (Math.random() < 0.5 ? primary : tertiary) : p.color;
          ctx.translate(p.x * dpr, p.y * dpr);
          ctx.rotate(p.rot);
          const s = (p.size * dpr * (1 - k * 0.4)) / 100;
          ctx.scale(s, s);
          ctx.translate(-50, -50);
          ctx.fill(shapePath2D(p.shape));
          ctx.restore();
        }
      }
      raf = requestAnimationFrame(frame);
    };

    const flameAll = svg.querySelector('.flame-all');
    const spark = dlg.querySelector('.ach-m-spark');
    const arc = dlg.querySelector('.arc');
    const reveal = [...dlg.querySelectorAll('.ach-m-label, .ach-m-title, .ach-m-sub, .ach-m-extras, .ach-m-rewards, .ach-m-go, .ach-m-hint')];

    if (still()) {
      // held still: the card as it ends, with one tap of the phone
      arc.setAttribute('stroke-dashoffset', (C * (1 - ring.at)).toFixed(2));
      rollOdometer(dlg, 0);
      buzz(big ? [10, 60, 30] : 12);
      later(close, big || rewards.length ? 12000 : 7000);
      return finished;
    }

    // the timeline (a second and a half, then it stays a while)
    const lively = fx.lively;
    const gentle = fx.gentle;
    dlg.querySelector('.ach-m-bg').animate([{ opacity: 0 }, { opacity: 1 }], { duration: 380, easing: 'ease-out', fill: 'backwards' });
    reveal.forEach((el) => (el.style.opacity = '0'));
    flameAll.style.transformOrigin = '50px 99px';
    flameAll.style.transform = 'scale(0)';
    const sparkShape = spark.querySelector('m3-shape');
    spark.animate([{ transform: 'scale(0) rotate(-90deg)' }, { transform: 'scale(1) rotate(0deg)' }], { duration: 320, easing: 'cubic-bezier(.2,1.6,.4,1)', fill: 'both' });
    raf = requestAnimationFrame(frame);
    later(() => {
      buzz(5);
      sparkShape.transitionTo(icy ? 'clover8' : 'burst', { spring: true });
    }, 260);
    later(() => {
      // the spark bursts into flame
      spark.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(2.2) rotate(60deg)' }], { duration: 380, easing: 'ease-out', fill: 'forwards' });
      const grow = M3.motion.springEasing({ spring: 3.6, damping: 0.26 });
      flameAll.animate([{ transform: 'scale(0.1)' }, { transform: `scale(${big ? 1.06 : 1})` }], { duration: grow.duration, easing: grow.easing, fill: 'forwards' });
      emberRate = icy ? 10 : 18;
      buzz(9);
    }, 520);
    if (icy) {
      // the ice cracks: shards fly, and the flame warms up from blue to fire
      later(() => {
        const o = origin();
        for (let i = 0; i < 28; i++) ember(o, true);
        buzz([6, 80, 6]);
        const stops = svg.querySelectorAll('#achfo stop, #achfm stop');
        const warm = ['#ff3d00', '#ff7a00', '#ffc400', '#ff9100', '#ffe082'];
        stops.forEach((s, i) => s.animate([{ stopColor: s.getAttribute('stop-color') }, { stopColor: warm[i] }], { duration: 700, easing: 'ease-in-out', fill: 'forwards' }));
        TONGUES.forEach((tg, i) => tg.el.setAttribute('fill', FIRE[i % FIRE.length]));
        palette.splice(0, palette.length, ...FIRE);
        dlg.classList.add('thawed');
      }, 1150);
    }
    rollOdometer(dlg, icy ? 1250 : 820);
    const landAt = (icy ? 1250 : 820) + 520;
    later(() => {
      const o = origin();
      for (let i = 0; i < (big ? 70 : 36); i++) ember(o, true);
      buzz(big ? [20, 70, 60] : 20);
      arc.animate([{ strokeDashoffset: arc.getAttribute('stroke-dashoffset') }, { strokeDashoffset: (C * (1 - ring.at)).toFixed(2) }], { duration: 900, easing: gentle.easing, fill: 'forwards' });
      dlg.querySelector('.ach-m-count').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
      if (big) {
        fx.confetti({ x: o.x, y: o.y }, { shapes: ['burst', 'sunny', 'flower', 'heart', 'softBurst'], count: 34, power: 1.3 });
        later(() => fx.confetti({ x: innerWidth * 0.15, y: innerHeight * 0.8 }, { count: 18, power: 1.1 }), 260);
        later(() => fx.confetti({ x: innerWidth * 0.85, y: innerHeight * 0.8 }, { count: 18, power: 1.1 }), 420);
      }
      emberRate = big ? 14 : 8;
    }, landAt);
    reveal.forEach((el, i) => {
      later(() => {
        el.style.opacity = '';
        el.animate([{ opacity: 0, transform: 'translateY(14px)' }, { opacity: 1, transform: 'none' }], { duration: lively.duration, easing: lively.easing, fill: 'backwards' });
      }, landAt + 120 + i * 90);
    });
    later(() => (emberRate = 4), landAt + 2600);
    later(close, big || rewards.length ? 14000 : 7500);
    addEventListener('resize', fit, { once: true });
    return finished;
  }

  const hasRewards = () => !!(Nook.rewards && typeof Nook.rewards.open === 'function');

  // the streak, once the app has told the server about today: its moment, at most once a day
  store.on('streak', (r) => {
    if (!r) return;
    const mine = cached(meName());
    if (mine && mine.streak) Object.assign(mine.streak, { count: r.count, best: r.best, freezes: r.freezes, log: r.log, day: r.day, next: r.next });
    repaintMine();
    if (r.unlocked && r.unlocked.length) refreshMine(600);
    const moment = r.grew || r.lost || r.usedFreeze;
    if (!moment) return;
    const shown = store_(meKey('moment'));
    if (shown === r.day) return;
    store_(meKey('moment'), r.day);
    // in Calm mode, or with the big moments turned off, a quiet note still says what happened
    if (S().streakMoments === false || calm()) {
      const note = r.usedFreeze ? 'A freeze kept your streak going' : r.lost ? 'Your streak started again' : `${r.count}-day streak!`;
      M3.toast(note, { symbol: r.usedFreeze ? 'ac_unit' : 'local_fire_department', shape: 'burst', timeout: 3000 });
      return;
    }
    // once the page has settled (and not over a call); celebrations of new tiers wait their turn behind it
    let release;
    momentDone = new Promise((resolve) => (release = resolve));
    setTimeout(() => {
      if (document.querySelector('.call-screen:not([hidden]):not(.ended)')) return release();
      streakMoment(r).then(release, release);
    }, 700);
  });
  // what the server unlocked as you did something (or while you were away): look, and celebrate what's new
  store.on('achievements', () => refreshMine(100));
  store.on('notify', (note) => note && note.kind === 'achievement' && refreshMine(300));
  // past midnight with the app open: today is a new visit
  let lastDay = '';
  store.on('streak', (r) => r && (lastDay = r.day));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !lastDay) return;
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (today !== lastDay) {
      lastDay = today;
      store.touchStreak();
    }
  });

  // ---- profiles ------------------------------------------------------------------------------------------------------

  const todayNum = () => Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / DAY);
  const dayNum = (name) => (name ? Math.round(Date.parse(name + 'T00:00:00Z') / DAY) : 0);

  /** under a profile's name: the streak's flame (3 days or more), and the achievements they feature */
  function heroHTML(name, u) {
    const mine = store.isMe(name);
    const data = cached(name);
    // what the server just said, when it's here (someone's streak that ran out since this device last synced is gone)
    const streak = data ? (data.streak && !data.streak.hidden ? data.streak.count : 0) : mine ? store.state.streak.count : (u && u.streak) || 0;
    const featured = (data ? data.featured || [] : mine ? [] : (u && u.featured) || []).map((f) => featuredEntry(f, data)).filter(Boolean);
    const parts = [];
    if (streak >= 3 && !calm()) {
      parts.push(`<button type="button" class="ach-streak-pill" data-ach-streak="${esc(name)}" aria-label="${streak}-day streak">${flameHTML()}<b>${num(streak)}</b><span>day streak</span></button>`);
    }
    for (const e of featured) {
      parts.push(
        `<button type="button" class="ach-feat ${tierClass(e)}" data-ach-open="${esc(e.id)}" data-ach-user="${esc(name)}">${badgeHTML(e, 26, { roman: false })}<span translate="no">${esc(e.name)}</span>${e.tier ? `<b>${ROMAN[e.tier - 1]}</b>` : ''}</button>`
      );
    }
    return parts.length ? parts.join('') : '';
  }
  /** a featured achievement ({ id, tier }) as an entry, with what's known of a special one */
  function featuredEntry(f, data) {
    if (String(f.id).startsWith('custom:')) {
      const c = data && (data.custom || []).find((x) => x.id === f.id);
      return c ? entryOf(c) : entryOf({ id: f.id, tier: f.tier, name: 'Special', symbol: 'auto_awesome', shape: 'softBurst' });
    }
    return entryOf({ id: f.id, tier: f.tier });
  }

  Nook.hook('profileHero', (u, who, me) => `<div class="ach-hero" data-ach-hero="${esc(u.name)}">${heroHTML(u.name, u)}</div>`);

  // tiny badges by a name on posts and comments: the first one they feature (all three on a wider screen)
  Nook.hook('nameTags', (u) => {
    const list = (store.isMe(u.name) ? (cached(u.name) || {}).featured : u.featured) || [];
    if (!list.length) return '';
    const data = cached(u.name);
    const items = list.map((f) => featuredEntry(f, data)).filter(Boolean);
    return `<span class="ach-tags" title="${esc(items.map((e) => `${tr(e.name)}${e.tier ? ' ' + ROMAN[e.tier - 1] : ''}`).join(' · '))}">${items.map((e) => `<span class="ach-tag ${tierClass(e)}" style="--ach-mask:${mask(e.shape)}${e.special && e.color ? `;--ach-color:${esc(e.color)}` : ''}"></span>`).join('')}</span>`;
  });

  /** your streak: the flame, the count, your freezes, this week, and how far to the next milestone and reward */
  function streakCardHTML(st, data) {
    if (calm() || !st) return '';
    const ring = ringOf(st.count);
    const left = ring.next - st.count;
    const today = todayNum();
    const last = dayNum(st.day);
    const log = st.log || '';
    let week = '';
    for (let d = today - 6; d <= today; d++) {
      const idx = log.length - 1 - (last - d);
      const mark = d > last || idx < 0 ? (d === today ? 'today' : 'none') : { v: 'on', f: 'frozen', '.': 'none' }[log[idx]] || 'none';
      const label = new Intl.DateTimeFormat(lang(), { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(d * DAY));
      week += `<span class="ach-day ${mark}${d === today ? ' is-today' : ''}"><small data-no-i18n>${esc(label)}</small><span class="dot">${mark === 'on' ? flameHTML('tiny') : mark === 'frozen' ? icon('ac_unit') : ''}</span></span>`;
    }
    const fam = FAMILY.get('streak');
    const e = data ? entriesOf(data).find((x) => x.id === 'streak') : null;
    const tier = e ? e.tier : 0;
    let next = '';
    if (tier < fam.tiers.length) {
      const need = fam.tiers[tier];
      const rw = rewardsAt('streak', tier + 1);
      next =
        `<div class="ach-next"><span class="ach-next-head">${icon('redeem')}<span>${`Next at ${need} days`}</span></span><span class="ach-next-list">` +
        (rw.length ? rw.map((x) => rewardChip(x)).join('') : `<span class="ach-reward">${icon('military_tech')}<span translate="no">${esc(FAMILY.get('streak').name)}</span> ${ROMAN[tier]}</span>`) +
        '</span></div>';
    }
    const freezes = Array.from({ length: st.freezesMax || CAT.streak.freezesMax }, (_, i) => `<span class="ach-freeze${i < st.freezes ? ' have' : ''}">${icon('ac_unit')}</span>`).join('');
    return (
      `<div class="ach-streak-card${st.count ? '' : ' cold'}">` +
      `<div class="ach-sc-top">${flameHTML('big')}<div class="ach-sc-count"><b>${num(st.count)}</b><span>${st.count === 1 ? 'day streak' : 'day streak'}</span></div>` +
      `<div class="ach-sc-freezes" data-tooltip="A freeze keeps your streak going on a day you miss. You earn one every ${st.freezeEvery || CAT.streak.freezeEvery} days, and can hold ${st.freezesMax || CAT.streak.freezesMax}." tabindex="0" aria-label="${st.freezes} of ${st.freezesMax || CAT.streak.freezesMax} freezes">${freezes}<small>Freezes</small></div></div>` +
      `<div class="ach-week" aria-label="This week">${week}</div>` +
      `<div class="ach-sc-goal"><span class="ach-bar"><span style="--p:${ring.p.toFixed(3)}"></span></span><small>${left === 1 ? `1 more day to a ${ring.next}-day streak` : `${left} more days to a ${ring.next}-day streak`}</small><small class="best">Best: ${num(Math.max(st.best || 0, st.count))} days</small></div>` +
      next +
      '</div>'
    );
  }

  /** a reward from the catalog as a small chip: its name and what kind of thing it is */
  const rewardChip = (r, cls = '') => `<span class="ach-reward ${cls}">${icon(REWARD_KIND[r.kind][1])}<span translate="no">${esc(r.name)}</span><small>${REWARD_KIND[r.kind][0]}</small></span>`;

  /** an achievement on the grid */
  function tileHTML(e, mine, name) {
    const p = progressOf(e);
    const maxed = e.has && (e.special || e.tier >= 5);
    const sub = e.special ? (e.tier ? `Special · ${ROMAN[e.tier - 1]}` : 'Special') : e.has ? TIER_NAMES[e.tier - 1] : 'Locked';
    return (
      `<button type="button" class="ach-tile ${tierClass(e)}${e.has ? '' : ' locked'}${e.special ? ' special' : ''}" data-ach-open="${esc(e.id)}" data-ach-user="${esc(name)}">` +
      badgeHTML(e, 58) +
      `<span class="ach-name" translate="no">${esc(e.name)}</span><span class="ach-sub">${sub}</span>` +
      (mine && !e.special && !maxed ? `<span class="ach-bar" aria-hidden="true"><span style="--p:${p.toFixed(3)}"></span></span><small class="count">${num(Math.floor(e.value))}/${num(e.next)}</small>` : '') +
      // every tier reached: nothing left to fill, so a little crown says so
      (mine && !e.special && maxed ? `<small class="ach-maxed">${icon('crown')}<span>Top tier</span></small>` : '') +
      '</button>'
    );
  }
  const sortEntries = (list) =>
    list.sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0) || (b.special ? 1 : 0) - (a.special ? 1 : 0) || b.tier - a.tier || progressOf(b) - progressOf(a));

  // folded, the grid shows two rows (however many fit across): fitRows() hides the rest once it's on the screen
  const ROWS = 2;
  /** the achievements section of a profile (the streak card first, on your own) */
  function sectionInner(name, data, { all = false } = {}) {
    const mine = store.isMe(name);
    if (!data) return `<div class="ach-grid loading">${'<span class="ach-tile ghost"></span>'.repeat(mine ? 6 : 3)}</div>`;
    const list = sortEntries(entriesOf(data));
    const reached = list.filter((e) => e.has).length;
    if (!mine && !reached) return '';
    // before it's measured, a phone's two rows of three
    const shown = list.map((e, i) => tileHTML(e, mine, name).replace('<button type="button" class="ach-tile', `<button type="button"${!all && i >= 6 ? ' hidden' : ''} class="ach-tile`));
    const head =
      `<header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="burst" symbol="military_tech" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Achievements</h2><m3-wavy-line></m3-wavy-line>` +
      `<span class="muted count">${mine ? `${reached}/${list.length}` : num(reached)}</span></header>`;
    return (
      head +
      (mine ? streakCardHTML(data.streak, data) : '') +
      (mine
        ? `<div class="ach-actions">${calm() ? '' : `<button type="button" class="m3-btn tonal small" data-ach-act="flex">${icon('ios_share')}Flex</button>`}<button type="button" class="m3-btn tonal small" data-ach-act="feature">${icon('push_pin')}Feature</button>${hasRewards() ? `<button type="button" class="m3-btn text small" data-ach-act="customise">${icon('palette')}Rewards</button>` : ''}</div>`
        : '') +
      `<div class="ach-grid">${shown.join('')}</div>` +
      `<button type="button" class="m3-btn text ach-more" data-ach-act="${all ? 'less' : 'more'}"${list.length > 3 ? '' : ' hidden'}>${icon(all ? 'expand_less' : 'expand_more')}${all ? 'Show fewer' : `Show all ${list.length}`}</button>`
    );
  }
  Nook.hook('profileSections', (u) => {
    const data = cached(u.name);
    const inner = sectionInner(u.name, data);
    return `<section class="section ach-section" data-ach-section="${esc(u.name)}"${inner ? '' : ' hidden'}>${inner}</section>`;
  });

  /** folded, a grid shows as many rows as ROWS, of however many tiles fit across; the button only when there's more */
  function fitRows(sec) {
    const grid = sec.querySelector('.ach-grid');
    const more = sec.querySelector('.ach-more');
    if (!grid || !more || !grid.offsetWidth) return;
    const tiles = [...grid.children];
    const across = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || 3;
    const all = more.dataset.achAct === 'less';
    tiles.forEach((tile, i) => (tile.hidden = !all && i >= across * ROWS));
    more.hidden = tiles.length <= across * ROWS;
  }
  addEventListener('resize', () => document.querySelectorAll('[data-ach-section]').forEach(fitRows));

  const expanded = new Set();
  /** draws a profile's achievements again where they're showing */
  function paint(name, data, { arrive = false } = {}) {
    for (const sec of document.querySelectorAll(`[data-ach-section="${CSS.escape(name)}"]`)) {
      const inner = sectionInner(name, data, { all: expanded.has(name.toLowerCase()) });
      sec.hidden = !inner;
      if (sec.innerHTML !== inner) {
        sec.innerHTML = inner;
        fitRows(sec);
        if (arrive) fx.stagger(sec.querySelectorAll('.ach-tile:not([hidden])'), { y: 12, step: 35 });
      } else fitRows(sec);
    }
    for (const hero of document.querySelectorAll(`[data-ach-hero="${CSS.escape(name)}"]`)) {
      const u = store.user(name);
      const html = heroHTML(name, u);
      if (hero.innerHTML !== html) hero.innerHTML = html;
    }
  }
  function repaintMine(data) {
    if (!store.state.me) return;
    paint(meName(), data || cached(meName()));
  }

  const opened = new Set();
  Nook.hook('profileMount', (root, u) => {
    const name = u.name;
    const had = cached(name);
    load(name)
      .then((data) => {
        paint(name, data, { arrive: !had });
        // opened from an achievement's note (…?achievement=streak): its sheet, once
        const want = new URLSearchParams((location.hash.split('?')[1] || '')).get('achievement');
        if (want && !opened.has(location.hash)) {
          opened.add(location.hash);
          const sec = root.querySelector('[data-ach-section]');
          if (sec) sec.scrollIntoView({ block: 'start', behavior: still() ? 'auto' : 'smooth' });
          setTimeout(() => openAchievement(want, name), 300);
        }
      })
      .catch(() => {
        for (const sec of root.querySelectorAll('[data-ach-section]')) sec.hidden = true;
      });
  });

  // ---- taps -----------------------------------------------------------------------------------------------------------

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const open = target.closest('[data-ach-open]');
    if (open) return openAchievement(open.dataset.achOpen, open.dataset.achUser || meName());
    const streak = target.closest('[data-ach-streak]');
    if (streak) return openAchievement('streak', streak.dataset.achStreak);
    const act = target.closest('[data-ach-act]');
    if (!act) return;
    const name = meName();
    switch (act.dataset.achAct) {
      case 'flex':
        return flex();
      case 'feature':
        return featurePicker();
      case 'customise':
        return hasRewards() && Nook.rewards.open();
      case 'more':
      case 'less': {
        const sec = act.closest('[data-ach-section]');
        const who = sec ? sec.dataset.achSection : name;
        if (act.dataset.achAct === 'more') expanded.add(who.toLowerCase());
        else expanded.delete(who.toLowerCase());
        const data = cached(who);
        if (sec && data) {
          fx.flipHeight(sec, () => {
            sec.innerHTML = sectionInner(who, data, { all: expanded.has(who.toLowerCase()) });
            fitRows(sec);
          });
          if (act.dataset.achAct === 'more') fx.stagger([...sec.querySelectorAll('.ach-tile')].slice(6), { y: 10, step: 25 });
        }
        return;
      }
      case 'give':
        return giveSheet(act.dataset.achName);
    }
  });

  // ---- one achievement, in full ---------------------------------------------------------------------------------------

  const when = (t) => new Date(t).toLocaleDateString(lang(), { day: 'numeric', month: 'short', year: 'numeric' });

  async function openAchievement(id, name) {
    let data = cached(name);
    if (!data) {
      try {
        data = await load(name);
      } catch (error) {
        return app().showError(error);
      }
    }
    let e = entriesOf(data).find((x) => x.id === id);
    if (!e && !String(id).startsWith('custom:')) e = entryOf({ id, tier: 0 });
    if (!e) return M3.snackbar('That achievement isn’t here any more.');
    const mine = store.isMe(name);
    const featured = (data.featured || []).some((f) => f.id === id);
    // focused first, so the sheet opens at its top (not scrolled down to its buttons)
    let html = `<div class="ach-detail ${tierClass(e)}" tabindex="-1" autofocus>` + `<div class="ach-detail-badge">${badgeHTML(e, 112)}</div>` + `<p class="ach-detail-tier">${tierLabel(e)}</p>`;
    if (e.special) {
      html += `<p class="ach-detail-desc">${esc(e.desc || 'A special achievement from Budgie.')}</p><p class="muted ach-detail-from">${icon('auto_awesome')}<span>${e.by ? `Given by Budgie’s team on ${when(e.at)}` : `Given by Budgie on ${when(e.at)}`}</span></p></div>`;
    } else {
      const fam = e.fam;
      html += `<p class="ach-detail-desc">${esc(descOf(fam, Math.max(1, e.has ? e.tier : 1)))}</p>`;
      if (mine && e.next != null && !calm()) {
        const unit = unitOf(fam);
        html += `<div class="ach-detail-progress"><span class="ach-bar"><span style="--p:${progressOf(e).toFixed(3)}"></span></span><small class="count">${num(Math.floor(e.value * 10) / 10)} of ${num(e.next)}${unit ? ' ' + unit : ''} to Tier ${ROMAN[e.tier]}</small></div>`;
      }
      html += '</div><ol class="ach-ladder">';
      fam.tiers.forEach((need, i) => {
        const n = i + 1;
        const got = e.tier >= n;
        const step = Object.assign({}, e, { tier: n, has: got });
        const rw = rewardsAt(e.id, n);
        html +=
          `<li class="${got ? 'got' : ''}${!got && n === e.tier + 1 ? ' next' : ''}">${badgeHTML(Object.assign({}, step, { has: true }), 40)}` +
          `<div class="ach-step"><b>Tier ${ROMAN[i]} · ${TIER_NAMES[i]}</b><small>${esc(descOf(fam, n))}</small>` +
          (rw.length
            ? `<span class="ach-rewards">${rw.map((r) => `<span class="ach-reward${got ? ' have' : ''}" ${got && mine && hasRewards() ? `role="button" tabindex="0" data-ach-reward="${esc(r.id)}"` : ''}>${icon(REWARD_KIND[r.kind][1])}<span translate="no">${esc(r.name)}</span><small>${REWARD_KIND[r.kind][0]}</small></span>`).join('')}</span>`
            : '') +
          `</div><span class="ach-step-when">${got && e.tiers && e.tiers[i] ? esc(when(e.tiers[i])) : got ? icon('check') : icon('lock')}</span></li>`;
      });
      html += '</ol>';
    }
    const actions = [];
    if (mine && e.has) {
      actions.push({
        label: featured ? 'Featured' : 'Feature it',
        symbol: featured ? 'check' : 'push_pin',
        variant: 'tonal',
        run: (close) => {
          setFeatured(featured ? data.featured.filter((f) => f.id !== id).map((f) => f.id) : [...data.featured.map((f) => f.id), id]).then((ok) => ok && close());
          return false;
        },
      });
      // (the Flex card shows the streak's number: not in calm mode)
      if (!calm()) actions.push({ label: 'Flex', symbol: 'ios_share', variant: 'filled', run: () => setTimeout(() => flex(), 250) });
    } else actions.push({ label: 'Close', variant: 'filled', value: null });
    ui.sheet({
      headline: e.name,
      symbol: e.symbol,
      shape: e.shape,
      className: 'ach-sheet',
      html,
      actions,
      setup(body, close) {
        const headline = body.parentElement.querySelector('.m3-dialog-headline');
        if (headline) headline.setAttribute('translate', 'no');
        const badge = body.querySelector('.ach-detail-badge .ach-badge');
        if (badge && !still()) {
          fx.pop(badge, 0.5);
          if (e.has && e.tier >= 3) setTimeout(() => badge.classList.add('shine'), 200);
        }
        body.addEventListener('click', (ev) => {
          const r = ev.target.closest('[data-ach-reward]');
          if (!r) return;
          close();
          setTimeout(() => Nook.rewards.open(r.dataset.achReward), 250);
        });
      },
    });
  }

  // ---- featuring ------------------------------------------------------------------------------------------------------

  async function setFeatured(ids) {
    if (ids.length > FEATURED_MAX) {
      M3.snackbar(`You can feature up to ${FEATURED_MAX}. Take one off first.`);
      return false;
    }
    try {
      const r = await api.put('/api/achievements/featured', { featured: ids });
      const data = cached(meName());
      if (data) data.featured = r.featured;
      repaintMine();
      M3.toast(ids.length ? 'Featured on your profile' : 'Nothing featured', { symbol: 'push_pin', shape: 'burst' });
      buzz(8);
      return true;
    } catch (error) {
      app().showError(error);
      return false;
    }
  }

  async function featurePicker() {
    let data;
    try {
      data = await load(meName());
    } catch (error) {
      return app().showError(error);
    }
    const reached = sortEntries(entriesOf(data).filter((e) => e.has));
    if (!reached.length) return M3.snackbar('Reach an achievement first, then you can feature it.');
    const chosen = new Set((data.featured || []).map((f) => f.id));
    ui.sheet({
      headline: 'Feature achievements',
      symbol: 'push_pin',
      shape: 'burst',
      className: 'ach-sheet',
      html:
        `<p class="muted">Pick up to ${FEATURED_MAX}. They show under your name on your profile, and small by your name on posts and comments.</p>` +
        `<div class="ach-pick">${reached
          .map((e) => `<button type="button" class="ach-pick-item ${tierClass(e)}" data-id="${esc(e.id)}" aria-pressed="${chosen.has(e.id)}">${badgeHTML(e, 44)}<span translate="no">${esc(e.name)}</span><span class="check">${icon('check')}</span></button>`)
          .join('')}</div><p class="ach-pick-count muted" aria-live="polite"></p>`,
      setup(body) {
        const count = body.querySelector('.ach-pick-count');
        const sync = () => {
          count.textContent = `${chosen.size} of ${FEATURED_MAX} chosen`;
          for (const b of body.querySelectorAll('.ach-pick-item')) b.setAttribute('aria-disabled', String(!chosen.has(b.dataset.id) && chosen.size >= FEATURED_MAX));
        };
        sync();
        body.addEventListener('click', (ev) => {
          const b = ev.target.closest('.ach-pick-item');
          if (!b) return;
          const id = b.dataset.id;
          if (chosen.has(id)) chosen.delete(id);
          else if (chosen.size < FEATURED_MAX) {
            chosen.add(id);
            fx.pop(b.querySelector('.ach-badge'), 0.7);
          } else return buzz([6, 40, 6]);
          b.setAttribute('aria-pressed', String(chosen.has(id)));
          buzz(6);
          sync();
        });
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Save',
          variant: 'filled',
          run: (close) => {
            setFeatured([...chosen]).then((ok) => ok && close());
            return false;
          },
        },
      ],
    });
  }

  // ---- the Flex card: a picture of your streak and achievements -------------------------------------------------------

  const loadImage = (src) =>
    new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      // its own address, so a copy cached without permission to draw it isn't used
      img.src = src + (src.includes('?') ? '&' : '?') + 'flex=1';
    });
  const roundRect = (ctx, x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h);
  };
  const TIER_FILL = [
    ['#f6d1ae', '#c9834a', '#7d4520', '#fffaf5'],
    ['#ffffff', '#c3cbd6', '#6f7b8b', '#26303c'],
    ['#fff4b0', '#f5c518', '#a26a00', '#3a2600'],
    ['#f0fdff', '#8fdcf2', '#2f7fa6', '#032a3b'],
  ];
  /** draws the card: returns the canvas */
  async function drawFlex(data) {
    const W = 1080;
    const H = 1350;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const me = store.user(store.ME);
    const css = (role, fallback) => fx.tone(document.querySelector('#main'), role) || fallback;
    const C = {
      primary: css('--m3-primary', '#6750a4'), onPrimary: css('--m3-on-primary', '#ffffff'), pc: css('--m3-primary-container', '#eaddff'), onPc: css('--m3-on-primary-container', '#21005d'),
      tertiary: css('--m3-tertiary', '#7d5260'), tc: css('--m3-tertiary-container', '#ffd8e4'), surface: css('--m3-surface', '#fef7ff'), onSurface: css('--m3-on-surface', '#1d1b20'),
      variant: css('--m3-on-surface-variant', '#49454f'), sc: css('--m3-surface-container-high', '#ece6f0'),
    };
    const font = (weight, size, family = 'Google Sans Flex') => `${weight} ${size}px "${family}"`;
    await Promise.all([font(800, 300), font(700, 64), font(500, 40), font(700, 64, 'Material Symbols Rounded')].map((f) => document.fonts.load(f, f.includes('Symbols') ? 'star' : 'Ab1').catch(() => {})));
    await document.fonts.ready.catch(() => {});

    // the background: the profile's colours, with big soft shapes drifting behind
    const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
    bg.addColorStop(0, C.pc);
    bg.addColorStop(0.55, C.surface);
    bg.addColorStop(1, C.tc);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const deco = [['cookie9', -120, -80, 520, C.primary, 0.1], ['flower', 760, 120, 420, C.tertiary, 0.12], ['burst', 700, 980, 520, C.primary, 0.08], ['heart', -80, 1040, 300, C.tertiary, 0.1], ['sunny', 860, 600, 220, C.primary, 0.08]];
    for (const [shape, x, y, size, color, alpha] of deco) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = color;
      ctx.translate(x, y);
      ctx.scale(size / 100, size / 100);
      ctx.fill(shapePath2D(shape));
      ctx.restore();
    }

    // who: picture on their shape, name, u/name
    const AV = 168;
    const ax = 96;
    const ay = 96;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.scale(AV / 100, AV / 100);
    ctx.fillStyle = me.color || C.primary;
    ctx.fill(shapePath2D(me.shape || 'circle'));
    ctx.clip(shapePath2D(me.shape || 'circle'));
    const photo = await loadImage(me.photo);
    if (photo) {
      const s = Math.max(100 / photo.width, 100 / photo.height);
      ctx.drawImage(photo, 50 - (photo.width * s) / 2, 50 - (photo.height * s) / 2, photo.width * s, photo.height * s);
    }
    ctx.restore();
    if (!photo) {
      ctx.fillStyle = ui.ink(me.color || '#6750a4');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (me.icon) {
        ctx.font = font(700, 84, 'Material Symbols Rounded');
        ctx.fillText(me.icon, ax + AV / 2, ay + AV / 2 + 4);
      } else {
        ctx.font = font(800, 84);
        ctx.fillText((me.name || '?')[0].toUpperCase(), ax + AV / 2, ay + AV / 2 + 4);
      }
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = C.onSurface;
    let size = 76;
    ctx.font = font(800, size);
    while (ctx.measureText(me.name).width > W - ax - AV - 48 - 72 && size > 40) ctx.font = font(800, (size -= 4));
    ctx.fillText(me.name, ax + AV + 40, ay + 92);
    ctx.fillStyle = C.variant;
    ctx.font = font(500, 38);
    ctx.fillText('u/' + me.name, ax + AV + 42, ay + 146);

    // the streak: a big flame and the number
    const st = data.streak || { count: store.state.streak.count, best: store.state.streak.best };
    const fx0 = 150;
    const fy0 = 360;
    const FS = 420;
    ctx.save();
    ctx.translate(fx0, fy0);
    ctx.scale(FS / 100, FS / 100);
    const glow = ctx.createRadialGradient(50, 70, 5, 50, 70, 70);
    glow.addColorStop(0, 'rgba(255,160,0,0.35)');
    glow.addColorStop(1, 'rgba(255,160,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-30, -10, 160, 140);
    const layer = (scale, stops, seed) => {
      ctx.save();
      ctx.translate(50, 99);
      ctx.scale(scale, scale);
      ctx.translate(-50, -99);
      const g = ctx.createLinearGradient(0, 100, 0, 0);
      stops.forEach(([o, c]) => g.addColorStop(o, c));
      ctx.fillStyle = g;
      ctx.fill(new Path2D(flamePath(seed, seed)));
      ctx.restore();
    };
    layer(1, [[0, '#ff3d00'], [0.55, '#ff7a00'], [1, '#ffc400']], 0.4);
    layer(0.72, [[0, '#ff9100'], [1, '#ffe082']], 1.1);
    layer(0.42, [[0, '#fff3c4'], [1, '#fffbe6']], 2.3);
    ctx.restore();
    const count = Math.max(0, st.count || 0);
    ctx.fillStyle = C.onSurface;
    let big = 300;
    ctx.font = font(800, big);
    while (ctx.measureText(num(count)).width > W - (fx0 + FS + 10) - 60 && big > 120) ctx.font = font(800, (big -= 10));
    ctx.fillText(num(count), fx0 + FS + 10, fy0 + FS * 0.62);
    ctx.fillStyle = C.primary;
    ctx.font = font(700, 58);
    ctx.fillText(tr('day streak'), fx0 + FS + 16, fy0 + FS * 0.62 + 76);
    ctx.fillStyle = C.variant;
    ctx.font = font(500, 38);
    ctx.fillText(tr(`Best: ${num(Math.max(st.best || 0, count))} days`), fx0 + FS + 18, fy0 + FS * 0.62 + 134);

    // the achievements: the featured ones, or the highest
    const reached = sortEntries(entriesOf(data).filter((e) => e.has));
    const feat = (data.featured || []).map((f) => reached.find((e) => e.id === f.id)).filter(Boolean);
    const top = (feat.length ? feat : reached).slice(0, 3);
    const cardY = 860;
    roundRect(ctx, 64, cardY, W - 128, 380, 64);
    ctx.fillStyle = C.surface;
    ctx.globalAlpha = 0.86;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.onSurface;
    ctx.font = font(700, 44);
    ctx.fillText(tr('Achievements'), 112, cardY + 76);
    ctx.fillStyle = C.variant;
    ctx.font = font(500, 36);
    ctx.textAlign = 'right';
    ctx.fillText(tr(reached.length === 1 ? '1 reached' : `${reached.length} reached`), W - 112, cardY + 76);
    ctx.textAlign = 'center';
    const slot = (W - 128 - 96) / 3;
    top.forEach((e, i) => {
      const cx = 64 + 48 + slot * i + slot / 2;
      const by = cardY + 112;
      const BS = 150;
      ctx.save();
      ctx.translate(cx - BS / 2, by);
      ctx.scale(BS / 100, BS / 100);
      const g = ctx.createLinearGradient(0, 0, 100, 100);
      if (e.special && !e.tier) {
        const c = e.color || C.primary;
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.45, c);
        g.addColorStop(1, c);
      } else if (e.tier >= 5) ['#ff7eb3', '#ffb46b', '#fff176', '#7dffb0', '#6fd3ff', '#b98bff'].forEach((c, k, a) => g.addColorStop(k / (a.length - 1), c));
      else TIER_FILL[e.tier - 1].slice(0, 3).forEach((c, k) => g.addColorStop(k / 2, c));
      ctx.fillStyle = g;
      ctx.shadowColor = 'rgba(0,0,0,0.18)';
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.fill(shapePath2D(e.shape));
      ctx.restore();
      ctx.fillStyle = e.tier >= 5 || (e.special && !e.tier) ? '#ffffff' : TIER_FILL[e.tier - 1][3];
      ctx.font = font(700, 66, 'Material Symbols Rounded');
      ctx.textBaseline = 'middle';
      ctx.fillText(e.symbol, cx, by + BS / 2 + 2);
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = C.onSurface;
      let s2 = 34;
      ctx.font = font(700, s2);
      const label = tr(e.name) + (e.tier ? ' ' + ROMAN[e.tier - 1] : '');
      while (ctx.measureText(label).width > slot - 16 && s2 > 22) ctx.font = font(700, (s2 -= 2));
      ctx.fillText(label, cx, by + BS + 54);
    });
    if (!top.length) {
      ctx.fillStyle = C.variant;
      ctx.font = font(500, 38);
      ctx.fillText(tr('The first ones are on their way'), W / 2, cardY + 220);
    }

    // Budgie
    ctx.textAlign = 'left';
    ctx.save();
    ctx.translate(96, 1268);
    ctx.scale(0.48, 0.48);
    ctx.fillStyle = C.primary;
    ctx.fill(shapePath2D('cookie9'));
    ctx.restore();
    ctx.fillStyle = C.onSurface;
    ctx.font = font(800, 44);
    ctx.fillText('budgie', 160, 1306);
    ctx.fillStyle = C.variant;
    ctx.font = font(500, 34);
    ctx.textAlign = 'right';
    ctx.fillText('budgiesocial.com', W - 96, 1304);
    return canvas;
  }

  const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));
  const blobToDataUrl = (blob) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  let pendingPost = null;

  async function flex() {
    let data;
    try {
      data = await load(meName());
    } catch (error) {
      return app().showError(error);
    }
    const count = (data.streak && data.streak.count) || store.state.streak.count || 0;
    const text = count >= 2 ? `My ${count}-day streak on Budgie` : 'My achievements on Budgie';
    let canvas = null;
    let png = null;
    ui.sheet({
      headline: 'Flex',
      symbol: 'ios_share',
      shape: 'burst',
      className: 'ach-sheet ach-flex-sheet',
      html:
        '<div class="ach-flex-preview"><m3-loading aria-label="Making your card"></m3-loading></div>' +
        '<div class="ach-flex-actions">' +
        `<button type="button" class="m3-btn filled" data-flex="share" disabled>${icon('share')}Share</button>` +
        (nativeApp() ? '' : `<button type="button" class="m3-btn tonal" data-flex="save" disabled>${icon('download')}Save image</button>`) +
        `<button type="button" class="m3-btn tonal" data-flex="send" disabled>${icon('send')}Send to a friend</button>` +
        `<button type="button" class="m3-btn tonal" data-flex="post" disabled>${icon('edit_square')}Post it</button>` +
        '</div>',
      async setup(body, close) {
        const box = body.querySelector('.ach-flex-preview');
        try {
          canvas = await drawFlex(data);
          png = await toBlob(canvas, 'image/png');
        } catch (error) {
          console.error(error);
          box.innerHTML = '<p class="muted">Couldn’t make the picture on this device.</p>';
          return;
        }
        const img = new Image();
        img.alt = text;
        img.src = URL.createObjectURL(png);
        box.innerHTML = '';
        box.appendChild(img);
        if (!still()) img.animate([{ opacity: 0, transform: 'scale(0.94) rotate(-2deg)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
        body.querySelectorAll('[data-flex]').forEach((b) => (b.disabled = false));
        const file = () => new File([png], 'budgie-flex.png', { type: 'image/png' });
        body.addEventListener('click', async (ev) => {
          const b = ev.target.closest('[data-flex]');
          if (!b) return;
          buzz(6);
          const what = b.dataset.flex;
          if (what === 'share') {
            const url = ui.linkTo('#/u/' + encodeURIComponent(meName()));
            try {
              // the apps' share sheets take words and links (not pictures): the link to your profile goes then
              if (!nativeApp() && navigator.canShare && navigator.canShare({ files: [file()] })) await navigator.share({ files: [file()], title: text, text });
              else if (navigator.share) await navigator.share({ title: text, text, url });
              else {
                await ui.copy(url);
                M3.toast('Link to your profile copied', { symbol: 'link', shape: 'burst' });
              }
            } catch (error) {
              if (error && error.name !== 'AbortError') M3.snackbar('Couldn’t share it from here. Try Save image.');
            }
          } else if (what === 'save') {
            const a = document.createElement('a');
            a.href = img.src;
            a.download = `budgie-${meName()}-flex.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            M3.toast('Saved', { symbol: 'download_done', shape: 'burst' });
          } else if (what === 'send') {
            const jpeg = await blobToDataUrl(await toBlob(canvas, 'image/jpeg', 0.9));
            close();
            setTimeout(() => sendToFriend(jpeg, canvas), 250);
          } else if (what === 'post') {
            pendingPost = { file: file(), title: text };
            close();
            app().go('#/submit?type=image');
          }
        });
      },
    });
  }

  function sendToFriend(image, canvas) {
    const friends = store.friends('friends').map((f) => store.user(f.name));
    if (!friends.length) return M3.snackbar('Add a friend first, then you can send them your card.');
    ui.sheet({
      headline: 'Send to a friend',
      symbol: 'send',
      shape: 'heart',
      className: 'ach-sheet',
      html: `<div class="ach-friends">${friends
        .map((u) => `<button type="button" class="ach-friend" data-name="${esc(u.name)}">${ui.avatar(u, 40)}<b translate="no">u/${esc(u.name)}</b>${icon('send')}</button>`)
        .join('')}</div>`,
      setup(body, close) {
        body.addEventListener('click', async (ev) => {
          const b = ev.target.closest('.ach-friend');
          if (!b || b.disabled) return;
          b.disabled = true;
          b.classList.add('sending');
          try {
            await store.sendMessage(b.dataset.name, '', { image, width: canvas.width, height: canvas.height });
            close();
            M3.toast(`Sent to u/${b.dataset.name}`, { symbol: 'send', shape: 'heart' });
            buzz([6, 40, 12]);
          } catch (error) {
            b.disabled = false;
            b.classList.remove('sending');
            app().showError(error);
          }
        });
      },
    });
  }

  // "Post it": the composer opens with the card as its picture
  Nook.hook('afterRender', (route, main) => {
    if (!pendingPost || route.view !== 'submit') return;
    const { file, title } = pendingPost;
    pendingPost = null;
    const input = main.querySelector('#f-file');
    const titleBox = main.querySelector('#f-title');
    if (titleBox && !titleBox.value.trim()) {
      titleBox.value = title;
      titleBox.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (!input || typeof DataTransfer !== 'function') return;
    try {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } catch (_) {
      /* the picture can still be added by hand */
    }
  });

  // ---- special achievements, for Budgie's admins ------------------------------------------------------------------------

  const SHAPE_CHOICES = ['softBurst', 'burst', 'cookie9', 'flower', 'heart', 'gem', 'sunny', 'clover8', 'boom', 'pixelCircle', 'puffy', 'arch'];
  const SYMBOL_IDEAS = ['star', 'celebration', 'bug_report', 'favorite', 'emoji_events', 'diamond', 'rocket_launch', 'palette', 'volunteer_activism', 'school', 'brush', 'workspace_premium'];

  Nook.hook('profileActions', (u) => (store.isAdmin() ? `<button type="button" class="m3-icon-btn tonal" data-ach-act="give" data-ach-name="${esc(u.name)}" aria-label="Give u/${esc(u.name)} a special achievement" data-tooltip="Give an achievement">${icon('military_tech')}</button>` : ''));

  async function giveSheet(name) {
    let r;
    try {
      r = await api.get('/api/admin/achievements/of/' + encodeURIComponent(name));
    } catch (error) {
      return app().showError(error);
    }
    if (!r.custom.length) return M3.snackbar('Make a special achievement on the Moderation page first.', { action: { label: 'Open', onClick: () => app().go('#/admin') } });
    let pick = r.custom[0].id;
    let tier = 0;
    const row = (c) =>
      `<button type="button" class="ach-give-item" data-id="${esc(c.id)}" aria-pressed="${c.id === pick}">${badgeHTML(entryOf(Object.assign({}, c, { tier: r.has[c.id] || 0 })), 40)}<span><b translate="no">${esc(c.name)}</b><small>${r.has[c.id] != null ? `Has it${r.has[c.id] ? ' · ' + ROMAN[r.has[c.id] - 1] : ''}` : esc(c.desc || '')}</small></span></button>`;
    ui.sheet({
      headline: `Give u/${name} an achievement`,
      symbol: 'military_tech',
      shape: 'softBurst',
      className: 'ach-sheet',
      html:
        `<div class="ach-give-list">${r.custom.map(row).join('')}</div>` +
        `<div class="setting-row"><span class="label">Tier</span><div class="m3-segmented" id="ach-give-tier" role="radiogroup" aria-label="Tier">${['None', ...ROMAN]
          .map((label, i) => `<button type="button" class="m3-segment" role="radio" aria-checked="${i === 0}" value="${i}">${label}</button>`)
          .join('')}</div></div><p class="error" id="ach-give-err"></p>`,
      setup(body) {
        body.addEventListener('click', (ev) => {
          const b = ev.target.closest('.ach-give-item');
          if (!b) return;
          pick = b.dataset.id;
          body.querySelectorAll('.ach-give-item').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        body.querySelector('#ach-give-tier').addEventListener('change', (ev) => (tier = Number(ev.detail.value)));
      },
      actions: [
        {
          label: 'Take away',
          run: (close, body) => {
            api
              .post(`/api/admin/achievements/${pick.replace('custom:', '')}/take`, { name })
              .then((x) => {
                close();
                M3.toast(x.changed ? 'Taken away' : 'They didn’t have it', { symbol: 'remove_circle', shape: 'softBurst' });
                cache.delete(name.toLowerCase());
              })
              .catch((error) => (body.querySelector('#ach-give-err').textContent = error.message));
            return false;
          },
        },
        {
          label: 'Give',
          variant: 'filled',
          symbol: 'military_tech',
          run: (close, body) => {
            api
              .post(`/api/admin/achievements/${pick.replace('custom:', '')}/give`, { name, tier })
              .then((x) => {
                close();
                M3.toast(x.changed ? `Given: they’ve been told` : 'They already have that', { symbol: 'military_tech', shape: 'softBurst' });
                cache.delete(name.toLowerCase());
                load(name, { fresh: true }).then((data) => paint(name, data, { arrive: true })).catch(() => {});
              })
              .catch((error) => (body.querySelector('#ach-give-err').textContent = error.message));
            return false;
          },
        },
      ],
    });
  }

  Nook.hook('adminSections', () =>
    store.isAdmin()
      ? '<section class="section ach-admin" id="ach-admin">' +
        `<header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="softBurst" symbol="military_tech" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Special achievements</h2><m3-wavy-line></m3-wavy-line></header>` +
        '<form class="card ach-make" id="ach-make" novalidate>' +
        `<div class="ach-make-preview">${badgeHTML({ special: true, has: true, tier: 0, shape: 'softBurst', symbol: 'star', color: '#e8467c' }, 72)}</div>` +
        '<div class="ach-make-fields">' +
        '<div class="field"><label for="ach-name">Name</label><input class="m3-field" id="ach-name" maxlength="40" placeholder="Bug hunter" required></div>' +
        '<div class="field"><label for="ach-desc">What it’s for</label><input class="m3-field" id="ach-desc" maxlength="160" placeholder="Found a real bug in Budgie"></div>' +
        `<div class="ach-make-row"><div class="field"><label for="ach-symbol">Symbol</label><input class="m3-field" id="ach-symbol" list="ach-symbols" value="star" maxlength="40" autocapitalize="none" spellcheck="false"><datalist id="ach-symbols">${SYMBOL_IDEAS.map((s) => `<option value="${s}">`).join('')}</datalist></div>` +
        '<div class="field"><label for="ach-color">Colour</label><input type="color" class="color-input" id="ach-color" value="#e8467c"></div></div>' +
        `<div class="ach-shapes" role="radiogroup" aria-label="Shape">${SHAPE_CHOICES.map((s, i) => `<button type="button" class="ach-shape" role="radio" aria-checked="${i === 0}" data-shape="${s}" aria-label="${s}"><m3-shape shape="${s}"></m3-shape></button>`).join('')}</div>` +
        `<div class="toolbar"><button class="m3-btn filled" type="submit">${icon('add')}Make it</button><span class="error" id="ach-make-err"></span></div>` +
        '</div></form>' +
        '<div class="ach-custom-list" id="ach-custom-list"><m3-loading aria-label="Loading"></m3-loading></div>' +
        '<p class="muted">Give one from someone’s profile (the medal button), or with <code>nook award &lt;user&gt; &lt;id&gt; [tier]</code> on the server. People are told when they get one.</p>' +
        '</section>'
      : ''
  );

  Nook.hook('adminMount', (root) => {
    const form = root.querySelector('#ach-make');
    if (!form) return;
    const list = root.querySelector('#ach-custom-list');
    let shape = 'softBurst';
    const preview = () => {
      const symbol = form.querySelector('#ach-symbol').value.trim() || 'star';
      form.querySelector('.ach-make-preview').innerHTML = badgeHTML({ special: true, has: true, tier: 0, shape, symbol, color: form.querySelector('#ach-color').value }, 72);
    };
    form.addEventListener('input', preview);
    form.querySelector('.ach-shapes').addEventListener('click', (e) => {
      const b = e.target.closest('[data-shape]');
      if (!b) return;
      shape = b.dataset.shape;
      form.querySelectorAll('[data-shape]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      preview();
      fx.pop(form.querySelector('.ach-make-preview .ach-badge'), 0.7);
    });
    const draw = async () => {
      let r;
      try {
        r = await api.get('/api/admin/achievements');
      } catch (error) {
        list.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
        return;
      }
      list.innerHTML = r.custom.length
        ? `<div class="card"><div class="team-list">${r.custom
            .map(
              (c) =>
                `<div class="team-row">${badgeHTML(entryOf(c), 44)}<span class="row-text"><b translate="no">${esc(c.name)}</b>${c.desc ? `<small>${esc(c.desc)}</small>` : ''}<small>${c.holders === 1 ? '1 person has it' : `${num(c.holders)} people have it`} · id ${esc(c.id.replace('custom:', ''))}</small></span>` +
                `<button type="button" class="m3-icon-btn" data-ach-delete="${esc(c.id)}" aria-label="Delete ${esc(c.name)}" data-tooltip="Delete">${icon('delete')}</button></div>`
            )
            .join('')}</div></div>`
        : '<p class="muted">No special achievements yet. Make the first one above.</p>';
    };
    draw();
    list.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-ach-delete]');
      if (!b) return;
      const ok = await M3.dialog({
        headline: 'Delete this special achievement?',
        symbol: 'delete',
        body: 'Everyone who has it loses it. This can’t be undone.',
        actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, variant: 'filled' }],
      });
      if (!ok) return;
      try {
        await api.del('/api/admin/achievements/' + encodeURIComponent(b.dataset.achDelete.replace('custom:', '')));
        M3.toast('Deleted', { symbol: 'delete', shape: 'softBurst' });
        draw();
      } catch (error) {
        app().showError(error);
      }
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = form.querySelector('#ach-make-err');
      err.textContent = '';
      try {
        await api.post('/api/admin/achievements', {
          name: form.querySelector('#ach-name').value,
          desc: form.querySelector('#ach-desc').value,
          symbol: form.querySelector('#ach-symbol').value.trim(),
          shape,
          color: form.querySelector('#ach-color').value,
        });
        M3.toast('Special achievement made', { symbol: 'military_tech', shape });
        M3.burst(form.querySelector('.ach-make-preview .ach-badge'), 'pin');
        form.querySelector('#ach-name').value = '';
        form.querySelector('#ach-desc').value = '';
        draw();
      } catch (error) {
        err.textContent = error.message;
      }
    });
  });

  // ---- settings -----------------------------------------------------------------------------------------------------

  Nook.hook('settingsSections', (header) => {
    const data = cached(meName());
    const shown = !(data && data.streak && data.streak.hidden);
    const sw = (id, title, sub, on) =>
      `<label class="switch-row"><span class="switch-text"><span>${title}</span><small>${sub}</small></span><input type="checkbox" class="m3-switch" role="switch" id="${id}"${on ? ' checked' : ''}></label>`;
    return (
      `<section>${header('burst', 'local_fire_department', 'Streak and achievements')}<div class="card setting-card">` +
      sw('ach-set-show', 'Show my streak on my profile', 'Others see your flame and how many days in a row you’ve opened Budgie (from 3 days). Off, only you see it.', shown) +
      sw('ach-set-moments', 'Streak celebrations', 'A full-screen moment, once a day, when your streak grows. Off, it’s just a small note.', S().streakMoments !== false) +
      '<p class="muted">Calm mode hides streaks and celebrations altogether. Achievements are counted by Budgie’s server from what you do here.</p>' +
      '</div></section>'
    );
  });
  Nook.hook('settingsMount', (root) => {
    const show = root.querySelector('#ach-set-show');
    const moments = root.querySelector('#ach-set-moments');
    if (!show) return;
    load(meName())
      .then((data) => (show.checked = !(data.streak && data.streak.hidden)))
      .catch(() => {});
    show.addEventListener('change', async () => {
      try {
        const r = await api.put('/api/achievements/settings', { showStreak: show.checked });
        const data = cached(meName());
        if (data && data.streak) data.streak.hidden = !r.showStreak;
        M3.toast(r.showStreak ? 'Your streak shows on your profile' : 'Your streak is only for you now', { symbol: 'local_fire_department', shape: 'burst' });
      } catch (error) {
        show.checked = !show.checked;
        app().showError(error);
      }
    });
    moments.addEventListener('change', () => {
      S().streakMoments = moments.checked;
      store.save();
    });
  });

  // ---- start ------------------------------------------------------------------------------------------------------------

  // your own, once the app has settled, so a profile opens with them already there (and what's new while you were
  // away gets its celebration)
  setTimeout(() => store.state.me && load(meName()).catch(() => {}), 2500);

  Nook.achievements = { open: openAchievement, flex, streakMoment, load, celebrate: (id, tier) => {
    const e = entryOf({ id, tier });
    if (e) celebrate([{ e: Object.assign(e, { has: true }), from: tier - 1 }]);
  } };
})();
