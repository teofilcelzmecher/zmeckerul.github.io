// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Stickers and custom emojis (Budgie 1.4), in the app.
 *
 * Making one: a picture (PNG, JPEG, WebP or GIF) → the crop tool → a sheet where a still picture can be cut to one
 * of Budgie's shapes and given a white sticker edge → a name → the server checks it like a profile picture. A GIF
 * keeps moving: the server cuts it to the part picked and re-makes it, frame by frame.
 *
 * Using them: the sticker button beside GIFs in a chat opens your stickers (one tap sends one) and your emojis
 * (one tap puts it in what you're writing). Typing :name: of one of your emojis anywhere you write (chats,
 * comments, posts) shows it as you type and becomes the token <:name:ID> when it's sent, which everyone sees as
 * the picture, the size of the words (bigger when it's all a message says). On a computer the emoji picker has
 * a Yours tab too. Tap anyone's sticker or emoji to see it big, save it, or report it.
 *
 * What it hands the rest of the app (Nook.stickers): emojiHTML (ui.md draws tokens with it), jumbo, mediaHTML,
 * popIn, menuRows and menuAction (views.js, for chats), pick (the chat's sticker button), pickerSection (the
 * emoji picker's Yours tab), make, open, info, load.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const store = Nook.store;
  const api = Nook.api;
  const ui = Nook.ui;
  const fx = Nook.fx;
  const { esc, icon } = ui;

  const MAX = { emoji: 50, sticker: 50 };
  const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';
  const GIF_MAX = 8 * 1024 * 1024;
  const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
  const TOKEN = /<:([a-z0-9_]{2,32}):([A-Za-z0-9]{6,16})>/g;
  const HAS_TOKEN = /<:[a-z0-9_]{2,32}:[A-Za-z0-9]{6,16}>/;
  // the cut-out shapes a still sticker can take (Budgie's own, from M3)
  const SHAPES = [
    ['none', 'As it is'], ['circle', 'Circle'], ['square', 'Rounded'], ['cookie9', 'Cookie'], ['sunny', 'Sunny'],
    ['heart', 'Heart'], ['flower', 'Flower'], ['clover4', 'Clover'], ['softBurst', 'Burst'], ['gem', 'Gem'],
  ];
  const calm = () => fx.reduced() || document.body.classList.contains('calm');
  const stillOnly = () => (ui.motionOff ? ui.motionOff() : fx.reduced());
  const hover = () => matchMedia('(hover: hover)').matches;
  const imageUrl = (id, still = false) => api.url(`/api/stickers/${id}/image`) + (still ? '?still=1' : '');
  const srcOf = (s) => s.local || imageUrl(s.id, stillOnly() && !!s.gif);
  const label = (s) => (s.kind === 'emoji' ? `:${s.name}:` : s.name || 'Sticker');
  const word = (kind) => (kind === 'emoji' ? 'emoji' : 'sticker');

  // ---- your library: what you made and saved, kept on this device too so it opens at once ---------------------

  const lib = { emojis: [], stickers: [], max: MAX, loaded: false };
  const meKey = () => 'nook-stickers-' + String((store.state.me && store.state.me.name) || '').toLowerCase();
  const RECENT = 'nook-stickers-recent';
  const local = {
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
        /* a private window may refuse: the library is just fetched again next time */
      }
    },
  };
  Object.assign(lib, local.get(meKey(), {}), { loaded: false });
  const listeners = new Set();
  function changed() {
    local.set(meKey(), { emojis: lib.emojis, stickers: lib.stickers, max: lib.max });
    for (const fn of [...listeners]) fn();
  }
  // a server from before 1.4 has no stickers: the app then doesn't offer them (it asks again each time it opens)
  const OFF = 'nook-stickers-off';
  let off = local.get(OFF, false) === true;
  const available = () => api.signedIn() && !off;
  let loading = null;
  /** your library from the server (the picker shows what this device knew meanwhile) */
  function load() {
    if (!api.signedIn() || !store.state.me) return Promise.resolve(lib);
    if (!loading) {
      loading = api
        .get('/api/stickers')
        .then((r) => {
          lib.emojis = r.emojis || [];
          lib.stickers = r.stickers || [];
          lib.max = r.max || MAX;
          lib.loaded = true;
          if (off) local.set(OFF, (off = false));
          changed();
          return lib;
        })
        .catch((error) => {
          if (error.status === 404 && !off) local.set(OFF, (off = true));
          throw error;
        })
        .finally(() => (loading = null));
    }
    return loading;
  }
  const listOf = (kind) => (kind === 'emoji' ? lib.emojis : lib.stickers);
  const byId = (id) => lib.emojis.find((e) => e.id === id) || lib.stickers.find((s) => s.id === id) || null;
  const emojiNamed = (name) => lib.emojis.find((e) => e.name === name) || null;
  function keep(s) {
    const list = listOf(s.kind);
    const at = list.findIndex((x) => x.id === s.id);
    if (at >= 0) list[at] = s;
    else list.unshift(s);
    changed();
  }
  function forget(id) {
    lib.emojis = lib.emojis.filter((x) => x.id !== id);
    lib.stickers = lib.stickers.filter((x) => x.id !== id);
    changed();
  }
  /** the ones used most lately first, then the newest */
  function ordered(kind) {
    const recent = local.get(RECENT, []);
    const rank = (s) => {
      const i = recent.indexOf(s.id);
      return i < 0 ? 1e6 : i;
    };
    return listOf(kind)
      .map((s, i) => [s, i])
      .sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1])
      .map(([s]) => s);
  }
  const used = (id) => local.set(RECENT, [id, ...local.get(RECENT, []).filter((x) => x !== id)].slice(0, 60));

  // ---- custom emoji in words ----------------------------------------------------------------------------------

  const gone = new Set(); // ones found missing (deleted or taken down) since the app opened
  /** an emoji token, drawn the size of the words around it (ui.md calls this) */
  function emojiHTML(name, id) {
    if (gone.has(id)) return `<span class="cemoji-gone" translate="no" title="This emoji isn’t there any more">:${esc(name)}:</span>`;
    return (
      `<img class="cemoji" src="${esc(imageUrl(id, stillOnly()))}" alt=":${esc(name)}:" title=":${esc(name)}:" data-cemoji="${esc(id)}" data-name="${esc(name)}"` +
      ' translate="no" draggable="false" loading="lazy" decoding="async">'
    );
  }

  /** whether a message is only emojis (custom ones among them), up to three: then it's drawn big */
  function jumbo(text) {
    const t = String(text || '').trim();
    if (!HAS_TOKEN.test(t)) return false;
    const rest = t.replace(TOKEN, '');
    if (rest.replace(/[\s\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Variation_Selector}\p{Join_Control}]/gu, '')) return false;
    return (t.match(TOKEN) || []).length + (rest.match(/\p{Extended_Pictographic}/gu) || []).length <= 3;
  }

  // what you type says :name:, and what's sent says <:name:ID>: code in backticks, and tokens already there, stay
  const PIECES = /(`[^`\n]*`)|<:[a-z0-9_]{2,32}:[A-Za-z0-9]{6,16}>|:([a-z0-9_]{2,32}):/g;
  function toTokens(text) {
    if (!lib.emojis.length || !text) return text;
    return String(text).replace(PIECES, (m, code, name) => {
      if (code || !name) return m;
      const e = emojiNamed(name);
      return e ? `<:${e.name}:${e.id}>` : m;
    });
  }
  /** and back, for something being edited (only your own emojis: anyone else's stays a token, so it still shows) */
  function toNames(text) {
    if (!text || !HAS_TOKEN.test(text)) return text;
    return String(text).replace(TOKEN, (m, name, id) => {
      const e = lib.emojis.find((x) => x.id === id);
      return e ? `:${e.name}:` : m;
    });
  }

  // ---- stickers in chats ----------------------------------------------------------------------------------------

  /** a sticker message: big, without a bubble. One that was deleted or taken down shows [sticker] */
  function mediaHTML(x) {
    const s = x.sticker || {};
    if (s.gone || !s.id || gone.has(s.id)) return '<span class="sticker-gone" title="This sticker isn’t there any more">[sticker]</span>';
    const name = s.name ? `Sticker: ${s.name}` : 'Sticker';
    return (
      `<button type="button" class="sticker-media" data-stk-open="${esc(s.id)}" aria-label="${esc(name)}">` +
      `<img class="sticker-img" src="${esc(srcOf(s))}" alt="${esc(name)}" translate="no" draggable="false" decoding="async"${s.width && s.height ? ` style="aspect-ratio:${s.width}/${s.height}"` : ''}></button>`
    );
  }
  /** what goes on screen at once when you send one, before the server says it's there */
  const localMedia = (s) => ({ type: 'sticker', sticker: Object.assign({}, s, { local: srcOf(s) }) });

  /** a sticker arriving in a chat: slapped down with a wobble (a friend's with a little burst) */
  function popIn(el) {
    const img = el.querySelector('.sticker-img');
    if (!img || calm()) return fx.play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 180 });
    const mine = !!el.closest('.mine');
    const turn = mine ? 1 : -1;
    img.style.transformOrigin = mine ? '75% 85%' : '25% 85%';
    fx.play(img, [
      { transform: `translateY(28px) scale(0.25) rotate(${16 * turn}deg)`, opacity: 0 },
      { transform: `translateY(-6px) scale(1.14) rotate(${-7 * turn}deg)`, opacity: 1, offset: 0.42 },
      { transform: `translateY(0) scale(0.95) rotate(${3 * turn}deg)`, offset: 0.68 },
      { transform: 'scale(1.02) rotate(-1deg)', offset: 0.85 },
      { transform: 'none' },
    ], { duration: 760, easing: 'cubic-bezier(.2,.8,.25,1)' });
    if (!mine) {
      setTimeout(() => img.isConnected && M3.burst(img, 'play', { count: 7 }), 260);
      fx.haptic([6, 40, 10]);
    }
  }

  /** the top of a sticker message's long-press menu: the sticker, and whose it is */
  function menuHead(m) {
    const s = m.media && m.media.sticker;
    if (!s || s.gone || gone.has(s.id)) return '';
    return `<div class="stk-menu-head"><img src="${esc(srcOf(s))}" alt="" draggable="false"><span><b translate="no">${esc(s.name || 'Sticker')}</b>${s.by ? `<small>by u/${esc(s.by)}</small>` : ''}</span></div>`;
  }
  /** and its rows: save it (or see it, once it's yours), report it */
  function menuRows(m) {
    const s = m.media && m.media.sticker;
    if (!s || s.gone || gone.has(s.id)) return '';
    const row = (act, symbol, title, sub) => `<button type="button" class="row-link" data-do="${act}" data-m3-ripple>${icon(symbol)}<span class="row-text"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
    return (
      (byId(s.id) ? row('sticker-info', 'check_circle', 'In your stickers', 'See it big') : row('sticker-save', 'library_add', 'Save sticker', 'Add it to your stickers')) +
      (s.by && store.isMe(s.by) ? '' : row('sticker-report', 'flag', 'Report sticker', 'Moderators can take it down everywhere'))
    );
  }
  function menuAction(act, m) {
    const s = m.media && m.media.sticker;
    if (!s) return;
    if (act === 'sticker-save') save(s, null);
    else if (act === 'sticker-report') report(s);
    else info(s.id, { kind: 'sticker', name: s.name });
  }

  // ---- saving, renaming, deleting, reporting ------------------------------------------------------------------

  async function save(s, from) {
    try {
      const r = await api.post(`/api/stickers/${encodeURIComponent(s.id)}/save`, {});
      keep(r.sticker);
      fx.haptic([8, 30, 14]);
      if (from && !calm()) M3.burst(from, 'hearts', { count: 10 });
      const was = s.kind === 'emoji' && s.name && r.sticker.name !== s.name ? ` as :${r.sticker.name}:` : '';
      M3.toast(s.kind === 'emoji' ? `Saved to your emojis${was}` : 'Saved to your stickers', { symbol: 'library_add_check', shape: 'puffy' });
      return r.sticker;
    } catch (error) {
      Nook.app.showError(error);
      return null;
    }
  }

  function rename(s) {
    const emoji = s.kind === 'emoji';
    return ui.sheet({
      headline: emoji ? 'Rename emoji' : 'Rename sticker',
      symbol: 'edit',
      shape: 'puffy',
      html:
        `<div class="stk-rename"><img src="${esc(srcOf(s))}" alt="" class="${emoji ? 'is-emoji' : ''}"><div class="field"><label for="stk-rename">${emoji ? 'Its name, between colons' : 'Its name (you can leave it empty)'}</label>` +
        `<input class="m3-field" id="stk-rename" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" translate="no" value="${esc(s.name || '')}"${emoji ? ' autofocus' : ''}></div></div><span class="error" id="stk-rename-err"></span>`,
      setup(body) {
        const input = body.querySelector('#stk-rename');
        if (emoji) input.addEventListener('input', () => (input.value = cleanName(input.value)));
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Save',
          variant: 'filled',
          run(close, body) {
            const name = body.querySelector('#stk-rename').value.trim();
            const err = body.querySelector('#stk-rename-err');
            if (emoji && !EMOJI_NAME.test(name)) return (err.textContent = 'Use 2–32 small letters, numbers or underscores.'), false;
            api
              .patch(`/api/stickers/${encodeURIComponent(s.id)}`, { name })
              .then((r) => {
                keep(r.sticker);
                close(r.sticker);
                M3.toast(emoji ? `Now it’s :${r.sticker.name}:` : 'Renamed', { symbol: 'edit', shape: 'puffy' });
              })
              .catch((error) => (err.textContent = error.message));
            return false;
          },
        },
      ],
    });
  }

  async function remove(s) {
    const mine = !!s.mine;
    const ok = await M3.dialog({
      headline: mine ? `Delete this ${word(s.kind)}?` : `Remove it from your ${s.kind === 'emoji' ? 'emojis' : 'stickers'}?`,
      symbol: 'delete',
      iconShape: 'softBoom',
      body: mine
        ? `It goes from everyone’s library too. Messages that already have it show ${s.kind === 'emoji' ? `:${s.name}:` : '[sticker]'} instead.`
        : 'You can save it again whenever you see it.',
      actions: [{ label: 'Cancel', value: false }, { label: mine ? 'Delete' : 'Remove', value: true, variant: 'filled' }],
    });
    if (!ok) return false;
    try {
      await api.del(`/api/stickers/${encodeURIComponent(s.id)}`);
    } catch (error) {
      Nook.app.showError(error);
      return false;
    }
    forget(s.id);
    if (mine) gone.add(s.id);
    M3.toast(mine ? 'Deleted' : 'Removed from your library', { symbol: 'delete', shape: 'softBoom' });
    return true;
  }

  async function report(s) {
    const what = s.kind === 'emoji' ? 'emoji' : 'sticker';
    const reason = await Nook.app.pickReason(`Report this ${what}`, 'flag', 'Reports go to Budgie’s moderators. If it breaks the rules, they take it down everywhere it’s used.', 'Report');
    if (!reason) return;
    try {
      await store.report('sticker', s.id, reason);
    } catch (error) {
      return Nook.app.showError(error);
    }
    M3.toast('Thanks, a moderator will take a look', { symbol: 'shield', shape: 'gem' });
  }

  // ---- seeing one big: whose it is, and saving it ---------------------------------------------------------------

  /** a sheet with one sticker or emoji (yours or anyone's), what it's called, and what you can do with it */
  function info(id, hint = {}) {
    const known = byId(id);
    const kind = (known && known.kind) || hint.kind || 'sticker';
    let s = known || { id, kind, name: hint.name || '' };
    const heroShape = kind === 'emoji' ? 'sunny' : 'cookie12';
    return ui.sheet({
      className: 'stk-info',
      html:
        `<div class="stk-hero ${kind === 'emoji' ? 'is-emoji' : ''}${calm() ? '' : ' lively'}"><m3-shape class="stk-hero-shape" shape="${heroShape}" aria-hidden="true"></m3-shape>` +
        `<img class="stk-hero-img" src="${esc(srcOf(s))}" alt="${esc(label(s))}" translate="no" draggable="false"></div>` +
        '<div class="stk-hero-text"></div><div class="stk-hero-actions"></div>',
      setup(body, close) {
        const text = body.querySelector('.stk-hero-text');
        const actions = body.querySelector('.stk-hero-actions');
        const hero = body.querySelector('.stk-hero-img');
        let saved = !!known;
        const paint = () => {
          const by = s.by ? (store.isMe(s.by) ? 'by you' : `by <a href="#/u/${encodeURIComponent(s.by)}" translate="no">u/${esc(s.by)}</a>`) : '';
          text.innerHTML =
            `<b class="m3-title" translate="no">${esc(label(s))}</b>` +
            `<span class="muted">${kind === 'emoji' ? 'Custom emoji' : 'Sticker'}${s.gif ? ' · moves' : ''}${by ? ' · ' + by : ''}</span>` +
            (saved && !s.mine ? `<span class="stk-kept">${icon('check')}${kind === 'emoji' ? 'In your emojis' : 'In your stickers'}</span>` : '');
          const btn = (act, symbol, words, variant = 'tonal') => `<button type="button" class="m3-btn ${variant}" data-info="${act}">${icon(symbol)}${words}</button>`;
          actions.innerHTML = s.mine
            ? btn('rename', 'edit', 'Rename') + btn('delete', 'delete', 'Delete', 'text')
            : (saved ? btn('rename', 'edit', 'Rename') + btn('delete', 'bookmark_remove', 'Remove', 'text')
              : btn('save', 'library_add', kind === 'emoji' ? 'Save to my emojis' : 'Save to my stickers', 'filled')) + btn('report', 'flag', 'Report', 'text');
        };
        paint();
        api
          .get(`/api/stickers/${encodeURIComponent(id)}`)
          .then((r) => {
            s = Object.assign({}, r.sticker, saved && known ? { name: known.name } : {});
            saved = r.saved;
            paint();
          })
          .catch((error) => {
            if (error.status === 404) {
              gone.add(id);
              text.innerHTML = `<b class="m3-title" translate="no">${esc(label(s))}</b><span class="muted">This ${word(kind)} isn’t there any more.</span>`;
              actions.innerHTML = '';
              hero.remove();
            }
          });
        actions.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-info]');
          if (!b) return;
          const act = b.dataset.info;
          if (act === 'save') {
            b.disabled = true;
            const got = await save(s, hero);
            if (got) {
              s = Object.assign({}, s, { name: got.name });
              saved = true;
              paint();
              if (!calm()) fx.play(hero, [{ transform: 'scale(1)' }, { transform: 'scale(1.16) rotate(-5deg)', offset: 0.4 }, { transform: 'scale(0.97) rotate(2deg)', offset: 0.7 }, { transform: 'none' }], { duration: 620, easing: 'cubic-bezier(.2,.8,.25,1)' });
            } else b.disabled = false;
          } else if (act === 'rename') {
            const next = await rename(byId(s.id) || s);
            if (next) {
              s = Object.assign({}, s, { name: next.name });
              paint();
            }
          } else if (act === 'delete') {
            if (await remove(Object.assign({}, s, { mine: !!s.mine }))) close(null);
          } else if (act === 'report') {
            close(null);
            report(s);
          }
        });
        // its maker's profile is a link: following it closes the sheet
        text.addEventListener('click', (e) => e.target.closest('a') && close(null));
      },
    });
  }

  // ---- making one ---------------------------------------------------------------------------------------------

  /** an emoji's name as you type it: small letters, numbers and underscores (spaces and dashes become _) */
  const cleanName = (v) => String(v || '').toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);
  /** a name to start from, out of the file's own (party-budgie.png → party_budgie) */
  function nameFromFile(file, kind) {
    const base = String((file && file.name) || '').replace(/\.[a-z0-9]+$/i, '');
    if (/^(img|image|screenshot|photo|pxl|dsc|signal|whatsapp|fb_img|\d)/i.test(base)) return '';
    if (kind === 'emoji') {
      const n = cleanName(base).replace(/_+/g, '_').replace(/^_|_$/g, '');
      return EMOJI_NAME.test(n) ? n : '';
    }
    return base.replace(/[_-]+/g, ' ').trim().slice(0, 32);
  }

  const loadImage = (url) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Couldn’t read that picture. Try a PNG, JPEG, WebP or GIF.'));
      img.src = url;
    });
  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('Couldn’t read that GIF.'));
      reader.readAsDataURL(file);
    });
  const canvasOf = (size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    return c;
  };

  /**
   * a still sticker, drawn: the part of the picture picked, cut to a shape, and with a white edge all round (as a
   * sticker cut from a sheet has) and a soft shadow under it, if asked for
   */
  function draw(img, crop, size, shape, outline) {
    const pad = outline ? Math.round(size * 0.06) : 0;
    const inner = size - pad * 2;
    const layer = canvasOf(size);
    const l = layer.getContext('2d');
    l.imageSmoothingQuality = 'high';
    if (shape !== 'none' && window.M3Shapes) {
      try {
        const path = new Path2D();
        path.addPath(new Path2D(M3Shapes.path(shape, inner)), new DOMMatrix([1, 0, 0, 1, pad, pad]));
        l.clip(path);
      } catch (_) {
        /* a shape that can't be drawn leaves the picture as it is */
      }
    }
    const k = inner / crop.sw;
    l.drawImage(img, pad - crop.sx * k, pad - crop.sy * k, img.naturalWidth * k, img.naturalHeight * k);
    if (!outline) return layer;
    const sil = canvasOf(size);
    const s = sil.getContext('2d');
    s.drawImage(layer, 0, 0);
    s.globalCompositeOperation = 'source-in';
    s.fillStyle = '#fff';
    s.fillRect(0, 0, size, size);
    // the edge: the picture's outline, grown outwards in rings
    const edge = canvasOf(size);
    const e = edge.getContext('2d');
    const r = pad * 0.9;
    for (const ring of [1, 0.75, 0.5, 0.25]) {
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2 + ring;
        e.drawImage(sil, Math.cos(a) * r * ring, Math.sin(a) * r * ring);
      }
    }
    e.drawImage(sil, 0, 0);
    const out = canvasOf(size);
    const o = out.getContext('2d');
    o.save();
    o.shadowColor = 'rgba(0, 0, 0, 0.3)';
    o.shadowBlur = pad * 0.55;
    o.shadowOffsetY = pad * 0.22;
    o.drawImage(edge, 0, 0);
    o.restore();
    o.drawImage(layer, 0, 0);
    return out;
  }
  /** a canvas as a picture to send: JPEG when nothing in it is see-through (smaller), PNG otherwise */
  function exported(canvas, kind) {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = true;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) {
        opaque = false;
        break;
      }
    }
    return opaque && kind === 'sticker' ? canvas.toDataURL('image/jpeg', 0.9) : canvas.toDataURL('image/png');
  }

  /** picks a picture for a new sticker or emoji: the file box, as if tapped */
  function choose(kind) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = ACCEPT;
    input.addEventListener('change', () => input.files && input.files[0] && make(kind, input.files[0]));
    input.click();
  }

  /** a new one, from a picture: fit it, style it, name it, and it's checked and kept */
  async function make(kind, file) {
    if (!file) return null;
    if (file.type && !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return M3.snackbar('Pick a PNG, JPEG, WebP or GIF picture.'), null;
    if (listOf(kind).length >= (lib.max[kind] || MAX[kind])) return M3.snackbar(kind === 'emoji' ? 'Your emojis are full. Delete one to make room.' : 'Your stickers are full. Delete one to make room.'), null;
    const gif = file.type === 'image/gif';
    if (gif && file.size > GIF_MAX) return M3.snackbar('That GIF is too big. Try one under 8 MB.'), null;
    if (file.size > 30 * 1024 * 1024) return M3.snackbar('That picture is too big. Try one under 30 MB.'), null;
    let crop;
    try {
      crop = await ui.cropPicture(file, kind);
    } catch (error) {
      return M3.snackbar(error.message), null;
    }
    if (!crop) return null;
    const url = URL.createObjectURL(file);
    try {
      const img = await loadImage(url);
      return await design(kind, file, img, crop, gif, url);
    } catch (error) {
      M3.snackbar(error.message);
      return null;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** the second step: its shape and edge (a still picture), and its name; then it's sent off to be checked */
  function design(kind, file, img, crop, gif, url) {
    const emoji = kind === 'emoji';
    // an emoji is 128 across; a sticker up to 512, never bigger than the part of the picture it's cut from
    let size = emoji ? 128 : Math.max(160, Math.min(512, Math.round(crop.sw)));
    const model = { shape: 'none', outline: false, name: nameFromFile(file, kind) };
    let busy = false;
    const gifView = () => {
      const w = (img.naturalWidth / crop.sw) * 100;
      return `<div class="stk-gifview"><img src="${esc(url)}" alt="" style="width:${w}%;left:${(-crop.sx / crop.sw) * 100}%;top:${(-crop.sy / crop.sw) * 100}%"></div>`;
    };
    return ui.sheet({
      headline: emoji ? 'New emoji' : 'New sticker',
      symbol: emoji ? 'add_reaction' : 'auto_awesome',
      shape: 'puffy',
      className: 'stk-design',
      html:
        `<div class="stk-stage${emoji ? ' is-emoji' : ''}"><div class="stk-preview">${gif ? gifView() : `<canvas width="${size}" height="${size}" aria-label="Your ${word(kind)}"></canvas>`}</div></div>` +
        (emoji ? '<div class="stk-inline-preview" aria-hidden="true"><span class="stk-bubble">so <span class="stk-mini"></span> good</span><span class="stk-bubble jumbo"><span class="stk-mini"></span></span></div>' : '') +
        (gif
          ? `<p class="muted stk-note">${icon('animation')}It keeps moving. GIFs keep their own shape.</p>`
          : `<div class="field"><span class="field-label">Shape</span><div class="stk-shapes" role="radiogroup" aria-label="Shape">${SHAPES.map(
              ([id, name]) =>
                `<button type="button" class="stk-shape" role="radio" aria-checked="${id === model.shape}" data-shape="${id}" aria-label="${name}" data-tooltip="${name}">${
                  id === 'none' ? icon('crop_square') : `<m3-shape shape="${id}"></m3-shape>`
                }</button>`
            ).join('')}</div></div>` +
            `<label class="switch-row stk-outline"><span class="switch-text"><span>Sticker edge</span><small>A white border all round, like a real sticker</small></span><input type="checkbox" class="m3-switch" role="switch" id="stk-outline"></label>`) +
        `<div class="field"><label for="stk-name">${emoji ? 'Name' : 'Name (optional)'}</label>` +
        `<div class="stk-name-row">${emoji ? '<span class="stk-colon" aria-hidden="true">:</span>' : ''}<input class="m3-field" id="stk-name" maxlength="32" autocomplete="off" autocapitalize="none" spellcheck="false" translate="no" placeholder="${emoji ? 'party_budgie' : 'Happy dance'}" value="${esc(model.name)}">${emoji ? '<span class="stk-colon" aria-hidden="true">:</span>' : ''}</div>` +
        `<small class="muted">${emoji ? 'Type it between colons to use it, like :party_budgie:. Small letters, numbers and _.' : 'Helps you find it, and shows when someone holds it.'}</small></div>` +
        '<span class="error" id="stk-err" role="alert"></span>',
      setup(body) {
        const canvas = body.querySelector('canvas');
        const stage = body.querySelector('.stk-stage');
        const name = body.querySelector('#stk-name');
        const minis = body.querySelectorAll('.stk-mini');
        const paint = () => {
          if (canvas) {
            const drawn = draw(img, crop, size, model.shape, model.outline);
            const g = canvas.getContext('2d');
            g.clearRect(0, 0, size, size);
            g.drawImage(drawn, 0, 0);
          }
          // the emoji as it'll look among words, and on its own
          if (minis.length) {
            const src = canvas ? canvas.toDataURL('image/png') : url;
            for (const m of minis) m.innerHTML = canvas ? `<img class="cemoji" src="${src}" alt="">` : `<span class="stk-gifmini">${gifView()}</span>`;
          }
        };
        paint();
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-shape]');
          if (!b) return;
          model.shape = b.dataset.shape;
          body.querySelectorAll('[data-shape]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          paint();
          fx.pop(b.firstElementChild || b, 0.7);
          if (!calm()) fx.play(stage.firstElementChild, [{ transform: 'scale(0.94)' }, { transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
        });
        const outline = body.querySelector('#stk-outline');
        if (outline)
          outline.addEventListener('change', () => {
            model.outline = outline.checked;
            paint();
            fx.haptic(6);
          });
        if (emoji) name.addEventListener('input', () => {
          const at = name.selectionStart;
          const was = name.value;
          name.value = cleanName(was);
          if (name.value !== was) name.setSelectionRange(Math.min(at, name.value.length), Math.min(at, name.value.length));
        });
        // a gentle hello as it appears
        if (!calm()) fx.play(stage.firstElementChild, [{ transform: 'scale(0.6) rotate(-8deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: fx.lively.duration, easing: fx.lively.easing });
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: emoji ? 'Make emoji' : 'Make sticker',
          variant: 'filled',
          symbol: 'auto_awesome',
          id: 'stk-make',
          run(close, body) {
            if (busy) return false;
            const err = body.querySelector('#stk-err');
            const nameBox = body.querySelector('#stk-name');
            const name = nameBox.value.trim();
            err.textContent = '';
            if (emoji && !EMOJI_NAME.test(name)) {
              err.textContent = 'Give it a name of 2–32 small letters, numbers or underscores.';
              nameBox.focus();
              return false;
            }
            if (emoji && emojiNamed(name)) {
              err.textContent = `You already have :${name}:. Pick another name.`;
              nameBox.focus();
              return false;
            }
            const button = body.closest('dialog').querySelector('#stk-make');
            const stage = body.querySelector('.stk-stage');
            busy = true;
            button.disabled = true;
            button.innerHTML = '<m3-loading aria-hidden="true"></m3-loading>Checking…';
            stage.classList.add('working');
            (async () => {
              let payload;
              if (gif) payload = { kind, name, gif: await readFile(file), crop };
              else {
                // a heavy sticker is made a little smaller until it fits
                let image = exported(draw(img, crop, size, model.shape, model.outline), kind);
                while (!emoji && image.length * 0.75 > 1.45 * 1024 * 1024 && size > 200) {
                  size = Math.round(size * 0.8);
                  image = exported(draw(img, crop, size, model.shape, model.outline), kind);
                }
                payload = { kind, name, image };
              }
              return api.post('/api/stickers', payload);
            })()
              .then((r) => {
                keep(r.sticker);
                used(r.sticker.id);
                stage.classList.remove('working');
                celebrate(stage.firstElementChild);
                if (r.unlocked) store.emit('achievements');
                button.innerHTML = icon('check') + 'Done';
                setTimeout(() => {
                  close(r.sticker);
                  // the sticker sheet it was made from shows it arriving; anywhere else a toast says so
                  if (!document.querySelector('dialog.stk-sheet[open]')) M3.toast(emoji ? `Your emoji is ready: :${r.sticker.name}:` : 'Your sticker is ready', { symbol: emoji ? 'add_reaction' : 'auto_awesome', shape: 'puffy' });
                }, calm() ? 200 : 750);
              })
              .catch((error) => {
                busy = false;
                stage.classList.remove('working');
                button.disabled = false;
                button.innerHTML = icon('auto_awesome') + (emoji ? 'Make emoji' : 'Make sticker');
                err.textContent = error.message;
                if (error.field === 'name') nameBox.focus();
                if (!calm()) fx.play(stage, [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-4px)' }, { transform: 'none' }], { duration: 320 });
                fx.haptic([20, 40, 20]);
              });
            return false;
          },
        },
      ],
    });
  }

  /** a new one's moment: it's slapped down like a real sticker, with a burst and a buzz */
  function celebrate(el) {
    fx.haptic([10, 45, 22]);
    if (!el || calm()) return;
    fx.play(el, [
      { transform: 'none' },
      { transform: 'scale(1.2) rotate(-7deg)', offset: 0.32 },
      { transform: 'scale(0.94) rotate(3deg)', offset: 0.62 },
      { transform: 'scale(1.03) rotate(-1deg)', offset: 0.82 },
      { transform: 'none' },
    ], { duration: 720, easing: 'cubic-bezier(.2,.8,.25,1)' });
    M3.burst(el, 'play', { count: 14 });
    fx.confetti(el, { count: 16, power: 0.75 });
  }

  // ---- the sticker sheet: your stickers and emojis, from a chat or from Settings ------------------------------

  /**
   * your stickers and emojis. From a chat, a tap on a sticker sends it (it resolves with it) and a tap on an emoji
   * puts it where you're writing (`field`); from Settings (`manage`), a tap shows what you can do with it.
   */
  function pick({ field = null, tab = 'sticker', manage = false, only = '' } = {}) {
    let kind = only || tab;
    let painter = null;
    const tabs = [['sticker', 'Stickers', 'sticky_note_2'], ['emoji', 'Emojis', 'mood']];
    const sheet = ui.sheet({
      headline: only === 'emoji' ? 'Your emojis' : manage ? 'Your stickers' : 'Stickers',
      symbol: 'add_reaction',
      shape: 'puffy',
      className: 'stk-sheet',
      html:
        // somewhere a sticker can't go (a comment), it's just your emojis
        (only
          ? ''
          : `<div class="m3-segmented stk-tabs" role="radiogroup" aria-label="Stickers or emojis">${tabs
              .map(([id, words, symbol]) => `<button type="button" class="m3-segment" role="radio" aria-checked="${id === kind}" data-tab="${id}">${icon(symbol)}${words}</button>`)
              .join('')}</div>`) +
        '<div class="stk-grid" role="list"></div><p class="stk-foot muted"></p>',
      setup(body, close) {
        const grid = body.querySelector('.stk-grid');
        const foot = body.querySelector('.stk-foot');
        let known = new Set();
        const paint = () => {
          const list = ordered(kind);
          const max = lib.max[kind] || MAX[kind];
          grid.dataset.kind = kind;
          grid.innerHTML =
            (list.length < max
              ? `<label class="stk-tile stk-make" role="listitem" data-m3-ripple><m3-shape-icon shape="${kind === 'emoji' ? 'sunny' : 'cookie9'}" symbol="add" size="${kind === 'emoji' ? 36 : 44}" icon-size="${kind === 'emoji' ? 20 : 24}" aria-hidden="true"></m3-shape-icon>` +
                `<span>${kind === 'emoji' ? 'New' : 'New sticker'}</span><input type="file" accept="${ACCEPT}" data-stk-file="${kind}" aria-label="${kind === 'emoji' ? 'Make an emoji from a picture' : 'Make a sticker from a picture'}"></label>`
              : '') +
            list
              .map(
                (s) =>
                  `<button type="button" class="stk-tile" role="listitem" data-stk-id="${esc(s.id)}" aria-label="${esc(label(s))}" title="${esc(label(s))}">` +
                  `<img src="${esc(srcOf(s))}" alt="" loading="lazy" decoding="async" draggable="false" translate="no">${kind === 'emoji' ? `<small translate="no">${esc(s.name)}</small>` : ''}</button>`
              )
              .join('') +
            (!list.length
              ? `<div class="stk-empty">${kind === 'emoji'
                  ? '<b>Your own emojis</b><span>Make one from any picture, then type its name between colons, like :party_budgie:, in a chat, comment or post.</span>'
                  : '<b>No stickers yet</b><span>Turn any picture into a sticker: a photo, a drawing, a GIF (it keeps moving). Or tap a friend’s sticker to save it.</span>'}</div>`
              : '');
          foot.textContent = list.length
            ? `${list.length} of ${max}${list.length ? (hover() ? ' · Right-click one to rename or delete it' : ' · Touch and hold one to rename or delete it') : ''}`
            : '';
          // what's new since the last time it was drawn springs in
          const fresh = known.size ? [...grid.querySelectorAll('[data-stk-id]')].filter((t) => !known.has(t.dataset.stkId)) : [];
          known = new Set(list.map((s) => s.id));
          fresh.forEach((t) => fx.pop(t, 0.3));
        };
        paint();
        if (!calm()) fx.stagger([...grid.children].slice(0, 12), { y: 12, step: 22 });
        painter = paint;
        listeners.add(paint);
        load().catch(() => {});
        const tabsEl = body.querySelector('.stk-tabs');
        if (tabsEl) tabsEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-tab]');
          if (!b || b.dataset.tab === kind) return;
          kind = b.dataset.tab;
          body.querySelectorAll('[data-tab]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
          known = new Set();
          paint();
          if (!calm()) fx.stagger([...grid.children].slice(0, 12), { y: 10, step: 18 });
        });
        // a tap uses it; holding it (or a right click) shows what else
        let timer = 0;
        let held = false;
        const itemOf = (el) => {
          const t = el && el.closest('[data-stk-id]');
          return t ? listOf(kind).find((s) => s.id === t.dataset.stkId) : null;
        };
        grid.addEventListener('click', (e) => {
          const s = itemOf(e.target);
          if (!s) return;
          if (held) return void (held = false);
          if (manage) return itemMenu(s, e.target.closest('[data-stk-id]'));
          used(s.id);
          if (s.kind === 'sticker') {
            fx.haptic(10);
            return close(s);
          }
          if (field && Nook.pickers) {
            const before = field.value.slice(0, field.selectionStart ?? field.value.length);
            Nook.pickers.insertAt(field, (before && !/\s$/.test(before) ? ' ' : '') + `:${s.name}: `);
          }
          fx.haptic(8);
          close(null);
        });
        grid.addEventListener('contextmenu', (e) => {
          const s = itemOf(e.target);
          if (!s) return;
          e.preventDefault();
          itemMenu(s, e.target.closest('[data-stk-id]'));
        });
        grid.addEventListener('pointerdown', (e) => {
          const s = e.pointerType !== 'mouse' && itemOf(e.target);
          if (!s) return;
          held = false;
          clearTimeout(timer);
          const tile = e.target.closest('[data-stk-id]');
          timer = setTimeout(() => {
            held = true;
            fx.haptic(12);
            itemMenu(s, tile);
          }, 480);
        });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) grid.addEventListener(type, () => clearTimeout(timer));
        grid.addEventListener('scroll', () => clearTimeout(timer), { passive: true });
      },
      actions: [{ label: 'Close', value: null }],
    });
    // it stops following the library once it's put away
    return sheet.finally(() => listeners.delete(painter));
  }

  /** what you can do with one of yours: see it big, rename it, delete it */
  function itemMenu(s, anchor) {
    const items = [
      { label: 'See it big', symbol: 'zoom_in', onSelect: () => info(s.id, s) },
      { label: 'Rename', symbol: 'edit', onSelect: () => rename(s) },
      { separator: true },
      { label: s.mine ? 'Delete' : 'Remove from library', symbol: s.mine ? 'delete' : 'bookmark_remove', destructive: true, onSelect: () => remove(s) },
    ];
    if (!matchMedia('(max-width: 719px) and (pointer: coarse)').matches) return M3.menu(anchor, items, { placement: 'bottom-start' });
    // on a phone it rises from the bottom, where your thumb is (as the app's own menus do)
    const list = items.filter((i) => !i.separator);
    ui.sheet({
      className: 'menu-sheet',
      html:
        `<div class="stk-menu-head"><img src="${esc(srcOf(s))}" alt="" draggable="false"><span><b translate="no">${esc(label(s))}</b><small>${s.mine ? 'You made this' : s.by ? `Saved, by u/${esc(s.by)}` : 'Saved'}</small></span></div>` +
        `<div class="menu-sheet-list" role="menu">${list
          .map((item, i) => `<button type="button" class="menu-sheet-item${item.destructive ? ' is-destructive' : ''}" role="menuitem" data-i="${i}" data-m3-ripple><span translate="no" class="m3-icon" aria-hidden="true">${item.symbol}</span><span>${esc(item.label)}</span></button>`)
          .join('')}</div>`,
      setup(body, close) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-i]');
          if (!b) return;
          close(null);
          list[+b.dataset.i].onSelect();
        });
      },
    });
  }

  /** the library from Settings */
  const open = (tab = 'sticker') => pick({ tab, manage: true });

  // ---- the emoji picker's "Yours" tab (on computers) ------------------------------------------------------------

  function pickerSection() {
    const list = ordered('emoji');
    return (
      '<section id="ep-yours" data-group="yours"><h4>Yours</h4>' +
      (list.length ? '' : '<p class="ep-yours-hint muted">Make your own emoji from any picture, then use it anywhere you write.</p>') +
      '<div class="ep-row ep-yours">' +
      list
        .map((e) => `<button type="button" data-emoji=":${esc(e.name)}:" data-custom="${esc(e.id)}" title="${esc(e.name)}" aria-label=":${esc(e.name)}:"><img class="cemoji" src="${esc(srcOf(e))}" alt="" loading="lazy" draggable="false"></button>`)
        .join('') +
      `<label class="ep-make" title="Make an emoji" data-tooltip="Make an emoji">${icon('add')}<input type="file" accept="${ACCEPT}" data-stk-file="emoji" aria-label="Make an emoji from a picture"></label>` +
      '</div></section>'
    );
  }

  // ---- :name: as you type --------------------------------------------------------------------------------------

  let suggest = null; // { el, field, from, items, at }
  function closeSuggest() {
    if (suggest) suggest.el.remove();
    suggest = null;
  }
  /** what's being typed just before the cursor, if it's the start of an emoji's name: ":par" */
  function partial(field) {
    const end = field.selectionStart;
    if (end == null || end !== field.selectionEnd) return null;
    const m = /(^|[\s(]):([a-z0-9_]{1,32})$/.exec(field.value.slice(Math.max(0, end - 40), end));
    return m ? { query: m[2], from: end - m[2].length - 1 } : null;
  }
  function showSuggest(field) {
    const p = lib.emojis.length ? partial(field) : null;
    if (!p) return closeSuggest();
    const q = p.query;
    const items = lib.emojis
      .filter((e) => e.name.includes(q))
      .sort((a, b) => (b.name.startsWith(q) ? 1 : 0) - (a.name.startsWith(q) ? 1 : 0) || a.name.length - b.name.length)
      .slice(0, 8);
    if (!items.length) return closeSuggest();
    const fresh = !suggest || suggest.field !== field;
    if (fresh) {
      closeSuggest();
      const el = document.createElement('div');
      el.className = 'stk-suggest';
      el.setAttribute('role', 'listbox');
      el.setAttribute('aria-label', 'Your emojis');
      document.body.appendChild(el);
      // a press here mustn't take the cursor out of the box
      el.addEventListener('pointerdown', (e) => e.preventDefault());
      el.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b && suggest) takeSuggestion(Number(b.dataset.i));
      });
      suggest = { el, field };
    }
    Object.assign(suggest, { from: p.from, items, at: Math.min(suggest.at || 0, items.length - 1) });
    suggest.el.innerHTML = items
      .map((e, i) => `<button type="button" role="option" aria-selected="${i === suggest.at}" data-i="${i}"><img class="cemoji" src="${esc(srcOf(e))}" alt="" draggable="false"><span translate="no">:${esc(e.name)}:</span></button>`)
      .join('');
    place();
    if (fresh) fx.play(suggest.el, [{ opacity: 0, transform: 'translateY(6px) scale(0.97)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
  }
  function place() {
    if (!suggest) return;
    const r = suggest.field.getBoundingClientRect();
    const el = suggest.el;
    const w = Math.min(innerWidth - 16, Math.max(220, r.width));
    el.style.width = w + 'px';
    el.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left)) + 'px';
    const h = el.offsetHeight;
    el.style.top = (r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
  }
  function takeSuggestion(i) {
    const { field, from, items } = suggest;
    const e = items[i];
    if (!e) return;
    const end = field.selectionStart;
    field.setRangeText(`:${e.name}: `, from, end, 'end');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    used(e.id);
    closeSuggest();
    fx.haptic(6);
    field.focus({ preventScroll: true });
  }

  // ---- everything else happens through the page: taps, files, typing, sending ---------------------------------

  // where your emojis go: what's drawn as Markdown everywhere it shows (messages, comments, a post's words). Bios and
  // nests' descriptions show as plain words in places, so they keep :name: as typed
  const WRITING = 'textarea#chat-input, .reply-box textarea, textarea#f-body';

  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;
      const opener = target.closest('[data-stk-open]');
      if (opener) {
        e.preventDefault();
        e.stopPropagation();
        return info(opener.dataset.stkOpen, { kind: 'sticker' });
      }
      // a custom emoji in someone's words
      const emoji = target.closest('.md img.cemoji, .bubble img.cemoji');
      if (emoji && emoji.dataset.cemoji) {
        e.preventDefault();
        e.stopPropagation();
        return info(emoji.dataset.cemoji, { kind: 'emoji', name: emoji.dataset.name });
      }
      const act = target.closest('[data-stk-act]');
      if (act) {
        e.preventDefault();
        if (act.dataset.stkAct === 'library') open(act.dataset.tab || 'sticker');
        // a comment's own emoji button, on a phone
        else if (act.dataset.stkAct === 'emojis') {
          const form = act.closest('form');
          const field = form && form.querySelector('textarea');
          if (field) pick({ field, only: 'emoji' });
        }
      }
    },
    true
  );
  document.addEventListener('change', (e) => {
    const input = e.target.closest && e.target.closest('input[data-stk-file]');
    if (!input) return;
    const file = input.files && input.files[0];
    input.value = ''; // so the same picture can be picked again
    if (Nook.pickers) Nook.pickers.closeEmoji();
    if (file) make(input.dataset.stkFile, file);
  });
  // a picture that's gone (deleted, or taken down by a moderator) leaves its name behind
  document.addEventListener(
    'error',
    (e) => {
      const img = e.target;
      if (!(img instanceof HTMLImageElement)) return;
      if (img.classList.contains('cemoji') && img.dataset.cemoji) {
        gone.add(img.dataset.cemoji);
        const span = document.createElement('span');
        span.className = 'cemoji-gone';
        span.setAttribute('translate', 'no');
        span.title = Nook.i18n ? Nook.i18n.t('This emoji isn’t there any more') : 'This emoji isn’t there any more';
        span.textContent = `:${img.dataset.name || 'emoji'}:`;
        img.replaceWith(span);
      } else if (img.classList.contains('sticker-img')) {
        const b = img.closest('.sticker-media');
        if (b && b.dataset.stkOpen) gone.add(b.dataset.stkOpen);
        const span = document.createElement('span');
        span.className = 'sticker-gone';
        span.textContent = '[sticker]';
        (b || img).replaceWith(span);
      }
    },
    true
  );
  // :name: becomes the emoji's token as it's sent (before the page's own handler reads the box)
  document.addEventListener(
    'submit',
    (e) => {
      closeSuggest();
      const form = e.target;
      if (!(form instanceof HTMLFormElement) || !lib.emojis.length) return;
      for (const ta of form.querySelectorAll(WRITING)) {
        const next = toTokens(ta.value);
        if (next !== ta.value) ta.value = next;
      }
    },
    true
  );
  // and back to :name: when something with your emojis in it is being edited again
  document.addEventListener('focusin', (e) => {
    const ta = e.target;
    if (!(ta instanceof HTMLTextAreaElement) || !ta.matches(WRITING) || !HAS_TOKEN.test(ta.value)) return;
    const next = toNames(ta.value);
    if (next === ta.value) return;
    const atEnd = ta.selectionStart === ta.value.length;
    ta.value = next;
    if (atEnd) ta.setSelectionRange(next.length, next.length);
  });
  document.addEventListener('input', (e) => {
    const ta = e.target;
    if (ta instanceof HTMLTextAreaElement && ta.matches(WRITING)) showSuggest(ta);
    else if (suggest) closeSuggest();
  });
  document.addEventListener(
    'keydown',
    (e) => {
      if (!suggest || e.target !== suggest.field) return;
      const n = suggest.items.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        suggest.at = (suggest.at + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
        suggest.el.querySelectorAll('[data-i]').forEach((b, i) => b.setAttribute('aria-selected', String(i === suggest.at)));
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        takeSuggestion(suggest.at);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        closeSuggest();
      }
    },
    true
  );
  document.addEventListener('selectionchange', () => {
    if (suggest && document.activeElement === suggest.field && !partial(suggest.field)) closeSuggest();
  });
  document.addEventListener('focusout', (e) => suggest && e.target === suggest.field && setTimeout(() => suggest && document.activeElement !== suggest.field && closeSuggest(), 120));
  addEventListener('resize', place);
  addEventListener('scroll', place, { passive: true });

  // ---- Settings: your stickers and emojis ------------------------------------------------------------------------

  Nook.hook('settingsSections', (header) => {
    if (!store.state.me) return '';
    const peek = [...ordered('sticker').slice(0, 5), ...ordered('emoji').slice(0, 6)];
    return (
      `<section>${header('puffy', 'add_reaction', 'Stickers and emojis')}<div class="card setting-card stk-settings">` +
      (peek.length
        ? `<div class="stk-peek" aria-hidden="true">${peek.map((s) => `<img class="${s.kind === 'emoji' ? 'is-emoji' : ''}" src="${esc(srcOf(s))}" alt="" loading="lazy" draggable="false">`).join('')}</div>`
        : '') +
      `<p class="muted">Make stickers and emojis from your own pictures (GIFs keep moving). Use them in chats, and your emojis anywhere you write, by typing their name between colons. You have <b class="stk-count">${lib.stickers.length}</b> of ${lib.max.sticker || MAX.sticker} stickers and <b class="stk-count">${lib.emojis.length}</b> of ${lib.max.emoji || MAX.emoji} emojis.</p>` +
      `<div class="toolbar"><button type="button" class="m3-btn tonal" data-stk-act="library" data-tab="sticker">${icon('sticky_note_2')}Your stickers</button><button type="button" class="m3-btn tonal" data-stk-act="library" data-tab="emoji">${icon('mood')}Your emojis</button></div>` +
      '<p class="muted small">Everyone who sees one of your stickers or emojis can see its picture and save it. Every picture is checked automatically first, as profile pictures are. Deleting one takes it out of everyone’s library.</p>' +
      '</div></section>'
    );
  });
  Nook.hook('settingsMount', (root) => {
    const card = root.querySelector('.stk-settings');
    if (!card) return;
    // the counts follow along while Settings is open
    const fit = () => {
      if (!card.isConnected) return listeners.delete(fit);
      const counts = card.querySelectorAll('.stk-count');
      if (counts.length === 2) [counts[0].textContent, counts[1].textContent] = [String(lib.stickers.length), String(lib.emojis.length)];
    };
    listeners.add(fit);
    load().catch(() => {});
  });
  Nook.hook('afterRender', () => closeSuggest());

  // once the app has settled, your library is fetched (for :name: and the pickers)
  setTimeout(() => load().catch(() => {}), 1500);

  Nook.stickers = {
    load, library: () => lib, available, emojiHTML, jumbo, toTokens, toNames, mediaHTML, localMedia, popIn, menuHead, menuRows, menuAction,
    pick, open, make, choose, info, save, used, pickerSection, TOKEN,
  };
})();
