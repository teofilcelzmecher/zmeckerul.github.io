/*
 * Nook's ui helpers: escaping and markdown-lite, little formatters, avatars and
 * nook icons, the theme engine (one scheme for the app, one per nook for the
 * cards that come from it), sheets, undo toasts and the favicon.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const store = Nook.store;
  const MIN = 60000;

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

  function duration(minutes) {
    const m = Math.round(Math.abs(minutes));
    if (m < 60) return m + 'm';
    if (m < 1440) return Math.floor(m / 60) + 'h' + (m % 60 ? ' ' + (m % 60) + 'm' : '');
    const d = Math.floor(m / 1440);
    const h = Math.floor((m % 1440) / 60);
    return d + 'd' + (h ? ' ' + h + 'h' : '');
  }

  /** where an event is: upcoming, live or over, and what to say about it */
  function eventStatus(ev) {
    const start = store.BOOT + ev.inMinutes * MIN;
    const end = start + ev.minutes * MIN;
    const now = Date.now();
    if (now < start) return { live: false, over: false, start, text: 'in ' + duration((start - now) / MIN) };
    if (now < end) return { live: true, over: false, start, text: 'Live now · ' + duration((end - now) / MIN) + ' left' };
    return { live: false, over: true, start, text: 'Ended' };
  }

  // ---- colour helpers -------------------------------------------------------------

  function luminance(hex) {
    const c = M3.color.parse(hex);
    const lin = (v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }
  const ink = (hex) => (luminance(hex) > 0.36 ? '#1d1b20' : '#ffffff');

  // ---- little pieces of markup ----------------------------------------------------

  function avatar(u, size = 32) {
    return (
      `<span class="avatar" style="--av:${esc(u.color)};--av-ink:${ink(u.color)};--s:${size}px" aria-hidden="true">` +
      `<m3-shape shape="${esc(u.shape)}"></m3-shape><b>${esc((u.name || '?')[0].toUpperCase())}</b></span>`
    );
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

    scheme(seed) {
      const { variant } = store.state.settings;
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

    /** the whole app in one seed's colours (the default seed is baked into m3.css) */
    async setRoot(seed) {
      const settings = store.state.settings;
      const root = document.documentElement;
      if (settings.mode === 'system') root.removeAttribute('data-m3-theme');
      else root.setAttribute('data-m3-theme', settings.mode);
      root.toggleAttribute('data-m3-reduce-motion', !!settings.reduceMotion);
      const want = (seed || settings.seed).toLowerCase();
      const token = ++this.token;
      this.current = want;
      if (want === DEFAULT_SEED && settings.variant === 'tonalSpot') {
        clearVars(root);
        this.afterRoot();
        return;
      }
      try {
        const colors = await this.scheme(want);
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
  function sheet({ headline = '', symbol = '', shape = 'cookie9', className = '', html = '', setup = null, actions = [] } = {}) {
    return new Promise((resolve) => {
      const el = document.createElement('dialog');
      el.className = 'm3-dialog sheet ' + className;
      el.innerHTML =
        '<div class="sheet-grip" aria-hidden="true"><span></span></div>' +
        (headline
          ? `<div class="m3-dialog-header">${symbol ? `<m3-shape-icon shape="${shape}" symbol="${symbol}" size="40" icon-size="21" aria-hidden="true"></m3-shape-icon>` : ''}` +
            `<h2 class="m3-title m3-dialog-headline" id="sheet-title">${esc(headline)}</h2></div>`
          : '') +
        `<div class="sheet-body">${html}</div><div class="m3-dialog-actions"></div>`;
      if (headline) el.setAttribute('aria-labelledby', 'sheet-title');
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
        if (fade) fade.finished.then(done, done);
        else done();
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
      // a press on the scrim dismisses, as a sheet should
      el.addEventListener('pointerdown', (e) => {
        if (e.target !== el) return;
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
      const first = body.querySelector('[autofocus], input:not([type=hidden]), textarea');
      if (first) first.focus();
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

  Nook.ui = {
    esc, md, plain, highlight, ago, num, plural, duration, eventStatus, ink, avatar, nookIcon, icon, theme, sheet,
    undoToast, copy, linkTo, favicon, SEEDS, SEED_SHAPES, NOOK_SYMBOLS, DEFAULT_SEED, systemDark,
  };
})();
