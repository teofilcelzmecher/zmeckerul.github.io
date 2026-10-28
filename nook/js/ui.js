// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's ui helpers: escaping and markdown-lite, little formatters, avatars and
 * nook icons, the theme engine (one scheme for the app, one per nook for the
 * cards that come from it), sheets, undo toasts and the favicon.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const store = Nook.store;

  // ---- text -------------------------------------------------------------------

  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);

  /** inline markdown on already escaped text */
  function inline(text) {
    const codes = [];
    let s = text.replace(/`([^`]+)`/g, (_, code) => {
      codes.push(code);
      return `\u0000${codes.length - 1}\u0000`;
    });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler" role="button" tabindex="0" aria-label="Spoiler, press to reveal">$1</span>');
    s = s.replace(/(^|[\s(])(n|u)\/([A-Za-z0-9_]{2,24})/g, '$1<a href="#/$2/$3">$2/$3</a>');
    return s.replace(/\u0000(\d+)\u0000/g, (_, index) => `<code>${codes[index]}</code>`);
  }

  /** a small, safe markdown: paragraphs, lists, quotes, bold, italics, code, links, spoilers */
  function md(text) {
    const lines = esc(text || '').replace(/\r/g, '').split('\n');
    const out = [];
    let run = null;
    const flush = () => {
      if (!run) return;
      if (run.kind === 'p') out.push(`<p>${run.items.map(inline).join('<br>')}</p>`);
      else if (run.kind === 'quote') out.push(`<blockquote>${run.items.map(inline).join('<br>')}</blockquote>`);
      else out.push(`<${run.kind}>${run.items.map((item) => `<li>${inline(item)}</li>`).join('')}</${run.kind}>`);
      run = null;
    };
    for (const line of lines) {
      let kind = 'p';
      let content = line;
      if (!line.trim()) {
        flush();
        continue;
      }
      if (/^\s*[-*] /.test(line)) [kind, content] = ['ul', line.replace(/^\s*[-*] /, '')];
      else if (/^\s*\d+[.)] /.test(line)) [kind, content] = ['ol', line.replace(/^\s*\d+[.)] /, '')];
      else if (/^&gt; ?/.test(line)) [kind, content] = ['quote', line.replace(/^&gt; ?/, '')];
      if (!run || run.kind !== kind) {
        flush();
        run = { kind, items: [] };
      }
      run.items.push(content);
    }
    flush();
    return out.join('');
  }

  /** markdown without its marks, for previews and notifications */
  function plain(text, max) {
    let s = String(text || '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\|\|(.+?)\|\|/g, '[spoiler]')
      .replace(/[*`]|^> ?|^\s*[-*] |^\s*\d+[.)] /gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (max && s.length > max) s = s.slice(0, max - 1).replace(/\s+\S*$/, '') + '…';
    return s;
  }

  /** wraps what matches the query in <mark>, on escaped text */
  function highlight(text, query) {
    const safe = esc(text);
    const q = (query || '').trim();
    if (!q) return safe;
    const pattern = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return safe.replace(pattern, (m) => `<mark>${m}</mark>`);
  }

  function ago(time) {
    const s = Math.max(0, (Date.now() - time) / 1000);
    if (s < 45) return 'now';
    if (s < 3600) return Math.round(s / 60) + 'm';
    if (s < 86400) return Math.round(s / 3600) + 'h';
    if (s < 86400 * 7) return Math.round(s / 86400) + 'd';
    if (s < 86400 * 30) return Math.round(s / 86400 / 7) + 'w';
    return new Date(time).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function num(n) {
    const sign = n < 0 ? '-' : '';
    const a = Math.abs(n);
    if (a < 1000) return sign + a;
    if (a < 10000) return sign + (a / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
    if (a < 1e6) return sign + Math.round(a / 1000) + 'k';
    return sign + (a / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  }

  const plural = (n, word, many) => `${num(n)} ${n === 1 ? word : many || word + 's'}`;

  // ---- colour helpers -------------------------------------------------------------

  function luminance(hex) {
    const c = M3.color.parse(hex);
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  const ink = (hex) => (luminance(hex) > 0.36 ? '#1d1b20' : '#ffffff');

  // ---- little pieces of markup ----------------------------------------------------

  // a photo is cut to the avatar's shape by a mask drawn from the same outline
  const masks = new Map();
  function shapeMask(shape) {
    if (!masks.has(shape)) {
      let d = '';
      try {
        d = M3Shapes.path(shape, 100);
      } catch (_) {
        /* an unknown shape leaves the photo square */
      }
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}"/></svg>`;
      masks.set(shape, d ? `url('data:image/svg+xml,${encodeURIComponent(svg)}')` : 'none');
    }
    return masks.get(shape);
  }

  // a picture picked here (data:) or one the server keeps (https://…/api/images/…)
  const PICTURE = /^(?:data:image\/(?:jpeg|png|webp|gif);|https?:\/\/[^"'<>\s]+\/api\/images\/[\w-]+$)/;
  const motionOff = () => document.documentElement.hasAttribute('data-m3-reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * what sits on an avatar's shape: a photo, an icon or the first letter. A GIF picture moves only
   * where it's asked to (moving: profiles and chats), and never when motion is reduced.
   */
  function avatarFace(u, { moving = false } = {}) {
    const photo = moving && u.photoGif && !motionOff() ? u.photoGif : u.photo;
    if (photo && PICTURE.test(photo)) {
      const mask = shapeMask(u.shape);
      return `<img src="${esc(photo)}" alt="" style="-webkit-mask-image:${mask};mask-image:${mask}">`;
    }
    if (u.icon) return `<span class="m3-icon">${esc(u.icon)}</span>`;
    return `<b>${esc((u.name || '?')[0].toUpperCase())}</b>`;
  }

  function avatar(u, size = 32, options) {
    return (
      `<span class="avatar" style="--av:${esc(u.color)};--av-ink:${ink(u.color)};--s:${size}px" aria-hidden="true">` +
      `<m3-shape shape="${esc(u.shape)}"></m3-shape>${avatarFace(u, options)}</span>`
    );
  }

  /** a profile's banner picture (its GIF moves unless motion is reduced), or '' */
  function bannerImage(u) {
    const src = u.bannerGif && !motionOff() ? u.bannerGif : u.banner;
    return src && PICTURE.test(src) ? `<img class="banner-img" src="${esc(src)}" alt="">` : '';
  }

  const PROFILE_ICONS = [
    'pets', 'cruelty_free', 'flutter_dash', 'emoji_nature', 'local_florist', 'eco', 'star', 'favorite',
    'bolt', 'rocket_launch', 'music_note', 'headphones', 'sports_esports', 'palette', 'photo_camera', 'menu_book',
    'coffee', 'icecream', 'sunny', 'nightlight', 'sailing', 'skateboarding', 'sports_soccer', 'code',
  ];

  // the sizes profile pictures and banners are kept at (the server checks the same limits)
  const PICTURE_SIZES = {
    photo: { width: 320, height: 320, gifMax: 2 * 1024 * 1024, maxSide: 1024 },
    banner: { width: 1500, height: 500, gifMax: 4 * 1024 * 1024, maxSide: 2048 },
  };

  /**
   * a picked picture for a profile (kind: 'photo' or 'banner'): { still, gif }. The still is
   * centre-cropped to size as a JPEG (this also drops any location the photo carried); a GIF is
   * kept as it is too, so it can move, and the still (its first frame) shows in feeds.
   */
  function pictureFrom(file, kind) {
    const { width, height, gifMax, maxSide } = PICTURE_SIZES[kind];
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('That file isn’t an image.'));
      const gif = file.type === 'image/gif';
      if (gif && file.size > gifMax) return reject(new Error(`That GIF is too big. Try one under ${gifMax / 1024 / 1024} MB.`));
      if (file.size > 20 * 1024 * 1024) return reject(new Error('That image is too big. Try one under 20 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth, h = img.naturalHeight;
        URL.revokeObjectURL(url);
        if (gif && (w > maxSide || h > maxSide)) return reject(new Error(`That GIF is too large. Try one at most ${maxSide}×${maxSide} pixels.`));
        const scale = Math.max(width / w, height / h);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, (w - width / scale) / 2, (h - height / scale) / 2, width / scale, height / scale, 0, 0, width, height);
        const still = canvas.toDataURL('image/jpeg', 0.85);
        if (!gif) return resolve({ still, gif: '' });
        const reader = new FileReader();
        reader.onload = () => resolve({ still, gif: String(reader.result) });
        reader.onerror = () => reject(new Error('Couldn’t read that GIF.'));
        reader.readAsDataURL(file);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Couldn’t read that image. Try a JPEG, PNG or GIF.'));
      };
      img.src = url;
    });
  }

  function nookIcon(c, size = 24, iconSize = 14, attrs = '') {
    return (
      `<m3-shape-icon shape="${esc(c.shape)}" symbol="${esc(c.symbol)}" size="${size}" icon-size="${iconSize}" ` +
      `style="--m3-shape-icon-color:${esc(c.color)};--m3-shape-icon-on-color:${ink(c.color)}" aria-hidden="true" ${attrs}></m3-shape-icon>`
    );
  }

  const icon = (name, cls = '') => `<span class="m3-icon ${cls}" aria-hidden="true">${name}</span>`;

  // ---- theme ------------------------------------------------------------------------

  const DEFAULT_SEED = '#6750a4';
  const systemDark = matchMedia('(prefers-color-scheme: dark)');
  const VAR_NAMES = () => [...M3.color.ROLES, ...M3.color.DERIVED_ROLES].map((role) => '--m3-' + role.replace(/[A-Z]/g, (l) => '-' + l.toLowerCase()));

  function clearVars(el) {
    for (const name of VAR_NAMES()) el.style.removeProperty(name);
    el.style.colorScheme = '';
  }

  const theme = {
    cache: new Map(),
    token: 0,
    current: null, // the seed the app wears now
    offline: false,

    isDark() {
      const mode = store.state.settings.mode;
      return mode === 'dark' || (mode === 'system' && systemDark.matches);
    },

    scheme(seed, variant = store.state.settings.variant) {
      const key = `${seed}|${this.isDark()}|${variant}`;
      if (!this.cache.has(key)) {
        const promise = M3.color.scheme({ seed, dark: this.isDark(), variant });
        promise.catch(() => {
          this.cache.delete(key);
          this.offline = true;
        });
        this.cache.set(key, promise);
      }
      return this.cache.get(key);
    },

    /** the whole app in one seed's colours (the default seed is baked into m3.css), in a style when given */
    async setRoot(seed, style) {
      const settings = store.state.settings;
      const root = document.documentElement;
      if (settings.mode === 'system') root.removeAttribute('data-m3-theme');
      else root.setAttribute('data-m3-theme', settings.mode);
      root.toggleAttribute('data-m3-reduce-motion', !!settings.reduceMotion);
      const want = (seed || settings.seed).toLowerCase();
      const variant = (seed && style) || settings.variant;
      const token = ++this.token;
      this.current = want;
      if (want === DEFAULT_SEED && variant === 'tonalSpot') {
        clearVars(root);
        this.afterRoot();
        return;
      }
      try {
        const colors = await this.scheme(want, variant);
        if (token !== this.token) return;
        M3.color.apply(colors, root);
        this.afterRoot();
      } catch (_) {
        clearVars(root);
        this.afterRoot();
      }
    },

    afterRoot() {
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue('--m3-background').trim();
    },

    /** one element in a nook's colours; `always` for what stands for the nook itself */
    tint(el, seed, always) {
      if (!seed || (!always && !store.state.settings.tintPosts) || seed.toLowerCase() === this.current) {
        clearVars(el);
        return Promise.resolve();
      }
      return this.scheme(seed.toLowerCase()).then(
        (colors) => el.isConnected && M3.color.apply(colors, el),
        () => {}
      );
    },

    /** settles once every tinted element there wears its colours */
    tintAll(root) {
      const jobs = [];
      for (const el of (root || document).querySelectorAll('[data-tint]')) {
        jobs.push(this.tint(el, el.dataset.tint, el.hasAttribute('data-tint-always')));
      }
      return Promise.all(jobs);
    },

    clearVars,
  };

  // ---- sheets: dialogs that hold a form ---------------------------------------------

  // on a phone a sheet rises from the bottom edge and can be swiped away
  const phone = () => matchMedia('(max-width: 719px)').matches;

  /**
   * a dialog in M3's look that holds anything. `setup(body, close)` fills it;
   * an action's `run(close)` may return false to keep it open.
   */
  let sheets = 0;
  function sheet({ headline = '', symbol = '', shape = 'cookie9', className = '', html = '', setup = null, actions = [] } = {}) {
    return new Promise((resolve) => {
      const el = document.createElement('dialog');
      // each its own title, so a sheet opened over another is named right
      const titleId = 'sheet-title-' + ++sheets;
      el.className = 'm3-dialog sheet ' + className;
      el.innerHTML =
        '<div class="sheet-grip" aria-hidden="true"><span></span></div>' +
        (headline
          ? `<div class="m3-dialog-header">${symbol ? `<m3-shape-icon shape="${shape}" symbol="${symbol}" size="40" icon-size="21" aria-hidden="true"></m3-shape-icon>` : ''}` +
            `<h2 class="m3-title m3-dialog-headline" id="${titleId}">${esc(headline)}</h2></div>`
          : '') +
        `<div class="sheet-body">${html}</div><div class="m3-dialog-actions"></div>`;
      if (headline) el.setAttribute('aria-labelledby', titleId);
      const body = el.querySelector('.sheet-body');
      const row = el.querySelector('.m3-dialog-actions');
      let settled = false;

      const close = (value) => {
        if (settled) return;
        settled = true;
        resolve(value == null ? null : value);
        // a phone's sheet drops back down from wherever a swipe left it
        const fade = phone()
          ? M3.motion.animate(el, [{ transform: el.style.transform || 'none' }, { transform: 'translateY(105%)' }], { duration: 240, ease: 'emphasizedAccel', fill: 'forwards' })
          : M3.motion.animate(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
        try {
          el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: phone() ? 240 : 120, fill: 'forwards', pseudoElement: '::backdrop' });
        } catch (_) {
          /* the scrim just goes */
        }
        const done = () => {
          if (el.open) el.close();
          el.remove();
        };
        // and goes for certain, even if a browser never reports the drop as finished
        if (fade) fade.finished.then(done, done);
        else done();
        setTimeout(done, 400);
      };

      for (const action of actions) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `m3-btn ${action.variant || 'text'}`;
        button.innerHTML = (action.symbol ? icon(action.symbol) : '') + esc(action.label);
        if (action.id) button.id = action.id;
        button.addEventListener('click', () => {
          const result = action.run ? action.run(close, body) : action.value;
          if (result !== false) close(action.run ? result : action.value);
        });
        row.appendChild(button);
      }
      if (!actions.length) row.remove();

      el.addEventListener('cancel', (e) => {
        e.preventDefault();
        close(null);
      });
      // a press on the scrim dismisses, as a sheet should, but not the second half of the double-tap that opened it
      const openedAt = performance.now();
      el.addEventListener('pointerdown', (e) => {
        if (e.target !== el || performance.now() - openedAt < 350) return;
        const r = el.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(null);
      });

      // dragged down by its grip or headline far or fast enough, it goes
      let drag = null;
      el.addEventListener('pointerdown', (e) => {
        if (!phone() || e.button !== 0 || !e.target.closest('.sheet-grip, .m3-dialog-header')) return;
        drag = { y: e.clientY, t: performance.now(), dy: 0, v: 0 };
        el.setPointerCapture(e.pointerId);
      });
      el.addEventListener('pointermove', (e) => {
        if (!drag) return;
        const dy = Math.max(0, e.clientY - drag.y);
        const now = performance.now();
        drag.v = (dy - drag.dy) / Math.max(1, now - drag.t);
        drag.dy = dy;
        drag.t = now;
        el.style.transform = `translateY(${dy}px)`;
      });
      const release = () => {
        if (!drag) return;
        const { dy, v } = drag;
        drag = null;
        if (dy > 120 || v > 0.7) return close(null);
        el.style.transform = '';
        M3.motion.animate(el, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0px)' }], { duration: 420, ease: 'expressiveDefaultSpatial' });
      };
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);

      document.body.appendChild(el);
      if (setup) setup(body, close);
      el.showModal();
      if (phone()) {
        M3.motion.animate(el, [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }], { duration: 420, ease: 'emphasizedDecel' });
      } else {
        M3.motion.animate(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 150 });
        M3.motion.animate(el, [{ transform: 'scale(0.92)' }, { transform: 'scale(1)' }], { duration: 380, ease: 'expressiveFastSpatial' });
      }
      try {
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, pseudoElement: '::backdrop' });
      } catch (_) {
        /* the scrim just appears */
      }
      // on a phone the keyboard only comes up when you tap a box, unless a sheet is all about typing
      const first = phone() ? body.querySelector('[autofocus]') : body.querySelector('[autofocus], input:not([type=hidden]), textarea');
      if (first) first.focus();
      else if (phone() && document.activeElement && document.activeElement.matches('input, textarea')) {
        // opening a dialog focuses its first box by itself: the sheet takes focus instead
        el.tabIndex = -1;
        el.focus({ preventScroll: true });
      }
    });
  }

  // ---- undo toast ------------------------------------------------------------------------

  let undoEl = null;
  function undoToast(text, onUndo, { symbol = 'undo', timeout = 6000 } = {}) {
    if (undoEl) undoEl.remove();
    let host = document.querySelector('.nook-toaster');
    if (!host) {
      host = document.createElement('div');
      host.className = 'nook-toaster';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'undo-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `${icon(symbol)}<span class="undo-text">${esc(text)}</span><button type="button" class="m3-btn text small">Undo</button>`;
    host.appendChild(el);
    undoEl = el;
    M3.motion.animate(el, [{ opacity: 0, transform: 'translateY(16px) scale(.94)' }, { opacity: 1, transform: 'none' }], { duration: 380, ease: 'expressiveFastSpatial' });
    let timer = 0;
    const go = () => {
      clearTimeout(timer);
      if (undoEl === el) undoEl = null;
      const out = M3.motion.animate(el, [{ opacity: 1 }, { opacity: 0, transform: 'scale(.94)' }], { duration: 180, fill: 'forwards' });
      if (out) out.finished.then(() => el.remove(), () => el.remove());
      else el.remove();
    };
    el.querySelector('button').addEventListener('click', () => {
      onUndo();
      go();
    });
    timer = setTimeout(go, timeout);
    return { close: go };
  }

  // ---- clipboard ------------------------------------------------------------------------

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand('copy');
      } catch (__) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }

  const linkTo = (hash) => location.href.split('#')[0] + hash;

  // ---- favicon: the shape the brand wears, in its colour -------------------------------------

  function favicon(shape, color) {
    const link = document.querySelector('link[rel="icon"]');
    if (!link || !window.M3Shapes) return;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${M3Shapes.path(shape)}" fill="${color}"/></svg>`;
    link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
  }

  // ---- pickers' palettes ---------------------------------------------------------------------

  const SEEDS = ['#6750a4', '#e8467c', '#ff8a3d', '#b98c00', '#1db954', '#00a6a6', '#3d7bff', '#8b5cf6', '#c2185b', '#5f7d95'];
  const SEED_SHAPES = ['cookie9', 'heart', 'sunny', 'clover4', 'flower', 'puffy', 'gem', 'softBurst', 'cookie6', 'ghostish'];
  const NOOK_SYMBOLS = [
    'forum', 'potted_plant', 'music_note', 'restaurant', 'code', 'rocket_launch', 'sports_esports', 'directions_bike',
    'menu_book', 'brush', 'photo_camera', 'flight', 'pets', 'fitness_center', 'movie', 'science', 'eco', 'school',
    'coffee', 'park', 'sailing', 'castle', 'icecream', 'theater_comedy',
  ];

  // the fonts someone can pick for their name: [id, what it's called]. The files (fonts/name-*.woff2) only have
  // the characters a username can, and a browser only fetches the ones on screen
  const NAME_FONTS = [
    ['', 'Budgie'], ['rounded', 'Rounded'], ['hand', 'Handwritten'], ['serif', 'Fancy'], ['pixel', 'Pixel'],
    ['mono', 'Typewriter'], ['sign', 'Sign'], ['script', 'Script'], ['comic', 'Comic'],
  ];
  const FONT_IDS = new Set(NAME_FONTS.map(([id]) => id).filter(Boolean));
  /** the class that draws someone's name in the font they picked (' name-font-pixel'), or '' */
  const nameFont = (u) => (u && FONT_IDS.has(u.font) ? ' name-font-' + u.font : '');

  // pride flags someone can wear next to their name: [id, name, stripes from the top (a colour, or
  // [colour, share]), what's drawn over them]. Drawn here as tiny SVGs, so they're sharp at any size.
  // (No Progress flag: its designer licenses it for non-commercial use only, and Budgie has ads.)
  const RAINBOW = ['#e40303', '#ff8c00', '#ffed00', '#008026', '#24408e', '#732982'];
  const PRIDE_FLAGS = [
    ['rainbow', 'Rainbow', RAINBOW],
    ['philly', 'Philadelphia', ['#000000', '#784f17', ...RAINBOW]],
    ['trans', 'Transgender', ['#5bcefa', '#f5a9b8', '#ffffff', '#f5a9b8', '#5bcefa']],
    ['bi', 'Bisexual', [['#d60270', 2], ['#9b4f96', 1], ['#0038a8', 2]]],
    ['pan', 'Pansexual', ['#ff218c', '#ffd800', '#21b1ff']],
    ['lesbian', 'Lesbian', ['#d52d00', '#ff9a56', '#ffffff', '#d362a4', '#a30262']],
    ['gay', 'Gay', ['#078d70', '#26ceaa', '#98e8c1', '#ffffff', '#7bade2', '#5049cc', '#3d1a78']],
    ['nonbinary', 'Non-binary', ['#fcf434', '#ffffff', '#9c59d1', '#2c2c2c']],
    ['ace', 'Asexual', ['#000000', '#a3a3a3', '#ffffff', '#800080']],
    ['aro', 'Aromantic', ['#3da542', '#a7d379', '#ffffff', '#a9a9a9', '#000000']],
    ['aroace', 'Aroace', ['#e28c00', '#eccd00', '#ffffff', '#62aedc', '#203856']],
    ['genderfluid', 'Genderfluid', ['#ff76a4', '#ffffff', '#c011d7', '#000000', '#2f3cbe']],
    ['genderqueer', 'Genderqueer', ['#b57edc', '#ffffff', '#4a8123']],
    ['agender', 'Agender', ['#000000', '#bcc4c7', '#ffffff', '#b7f684', '#ffffff', '#bcc4c7', '#000000']],
    ['demisexual', 'Demisexual', [['#ffffff', 5], ['#6e0070', 2], ['#d2d2d2', 5]], 'demi'],
    ['intersex', 'Intersex', ['#ffd800'], 'intersex'],
    ['polysexual', 'Polysexual', ['#f61cb9', '#07d569', '#1c92f6']],
    ['omnisexual', 'Omnisexual', ['#fe9ace', '#ff53bf', '#200044', '#6760fe', '#8ea6ff']],
    ['demigirl', 'Demigirl', ['#7f7f7f', '#c4c4c4', '#fdadc8', '#ffffff', '#fdadc8', '#c4c4c4', '#7f7f7f']],
    ['demiboy', 'Demiboy', ['#7f7f7f', '#c4c4c4', '#9dd7ea', '#ffffff', '#9dd7ea', '#c4c4c4', '#7f7f7f']],
  ];
  const FLAGS = new Map(PRIDE_FLAGS.map((f) => [f[0], f]));
  const flagSVGs = new Map();
  /** a flag drawn 30 × 20: its stripes, then a triangle or ring where it has one */
  function flagSVG(id) {
    if (flagSVGs.has(id)) return flagSVGs.get(id);
    const [, , stripes, extra] = FLAGS.get(id);
    const parts = stripes.map((s) => (Array.isArray(s) ? s : [s, 1]));
    const total = parts.reduce((sum, [, share]) => sum + share, 0);
    const n = (x) => +x.toFixed(2);
    let y = 0;
    let svg = '';
    for (const [color, share] of parts) {
      const h = (20 * share) / total;
      svg += `<rect y="${n(y)}" width="30" height="${n(h + 0.1)}" fill="${color}"/>`;
      y += h;
    }
    if (extra === 'demi') svg += '<polygon points="0,0 11,10 0,20" fill="#000000"/>';
    if (extra === 'intersex') svg += '<circle cx="15" cy="10" r="4.6" fill="none" stroke="#7902aa" stroke-width="1.9"/>';
    const out = `<svg viewBox="0 0 30 20" preserveAspectRatio="none" aria-hidden="true" focusable="false">${svg}</svg>`;
    flagSVGs.set(id, out);
    return out;
  }
  /** someone's pride flag, small, after their name; '' without one */
  function prideFlag(u) {
    const flag = u && FLAGS.get(u.flag);
    if (!flag) return '';
    return `<span class="pride-flag" role="img" aria-label="${flag[1]} flag" title="${flag[1]} flag">${flagSVG(flag[0])}</span>`;
  }

  // what someone can say they're into, on their profile: [id, label, symbol]
  const INTERESTS = [
    ['gaming', 'Gaming', 'sports_esports'], ['music', 'Music', 'music_note'], ['art', 'Art', 'palette'], ['drawing', 'Drawing', 'draw'],
    ['photography', 'Photography', 'photo_camera'], ['books', 'Books', 'menu_book'], ['writing', 'Writing', 'edit_note'], ['movies', 'Movies', 'movie'],
    ['anime', 'Anime', 'animation'], ['science', 'Science', 'science'], ['space', 'Space', 'rocket_launch'], ['coding', 'Coding', 'code'],
    ['sports', 'Sports', 'sports_soccer'], ['fitness', 'Fitness', 'fitness_center'], ['cooking', 'Cooking', 'restaurant'], ['baking', 'Baking', 'bakery_dining'],
    ['plants', 'Plants', 'potted_plant'], ['animals', 'Animals', 'pets'], ['travel', 'Travel', 'flight'], ['nature', 'Nature', 'forest'],
    ['fashion', 'Fashion', 'checkroom'], ['dance', 'Dance', 'nightlife'], ['theatre', 'Theatre', 'theater_comedy'], ['languages', 'Languages', 'translate'],
  ];
  const INTERESTS_MAX = 6;

  // the colour styles Material 3 builds a scheme in, for someone's profile page: [id, name]
  const PROFILE_SCHEMES = [
    ['tonalSpot', 'Tonal spot'], ['vibrant', 'Vibrant'], ['expressive', 'Expressive'], ['fidelity', 'Fidelity'], ['content', 'Content'],
    ['rainbow', 'Rainbow'], ['fruitSalad', 'Fruit salad'], ['neutral', 'Neutral'], ['monochrome', 'Monochrome'],
  ];

  Nook.ui = {
    esc, md, plain, highlight, ago, num, plural, ink, avatar, avatarFace, bannerImage, motionOff, PROFILE_ICONS, pictureFrom, nookIcon, icon, theme, sheet,
    NAME_FONTS, nameFont, PRIDE_FLAGS, prideFlag, flagSVG, INTERESTS, INTERESTS_MAX, PROFILE_SCHEMES,
    undoToast, copy, linkTo, favicon, SEEDS, SEED_SHAPES, NOOK_SYMBOLS, DEFAULT_SEED, systemDark,
  };
})();
