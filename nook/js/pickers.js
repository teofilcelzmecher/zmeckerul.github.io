// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Pickers for what goes into a message: emoji (a popover, mostly for computers, whose keyboards have none),
 * GIFs from KLIPY's search (once the server's owner has turned it on), and pictures from the device, which are
 * made smaller here before they're sent. And a viewer that opens a picture from a chat full size.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  if (Nook.pickers) return;
  const store = Nook.store;
  const ui = Nook.ui;
  const fx = Nook.fx;
  const { esc, icon } = ui;

  const remember = {
    get(key, fallback) {
      try {
        return JSON.parse(localStorage.getItem(key)) || fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (_) {
        /* a private window may refuse; the picker just won't remember */
      }
    },
  };

  // ---- emoji ----------------------------------------------------------------------------------------------

  let emojiData = null;
  /** the list, loaded the first time it's wanted (js/emoji.js, about 40 KB) */
  function loadEmoji() {
    if (!emojiData) {
      emojiData = new Promise((resolve, reject) => {
        if (window.NOOK_EMOJI) return resolve(window.NOOK_EMOJI);
        const script = document.createElement('script');
        script.src = 'js/emoji.js';
        script.onload = () => resolve(window.NOOK_EMOJI);
        script.onerror = () => {
          emojiData = null;
          reject(new Error('Couldn’t load the emoji. Check your connection and try again.'));
        };
        document.head.appendChild(script);
      }).then((groups) => groups.map(([name, symbol, list]) => ({ name, symbol, items: list.split(';').map((pair) => pair.split('|')) })));
    }
    return emojiData;
  }
  const RECENT = 'nook-emoji-recent';

  let openPicker = null;
  function closePicker() {
    if (openPicker) openPicker();
    openPicker = null;
  }

  /** a card of emoji next to `anchor`; each one picked goes to onPick, and it stays open for more */
  async function emoji(anchor, onPick) {
    if (openPicker && openPicker.anchor === anchor) return closePicker();
    closePicker();
    let groups;
    try {
      groups = await loadEmoji();
    } catch (error) {
      return M3.snackbar(error.message);
    }
    const recent = remember.get(RECENT, []);
    const el = document.createElement('div');
    el.className = 'emoji-picker';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'Emoji');
    const tab = (id, symbol, label) => `<button type="button" class="m3-icon-btn small" data-jump="${id}" aria-label="${esc(label)}" data-tooltip="${esc(label)}">${icon(symbol)}</button>`;
    const section = (id, label, items) =>
      `<section id="ep-${id}" data-group="${id}"><h4>${esc(label)}</h4><div class="ep-row">${items.map(([e, name]) => `<button type="button" data-emoji="${esc(e)}" title="${esc(name)}" aria-label="${esc(name)}">${e}</button>`).join('')}</div></section>`;
    const named = new Map(groups.flatMap((g) => g.items));
    el.innerHTML =
      '<input class="m3-field ep-search" type="search" placeholder="Search emoji" aria-label="Search emoji" autocomplete="off">' +
      `<div class="ep-tabs">${recent.length ? tab('recent', 'history', 'Recent') : ''}${groups.map((g, i) => tab(i, g.symbol, g.name)).join('')}</div>` +
      '<div class="ep-grid">' +
      (recent.length ? section('recent', 'Recent', recent.map((e) => [e, named.get(e) || e])) : '') +
      groups.map((g, i) => section(i, g.name, g.items)).join('') +
      '<p class="ep-none muted" hidden>No emoji found.</p></div>';
    document.body.appendChild(el);

    // beside its button: above it if there's room, and never off the screen
    const place = () => {
      const r = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left - 8)) + 'px';
      el.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : Math.min(innerHeight - h - 8, r.bottom + 8)) + 'px';
    };
    place();
    fx.play(el, [{ opacity: 0, transform: 'translateY(8px) scale(0.96)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });

    const grid = el.querySelector('.ep-grid');
    const search = el.querySelector('.ep-search');
    el.addEventListener('click', (e) => {
      const jump = e.target.closest('[data-jump]');
      if (jump) {
        search.value = '';
        filter();
        const target = el.querySelector(`#ep-${jump.dataset.jump}`);
        grid.scrollTo({ top: target.offsetTop - grid.offsetTop, behavior: fx.reduced() ? 'auto' : 'smooth' });
        return;
      }
      const b = e.target.closest('[data-emoji]');
      if (!b) return;
      const picked = b.dataset.emoji;
      remember.set(RECENT, [picked, ...remember.get(RECENT, []).filter((x) => x !== picked)].slice(0, 24));
      onPick(picked);
      fx.pop(b, 0.7);
    });
    // search by name, every word
    const filter = () => {
      const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
      let any = false;
      for (const sec of grid.querySelectorAll('section')) {
        let shown = 0;
        for (const b of sec.querySelectorAll('[data-emoji]')) {
          const hit = !words.length || words.every((w) => b.title.toLowerCase().includes(w));
          b.hidden = !hit;
          if (hit) shown++;
        }
        // while searching, recent emoji would only show twice
        sec.hidden = !shown || (words.length && sec.dataset.group === 'recent');
        any = any || (!sec.hidden && shown > 0);
      }
      grid.querySelector('.ep-none').hidden = any;
    };
    search.addEventListener('input', filter);
    search.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const first = grid.querySelector('section:not([hidden]) [data-emoji]:not([hidden])');
      if (first) first.click();
    });
    if (matchMedia('(hover: hover)').matches) search.focus({ preventScroll: true });

    const outside = (e) => !el.contains(e.target) && !anchor.contains(e.target) && closePicker();
    const keys = (e) => e.key === 'Escape' && (closePicker(), anchor.focus());
    setTimeout(() => document.addEventListener('pointerdown', outside, true));
    document.addEventListener('keydown', keys);
    addEventListener('resize', place);
    openPicker = () => {
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', keys);
      removeEventListener('resize', place);
      el.remove();
    };
    openPicker.anchor = anchor;
  }

  /** puts text where a text box's cursor is, as if it had been typed */
  function insertAt(field, text) {
    const start = field.selectionStart ?? field.value.length;
    const end = field.selectionEnd ?? field.value.length;
    field.setRangeText(text, start, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.focus({ preventScroll: true });
  }

  // ---- GIFs, from KLIPY ----------------------------------------------------------------------------------------
  // KLIPY asks that searches come straight from the app, with its media loaded from its own links, in the order it
  // gives them, and that the search box says "Search KLIPY". Its safest content filter is always asked for.

  const KLIPY = 'https://api.klipy.com/api/v1/';
  const gifsOn = () => !!store.state.gifs;
  function klipyUrl(path, params) {
    const q = new URLSearchParams(Object.assign({ per_page: '24', content_filter: 'high' }, params));
    const region = (navigator.language || '').split('-')[1];
    if (region) q.set('locale', region.toLowerCase());
    return `${KLIPY}${encodeURIComponent(store.state.gifs)}/gifs/${path}?${q}`;
  }
  /** the file to show at a size, in the lightest format there is */
  const fileOf = (item, size, formats = ['webp', 'gif']) => {
    const sizes = (item.file || {})[size] || {};
    for (const f of formats) if (sizes[f] && sizes[f].url) return sizes[f];
    return null;
  };

  /** a sheet to find a GIF in; resolves with what to send ({ url, still, width, height, title }) or null */
  function gif() {
    if (!gifsOn()) return Promise.resolve(null);
    let page = 1;
    let query = '';
    let loading = false;
    let more = true;
    let token = 0;
    return ui.sheet({
      headline: 'GIFs',
      symbol: 'gif_box',
      shape: 'sunny',
      className: 'wide gif-sheet',
      html:
        '<input class="m3-field gif-search" type="search" placeholder="Search KLIPY" aria-label="Search KLIPY" autocomplete="off" enterkeyhint="search">' +
        '<div class="gif-grid" aria-live="polite"></div><div class="gif-more"></div>' +
        '<p class="gif-credit">Powered by KLIPY</p>',
      setup(body, close) {
        const grid = body.querySelector('.gif-grid');
        const status = body.querySelector('.gif-more');
        const input = body.querySelector('.gif-search');
        const still = ui.motionOff ? ui.motionOff() : fx.reduced();
        async function load(reset) {
          if (reset) {
            page = 1;
            more = true;
            grid.innerHTML = '';
          }
          if (loading || !more) return;
          loading = true;
          const mine = ++token;
          status.innerHTML = '<m3-loading aria-label="Loading GIFs"></m3-loading>';
          try {
            const res = await fetch(query ? klipyUrl('search', { q: query, page }) : klipyUrl('trending', { page }), { referrerPolicy: 'no-referrer' });
            const json = await res.json();
            if (mine !== token) return;
            if (!res.ok || json.result === false) throw new Error();
            const data = (json.data && json.data.data) || [];
            more = !!(json.data && json.data.has_next) && data.length > 0;
            page++;
            grid.insertAdjacentHTML(
              'beforeend',
              data
                .map((item, i) => {
                  const preview = still ? fileOf(item, 'sm', ['jpg']) : fileOf(item, 'sm');
                  if (!preview) return '';
                  return `<button type="button" class="gif-item" data-i="${grid.children.length + i}" aria-label="${esc(item.title || 'GIF')}"><img src="${esc(preview.url)}" alt="" loading="lazy" referrerpolicy="no-referrer" style="aspect-ratio:${preview.width}/${preview.height}"></button>`;
                })
                .join('')
            );
            grid._items = (grid._items || []).concat(data);
            status.innerHTML = !grid.children.length ? `<p class="muted">${query ? `No GIFs for “${esc(query)}”.` : 'No GIFs right now.'}</p>` : '';
          } catch (_) {
            if (mine === token) status.innerHTML = '<p class="muted">Couldn’t reach KLIPY. Try again in a moment.</p>';
          } finally {
            if (mine === token) loading = false;
          }
        }
        let typing = 0;
        input.addEventListener('input', () => {
          clearTimeout(typing);
          typing = setTimeout(() => {
            query = input.value.trim();
            loading = false;
            load(true);
          }, 450);
        });
        grid.addEventListener('click', (e) => {
          const b = e.target.closest('.gif-item');
          if (!b) return;
          const item = grid._items[Number(b.dataset.i)];
          const file = fileOf(item, 'md') || fileOf(item, 'sm');
          const jpg = fileOf(item, 'md', ['jpg']) || fileOf(item, 'sm', ['jpg']);
          if (!file) return;
          close({ url: file.url, still: jpg ? jpg.url : '', width: file.width, height: file.height, title: item.title || '' });
        });
        // more as you scroll to the end
        body.addEventListener('scroll', () => body.scrollTop + body.clientHeight > body.scrollHeight - 300 && load(false), { passive: true });
        load(true);
        if (matchMedia('(hover: hover)').matches) setTimeout(() => input.focus(), 60);
      },
      actions: [{ label: 'Cancel', value: null }],
    });
  }

  // ---- pictures from the device ----------------------------------------------------------------------------

  const PICTURE_SIDE = 1600; // photos are made this small at most (which also drops hidden details such as location)
  const GIF_MAX = 4 * 1024 * 1024;

  /** a picture file, ready to send: { image (a data URL), width, height, gif } */
  function readPicture(file) {
    return new Promise((resolve, reject) => {
      // some phones' galleries give a photo no type at all: then whether it opens as a picture decides
      if (!file || (file.type && !/^image\//.test(file.type))) return reject(new Error('That file isn’t a picture.'));
      const gif = file.type === 'image/gif';
      if (gif && file.size > GIF_MAX) return reject(new Error('That GIF is too big. Try one under 4 MB.'));
      if (file.size > 30 * 1024 * 1024) return reject(new Error('That picture is too big. Try one under 30 MB.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (gif) {
          if (w > PICTURE_SIDE || h > PICTURE_SIDE) return reject(new Error(`That GIF is too large. Try one at most ${PICTURE_SIDE}×${PICTURE_SIDE} pixels.`));
          const reader = new FileReader();
          reader.onload = () => resolve({ image: String(reader.result), width: w, height: h, gif: true });
          reader.onerror = () => reject(new Error('Couldn’t read that GIF.'));
          return reader.readAsDataURL(file);
        }
        const scale = Math.min(1, PICTURE_SIDE / Math.max(w, h));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        // a see-through PNG gets a white background, as JPEG has none
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve({ image: canvas.toDataURL('image/jpeg', 0.85), width: canvas.width, height: canvas.height, gif: false });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Couldn’t read that picture. Try a JPEG, PNG or GIF.'));
      };
      img.src = url;
    });
  }

  // ---- seeing a picture full size ----------------------------------------------------------------------------

  function view(src, label = 'Picture') {
    const el = document.createElement('dialog');
    el.className = 'media-viewer';
    el.setAttribute('aria-label', label);
    el.innerHTML =
      `<img src="${esc(src)}" alt="${esc(label)}" referrerpolicy="no-referrer">` +
      `<button type="button" class="m3-icon-btn media-close" aria-label="Close" data-tooltip="Close">${icon('close')}</button>`;
    document.body.appendChild(el);
    el.showModal();
    const shut = () => {
      const out = fx.play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
      fx.settled(out).then(() => el.remove());
    };
    el.addEventListener('click', (e) => (e.target === el || e.target.closest('.media-close')) && shut());
    el.addEventListener('cancel', (e) => {
      e.preventDefault();
      shut();
    });
    fx.play(el.querySelector('img'), [{ opacity: 0, transform: 'scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
  }

  Nook.pickers = { emoji, closeEmoji: closePicker, insertAt, gif, gifsOn, readPicture, view };
})();
