// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Sticker blasts (Budgie 1.5), in the app.
 *
 * On a friend's profile, the Blast button opens a small strip at the bottom of the screen (on a phone, over the
 * bottom bar): one row of big stickers, swiped sideways, with their names under them. Yours come first (and a tile to
 * make one, from any picture or GIF); Popular and New are what everyone shared, and the search finds them by name.
 *
 * Tap a sticker as fast as you like, or hold it down: each one pops off the strip and flies in a curve into your
 * friend's profile picture, squashes as it hits, and lands in a heap there, with a few sparks; the picture wobbles
 * from the hits, and now and then a ring goes out from it. A combo counter beside the picture counts the burst, ×2,
 * ×3 … with no top to it, popping with every sticker, and at ×10, ×25, ×50, ×100 and on it has a moment of its own.
 * Stop for a moment and the burst is sent; it's kept as one line in your chat with them (the sticker, piled up, and
 * how many) that plays again when it's tapped. Picking another sticker sends the burst so far and starts a new one.
 * GIF stickers keep moving, in the strip and in the air.
 *
 * On the other end, with Budgie open, it arrives over the live connection (or with the next check for news): the
 * stickers burst up from the bottom of the screen and tumble down again, under a card that says who and how many
 * (tap it for the chat). With reduced motion or calm mode it's just the card (and, when blasting, just the counter).
 * Settings → Sticker blasts turns them off.
 *
 * Everything moves with the browser's own animations (transforms, opacity and motion paths), so it stays smooth while
 * the app is busy, and there are never more than a couple of dozen stickers in the air.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const { store, ui, fx, api } = Nook;
  const { esc, icon } = ui;
  const app = () => Nook.app;
  const serverHas = () => !!(Nook.views && Nook.views.serverAt && Nook.views.serverAt('1.5.0'));
  const still = () => fx.reduced() || document.body.classList.contains('calm');
  const stickers = () => Nook.stickers || null;

  const SEND_AFTER = 1100; // ms without a tap and the burst goes
  const IN_AIR = 24; // stickers flying at once, at most
  // a sticker flies along a real curve where the browser can draw one (CSS motion paths)
  const CURVES = typeof CSS !== 'undefined' && !!CSS.supports && CSS.supports('offset-path', 'path("M0 0L1 1")');
  // the counter's moments, and what it says at each
  const MILESTONES = [
    [10, 'Nice!'],
    [25, 'Great!'],
    [50, 'On fire!'],
    [100, 'Unstoppable!'],
    [250, 'Legendary!'],
    [500, 'Ridiculous!'],
    [1000, 'Absolute legend!'],
  ];
  const milestone = (n) => {
    const hit = MILESTONES.find(([at]) => at === n);
    if (hit) return hit[1];
    // past a thousand, every thousand
    return n > 1000 && n % 1000 === 0 ? 'Absolute legend!' : '';
  };

  /** a sticker drawn at `size` px (a GIF keeps moving unless motion is reduced) */
  function art(what, size = 56) {
    const src = api.url(`/api/stickers/${encodeURIComponent((what && what.sticker) || '')}/image`) + (ui.motionOff && ui.motionOff() && what && what.gif ? '?still=1' : '');
    return `<span class="bl-art" style="--bl-s:${size}px" aria-hidden="true"><img src="${esc(src)}" alt="" draggable="false" decoding="async"></span>`;
  }
  const labelOf = (what) => (what && what.name) || 'Sticker';
  const same = (a, b) => !!a && !!b && a.sticker === b.sticker;
  /** how many, as a number to read: in full, and shortened once it's very long (1.2M) */
  const many = (n) => (n < 100000 ? n.toLocaleString() : new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n));

  // ---- a layer over everything, for what flies (in the top layer where it can be, so it's over an open sheet too) --

  function layer(className) {
    const el = document.createElement('div');
    el.className = 'bl-layer ' + className;
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
    if (el.showPopover) {
      try {
        el.popover = 'manual';
        el.showPopover();
      } catch (_) {
        /* drawn as an ordinary layer */
      }
    }
    return el;
  }

  /** one sticker in the air, along `frames` (transform and opacity), gone when it's done (the rain) */
  function fly(host, what, size, x, y, frames, timing) {
    const el = document.createElement('div');
    el.className = 'bl-flyer';
    el.style.left = x - size / 2 + 'px';
    el.style.top = y - size / 2 + 'px';
    el.innerHTML = art(what, size);
    host.appendChild(el);
    const run = el.animate(frames, Object.assign({ fill: 'both' }, timing));
    run.onfinish = run.oncancel = () => el.remove();
    return run;
  }

  /** a few sparks out from a point, in the page's own colours */
  function sparks(host, x, y, count = 6, reach = 46) {
    for (let i = 0; i < count; i++) {
      const s = document.createElement('i');
      s.className = 'bl-spark t' + (i % 3);
      s.style.left = x + 'px';
      s.style.top = y + 'px';
      host.appendChild(s);
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const d = reach * (0.6 + Math.random() * 0.6);
      const run = s.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
          { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d}px)) scale(0.2)`, opacity: 0 },
        ],
        { duration: 380 + Math.random() * 160, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' }
      );
      run.onfinish = run.oncancel = () => s.remove();
    }
  }

  // ---- the Blast button on a friend's profile, beside Nudge ----------------------------------------------------

  const canBlast = (name) => serverHas() && api.signedIn() && !!stickers() && store.friendStatus(name) === 'friends' && !(store.isBlocked && store.isBlocked(name));
  Nook.hook('profileActions', (u, who, me) =>
    !me && canBlast(u.name)
      ? `<button type="button" class="m3-btn tonal bl-btn" data-blast-at="${esc(u.name)}" aria-label="Blast u/${esc(u.name)} with stickers" data-tooltip="Throw stickers at their picture">${icon('celebration')}Blast</button>`
      : ''
  );
  let current = null;
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-blast-at]');
    if (!b) return;
    const friend = store.user(b.dataset.blastAt);
    if (current) current.close();
    else if (friend && !friend.unknown) current = open(friend, () => (current = null));
  });

  const TABS = [
    ['yours', 'Yours', 'sticky_note_2'],
    ['popular', 'Popular', 'local_fire_department'],
    ['new', 'New', 'schedule'],
  ];

  // ---- the strip ---------------------------------------------------------------------------------------------

  function open(friend, onClose) {
    const tray = document.createElement('section');
    tray.className = 'bl-tray';
    tray.setAttribute('aria-label', `Blast u/${friend.name} with stickers`);
    tray.innerHTML =
      '<div class="bl-bar">' +
      `<div class="bl-tabs" role="tablist">${TABS.map(([id, words, symbol], i) => `<button type="button" class="chip" role="tab" data-bl-tab="${id}" aria-selected="${i === 0}">${icon(symbol)}${words}</button>`).join('')}</div>` +
      `<div class="bl-find" hidden><input class="m3-field" type="search" maxlength="32" placeholder="Search what everyone shared" aria-label="Search stickers" autocomplete="off"></div>` +
      `<button type="button" class="m3-icon-btn small" data-bl-search aria-label="Search stickers" aria-pressed="false" data-tooltip="Search">${icon('search')}</button>` +
      `<button type="button" class="m3-icon-btn small" data-bl-close aria-label="Close" data-tooltip="Close">${icon('close')}</button>` +
      '</div>' +
      '<div class="bl-strip" role="list"></div>';
    document.body.appendChild(tray);
    document.body.classList.add('blasting');
    // their picture in view, above the strip
    if (scrollY > 40) scrollTo({ top: 0, behavior: still() ? 'auto' : 'smooth' });
    if (!still()) tray.animate([{ translate: '0 100%' }, { translate: '0 0' }], { duration: 380, easing: 'cubic-bezier(.05,.7,.1,1)' });

    const strip = tray.querySelector('.bl-strip');
    const find = tray.querySelector('.bl-find');
    const tabsEl = tray.querySelector('.bl-tabs');
    const findInput = find.querySelector('input');
    let tab = 'yours';
    let q = '';
    // what everyone shared, per tab: the list so far, whether there's more, and the search it's for
    const shared = { popular: { list: [], page: 0, more: false, busy: false, q: '', token: 0 }, new: { list: [], page: 0, more: false, busy: false, q: '', token: 0 } };
    const listFor = () => (q ? 'popular' : tab === 'yours' ? null : tab);

    const tile = (s) =>
      `<button type="button" class="bl-tile" role="listitem" data-bl-sticker="${esc(s.id)}" data-bl-name="${esc(s.name || '')}"${s.gif ? ' data-bl-gif' : ''} aria-label="${s.by ? `${esc(labelOf(s))}, by u/${esc(s.by)}` : esc(labelOf(s))}">` +
      `${art({ sticker: s.id, gif: s.gif }, 76)}<small translate="no">${esc(s.name || '')}</small></button>`;
    const makeTile = `<label class="bl-tile bl-make" role="listitem"><span class="bl-make-ring">${icon('add')}</span><small>Make one</small><input type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Make a sticker from a picture or GIF"></label>`;

    function paint() {
      tray.querySelectorAll('[data-bl-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.blTab === tab)));
      const which = listFor();
      if (!which) {
        const mine = (stickers().library().stickers || []);
        strip.innerHTML =
          makeTile +
          mine.map(tile).join('') +
          (!mine.length ? '<p class="bl-empty">Make your own from any picture or GIF, or pick one from Popular. Tap fast or hold one down!</p>' : '');
        return;
      }
      const s = shared[which];
      strip.innerHTML =
        s.list.map(tile).join('') +
        (s.busy ? '<span class="bl-loading" role="listitem"><m3-loading aria-label="Loading stickers"></m3-loading></span>' : '') +
        (!s.list.length && !s.busy ? `<p class="bl-empty">${s.error ? esc(s.error) : q ? 'Nothing by that name.' : 'Nothing shared yet. Make a sticker and share it!'}</p>` : '');
    }

    async function load(which, fresh) {
      const s = shared[which];
      if (s.busy && !fresh) return;
      const token = ++s.token;
      if (fresh || s.q !== q) Object.assign(s, { list: [], page: 0, more: false, q });
      s.busy = true;
      s.error = '';
      if (listFor() === which) paint();
      try {
        const r = await stickers().browse({ sort: which === 'new' ? 'new' : 'popular', q, page: s.page });
        if (token !== s.token) return;
        s.list = s.list.concat(r.stickers || []);
        s.more = !!r.more;
        s.page++;
      } catch (error) {
        if (token === s.token) s.error = error.message;
      } finally {
        if (token === s.token) {
          s.busy = false;
          if (listFor() === which) {
            const at = strip.scrollLeft;
            paint();
            strip.scrollLeft = at;
          }
        }
      }
    }
    // more of what everyone shared as you reach the end
    strip.addEventListener(
      'scroll',
      () => {
        const which = listFor();
        const s = which && shared[which];
        if (s && s.more && !s.busy && strip.scrollLeft + strip.clientWidth > strip.scrollWidth - 260) load(which, false);
      },
      { passive: true }
    );
    // a mouse wheel scrolls the strip sideways
    strip.addEventListener(
      'wheel',
      (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        strip.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false }
    );

    const show = (next) => {
      tab = next;
      strip.scrollLeft = 0;
      const which = listFor();
      if (which && (shared[which].q !== q || (!shared[which].list.length && !shared[which].busy))) load(which, true);
      else paint();
      if (!still()) fx.stagger([...strip.children].slice(0, 6), { y: 18, step: 26 });
    };
    tabsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bl-tab]');
      if (b && b.dataset.blTab !== tab) show(b.dataset.blTab);
    });
    const searchBtn = tray.querySelector('[data-bl-search]');
    const setSearching = (on) => {
      find.hidden = !on;
      tabsEl.hidden = on;
      searchBtn.setAttribute('aria-pressed', String(on));
      searchBtn.innerHTML = icon(on ? 'arrow_back' : 'search');
      searchBtn.setAttribute('aria-label', on ? 'Back to the tabs' : 'Search stickers');
      if (on) findInput.focus({ preventScroll: true });
      else {
        findInput.value = '';
        if (q) {
          q = '';
          show(tab);
        }
      }
    };
    searchBtn.addEventListener('click', () => setSearching(find.hidden));
    let soon = 0;
    findInput.addEventListener('input', () => {
      clearTimeout(soon);
      soon = setTimeout(() => {
        q = findInput.value.trim();
        show(tab);
      }, 300);
    });

    // making one, right here: it lands in Yours, ready to throw
    strip.addEventListener('change', async (e) => {
      const file = e.target.matches('.bl-make input') && e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;
      const made = await stickers().make('sticker', file);
      if (made && tray.isConnected) {
        if (q) setSearching(false);
        show('yours');
        const t = strip.querySelector(`[data-bl-sticker="${CSS.escape(made.id)}"]`);
        if (t) {
          t.scrollIntoView({ inline: 'center', block: 'nearest' });
          fx.pop(t, 0.5);
        }
      }
    });
    paint();
    stickers().load().then(() => tray.isConnected && listFor() === null && paint(), () => {});
    if (!still()) fx.stagger([...strip.children].slice(0, 6), { y: 22, step: 30 });

    // ---- throwing them
    // the picture they're thrown at (found again each time: the profile may be drawn again meanwhile)
    const target = () => document.querySelector('#main .profile-main > .avatar');
    const sky = layer('bl-sky');
    let burst = null; // { what, count, timer }
    let inAir = 0;
    let closed = false;

    // the combo beside your friend's picture
    const combo = document.createElement('div');
    combo.className = 'bl-combo';
    combo.hidden = true;
    combo.innerHTML = '<span class="bl-combo-word" aria-hidden="true"></span><span class="bl-combo-x">×</span><b>0</b>';
    sky.appendChild(combo);
    const comboNum = combo.querySelector('b');
    const comboWord = combo.querySelector('.bl-combo-word');
    const placeCombo = () => {
      const t = target();
      if (!t) return;
      const r = t.getBoundingClientRect();
      combo.style.left = Math.max(10, Math.min(innerWidth - 170, r.right + 14)) + 'px';
      combo.style.top = r.top + r.height / 2 + 'px';
    };
    let wiggle = 1;
    const paintCombo = (b) => {
      comboNum.textContent = many(b.count);
      const word = milestone(b.count);
      // a new burst (or one started while the last one's counter was going): it comes in afresh
      if (combo.hidden || combo.dataset.leaving || b.count === 1) {
        combo.getAnimations().forEach((a) => a.cancel());
        delete combo.dataset.leaving;
        comboWord.textContent = '';
        combo.hidden = false;
        placeCombo();
        if (!still()) combo.animate([{ opacity: 0, scale: 0.2, rotate: '-20deg' }, { opacity: 1, scale: 1.15, rotate: '4deg', offset: 0.6 }, { opacity: 1, scale: 1, rotate: '0deg' }], { duration: 360, easing: 'cubic-bezier(.2,.9,.3,1)' });
        return;
      }
      if (still()) return;
      wiggle = -wiggle;
      if (word) {
        // a moment: it jumps, says so, and throws sparks
        comboWord.textContent = word;
        comboWord.getAnimations().forEach((a) => a.cancel());
        comboWord.animate([{ opacity: 0, translate: '0 10px', scale: 0.6 }, { opacity: 1, translate: '0 0', scale: 1.1, offset: 0.25 }, { opacity: 1, translate: '0 -2px', scale: 1, offset: 0.8 }, { opacity: 0, translate: '0 -14px', scale: 1 }], { duration: 1300, easing: 'ease-out', fill: 'both' });
        comboNum.animate([{ scale: 1 }, { scale: 1.7, rotate: `${8 * wiggle}deg`, offset: 0.35 }, { scale: 0.95, rotate: '0deg', offset: 0.7 }, { scale: 1 }], { duration: 520, easing: 'cubic-bezier(.2,.9,.3,1)' });
        const r = comboNum.getBoundingClientRect();
        sparks(sky, r.left + r.width / 2, r.top + r.height / 2, 12, 70);
        fx.haptic([12, 40, 18]);
      } else {
        comboNum.animate([{ scale: 1.32, rotate: `${4 * wiggle}deg` }, { scale: 1, rotate: '0deg' }], { duration: 200, easing: 'cubic-bezier(.2,1.5,.4,1)' });
      }
    };

    function flush(b = burst) {
      if (!b) return;
      clearTimeout(b.timer);
      if (burst === b) burst = null;
      // the combo goes up and away, the way it came
      if (!still() && !combo.hidden) {
        combo.dataset.leaving = '1';
        combo
          .animate([{ opacity: 1, scale: 1, translate: '0 0' }, { opacity: 1, scale: 1.12, translate: '0 -6px', offset: 0.3 }, { opacity: 0, scale: 0.8, translate: '0 -30px' }], { duration: 420, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' })
          .finished.then(() => {
            if (!combo.dataset.leaving) return;
            delete combo.dataset.leaving;
            combo.hidden = true;
            combo.getAnimations().forEach((a) => a.cancel());
          }, () => {});
      } else combo.hidden = true;
      api
        .post('/api/blasts', { to: friend.name, sticker: b.what.sticker, count: b.count })
        .then(() => {
          fx.haptic([6, 30, 10]);
          store.sync().catch(() => {});
        })
        .catch((error) => M3.snackbar(error.message || 'Couldn’t send that blast. Try again.'));
    }

    // the picture takes a hit: it squashes and wobbles (not more often than it can show), and a ring goes out now
    // and then
    let lastHit = 0;
    let hits = 0;
    function hit(x, y) {
      const av = target();
      if (!av) return;
      hits++;
      sparks(sky, x, y, 5, 38);
      const now = performance.now();
      if (now - lastHit > 90) {
        lastHit = now;
        const side = Math.random() < 0.5 ? -1 : 1;
        av.animate([{ scale: '1 1', rotate: '0deg' }, { scale: '0.9 1.07', rotate: `${-3 * side}deg`, offset: 0.3 }, { scale: '1.05 0.96', rotate: `${2 * side}deg`, offset: 0.65 }, { scale: '1 1', rotate: '0deg' }], { duration: 300, easing: 'ease-out' });
      }
      if (hits % 5 === 0) {
        const r = av.getBoundingClientRect();
        const ring = document.createElement('i');
        ring.className = 'bl-ring';
        ring.style.left = r.left + r.width / 2 + 'px';
        ring.style.top = r.top + r.height / 2 + 'px';
        ring.style.width = ring.style.height = r.width + 'px';
        sky.appendChild(ring);
        const run = ring.animate([{ transform: 'translate(-50%, -50%) scale(0.9)', opacity: 0.9 }, { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0 }], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' });
        run.onfinish = run.oncancel = () => ring.remove();
      }
    }

    /** one sticker off the strip and into their picture: a pop as it leaves, a curve, a squash as it lands */
    function launch(t, what) {
      const av = target();
      if (!av) return;
      const from = (t.querySelector('.bl-art') || t).getBoundingClientRect();
      const to = av.getBoundingClientRect();
      const size = Math.round(Math.min(92, Math.max(60, to.width * 0.8)));
      const x0 = from.left + from.width / 2;
      const y0 = from.top + from.height / 2;
      // where it lands: on the picture, a little off centre each time, so they heap up
      const a = Math.random() * Math.PI * 2;
      const d = Math.random() * to.width * 0.3;
      const x1 = to.left + to.width / 2 + Math.cos(a) * d;
      const y1 = to.top + to.height / 2 + Math.sin(a) * d * 0.8;
      // the curve: up and over, bending one way or the other
      const side = Math.random() < 0.5 ? -1 : 1;
      const cx = (x0 + x1) / 2 + side * (50 + Math.random() * 110);
      const cy = Math.min(y0, y1) - 40 - Math.random() * 90;
      const spin = side * (200 + Math.random() * 220);
      const rest = side * (6 + Math.random() * 16);
      const s0 = from.width / size;
      const el = document.createElement('div');
      el.className = 'bl-flyer';
      el.innerHTML = art(what, size);
      sky.appendChild(el);
      inAir++;
      const T = 1350; // flight, landing, a rest on the heap, and gone
      const land = 0.44;
      let run;
      if (CURVES) {
        el.style.left = el.style.top = '0px';
        el.style.offsetPath = `path("M ${x0.toFixed(1)} ${y0.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${x1.toFixed(1)} ${y1.toFixed(1)}")`;
        el.style.offsetRotate = '0deg';
        el.style.offsetAnchor = '50% 50%';
        run = el.animate(
          [
            { offsetDistance: '0%', transform: `rotate(0deg) scale(${s0})`, opacity: 1, easing: 'cubic-bezier(.2,.8,.4,1)' },
            { offsetDistance: '8%', transform: `rotate(${spin * 0.08}deg) scale(${s0 * 1.3})`, offset: 0.07, easing: 'cubic-bezier(.35,.1,.45,1)' },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(1)`, offset: land, easing: 'ease-out' },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(1.22, 0.8)`, offset: land + 0.05, easing: 'ease-in-out' },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(0.92, 1.08)`, offset: land + 0.11, easing: 'ease-in-out' },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(1)`, offset: land + 0.17, opacity: 1 },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(1)`, offset: 0.86, opacity: 1, easing: 'ease-in' },
            { offsetDistance: '100%', transform: `rotate(${spin + rest}deg) scale(0.5)`, opacity: 0 },
          ],
          { duration: T, fill: 'both' }
        );
      } else {
        // no curves here: the same flight through three points
        el.style.left = x0 - size / 2 + 'px';
        el.style.top = y0 - size / 2 + 'px';
        const dx = x1 - x0;
        const dy = y1 - y0;
        run = el.animate(
          [
            { transform: `translate(0,0) rotate(0deg) scale(${s0})`, opacity: 1 },
            { transform: `translate(${(cx - x0) * 0.6}px, ${(cy - y0) * 0.7}px) rotate(${spin * 0.5}deg) scale(1.15)`, offset: land * 0.5 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${spin + rest}deg) scale(1)`, offset: land },
            { transform: `translate(${dx}px, ${dy}px) rotate(${spin + rest}deg) scale(1.2, 0.82)`, offset: land + 0.05 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${spin + rest}deg) scale(1)`, offset: land + 0.15, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${spin + rest}deg) scale(1)`, offset: 0.86, opacity: 1 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${spin + rest}deg) scale(0.5)`, opacity: 0 },
          ],
          { duration: T, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' }
        );
      }
      const landed = setTimeout(() => hit(x1, y1), T * land);
      run.onfinish = run.oncancel = () => {
        clearTimeout(landed);
        inAir--;
        el.remove();
      };
    }

    function fire(t) {
      if (closed) return;
      const what = { sticker: t.dataset.blSticker, name: t.dataset.blName || undefined, gif: t.hasAttribute('data-bl-gif') || undefined };
      if (burst && !same(burst.what, what)) flush();
      if (!burst) burst = { what, count: 0, timer: 0 };
      burst.count++;
      clearTimeout(burst.timer);
      const b = burst;
      b.timer = setTimeout(() => flush(b), SEND_AFTER);
      paintCombo(b);
      fx.haptic(4);
      if (still()) return;
      // the sticker on the strip gives a little kick as each one leaves it
      const pic = t.querySelector('.bl-art');
      if (pic) pic.animate([{ scale: 0.82 }, { scale: 1.08, offset: 0.5 }, { scale: 1 }], { duration: 240, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      if (inAir < IN_AIR) launch(t, what);
    }

    // a tap throws one (when it's let go, so swiping the strip throws nothing); held down, they keep coming,
    // faster and faster
    let held = 0;
    let pressed = null;
    const stop = () => {
      clearTimeout(held);
      held = 0;
      pressed = null;
    };
    strip.addEventListener('pointerdown', (e) => {
      const t = e.target.closest('[data-bl-sticker]');
      if (!t) return;
      if (e.pointerType === 'mouse') e.preventDefault();
      stop();
      const p = (pressed = { t, fired: false });
      let pace = 110;
      held = setTimeout(function again() {
        if (pressed !== p) return;
        p.fired = true;
        fire(t);
        pace = Math.max(55, pace - 6);
        held = setTimeout(again, pace);
      }, 260);
    });
    strip.addEventListener('pointerup', (e) => {
      const p = pressed;
      stop();
      if (p && !p.fired && e.target.closest('[data-bl-sticker]') === p.t) fire(p.t);
    });
    for (const type of ['pointercancel', 'pointerleave']) strip.addEventListener(type, stop);
    strip.addEventListener('scroll', stop, { passive: true });
    // keys: Enter or Space on a sticker throws one (and the key's own repeat keeps them coming)
    strip.addEventListener('keydown', (e) => {
      const t = e.target.closest('[data-bl-sticker]');
      if (!t || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      fire(t);
    });
    strip.addEventListener('contextmenu', (e) => e.target.closest('[data-bl-sticker]') && e.preventDefault());

    const onKey = (e) => e.key === 'Escape' && !document.querySelector('dialog[open]') && close();
    const close = () => {
      if (closed) return;
      closed = true;
      stop();
      flush();
      document.body.classList.remove('blasting');
      removeEventListener('resize', placeCombo);
      removeEventListener('hashchange', close);
      removeEventListener('keydown', onKey);
      setTimeout(() => sky.remove(), 1500);
      if (still()) tray.remove();
      else tray.animate([{ translate: '0 0' }, { translate: '0 100%' }], { duration: 220, easing: 'cubic-bezier(.3,0,.8,.15)', fill: 'forwards' }).finished.then(() => tray.remove(), () => tray.remove());
      onClose();
    };
    tray.querySelector('[data-bl-close]').addEventListener('click', close);
    addEventListener('resize', placeCombo);
    addEventListener('keydown', onKey);
    // going to another page sends what's in the air (the profile being drawn again keeps it open)
    addEventListener('hashchange', close);
    return { close };
  }

  // ---- receiving: the rain ------------------------------------------------------------------------------------

  let raining = null;
  /** a burst arriving (or played again): stickers up from the bottom, tumbling down, and a card saying who */
  function rain({ from, what, count, mine = false, preview = false }) {
    if (raining) raining.end();
    const host = layer('bl-rain');
    const who = mine || preview || !from ? store.state.me : store.user(from);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'bl-card';
    const says = preview ? 'This is what a friend’s blast looks like' : mine ? `You blasted u/${esc(from || '')}` : 'Blasted you';
    card.innerHTML =
      `${ui.avatar(who, 40)}<span class="bl-card-text"><b translate="no">${mine || preview ? 'You' : 'u/' + esc(who.name)}</b><small>${says}</small></span>` +
      `${art(what, 44)}<b class="bl-card-count">×${many(count)}</b>`;
    host.appendChild(card);
    card.addEventListener('click', () => {
      end();
      if (from && !mine && !preview) location.hash = '#/messages/' + encodeURIComponent(from);
    });
    if (!still()) fx.play(card, [{ opacity: 0, translate: '-50% -24px', scale: 0.85 }, { opacity: 1, translate: '-50% 0', scale: 1 }], { duration: 420, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    fx.haptic([10, 50, 10, 50, 24]);
    const pieces = still() ? 0 : Math.min(30, 6 + Math.round(Math.sqrt(count) * 4));
    const timers = [];
    for (let i = 0; i < pieces; i++) {
      timers.push(
        setTimeout(() => {
          const size = 64 + Math.random() * 44;
          const x = innerWidth * (0.08 + Math.random() * 0.84);
          const y = innerHeight + size;
          const up = innerHeight * (0.45 + Math.random() * 0.4);
          const drift = (Math.random() - 0.5) * innerWidth * 0.5;
          const spin = (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 200);
          fly(
            host,
            what,
            size,
            x,
            y,
            [
              { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
              { transform: `translate(${drift * 0.5}px, ${-up}px) rotate(${spin * 0.5}deg)`, opacity: 1, offset: 0.45, easing: 'cubic-bezier(.3,0,.7,1)' },
              { transform: `translate(${drift}px, ${-up * 0.25}px) rotate(${spin}deg)`, opacity: 0.95, offset: 0.8 },
              { transform: `translate(${drift * 1.15}px, ${size}px) rotate(${spin * 1.2}deg)`, opacity: 0 },
            ],
            { duration: 1500 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.5,1)' }
          );
        }, i * (1100 / Math.max(1, pieces)))
      );
    }
    const done = setTimeout(end, still() ? 4200 : 3600);
    function end() {
      timers.forEach(clearTimeout);
      clearTimeout(done);
      if (raining && raining.host === host) raining = null;
      if (still() || !card.isConnected) return host.remove();
      card.animate([{ opacity: 1 }, { opacity: 0, translate: '-50% -16px' }], { duration: 220, fill: 'forwards' }).finished.then(() => setTimeout(() => host.remove(), 1200), () => host.remove());
    }
    raining = { host, end };
  }

  const dataOf = (m) => {
    try {
      return JSON.parse(m.body) || {};
    } catch (_) {
      return {};
    }
  };
  const whatOf = (d) => ({ sticker: d.sticker, name: d.name, gif: d.gif });

  // the live connection says it at once (the line in the chat comes with the next check for news, asked for now)
  const seen = new Set();
  Nook.hook('signal', (type, data) => {
    if (type !== 'blast' || !data || !data.from || !data.sticker || seen.has(data.id)) return;
    seen.add(data.id);
    if (store.isBlocked && store.isBlocked(data.from)) return;
    if (!document.hidden) rain({ from: String(data.from), what: whatOf(data), count: Number(data.count) || 1 });
    store.sync().catch(() => {});
  });
  /** a burst that came with the check for news instead (no live connection): it flies in then, if it's recent */
  function arrived(m) {
    if (!m || m.mine || seen.has(m.id) || Date.now() - m.createdAt > 2 * 60000 || document.hidden) return;
    seen.add(m.id);
    if (store.isBlocked && store.isBlocked(m.from)) return;
    const d = dataOf(m);
    if (d.sticker) rain({ from: m.from, what: whatOf(d), count: Math.max(1, Number(d.count) || 1) });
  }

  // ---- in the chat: a burst is a pile of the sticker and how many; tapped, it plays again ------------------------

  function lineHTML(m, them) {
    const d = dataOf(m);
    const what = whatOf(d);
    const count = Math.max(1, Number(d.count) || 1);
    const who = m.mine ? 'You' : 'u/' + (them ? them.name : m.from || '');
    const time = new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const pile = count > 1 ? `<span class="bl-pile-back">${art(what, 54)}</span><span class="bl-pile-mid">${art(what, 54)}</span>` : '';
    return (
      `<div class="bl-line ${m.mine ? 'mine' : 'them'}" data-message="${esc(String(m.id))}">` +
      `<button type="button" class="bl-pile" data-bl-replay data-bl='${esc(JSON.stringify({ what, count, from: m.mine ? (them && them.name) || m.to : m.from, mine: !!m.mine }))}' ` +
      `aria-label="${esc(`${who} blasted ${count} × ${labelOf(what)}. Play it again`)}">${pile}<span class="bl-pile-top">${art(what, 62)}</span><b class="bl-count">×${many(count)}</b></button>` +
      `<small class="bl-when">${icon('celebration')}${esc(who)} · ${esc(time)}</small></div>`
    );
  }
  /** a burst in a list of chats: "u/alex blasted 37 stickers" */
  function lineText(m) {
    const d = dataOf(m);
    const count = Math.max(1, Number(d.count) || 1);
    const who = m.mine ? 'You' : m.from ? 'u/' + m.from : 'Someone';
    return count > 1 ? `${who} blasted ${many(count)} stickers` : `${who} blasted a sticker`;
  }
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-bl-replay]');
    if (!b) return;
    try {
      const d = JSON.parse(b.dataset.bl);
      rain({ from: d.from, what: d.what, count: d.count, mine: d.mine });
    } catch (_) {
      /* nothing to play */
    }
  });

  // ---- Settings → Sticker blasts ------------------------------------------------------------------------------

  Nook.hook('settingsSections', (header) =>
    serverHas()
      ? `<section id="blast-settings">${header('softBurst', 'celebration', 'Sticker blasts')}<div class="card setting-card">` +
        '<label class="switch-row"><span class="switch-text"><span>Let friends blast me with stickers</span><small>A friend can throw a burst of a sticker at your profile picture. It’s a line in your chat with them, and if Budgie is open, the stickers fly across your screen.</small></span>' +
        '<input type="checkbox" class="m3-switch" role="switch" id="set-blasts" checked disabled></label>' +
        `<div class="toolbar"><button type="button" class="m3-btn tonal" id="blast-preview">${icon('celebration')}See what a blast looks like</button></div></div></section>`
      : ''
  );
  Nook.hook('settingsMount', async (root) => {
    const box = root.querySelector('#blast-settings');
    if (!box) return;
    const input = box.querySelector('#set-blasts');
    box.querySelector('#blast-preview').addEventListener('click', async () => {
      // one of yours, or else the most popular of what everyone shared
      let s = ((stickers() && stickers().library().stickers) || [])[0];
      if (!s && stickers()) s = ((await stickers().browse({ sort: 'popular' }).catch(() => ({}))).stickers || [])[0];
      if (!s) return M3.snackbar('Make or save a sticker first, then blast a friend with it!');
      rain({ what: { sticker: s.id, name: s.name, gif: s.gif }, count: 24, preview: true });
    });
    try {
      const s = await api.get('/api/blasts/prefs');
      input.checked = s.on !== false;
      input.disabled = false;
    } catch (_) {
      return;
    }
    input.addEventListener('change', async () => {
      const on = input.checked;
      input.disabled = true;
      try {
        await api.put('/api/blasts/prefs', { on });
        fx.haptic(8);
        M3.toast(on ? 'Friends can blast you with stickers' : 'Sticker blasts are off', { symbol: on ? 'celebration' : 'notifications_paused', shape: 'softBurst' });
      } catch (error) {
        input.checked = !on;
        if (app() && app().showError) app().showError(error);
      } finally {
        input.disabled = false;
      }
    });
  });

  Nook.blasts = { open, art, rain, arrived, lineHTML, lineText };
})();
