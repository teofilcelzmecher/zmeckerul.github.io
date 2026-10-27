/*
 * Nook's app: the router, the shell (drawer, top bar, bottom bar), every
 * data-act action, the sheets for making nooks, collections and profiles,
 * the post composer, keyboard shortcuts, and the small simulations that make
 * the demo feel lived in (replies to what you post, live event clocks, the
 * break reminder).
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const store = Nook.store;
  const ui = Nook.ui;
  const views = Nook.views;
  const fx = Nook.fx;
  const { esc, icon, num, plural, avatar, nookIcon } = ui;
  const S = () => store.state.settings;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const main = $('#main');
  const drawer = $('#drawer');
  const scrim = $('#scrim');
  const topbar = $('#topbar');
  const brandShape = $('#brand-shape');
  const searchInput = $('#search-input');

  // ---- routing -------------------------------------------------------------------

  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const [path, query] = raw.split('?');
    const params = Object.fromEntries(new URLSearchParams(query || ''));
    const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
    const at = (view, extra) => ({ view, params: Object.assign(params, extra) });
    switch (parts[0]) {
      case undefined:
        return at('home');
      case 'popular':
        return at('popular');
      case 'explore':
        return at('explore');
      case 'n':
        if (parts[2] === 'p' && parts[3]) return at('postPage', { nook: parts[1], post: parts[3] });
        return at('community', { nook: parts[1] });
      case 'u':
        return at('profile', { user: parts[1] });
      case 'saved':
        return parts[1] ? at('collection', { col: parts[1] }) : at('saved');
      case 'inbox':
        return at('inbox');
      case 'settings':
        return at('settingsPage');
      case 'search':
        return at('searchPage');
      case 'submit':
        return at('submit');
      default:
        return at('notFound');
    }
  }

  const NAV_FOR = { home: 'home', popular: 'popular', explore: 'explore', saved: 'saved', collection: 'saved', inbox: 'inbox', submit: 'submit' };

  let leaving = [];
  let current = location.hash || '#/';
  let stack = [current];
  let restoring = null;
  let replacing = false;
  let feedShown = () => 0;
  let route = null;
  let viewNook = null;
  let navigating = false; // drawing a page inside a view transition
  let pendingShare = null; // what was tapped, to carry over into the next page
  const scrolls = new Map();

  const app = (Nook.app = {
    onLeave: (fn) => leaving.push(fn),
    restoreCount: () => (restoring ? restoring.count : 0),
    trackFeed: (fn) => (feedShown = fn),
    inTransition: () => navigating,
  });

  function go(hash, { replace = false } = {}) {
    const normal = hash === '#' || hash === '' ? '#/' : hash;
    if ((location.hash || '#/') === normal) {
      render();
      return;
    }
    if (replace) {
      replacing = true;
      location.replace(normal);
    } else {
      location.hash = normal;
    }
  }
  app.go = go;

  window.addEventListener('hashchange', () => {
    const hash = location.hash || '#/';
    scrolls.set(current, { y: scrollY, count: feedShown() });
    let direction = 'forward';
    if (replacing) {
      stack[stack.length - 1] = hash;
      replacing = false;
      restoring = null;
      direction = 'same';
    } else if (stack.length > 1 && stack[stack.length - 2] === hash) {
      stack.pop();
      restoring = scrolls.get(hash) || null;
      direction = 'back';
    } else {
      stack.push(hash);
      restoring = null;
    }
    current = hash;
    navigate(direction);
  });

  // what gets tapped on the way to a new page: a post card grows into the
  // post, a nook's icon into its banner
  document.addEventListener(
    'click',
    (e) => {
      const target = e.target instanceof Element ? e.target : null;
      pendingShare = null;
      if (!target || e.metaKey || e.ctrlKey) return;
      const toNook = target.closest('a[href^="#/n/"]:not([href*="/p/"]), [data-href^="#/n/"]:not([data-href*="/p/"])');
      if (toNook) {
        const iconEl = toNook.querySelector('m3-shape-icon');
        if (iconEl) pendingShare = { nookEl: iconEl, at: Date.now() };
        return;
      }
      const card = target.closest('.post[data-href]');
      if (card && !target.closest('button, input, textarea, label, .author')) pendingShare = { post: card.dataset.post, postEl: card, at: Date.now() };
    },
    true
  );

  /** draws the new page, moving from the old one the way you went */
  function navigate(direction) {
    const shared = pendingShare && Date.now() - pendingShare.at < 1500 ? pendingShare : null;
    pendingShare = null;
    let postId = shared && shared.post;
    if (fx.supported()) {
      if (postId) fx.share(shared.postEl, 'post-hero');
      // going back, the open post shrinks into its place in the feed
      const open = direction === 'back' && !postId ? $('.post.is-open', main) : null;
      if (open) {
        postId = open.dataset.post;
        fx.share(open, 'post-hero');
      }
      if (shared && shared.nookEl) fx.share(shared.nookEl, 'nook-hero');
    }
    fx.transition(
      'nav',
      () => {
        navigating = fx.supported();
        try {
          render();
        } finally {
          navigating = false;
        }
        if (postId) fx.share($(`.post[data-post="${postId}"]`, main), 'post-hero');
        if (shared && shared.nookEl) fx.share($('.nook-hero .nook-avatar', main), 'nook-hero');
      },
      { direction }
    );
  }

  function render() {
    for (const fn of leaving) {
      try {
        fn();
      } catch (_) {
        /* a page that has gone */
      }
    }
    leaving = [];
    feedShown = () => 0;
    closePicker();
    closeDrawer();
    topbar.classList.remove('searching');

    route = parse();
    let view;
    try {
      view = route.view === 'notFound' ? views.notFound() : views[route.view](route.params);
    } catch (error) {
      console.error(error);
      view = views.notFound('Something went wrong drawing this page.');
    }
    viewNook = view.nook || null;
    main.innerHTML = view.html;
    // a view transition moves the page itself; without one it fades up
    if (main.firstElementChild && !navigating) main.firstElementChild.classList.add('enter');
    document.title = `${view.title} · Nook`;

    // the app wears the nook it is in, and the brand takes its shape
    const wear = viewNook && S().themeNooks ? viewNook.color : null;
    ui.theme.setRoot(wear);
    const shape = view.brand || 'cookie9';
    if (brandShape.showing !== shape) brandShape.transitionTo(shape, { spring: true });
    ui.favicon(shape, wear || S().seed);

    const navKey = NAV_FOR[route.view] || '';
    $$('[data-nav]').forEach((el) => (el.dataset.nav === navKey ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current')));

    if (view.mount) {
      try {
        view.mount(main);
      } catch (error) {
        console.error(error);
      }
    }
    renderDrawerNooks();
    ui.theme.tintAll(main);
    M3.spin.hold('live', !!main.querySelector('[data-live]'));

    // scrolled now, in the same frame, so a view transition captures the page where it will be
    const target = restoring;
    restoring = null;
    if (target) scrollTo(0, target.y);
    else if (!route.params.c && route.params.focus !== 'comments') scrollTo(0, 0);
    if (route.view === 'searchPage') searchInput.value = route.params.q || '';
    onScroll();
  }
  app.render = render;

  // ---- the shell -------------------------------------------------------------------

  function renderDrawerNooks() {
    const s = store.state;
    const here = viewNook ? viewNook.id : '';
    const row = (c) =>
      `<a class="nav-item nav-nook" href="#/n/${c.id}" data-m3-ripple data-tooltip="n/${esc(c.id)}"${c.id === here ? ' aria-current="page"' : ''}>` +
      `<span class="nav-ind">${nookIcon(c, 28, 16)}</span><span class="nav-label">n/${esc(c.id)}</span></a>`;
    $('#nav-nooks').innerHTML = s.joined
      .map(store.community)
      .filter(Boolean)
      .map(row)
      .join('');
    const recent = s.recent.filter((id) => !s.joined.includes(id)).map(store.community).filter(Boolean).slice(0, 3);
    $('#nav-recent').innerHTML = recent.length
      ? `<div class="nav-heading"><span>Recently visited</span><m3-wavy-line amplitude="1.4" wavelength="12" aria-hidden="true"></m3-wavy-line></div>${recent.map(row).join('')}`
      : '';
    placeGlide();
  }

  // in the full drawer the highlight glides from one row to the next
  const glide = document.createElement('span');
  glide.className = 'nav-glide';
  glide.setAttribute('aria-hidden', 'true');
  drawer.prepend(glide);
  drawer.classList.add('has-glide');

  function placeGlide() {
    const here = drawer.querySelector('.nav-item[aria-current="page"]');
    if (!here || getComputedStyle(glide).display === 'none' || !here.offsetHeight) {
      glide.style.opacity = '0';
      return;
    }
    // from nowhere it appears in place; from another row it slides
    const jump = glide.style.opacity !== '1';
    if (jump) glide.style.transition = 'none';
    glide.style.transform = `translate(${here.offsetLeft}px, ${here.offsetTop}px)`;
    glide.style.width = here.offsetWidth + 'px';
    glide.style.height = here.offsetHeight + 'px';
    glide.style.opacity = '1';
    if (jump) {
      void glide.offsetWidth;
      glide.style.transition = '';
    }
  }
  addEventListener('resize', () => {
    glide.style.opacity = '0';
    placeGlide();
  });

  function renderMe() {
    $('#me-btn').innerHTML = avatar(store.user(store.ME), 36);
  }

  let lastUnread = -1;
  function renderBadges() {
    const n = store.unread();
    for (const id of ['inbox-badge', 'bottom-badge']) {
      const el = document.getElementById(id);
      el.hidden = !n;
      el.textContent = n > 9 ? '9+' : String(n);
      // a new arrival makes the badge hop
      if (lastUnread >= 0 && n > lastUnread) fx.pop(el, 0.3);
    }
    lastUnread = n;
    $('#drawer-unread').textContent = n ? String(n) : '';
  }

  function openDrawer() {
    // the menu's logo wears the shape the app wears now
    $('#drawer-brand').setAttribute('shape', brandShape.showing);
    drawer.scrollTop = 0;
    drawer.classList.add('open');
    scrim.hidden = false;
    fx.play(scrim, [{ opacity: 0 }, { opacity: 1 }], { duration: 250, easing: 'ease-out' });
    $('#menu-btn').setAttribute('aria-expanded', 'true');
    glide.style.opacity = '0';
    requestAnimationFrame(placeGlide);
    fx.stagger($$('.nav-item, .nav-heading, .nav-foot', drawer), { y: 12, step: 22, max: 14 });
    fx.haptic(6);
    $('#drawer-close').focus({ preventScroll: true });
  }
  function closeDrawer() {
    if (!drawer.classList.contains('open')) return;
    drawer.classList.remove('open');
    $('#menu-btn').setAttribute('aria-expanded', 'false');
    fx.settled(fx.play(scrim, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })).then(() => {
      if (!drawer.classList.contains('open')) scrim.hidden = true;
      scrim.getAnimations().forEach((a) => a.cancel());
    });
  }

  $('#menu-btn').addEventListener('click', openDrawer);
  $('#drawer-close').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  $('#search-btn').addEventListener('click', () => {
    topbar.classList.add('searching');
    searchInput.focus();
  });
  $('#search-back').addEventListener('click', () => topbar.classList.remove('searching'));
  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    if (!q) return;
    searchInput.blur();
    go('#/search?q=' + encodeURIComponent(q), { replace: route && route.view === 'searchPage' });
  });
  let searchTimer = 0;
  searchInput.addEventListener('input', () => {
    // already on the results page, they follow the typing
    if (!route || route.view !== 'searchPage') return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const q = searchInput.value.trim();
      go('#/search?q=' + encodeURIComponent(q), { replace: true });
      requestAnimationFrame(() => searchInput.focus());
    }, 350);
  });

  // light or dark spreads out from the button in a circle
  $('#theme-btn').addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    fx.haptic(6);
    fx.reveal(r.left + r.width / 2, r.top + r.height / 2, () => {
      S().mode = ui.theme.isDark() ? 'light' : 'dark';
      store.save();
      return applySettings();
    });
  });

  // the brand takes a spin home
  $('.brand').addEventListener('click', () => {
    fx.play(brandShape, [{ rotate: '0deg', scale: 1 }, { rotate: '200deg', scale: 1.15, offset: 0.5 }, { rotate: '360deg', scale: 1 }], { duration: 700, easing: 'cubic-bezier(.3,0,.2,1)' });
  });

  $('#me-btn').addEventListener('click', (e) => {
    const s = S();
    M3.menu(e.currentTarget, [
      { label: 'u/' + store.state.me.name, symbol: 'account_circle', onSelect: () => go('#/u/' + encodeURIComponent(store.state.me.name)) },
      { label: 'Edit profile', symbol: 'edit', onSelect: editProfile },
      { label: 'Saved', symbol: 'bookmarks', onSelect: () => go('#/saved') },
      { label: 'Settings', symbol: 'settings', onSelect: () => go('#/settings') },
      { label: 'Keyboard shortcuts', symbol: 'keyboard', onSelect: shortcuts },
      { separator: true },
      { label: 'Calm mode', checked: s.calm, onSelect: () => toggleSetting('calm') },
      { label: 'Compact cards', checked: s.compact, onSelect: () => toggleSetting('compact') },
    ], { placement: 'bottom-end' });
  });

  function toggleSetting(key) {
    const flip = () => {
      S()[key] = !S()[key];
      store.save();
      return applySettings();
    };
    if (key === 'compact') {
      // each card on screen morphs between its sizes
      const onScreen = $$('.feed .post', main).filter((card) => {
        const r = card.getBoundingClientRect();
        return r.bottom > -200 && r.top < innerHeight + 200;
      });
      if (fx.supported()) {
        onScreen.slice(0, 14).forEach((card) => {
          fx.share(card, 'post-' + card.dataset.post);
          card.style.viewTransitionClass = 'card';
        });
      }
      fx.transition('morph', flip).finished.finally(() => onScreen.forEach((card) => (card.style.viewTransitionClass = '')));
    } else {
      flip();
    }
    if (key === 'calm') M3.toast(S().calm ? 'Calm mode on: no more numbers' : 'Calm mode off', { symbol: 'self_improvement', shape: 'heart' });
  }

  /** puts the settings into effect; settles once every colour is in place */
  function applySettings() {
    const s = S();
    document.body.classList.toggle('calm', !!s.calm);
    document.body.classList.toggle('compact', !!s.compact);
    $$('[data-act="compact"]').forEach((b) => b.setAttribute('aria-pressed', String(!!s.compact)));
    $('#theme-btn .m3-icon').textContent = ui.theme.isDark() ? 'light_mode' : 'dark_mode';
    ui.favicon(brandShape.showing, viewNook && s.themeNooks ? viewNook.color : s.seed);
    scheduleBreak();
    return ui.theme.setRoot(viewNook && s.themeNooks ? viewNook.color : null).then(() => ui.theme.tintAll(document));
  }
  app.applySettings = applySettings;
  ui.systemDark.addEventListener('change', () => S().mode === 'system' && applySettings());

  // ---- clicks: actions first, then whole-card links -----------------------------------

  const ACTIONS = {};
  const postOf = (el) => store.post((el.closest('[data-post]') || {}).dataset?.post);

  document.addEventListener('click', (e) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;

    const act = target.closest('[data-act]');
    if (act && !act.matches(':disabled,[aria-disabled="true"]')) {
      const fn = ACTIONS[act.dataset.act];
      if (fn) {
        e.preventDefault();
        fn(act, e);
        return;
      }
    }

    const spoiler = target.closest('.spoiler');
    if (spoiler && !spoiler.classList.contains('shown')) {
      e.preventDefault();
      spoiler.classList.add('shown');
      return;
    }

    const collapsedHead = target.closest('.comment.collapsed > .c-main > .c-head');
    if (collapsedHead && !target.closest('a')) {
      toggleCollapse(collapsedHead.closest('.comment'));
      return;
    }

    const jump = target.closest('[data-jump]');
    if (jump) {
      jumpToComment(jump.dataset.jump);
      return;
    }

    // clicking the link you're already on takes you to the top
    const link = target.closest('a[href^="#"]');
    if (link && !e.metaKey && !e.ctrlKey) {
      const href = link.getAttribute('href');
      if ((href === '#/' ? ['', '#/', '#'] : [href]).includes(location.hash)) {
        e.preventDefault();
        scrollTo({ top: 0, behavior: 'smooth' });
        closeDrawer();
        return;
      }
    }

    const card = target.closest('[data-href]');
    if (card) {
      const inner = target.closest('a, button, input, textarea, select, label, [role="button"], .poll, video');
      if (inner && inner !== card && card.contains(inner)) return;
      if (String(getSelection() || '').length) return;
      const href = card.dataset.href;
      if (!href) return;
      if (e.metaKey || e.ctrlKey) window.open(ui.linkTo(href), '_blank', 'noopener');
      else go(href);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target;
    if (el.classList && el.classList.contains('spoiler')) {
      e.preventDefault();
      el.classList.add('shown');
    } else if (el.matches && el.matches('[data-href][tabindex], [data-jump]') && e.key === 'Enter') {
      e.preventDefault();
      el.click();
    }
  });

  // ---- votes, sparks, polls, saves ---------------------------------------------------------

  function setVoteBox(box, next, score, dir, pressed) {
    const was = box.dataset.dir;
    box.dataset.dir = next || '';
    box.querySelector('.up').setAttribute('aria-pressed', String(next === 1));
    box.querySelector('.down').setAttribute('aria-pressed', String(next === -1));
    M3.rollText(box.querySelector('.score'), num(score), { dx: 0, dy: dir > 0 ? 8 : -8 });
    // the arrow you pressed jumps the way it points, and a fresh vote makes the pill pop
    if (pressed) fx.nudge(pressed.querySelector('.m3-icon'), dir > 0 ? -6 : 6);
    if (next && String(next) !== was) fx.pop(box, 0.86);
  }

  ACTIONS.vote = (btn) => {
    const p = postOf(btn);
    if (!p) return;
    const dir = +btn.dataset.dir;
    const next = store.vote(p.id, dir);
    $$(`.vote[data-post-id="${p.id}"]`).forEach((box) => setVoteBox(box, next, store.score(p), dir, box.contains(btn) ? btn : null));
    if (next === 1) M3.burst(btn, 'play', { count: 7 });
    fx.haptic(next ? 10 : 5);
  };

  ACTIONS.cvote = (btn) => {
    const box = btn.closest('.vote');
    const c = store.commentsById.get(box.dataset.commentId);
    if (!c) return;
    const dir = +btn.dataset.dir;
    const next = store.voteComment(c.id, dir);
    setVoteBox(box, next, store.commentScore(c), dir, btn);
    if (next === 1) M3.burst(btn, 'play', { count: 5 });
    fx.haptic(next ? 8 : 4);
  };

  /** a post's sparks, changed in place: counts roll, a new kind springs in, the last of one shrinks away */
  function refreshSparks(p, kind, { from = null } = {}) {
    const spark = store.SPARKS.find((s) => s.id === kind);
    const now = store.sparks(p).find((s) => s.id === kind);
    for (const row of $$(`[data-post="${p.id}"] .sparks`)) {
      const chip = row.querySelector(`.spark[data-kind="${kind}"]`);
      const redraw = () => {
        const tmp = document.createElement('div');
        tmp.innerHTML = views.sparksRow(p);
        if (row.isConnected) row.replaceWith(tmp.firstElementChild);
      };
      if (chip && now.count > 0) {
        chip.setAttribute('aria-pressed', String(now.mine));
        chip.setAttribute('aria-label', `${spark.label}: ${now.count}`);
        M3.rollText(chip.querySelector('.n'), num(now.count), { dy: now.mine ? -8 : 8 });
      } else if (chip) {
        fx.settled(fx.play(chip, [{ scale: 1, opacity: 1 }, { scale: 0.4, opacity: 0 }], { duration: 180, fill: 'forwards' })).then(redraw);
      } else {
        redraw();
      }
    }
    fx.haptic(now.mine ? 12 : 5);
    if (!now.mine) return;
    const chip = $(`[data-post="${p.id}"] .spark[data-kind="${kind}"]`);
    if (!chip) return;
    const land = () => {
      chip.style.opacity = '';
      fx.pop(chip, 0.4);
      M3.burst(chip, spark.burst, { count: 9 });
    };
    // picked from the picker, the spark flies down to its place first
    if (!from) return land();
    chip.style.opacity = '0';
    fx.flyTo(from, chip, { shape: spark.shape, color: fx.tone(chip, '--m3-primary'), size: 30, lift: 60, duration: 560 }).then(land);
  }

  ACTIONS.react = (btn) => {
    const p = postOf(btn);
    if (!p) return;
    store.react(p.id, btn.dataset.kind);
    refreshSparks(p, btn.dataset.kind);
  };

  let picker = null;
  function closePicker() {
    if (!picker) return;
    const el = picker.el;
    picker.cleanup();
    picker = null;
    const out = M3.motion.animate(el, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.85)' }], { duration: 140, fill: 'forwards' });
    if (out) out.finished.then(() => el.remove(), () => el.remove());
    else el.remove();
  }

  ACTIONS['spark-picker'] = (btn) => {
    const p = postOf(btn);
    if (!p) return;
    if (picker && picker.anchor === btn) return closePicker();
    closePicker();
    const mine = store.state.reacts[p.id] || {};
    const el = document.createElement('div');
    el.className = 'spark-picker';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'Spark this post');
    el.innerHTML = store.SPARKS.map(
      (s) =>
        `<button role="menuitemcheckbox" aria-checked="${!!mine[s.id]}" aria-pressed="${!!mine[s.id]}" data-kind="${s.id}" aria-label="${s.label}" data-tooltip="${s.label}">` +
        `<m3-shape-icon shape="${s.shape}" symbol="${s.symbol}" size="40" icon-size="20"></m3-shape-icon></button>`
    ).join('');
    document.body.appendChild(el);
    const r = btn.getBoundingClientRect();
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8);
    const top = r.top - h - 8 > 8 ? r.top - h - 8 : r.bottom + 8;
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    // the tinted card's colours come along
    const card = btn.closest('[data-tint]');
    if (card) for (const name of ['--m3-primary', '--m3-on-primary', '--m3-tertiary-container', '--m3-on-tertiary-container', '--m3-secondary-container', '--m3-on-secondary-container']) el.style.setProperty(name, getComputedStyle(card).getPropertyValue(name));
    M3.motion.animate(el, [{ opacity: 0, transform: 'scale(.6) translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 420, ease: 'expressiveFastSpatial' });
    [...el.children].forEach((child, i) =>
      M3.motion.animate(child, [{ transform: 'scale(0) rotate(-40deg)' }, { transform: 'scale(1) rotate(0deg)' }], { duration: 520, delay: 40 * i, ease: 'expressiveFastSpatial', fill: 'backwards' })
    );
    el.addEventListener('click', (e) => {
      const choice = e.target.closest('button[data-kind]');
      if (!choice) return;
      store.react(p.id, choice.dataset.kind);
      refreshSparks(p, choice.dataset.kind, { from: choice });
      closePicker();
    });
    const away = (e) => {
      if (!el.contains(e.target) && !btn.contains(e.target)) closePicker();
    };
    const onScroll = () => closePicker();
    document.addEventListener('pointerdown', away, true);
    addEventListener('scroll', onScroll, { passive: true });
    picker = {
      el,
      anchor: btn,
      cleanup() {
        document.removeEventListener('pointerdown', away, true);
        removeEventListener('scroll', onScroll);
      },
    };
    el.querySelector('button').focus({ preventScroll: true });
  };

  ACTIONS.poll = (btn) => {
    const p = postOf(btn);
    if (!p || !store.votePoll(p.id, +btn.dataset.i)) return;
    const box = btn.closest('.poll');
    const tmp = document.createElement('div');
    tmp.innerHTML = views.pollBlock(p, true);
    const fresh = tmp.firstElementChild;
    box.replaceWith(fresh);
    void fresh.offsetWidth;
    // the bars spring out and their percentages count up with them
    requestAnimationFrame(() => {
      fresh.classList.add('voted');
      fresh.querySelectorAll('.poll-pct').forEach((el) => fx.countUp(el, parseInt(el.textContent, 10) || 0, { format: (n) => Math.round(n) + '%' }));
    });
    const mine = fresh.querySelector('.poll-opt.mine');
    if (mine) {
      M3.burst(mine, 'play', { count: 10 });
      fx.pop(mine.querySelector('.m3-icon'), 0.2);
    }
    fx.haptic([8, 50, 8]);
    M3.toast('Vote counted', { symbol: 'how_to_vote', shape: 'pill' });
  };

  ACTIONS.save = (btn) => {
    const p = postOf(btn);
    if (!p) return;
    const on = store.toggleSave(p.id);
    $$(`[data-post="${p.id}"] [data-act="save"]`).forEach((b) => {
      b.setAttribute('aria-pressed', String(on));
      b.dataset.tooltip = on ? 'Saved' : 'Save';
    });
    fx.haptic(on ? 10 : 5);
    // saved, it flies to Saved, which catches it; where Saved isn't in sight, a toast says so
    const target = on ? savedTarget() : null;
    if (on) fx.pop(btn.querySelector('.m3-icon'), 0.5);
    if (target) {
      fx.flyTo(btn, target, { shape: 'clover4', size: 24 }).then((flew) => {
        if (!flew) return M3.toast('Saved', { symbol: 'bookmark_added', shape: 'clover4' });
        fx.pop(target, 0.7);
        fx.haptic(6);
      });
    } else {
      M3.toast(on ? 'Saved' : 'Removed from saved', { symbol: on ? 'bookmark_added' : 'bookmark_remove', shape: 'clover4' });
    }
  };

  /** the Saved tab, wherever it can be seen right now */
  function savedTarget() {
    return (
      $$('[data-nav="saved"] .nav-ind').find((el) => {
        const r = el.getBoundingClientRect();
        const bar = el.closest('nav');
        return r.width > 0 && r.left >= 0 && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(bar).visibility !== 'hidden';
      }) || null
    );
  }

  async function share(hash, what) {
    const ok = await ui.copy(ui.linkTo(hash));
    M3.toast(ok ? `Link to ${what} copied` : 'Couldn’t copy the link', { symbol: 'link', shape: 'cookie12' });
  }
  ACTIONS.share = (btn) => {
    const p = postOf(btn);
    if (p) share(`#/n/${p.n}/p/${p.id}`, 'post');
  };
  ACTIONS['comment-share'] = (btn) => {
    const c = store.commentsById.get(btn.closest('[data-comment]').dataset.comment);
    const p = c && store.post(c.postId);
    if (p) share(`#/n/${p.n}/p/${p.id}?c=${c.id}`, 'comment');
  };

  ACTIONS.unveil = (btn) => {
    const veil = btn.closest('.post-veil');
    fx.haptic(6);
    fx.settled(fx.play(btn, [{ opacity: 1, scale: 1 }, { opacity: 0, scale: 0.8 }], { duration: 160, fill: 'forwards' })).then(() => veil.classList.remove('is-veiled'));
  };

  ACTIONS.compact = () => toggleSetting('compact');

  // ---- menus on posts, comments and nooks ----------------------------------------------------

  // a card leaves, then the ones below close the gap
  const removeCard = (card) => fx.collapseOut(card);

  ACTIONS['post-menu'] = (btn) => {
    const p = postOf(btn);
    if (!p) return;
    const mine = store.isMe(p.author);
    const saved = store.state.saved.includes(p.id);
    const card = btn.closest('[data-post]');
    M3.menu(btn, [
      { label: 'Add to collection…', symbol: 'collections_bookmark', onSelect: () => collectSheet(p) },
      { label: saved ? 'Unsave' : 'Save', symbol: saved ? 'bookmark_remove' : 'bookmark_add', onSelect: () => ACTIONS.save(card.querySelector('[data-act="save"]')) },
      { label: 'Copy link', symbol: 'link', onSelect: () => share(`#/n/${p.n}/p/${p.id}`, 'post') },
      { label: `Go to n/${p.n}`, symbol: store.community(p.n).symbol, onSelect: () => go('#/n/' + p.n) },
      { separator: true },
      card && card.dataset.href
        ? {
            label: 'Hide post',
            symbol: 'visibility_off',
            onSelect: () => {
              store.hide(p.id, true);
              removeCard(card);
              ui.undoToast('Post hidden', () => {
                store.hide(p.id, false);
                render();
              }, { symbol: 'visibility_off' });
            },
          }
        : null,
      mine
        ? { label: 'Delete post', symbol: 'delete', destructive: true, onSelect: () => deletePost(p, card) }
        : { label: 'Report', symbol: 'flag', destructive: true, onSelect: () => report('post', p) },
    ]);
  };

  async function deletePost(p, card) {
    const ok = await M3.dialog({
      headline: 'Delete this post?',
      symbol: 'delete',
      iconShape: 'softBoom',
      body: 'It goes for good, along with its place in your profile. Comments stay with the thread.',
      actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, variant: 'filled' }],
    });
    if (!ok) return;
    store.remove(p.id);
    M3.toast('Post deleted', { symbol: 'delete', shape: 'softBoom' });
    if (route.view === 'postPage') go('#/n/' + p.n, { replace: true });
    else removeCard(card);
  }

  ACTIONS['comment-menu'] = (btn) => {
    const el = btn.closest('[data-comment]');
    const c = store.commentsById.get(el.dataset.comment);
    if (!c) return;
    const mine = store.isMe(c.author);
    M3.menu(btn, [
      { label: 'Copy text', symbol: 'content_copy', onSelect: () => ui.copy(c.body).then((ok) => M3.toast(ok ? 'Copied' : 'Couldn’t copy', { symbol: 'content_copy' })) },
      { label: 'Collapse thread', symbol: 'unfold_less', onSelect: () => toggleCollapse(el) },
      { separator: true },
      ...(mine
        ? [
            { label: 'Edit', symbol: 'edit', onSelect: () => editComment(el, c) },
            { label: 'Delete', symbol: 'delete', destructive: true, onSelect: () => deleteComment(c) },
          ]
        : [{ label: 'Report', symbol: 'flag', destructive: true, onSelect: () => report('comment', c) }]),
    ]);
  };

  async function deleteComment(c) {
    const ok = await M3.dialog({
      headline: 'Delete your comment?',
      symbol: 'delete',
      iconShape: 'softBoom',
      body: 'Replies to it stay, under a “deleted” placeholder.',
      actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, variant: 'filled' }],
    });
    if (!ok) return;
    store.remove(c.id);
    rerenderComments();
    M3.toast('Comment deleted', { symbol: 'delete', shape: 'softBoom' });
  }

  function editComment(el, c) {
    const body = el.querySelector(':scope > .c-main > .c-body');
    const actions = el.querySelector(':scope > .c-main > .c-actions');
    const box = el.querySelector(':scope > .c-main > .c-reply');
    body.hidden = true;
    actions.hidden = true;
    box.innerHTML = views.replyBox('Edit your comment', 'Save', c.body);
    const form = box.querySelector('form');
    const textarea = form.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) return;
      store.editComment(c.id, text);
      rerenderComments();
      jumpToComment(c.id);
    });
    form.querySelector('[data-act="reply-cancel"]').dataset.restore = '1';
  }

  ACTIONS['nook-menu'] = (btn) => {
    const c = store.community(btn.dataset.nook);
    const joined = store.state.joined.includes(c.id);
    M3.menu(btn, [
      { label: 'Create a post here', symbol: 'edit', onSelect: () => go('#/submit?n=' + c.id) },
      { label: 'About this nook', symbol: 'info', onSelect: () => nookAbout(c) },
      { label: 'Copy link', symbol: 'link', onSelect: () => share('#/n/' + c.id, 'nook') },
      { separator: true },
      { label: joined ? 'Leave nook' : 'Join nook', symbol: joined ? 'logout' : 'group_add', destructive: joined, onSelect: () => setJoined(c, !joined) },
    ], { placement: 'bottom-end' });
  };

  ACTIONS['nook-about'] = (btn) => nookAbout(store.community(btn.dataset.nook));

  function nookAbout(c) {
    ui.sheet({
      headline: c.title,
      symbol: c.symbol,
      shape: c.shape,
      className: 'about-sheet',
      html: views.aboutCard(c) + views.eventsCard(c) + views.rulesCard(c),
      actions: [{ label: 'Close', variant: 'text' }],
    });
  }

  async function report(kind, thing) {
    let reason = null;
    const reasons = ['Spam', 'Harassment', 'Misinformation', 'Off topic', 'Breaks nook rules', 'Something else'];
    const value = await ui.sheet({
      headline: `Report this ${kind}`,
      symbol: 'flag',
      shape: 'softBoom',
      html: `<p class="muted">Reports go to the moderators of n/${esc((store.post(thing.postId || thing.id) || {}).n || '')}. Thanks for keeping Nook kind.</p><div class="chips" style="flex-wrap:wrap">${reasons.map((r) => `<button type="button" class="chip" data-reason="${r}" aria-pressed="false">${r}</button>`).join('')}</div>`,
      setup(body) {
        body.querySelectorAll('[data-reason]').forEach((chip) =>
          chip.addEventListener('click', () => {
            reason = chip.dataset.reason;
            body.querySelectorAll('[data-reason]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
          })
        );
      },
      actions: [{ label: 'Cancel', value: null }, { label: 'Report', variant: 'filled', run: () => (reason ? reason : false) }],
    });
    if (value) M3.toast('Thanks, the mods will take a look', { symbol: 'shield', shape: 'gem' });
  }

  // ---- joining, bells, events ------------------------------------------------------------------

  function setJoined(c, on, from) {
    const joined = store.join(c.id, on);
    let origin = null;
    $$(`[data-act="join"][data-nook="${c.id}"]`).forEach((b) => {
      const width = b.getBoundingClientRect().width;
      const tmp = document.createElement('div');
      tmp.innerHTML = views.joinButton(c, b.classList.contains('small'));
      const fresh = tmp.firstElementChild;
      b.replaceWith(fresh);
      if (b === from) origin = fresh;
      // the button eases to its new width as its words change, and its symbol turns in
      const to = fresh.getBoundingClientRect().width;
      if (width && to && Math.abs(width - to) > 1) {
        fresh.style.overflow = 'hidden';
        fx.settled(fx.play(fresh, [{ width: width + 'px' }, { width: to + 'px' }], { duration: fx.gentle.duration, easing: fx.gentle.easing })).then(() => (fresh.style.overflow = ''));
      }
      fx.play(fresh.querySelector('.m3-icon'), [{ rotate: joined ? '-120deg' : '120deg', scale: 0.2 }, { rotate: '0deg', scale: 1 }], { duration: fx.lively.duration, easing: fx.lively.easing });
      if (joined && fresh.getBoundingClientRect().width) M3.burst(fresh, 'playlist', { count: 8 });
    });
    renderDrawerNooks();
    fx.haptic(joined ? [10, 40, 10] : 6);
    // joined, its icon flies into Your nooks, where its new row slides in to catch it
    const row = joined ? $(`#nav-nooks a[href="#/n/${c.id}"]`) : null;
    const catcher = row && row.querySelector('m3-shape-icon');
    if (row) fx.play(row, [{ opacity: 0, transform: 'translateX(-18px)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
    const flight = origin && catcher ? fx.flyTo(origin, catcher, { shape: c.shape, color: c.color, size: 28 }) : Promise.resolve(false);
    flight.then((flew) => {
      if (flew) fx.pop(catcher, 0.3);
      else M3.toast(joined ? `Joined n/${c.id}` : `Left n/${c.id}`, { symbol: joined ? c.symbol : 'logout', shape: c.shape });
    });
  }

  ACTIONS.join = (btn) => {
    const c = store.community(btn.dataset.nook);
    if (c) setJoined(c, !store.state.joined.includes(c.id), btn);
  };

  ACTIONS.bell = (btn) => {
    const c = store.community(btn.dataset.nook);
    const on = store.bell(c.id);
    btn.setAttribute('aria-pressed', String(on));
    btn.querySelector('.m3-icon').textContent = on ? 'notifications_active' : 'notifications';
    // switched on, the bell rings
    btn.classList.remove('ring');
    void btn.offsetWidth;
    if (on) btn.classList.add('ring');
    fx.haptic(on ? [6, 60, 6] : 5);
    M3.toast(on ? `You’ll hear about events in n/${c.id}` : `Event alerts off for n/${c.id}`, { symbol: on ? 'notifications_active' : 'notifications_off', shape: c.shape });
  };

  ACTIONS.rsvp = (btn) => {
    const c = store.community(btn.dataset.nook);
    const ev = (c.events || []).find((x) => x.id === btn.dataset.event);
    if (!ev) return;
    const on = store.rsvp(ev.id);
    $$(`.event[data-event="${ev.id}"]`).forEach((row) => {
      const tmp = document.createElement('div');
      tmp.innerHTML = views.eventRow(ev, c, row.hasAttribute('data-show-nook'));
      row.replaceWith(tmp.firstElementChild);
    });
    fx.haptic(on ? 10 : 5);
    if (on) {
      const fresh = $(`.event[data-event="${ev.id}"] [data-act="rsvp"]`);
      if (fresh) {
        M3.burst(fresh, 'pin', { count: 8 });
        fx.pop(fresh, 0.8);
      }
      store.notify({ kind: 'event', symbol: ev.symbol, shape: c.shape, text: `You’re going to “${ev.title}” in n/${c.id}. We’ll remind you.`, href: '#/n/' + c.id });
    }
    M3.toast(on ? 'See you there!' : 'RSVP cancelled', { symbol: on ? 'event_available' : 'event_busy', shape: c.shape });
  };

  // ---- comments -----------------------------------------------------------------------------------

  function rerenderComments() {
    if (main._rerenderComments) main._rerenderComments();
    const p = route && route.view === 'postPage' ? store.post(route.params.post) : null;
    if (!p) return;
    const count = store.commentCount(p.id);
    const countEl = $('#comment-count');
    if (countEl) countEl.textContent = num(count);
    $$(`[data-post="${p.id}"] a[href$="?focus=comments"] .count`).forEach((el) => (el.textContent = num(count)));
    const none = $('#no-comments');
    if (none && count) none.remove();
  }

  function descendants(el) {
    return el.querySelectorAll('.c-children .comment').length;
  }

  // a thread folds shut, or opens back up, instead of jumping
  function toggleCollapse(el) {
    let collapsed = false;
    fx.flipHeight(el, () => {
      collapsed = el.classList.toggle('collapsed');
      const note = el.querySelector(':scope > .c-main > .c-head .c-hidden');
      const n = descendants(el);
      if (note) note.textContent = collapsed ? `· ${n ? plural(n, 'reply', 'replies') + ' hidden' : 'collapsed'}` : '';
      const thread = el.querySelector(':scope > .c-side > .c-thread');
      if (thread) thread.setAttribute('aria-label', collapsed ? 'Expand this thread' : 'Collapse this thread');
    });
    if (!collapsed) {
      fx.play(el.querySelector(':scope > .c-main'), [{ opacity: 0.4 }, { opacity: 1 }], { duration: 250 });
      fx.play(el.querySelector(':scope > .c-children'), [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: fx.decel });
    }
    fx.haptic(5);
  }
  ACTIONS.collapse = (btn) => toggleCollapse(btn.closest('.comment'));

  function jumpToComment(id) {
    requestAnimationFrame(() => {
      const el = document.getElementById('c-' + id);
      if (!el) return;
      let up = el.parentElement && el.parentElement.closest('.comment');
      while (up) {
        if (up.classList.contains('collapsed')) toggleCollapse(up);
        up = up.parentElement && up.parentElement.closest('.comment');
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
    });
  }
  app.jumpToComment = jumpToComment;

  function wireReplyBox(form, p, parentId) {
    if (!form) return;
    const textarea = form.querySelector('textarea');
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textarea.value.trim();
      if (!text) {
        textarea.focus();
        return;
      }
      const c = store.addOwnComment(p.id, parentId, text);
      textarea.value = '';
      rerenderComments();
      // the new comment opens into the thread
      fx.expand(document.getElementById('c-' + c.id));
      jumpToComment(c.id);
      fx.haptic(10);
      M3.toast(parentId ? 'Reply posted' : 'Comment posted', { symbol: 'chat', shape: 'clover4' });
    });
  }
  app.wireReplyBox = wireReplyBox;

  ACTIONS.reply = (btn) => {
    const el = btn.closest('[data-comment]');
    const c = store.commentsById.get(el.dataset.comment);
    const box = el.querySelector(':scope > .c-main > .c-reply');
    if (box.firstElementChild) {
      fx.flipHeight(box, () => (box.innerHTML = ''));
      return;
    }
    box.innerHTML = views.replyBox(`Reply to ${store.userName(c.author)}…`, 'Reply');
    wireReplyBox(box.querySelector('form'), store.post(c.postId), c.id);
    fx.expand(box);
    box.querySelector('textarea').focus({ preventScroll: true });
  };

  ACTIONS['reply-cancel'] = (btn) => {
    const form = btn.closest('form');
    const box = form.parentElement;
    if (box.id === 'top-reply') {
      form.querySelector('textarea').value = '';
      return;
    }
    if (btn.dataset.restore) {
      const main = box.parentElement;
      main.querySelector(':scope > .c-body').hidden = false;
      main.querySelector(':scope > .c-actions').hidden = false;
      box.innerHTML = '';
      return;
    }
    fx.flipHeight(box, () => (box.innerHTML = ''));
  };

  ACTIONS['hide-highlights'] = (btn) => removeCard(btn.closest('.highlights'));

  ACTIONS['dismiss-hello'] = (btn) => {
    store.state.tourDone = true;
    store.save();
    removeCard(btn.closest('.hello'));
  };

  ACTIONS.back = () => {
    if (stack.length > 1) history.back();
    else go(viewNook ? '#/n/' + viewNook.id : '#/');
  };

  ACTIONS.follow = (btn) => {
    const following = (store.state.following = store.state.following || []);
    const name = btn.dataset.user;
    const on = !following.includes(name);
    if (on) following.push(name);
    else following.splice(following.indexOf(name), 1);
    store.save();
    btn.className = `m3-btn ${on ? 'tonal' : 'filled'}`;
    btn.innerHTML = `${icon(on ? 'how_to_reg' : 'person_add')}${on ? 'Following' : 'Follow'}`;
    if (on) {
      M3.burst(btn, 'hearts', { count: 8 });
      fx.pop(btn, 0.85);
    }
    fx.haptic(on ? 10 : 5);
    M3.toast(on ? `Following u/${name}` : `Unfollowed u/${name}`, { symbol: on ? 'how_to_reg' : 'person_remove', shape: 'heart' });
  };

  // ---- inbox -----------------------------------------------------------------------------------------

  ACTIONS['read-all'] = () => {
    store.markRead();
    renderBadges();
    // the unread ones settle one after another
    $$('.note.unread', main).forEach((note, i) => setTimeout(() => note.classList.remove('unread'), fx.reduced() ? 0 : i * 70));
    const count = $('.page-head .muted', main);
    if (count) M3.rollText(count, plural(0, 'unread notification'));
    fx.haptic(8);
    M3.toast('All caught up', { symbol: 'done_all', shape: 'clover4' });
  };

  ACTIONS['open-note'] = (btn) => {
    store.markRead(btn.dataset.note);
    renderBadges();
    if (btn.dataset.href) go(btn.dataset.href);
    else btn.classList.remove('unread');
  };

  // ---- sheets: nooks, collections, profile, shortcuts -----------------------------------------------------

  function swatchesHTML(selected, name) {
    return (
      `<div class="swatches" data-swatches="${name}">` +
      ui.SEEDS.map((seed, i) => `<button type="button" class="swatch" data-seed="${seed}" aria-pressed="${seed === selected}" aria-label="Colour ${seed}"><m3-shape shape="${ui.SEED_SHAPES[i]}" style="color:${seed}"></m3-shape></button>`).join('') +
      `<input type="color" class="color-input" value="${selected}" aria-label="Pick any colour"></div>`
    );
  }

  function wireSwatches(root, onPick) {
    const input = root.querySelector('.color-input');
    const pick = (seed) => {
      root.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seed === seed)));
      input.value = seed;
      onPick(seed);
    };
    root.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => pick(b.dataset.seed)));
    input.addEventListener('input', () => pick(input.value));
  }

  function shapeGridHTML(selected) {
    return `<div class="shape-grid" role="group" aria-label="Shape">${M3Shapes.names
      .filter((n) => n !== 'softCookie')
      .map((n) => `<button type="button" data-shape="${n}" aria-pressed="${n === selected}" aria-label="${n}" data-tooltip="${n}"><m3-shape shape="${n}"></m3-shape></button>`)
      .join('')}</div>`;
  }

  function wireGrid(root, attr, onPick) {
    root.querySelectorAll(`[data-${attr}]`).forEach((b) =>
      b.addEventListener('click', () => {
        root.querySelectorAll(`[data-${attr}]`).forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
        onPick(b.dataset[attr]);
      })
    );
  }

  function newNook() {
    const pickSeed = ui.SEEDS[Math.floor(Math.random() * ui.SEEDS.length)];
    const model = { color: pickSeed, shape: 'cookie9', symbol: 'forum', category: 'Hobbies' };
    const categories = [...new Set(store.allCommunities().map((c) => c.category))].filter((c) => c !== 'Meta');
    ui.sheet({
      headline: 'Create a nook',
      symbol: 'castle',
      shape: 'softBurst',
      className: 'wide',
      html:
        '<div class="nook-preview" id="np"><m3-shape-icon id="np-icon" shape="cookie9" symbol="forum" size="72" icon-size="34"></m3-shape-icon>' +
        '<div class="np-text"><b class="m3-title" id="np-title">Your nook</b><span class="muted" id="np-id">n/your_nook</span><span id="np-tag" class="muted">A cosy corner for…</span></div></div>' +
        '<div class="split">' +
        '<div class="field"><label for="nn-id">Name (n/…)</label><input class="m3-field" id="nn-id" maxlength="21" placeholder="pottery_club" autocomplete="off" autofocus><span class="error" id="nn-id-err"></span></div>' +
        '<div class="field"><label for="nn-title">Display title</label><input class="m3-field" id="nn-title" maxlength="40" placeholder="Pottery Club"></div></div>' +
        '<div class="field"><label for="nn-tag">What’s it about?</label><input class="m3-field" id="nn-tag" maxlength="120" placeholder="Wobbly mugs and the people who make them."></div>' +
        `<div class="field"><span class="field-label">Category</span><div class="chips" style="flex-wrap:wrap">${categories.map((c) => `<button type="button" class="chip" data-cat="${c}" aria-pressed="${c === model.category}">${c}</button>`).join('')}</div></div>` +
        `<div class="field"><span class="field-label">Colour</span>${swatchesHTML(model.color, 'nook')}</div>` +
        `<div class="field"><span class="field-label">Shape</span>${shapeGridHTML(model.shape)}</div>` +
        `<div class="field"><span class="field-label">Symbol</span><div class="symbol-grid">${ui.NOOK_SYMBOLS.map((s) => `<button type="button" data-symbol="${s}" aria-pressed="${s === model.symbol}" aria-label="${s.replace(/_/g, ' ')}"><span class="m3-icon">${s}</span></button>`).join('')}</div></div>`,
      setup(body) {
        const preview = body.querySelector('#np');
        const npIcon = body.querySelector('#np-icon');
        const idInput = body.querySelector('#nn-id');
        const titleInput = body.querySelector('#nn-title');
        const tagInput = body.querySelector('#nn-tag');
        const retint = () => ui.theme.scheme(model.color.toLowerCase()).then((colors) => M3.color.apply(colors, preview), () => {});
        retint();
        const slug = () => idInput.value.trim().toLowerCase();
        const sync = () => {
          body.querySelector('#np-title').textContent = titleInput.value.trim() || (slug() ? slug().replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()) : 'Your nook');
          body.querySelector('#np-id').textContent = 'n/' + (slug() || 'your_nook');
          body.querySelector('#np-tag').textContent = tagInput.value.trim() || 'A cosy corner for…';
        };
        [idInput, titleInput, tagInput].forEach((el) => el.addEventListener('input', sync));
        idInput.addEventListener('input', () => {
          idInput.value = idInput.value.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_]/g, '');
          body.querySelector('#nn-id-err').textContent = '';
        });
        wireSwatches(body.querySelector('[data-swatches]'), (seed) => {
          model.color = seed;
          retint();
        });
        wireGrid(body.querySelector('.shape-grid'), 'shape', (shape) => {
          model.shape = shape;
          npIcon.setAttribute('shape', shape);
        });
        wireGrid(body.querySelector('.symbol-grid'), 'symbol', (symbol) => {
          model.symbol = symbol;
          npIcon.setAttribute('symbol', symbol);
        });
        wireGrid(body, 'cat', (cat) => (model.category = cat));
        body._model = model;
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Create nook',
          variant: 'filled',
          symbol: 'castle',
          run(close, body) {
            const id = body.querySelector('#nn-id').value.trim().toLowerCase();
            const err = body.querySelector('#nn-id-err');
            if (!/^[a-z0-9_]{3,21}$/.test(id)) {
              err.textContent = 'Use 3–21 letters, numbers or underscores.';
              body.querySelector('#nn-id').focus();
              return false;
            }
            if (store.community(id)) {
              err.textContent = `n/${id} already exists. Try another name.`;
              body.querySelector('#nn-id').focus();
              return false;
            }
            const title = body.querySelector('#nn-title').value.trim() || id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
            const tagline = body.querySelector('#nn-tag').value.trim() || `A brand new nook about ${title.toLowerCase()}.`;
            const c = store.createCommunity({ id, title, tagline, description: tagline, category: model.category, color: model.color, shape: model.shape, symbol: model.symbol, activity: 0.1 });
            setTimeout(() => {
              go('#/n/' + c.id);
              M3.toast(`Welcome to n/${c.id}, founder!`, { symbol: c.symbol, shape: c.shape });
              // a nook is born: confetti in its own shape and colours
              setTimeout(() => {
                fx.confetti($('.nook-hero .nook-avatar', main) || { x: innerWidth / 2, y: innerHeight / 3 }, { shapes: [c.shape, c.shape, 'sunny', 'heart'], count: 40, power: 1.2 });
                fx.haptic([12, 60, 12, 60, 20]);
              }, 450);
            }, 140);
            return c.id;
          },
        },
      ],
    });
  }
  ACTIONS['new-nook'] = () => {
    closeDrawer();
    newNook();
  };

  async function askName(headline, value, label) {
    let input = null;
    return ui.sheet({
      headline,
      symbol: 'collections_bookmark',
      shape: 'gem',
      html: `<div class="field"><label for="col-name">${label}</label><input class="m3-field" id="col-name" maxlength="40" value="${esc(value || '')}" placeholder="Recipes to try" autofocus></div>`,
      setup(body, close) {
        input = body.querySelector('input');
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && input.value.trim()) close(input.value.trim());
        });
      },
      actions: [{ label: 'Cancel', value: null }, { label: 'Save', variant: 'filled', run: () => (input.value.trim() ? input.value.trim() : false) }],
    });
  }

  ACTIONS['new-collection'] = async () => {
    const name = await askName('New collection', '', 'Name');
    if (!name) return;
    const col = store.createCollection(name);
    M3.toast(`Made “${col.name}”`, { symbol: 'collections_bookmark', shape: col.shape });
    if (route.view === 'saved') render();
  };

  ACTIONS['rename-collection'] = async (btn) => {
    const col = store.state.collections.find((c) => c.id === btn.dataset.col);
    const name = await askName('Rename collection', col.name, 'Name');
    if (!name) return;
    col.name = name;
    store.save();
    render();
  };

  ACTIONS['delete-collection'] = async (btn) => {
    const col = store.state.collections.find((c) => c.id === btn.dataset.col);
    const ok = await M3.dialog({
      headline: `Delete “${col.name}”?`,
      symbol: 'delete',
      iconShape: 'softBoom',
      body: 'The posts stay saved; only the collection goes.',
      actions: [{ label: 'Cancel', value: false }, { label: 'Delete', value: true, variant: 'filled' }],
    });
    if (!ok) return;
    store.state.collections = store.state.collections.filter((c) => c !== col);
    store.save();
    go('#/saved', { replace: true });
  };

  function collectSheet(p) {
    const rows = () =>
      store.state.collections
        .map((col) => {
          const on = col.posts.includes(p.id);
          return `<label class="switch-row"><m3-shape-icon shape="${col.shape}" symbol="collections_bookmark" size="36" icon-size="18" style="--m3-shape-icon-color:${col.color};--m3-shape-icon-on-color:${ui.ink(col.color)}"></m3-shape-icon><span class="switch-text"><span>${esc(col.name)}</span><small>${plural(col.posts.length, 'post')}</small></span><input type="checkbox" class="m3-switch" role="switch" data-col="${col.id}"${on ? ' checked' : ''}></label>`;
        })
        .join('') || '<p class="muted">No collections yet. Make your first one below.</p>';
    ui.sheet({
      headline: 'Add to collection',
      symbol: 'collections_bookmark',
      shape: 'gem',
      html: `<div class="setting-card" id="col-list" style="display:grid;gap:14px">${rows()}</div><form class="toolbar" id="col-new"><input class="m3-field" style="flex:1" maxlength="40" placeholder="New collection name" aria-label="New collection name"><button class="m3-btn tonal" type="submit">${icon('add')}Create</button></form>`,
      setup(body) {
        const list = body.querySelector('#col-list');
        const wire = () =>
          list.querySelectorAll('[data-col]').forEach((sw) =>
            sw.addEventListener('change', () => {
              store.collect(sw.dataset.col, p.id, sw.checked);
              $$(`[data-post="${p.id}"] [data-act="save"]`).forEach((b) => b.setAttribute('aria-pressed', 'true'));
            })
          );
        wire();
        body.querySelector('#col-new').addEventListener('submit', (e) => {
          e.preventDefault();
          const input = e.target.querySelector('input');
          const name = input.value.trim();
          if (!name) return;
          const col = store.createCollection(name);
          store.collect(col.id, p.id, true);
          input.value = '';
          list.innerHTML = rows();
          wire();
          $$(`[data-post="${p.id}"] [data-act="save"]`).forEach((b) => b.setAttribute('aria-pressed', 'true'));
        });
      },
      actions: [{ label: 'Done', variant: 'filled' }],
    }).then(() => {
      if (route.view === 'saved' || route.view === 'collection') render();
    });
  }

  function editProfile() {
    const me = store.state.me;
    const model = { color: me.color, shape: me.shape };
    ui.sheet({
      headline: 'Edit profile',
      symbol: 'face',
      shape: me.shape,
      html:
        `<div class="nook-preview"><span class="avatar" id="ep-avatar" style="--av:${me.color};--av-ink:${ui.ink(me.color)};--s:80px"><m3-shape shape="${me.shape}" id="ep-shape"></m3-shape><b id="ep-letter">${esc(me.name[0].toUpperCase())}</b></span>` +
        `<div class="np-text"><b class="m3-title" id="ep-name">${esc(me.name)}</b><span class="muted">Your shape and colour follow you everywhere</span></div></div>` +
        `<div class="field"><label for="ep-input">Username</label><input class="m3-field" id="ep-input" maxlength="20" value="${esc(me.name)}" autocomplete="off"><span class="error" id="ep-err"></span></div>` +
        `<div class="field"><label for="ep-bio">Bio</label><textarea class="m3-field" id="ep-bio" rows="2" maxlength="160" placeholder="Tell people what you’re into">${esc(me.bio || '')}</textarea></div>` +
        `<div class="field"><span class="field-label">Colour</span>${swatchesHTML(me.color, 'me')}</div>` +
        `<div class="field"><span class="field-label">Shape</span>${shapeGridHTML(me.shape)}</div>`,
      setup(body) {
        const av = body.querySelector('#ep-avatar');
        const shape = body.querySelector('#ep-shape');
        const input = body.querySelector('#ep-input');
        input.addEventListener('input', () => {
          input.value = input.value.replace(/[^A-Za-z0-9_]/g, '');
          body.querySelector('#ep-name').textContent = input.value || '…';
          body.querySelector('#ep-letter').textContent = (input.value[0] || '?').toUpperCase();
          body.querySelector('#ep-err').textContent = '';
        });
        wireSwatches(body.querySelector('[data-swatches]'), (seed) => {
          model.color = seed;
          av.style.setProperty('--av', seed);
          av.style.setProperty('--av-ink', ui.ink(seed));
        });
        wireGrid(body.querySelector('.shape-grid'), 'shape', (name) => {
          model.shape = name;
          shape.transitionTo(name, { spring: true });
        });
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Save',
          variant: 'filled',
          run(close, body) {
            const name = body.querySelector('#ep-input').value.trim();
            const err = body.querySelector('#ep-err');
            if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) {
              err.textContent = 'Use 3–20 letters, numbers or underscores.';
              return false;
            }
            if (name !== me.name && window.NOOK_DATA.users[name]) {
              err.textContent = 'Someone already has that name.';
              return false;
            }
            const renamed = name !== me.name;
            if (renamed) store.renameMe(name);
            me.bio = body.querySelector('#ep-bio').value.trim();
            me.color = model.color;
            me.shape = model.shape;
            store.save();
            renderMe();
            if (route.view === 'profile') go('#/u/' + encodeURIComponent(name), { replace: true });
            else render();
            M3.toast('Profile updated', { symbol: 'face', shape: model.shape });
            return true;
          },
        },
      ],
    });
  }
  ACTIONS['edit-profile'] = editProfile;

  function shortcuts() {
    // each key list reads as written: words between keys are shown as words
    const keys = [
      [['j', 'k'], 'Next / previous post'],
      [['a', 'z'], 'Upvote / downvote'],
      [['x'], 'Spark the post'],
      [['s'], 'Save the post'],
      [['o', 'or', 'Enter'], 'Open the post'],
      [['n'], 'New post'],
      [['/'], 'Search'],
      [['g', 'then', 'h'], 'Go home (or p, e, s, i for popular, explore, saved, inbox)'],
      [['t'], 'Light or dark'],
      [['?'], 'This help'],
    ];
    const WORDS = ['or', 'then'];
    ui.sheet({
      headline: 'Keyboard shortcuts',
      symbol: 'keyboard',
      shape: 'squircle',
      html: `<div class="keys">${keys
        .map(([parts, what]) => `<span>${parts.map((k) => (WORDS.includes(k) ? `<span class="muted"> ${k} </span>` : `<kbd>${esc(k)}</kbd>`)).join(' ')}</span><span>${what}</span>`)
        .join('')}</div>`,
      actions: [{ label: 'Got it', variant: 'filled' }],
    });
  }
  ACTIONS.shortcuts = () => {
    closeDrawer();
    shortcuts();
  };

  ACTIONS.export = () => {
    const blob = new Blob([JSON.stringify(store.state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nook-${store.state.me.name}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    M3.toast('Exported', { symbol: 'download', shape: 'pixelCircle' });
  };

  ACTIONS.reset = async () => {
    const ok = await M3.dialog({
      headline: 'Reset the demo?',
      symbol: 'restart_alt',
      iconShape: 'softBoom',
      body: 'Your posts, comments, nooks, votes, badges and settings will be wiped from this browser.',
      actions: [{ label: 'Cancel', value: false }, { label: 'Reset', value: true, variant: 'filled' }],
    });
    if (!ok) return;
    store.reset();
    location.hash = '#/';
    location.reload();
  };

  // ---- sort controls, used by the feed pages ---------------------------------------------------------

  app.onSort = (root, fn) => {
    const el = root.querySelector('#sort');
    if (el) el.addEventListener('change', (e) => fn(e.detail.value));
  };

  // ---- the composer -------------------------------------------------------------------------------------

  function shrinkImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('read'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('decode'));
        img.onload = () => {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.84));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  app.mountSubmit = (root, startNook, startType, draft) => {
    const form = $('#submit-form', root);
    const model = {
      nook: startNook,
      type: startType,
      flair: draft.flair || null,
      image: null,
      poll: draft.poll && draft.poll.length >= 2 ? draft.poll : ['', ''],
    };
    const title = $('#f-title', root);
    const body = $('#f-body', root);
    const url = $('#f-url', root);
    const spoiler = $('#f-spoiler', root);
    const status = $('#f-status', root);

    // the nook you're posting in: the app wears its colours while you write
    const setNook = (c) => {
      model.nook = c;
      if (!(c.flairs || []).includes(model.flair)) model.flair = null;
      $('#nook-picker', root).innerHTML = `${nookIcon(c, 32, 18)}<span>n/${esc(c.id)}</span>${icon('expand_more')}`;
      $('#f-flairs', root).innerHTML = (c.flairs || []).map((f) => `<button type="button" class="chip" data-flair="${esc(f)}" aria-pressed="${f === model.flair}">${esc(f)}</button>`).join('') || '<span class="muted">This nook has no flairs.</span>';
      $('#submit-rail', root).innerHTML = views.submitRail(c);
      viewNook = c;
      ui.theme.setRoot(S().themeNooks ? c.color : null);
      if (brandShape.showing !== c.shape) brandShape.transitionTo(c.shape, { spring: true });
      renderDrawerNooks();
    };
    setNook(startNook);

    $('#nook-picker', root).addEventListener('click', (e) => {
      const joined = store.state.joined.map(store.community).filter(Boolean);
      const others = store.allCommunities().filter((c) => !store.state.joined.includes(c.id));
      M3.menu(e.currentTarget, [
        ...joined.map((c) => ({ label: `n/${c.id}`, symbol: c.symbol, onSelect: () => (setNook(c), saveDraft()) })),
        others.length ? { separator: true } : null,
        ...others.map((c) => ({ label: `n/${c.id}`, symbol: c.symbol, onSelect: () => (setNook(c), saveDraft()) })),
      ]);
    });

    $('#f-flairs', root).addEventListener('click', (e) => {
      const chip = e.target.closest('[data-flair]');
      if (!chip) return;
      model.flair = model.flair === chip.dataset.flair ? null : chip.dataset.flair;
      $$('[data-flair]', root).forEach((other) => other.setAttribute('aria-pressed', String(other.dataset.flair === model.flair)));
      saveDraft();
    });

    const showType = () => {
      $$('[data-for]', root).forEach((el) => (el.hidden = el.dataset.for !== model.type));
      $('#f-body-optional', root).hidden = false;
    };
    showType();
    $('#post-type', root).addEventListener('change', (e) => {
      model.type = e.detail.value;
      showType();
      saveDraft();
    });

    const count = () => ($('#f-title-count', root).textContent = `${title.value.length}/300`);
    count();
    title.addEventListener('input', () => {
      count();
      $('#f-title-err', root).textContent = '';
    });

    // formatting buttons wrap the selection
    $$('.format-bar [data-wrap-a]', root).forEach((b) =>
      b.addEventListener('click', () => {
        const a = b.dataset.wrapA;
        const z = b.dataset.wrapB;
        const { selectionStart: s, selectionEnd: t, value } = body;
        const picked = value.slice(s, t) || (z ? 'text' : '');
        const lineStart = !z ? value.lastIndexOf('\n', s - 1) + 1 : s;
        if (!z) body.value = value.slice(0, lineStart) + a + value.slice(lineStart);
        else body.value = value.slice(0, s) + a + picked + z + value.slice(t);
        body.focus();
        const at = !z ? t + a.length : s + a.length;
        body.setSelectionRange(at, at + (z ? picked.length : 0));
        saveDraft();
      })
    );

    $('#body-mode', root).addEventListener('change', (e) => {
      const preview = e.detail.value === 'preview';
      $('#f-write', root).hidden = preview;
      const box = $('#f-preview', root);
      box.hidden = !preview;
      box.innerHTML = body.value.trim() ? ui.md(body.value) : '<p class="muted">Nothing to preview yet.</p>';
    });

    // the image: chosen or dropped, then shrunk to fit in local storage
    const drop = $('#f-drop', root);
    const inner = $('#f-drop-inner', root);
    const placeholder = inner.innerHTML;
    const showImage = () => {
      if (model.image) {
        inner.innerHTML = `<img src="${model.image}" alt="Your image"><button type="button" class="m3-icon-btn filled remove" id="f-remove" aria-label="Remove image"><span class="m3-icon">close</span></button>`;
        $('#f-remove', root).addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          model.image = null;
          showImage();
        });
      } else {
        inner.innerHTML = placeholder;
      }
    };
    const takeFile = async (file) => {
      const err = $('#f-image-err', root);
      err.textContent = '';
      if (!file || !file.type.startsWith('image/')) {
        err.textContent = 'That doesn’t look like an image.';
        return;
      }
      inner.innerHTML = '<m3-loading></m3-loading>';
      try {
        model.image = await shrinkImage(file);
        if (model.image.length > 2_400_000) {
          model.image = null;
          err.textContent = 'That image is too big to keep in this browser. Try a smaller one.';
        }
      } catch (_) {
        model.image = null;
        err.textContent = 'Couldn’t read that image.';
      }
      showImage();
    };
    $('#f-file', root).addEventListener('change', (e) => takeFile(e.target.files[0]));
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      takeFile(e.dataTransfer.files[0]);
    });

    // poll options
    const pollBox = $('#f-poll', root);
    const drawPoll = () => {
      pollBox.innerHTML = model.poll
        .map(
          (text, i) =>
            `<div class="opt"><input class="m3-field" data-opt="${i}" maxlength="80" placeholder="Option ${i + 1}" value="${esc(text)}">` +
            (model.poll.length > 2 ? `<button type="button" class="m3-icon-btn small" data-drop-opt="${i}" aria-label="Remove option ${i + 1}"><span class="m3-icon">close</span></button>` : '') +
            '</div>'
        )
        .join('');
      $('#f-poll-add', root).hidden = model.poll.length >= 6;
    };
    drawPoll();
    pollBox.addEventListener('input', (e) => {
      const i = e.target.dataset.opt;
      if (i != null) model.poll[+i] = e.target.value;
      saveDraft();
    });
    pollBox.addEventListener('click', (e) => {
      const b = e.target.closest('[data-drop-opt]');
      if (!b) return;
      model.poll.splice(+b.dataset.dropOpt, 1);
      drawPoll();
      saveDraft();
    });
    $('#f-poll-add', root).addEventListener('click', () => {
      model.poll.push('');
      drawPoll();
      pollBox.querySelector(`[data-opt="${model.poll.length - 1}"]`).focus();
    });

    // drafts keep themselves
    let draftTimer = 0;
    function saveDraft() {
      clearTimeout(draftTimer);
      draftTimer = setTimeout(() => {
        store.state.draft = { n: model.nook.id, type: model.type, title: title.value, body: body.value, url: url.value, flair: model.flair, spoiler: spoiler.checked, poll: model.poll };
        store.save();
        status.textContent = 'Draft saved';
        M3.rollText(status, 'Draft saved · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }, 500);
    }
    [title, body, url].forEach((el) => el.addEventListener('input', saveDraft));
    spoiler.addEventListener('change', saveDraft);
    app.onLeave(() => clearTimeout(draftTimer));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      const fail = (id, text, el) => {
        $(id, root).textContent = text;
        if (ok && el) el.focus();
        ok = false;
      };
      ['#f-title-err', '#f-image-err', '#f-url-err', '#f-poll-err'].forEach((id) => ($(id, root).textContent = ''));
      const t = title.value.trim();
      if (t.length < 3) fail('#f-title-err', 'Give your post a title (at least 3 characters).', title);
      let link = null;
      if (model.type === 'image' && !model.image) fail('#f-image-err', 'Add an image, or switch to a text post.', drop);
      if (model.type === 'link') {
        try {
          const u = new URL(url.value.trim());
          if (!/^https?:$/.test(u.protocol)) throw new Error('scheme');
          link = { url: u.href, domain: u.hostname.replace(/^www\./, ''), title: t };
        } catch (_) {
          fail('#f-url-err', 'That link doesn’t look right. It should start with https://', url);
        }
      }
      const options = model.poll.map((o) => o.trim()).filter(Boolean);
      if (model.type === 'poll' && options.length < 2) fail('#f-poll-err', 'A poll needs at least two options.', pollBox.querySelector('input'));
      if (!ok) {
        M3.motion.animate(form, [{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(0)' }], { duration: 260 });
        return;
      }
      clearTimeout(draftTimer);
      const p = store.createPost({ n: model.nook.id, title: t, body: body.value.trim(), type: model.type, flair: model.flair, link, image: model.image, poll: options, spoiler: spoiler.checked });
      if (!store.saveNow() && p.image) M3.snackbar('Posted, but this browser couldn’t store the image. It may vanish after a reload.');
      go(`#/n/${p.n}/p/${p.id}`, { replace: true });
      M3.toast(`Posted to n/${p.n}`, { symbol: 'send', shape: model.nook.shape });
      // the new post lands with a little confetti in its nook's shape
      setTimeout(() => {
        const card = $('.post.is-open', main);
        if (!card) return;
        fx.pop(card, 0.94);
        fx.confetti(card.querySelector('.post-title') || card, { shapes: [model.nook.shape, 'sunny', 'heart', 'cookie9'], count: 26 });
        fx.haptic([10, 60, 20]);
      }, 380);
    });
  };

  // ---- keyboard shortcuts ---------------------------------------------------------------------------------

  let gPending = 0;
  function focusedPost() {
    return $('.post.kb-focus', main) || null;
  }
  function moveFocus(step) {
    const posts = $$('.post', main);
    if (!posts.length) return;
    const now = focusedPost();
    let i = now ? posts.indexOf(now) + step : step > 0 ? 0 : posts.length - 1;
    i = Math.max(0, Math.min(posts.length - 1, i));
    if (now) now.classList.remove('kb-focus');
    posts[i].classList.add('kb-focus');
    posts[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t.closest && t.closest('input, textarea, select, [contenteditable="true"], dialog')) {
      if (e.key === 'Escape' && t.blur && !t.closest('dialog')) t.blur();
      return;
    }
    // enter belongs to whatever has focus
    if (e.key === 'Enter' && t !== document.body && t !== main) return;
    if (e.key === 'Escape') {
      closePicker();
      closeDrawer();
      topbar.classList.remove('searching');
      return;
    }
    if (gPending) {
      clearTimeout(gPending);
      gPending = 0;
      const dest = { h: '#/', p: '#/popular', e: '#/explore', s: '#/saved', i: '#/inbox' }[e.key];
      if (dest) go(dest);
      return;
    }
    const post = focusedPost() || (e.key === 'o' || e.key === 'Enter' ? null : $('.post.is-open', main));
    const click = (sel) => {
      const target = post && post.querySelector(sel);
      if (target) target.click();
    };
    switch (e.key) {
      case 'j':
        moveFocus(1);
        break;
      case 'k':
        moveFocus(-1);
        break;
      case 'a':
        click('.post-actions .vote .up');
        break;
      case 'z':
        click('.post-actions .vote .down');
        break;
      case 's':
        click('[data-act="save"]');
        break;
      case 'x':
        click('[data-act="spark-picker"]');
        break;
      case 'o':
      case 'Enter':
        if (post && post.dataset.href) go(post.dataset.href);
        else return;
        break;
      case 'n':
        go('#/submit');
        break;
      case 't':
        $('#theme-btn').click();
        break;
      case '/':
        if (getComputedStyle(searchInput.closest('form')).display === 'none') topbar.classList.add('searching');
        searchInput.focus();
        searchInput.select();
        break;
      case '?':
        shortcuts();
        break;
      case 'g':
        gPending = setTimeout(() => (gPending = 0), 1200);
        break;
      default:
        return;
    }
    e.preventDefault();
  });

  // ---- the lived-in bits -------------------------------------------------------------------------------------

  const randomOf = (list) => list[Math.floor(Math.random() * list.length)];
  const later = (min, max, fn) => setTimeout(fn, (min + Math.random() * (max - min)) * 1000);

  function regularsOf(nookId) {
    const names = store.visiblePosts().filter((p) => p.n === nookId && !store.isMe(p.author)).map((p) => p.author);
    return names.length ? names : Object.keys(window.NOOK_DATA.users);
  }

  store.on('posted', (p) => {
    later(8, 15, () => {
      if (store.isRemoved(p.id)) return;
      const who = randomOf(regularsOf(p.n));
      store.addOwnComment(p.id, null, randomOf(store.replies), who);
      store.notify({ kind: 'reply', symbol: 'chat', shape: 'clover4', text: `u/${who} commented on your post “${ui.plain(p.title, 60)}”`, href: `#/n/${p.n}/p/${p.id}` });
      if (route.view === 'postPage' && route.params.post === p.id) rerenderComments();
    });
  });

  store.on('commented', (c) => {
    if (Math.random() > 0.5) return;
    const p = store.post(c.postId);
    const parent = c.parentId && store.commentsById.get(c.parentId);
    const who = parent && !store.isMe(parent.author) ? parent.author : !store.isMe(p.author) ? p.author : randomOf(regularsOf(p.n));
    later(10, 20, () => {
      if (store.isRemoved(c.id)) return;
      const reply = store.addOwnComment(p.id, c.id, randomOf(['Ha, exactly!', 'Good point, I hadn’t thought of it that way.', 'Thank you for this 🙏', 'Agreed 100%.', 'Love this take.', 'Okay you convinced me.']), who);
      store.notify({ kind: 'reply', symbol: 'reply', shape: 'cookie6', text: `u/${who} replied to your comment`, href: `#/n/${p.n}/p/${p.id}?c=${reply.id}` });
      if (route.view === 'postPage' && route.params.post === p.id) rerenderComments();
    });
  });

  store.on('notify', (note) => {
    renderBadges();
    if (note.kind === 'reply') M3.toast(note.text, { symbol: note.symbol, shape: note.shape, timeout: 3200 });
  });

  store.on('badge', (badge) => {
    setTimeout(() => {
      M3.toast(`Badge unlocked: ${badge.name}`, { symbol: badge.symbol, shape: badge.shape, timeout: 3200 });
      fx.confetti({ x: innerWidth / 2, y: innerHeight - (innerWidth < 720 ? 130 : 60) }, { shapes: [badge.shape, badge.shape, 'sunny'], count: 24, power: 0.9 });
      fx.haptic([8, 50, 8]);
    }, 600);
  });

  // event clocks tick, and live ones start the shared spin
  setInterval(() => {
    for (const el of $$('[data-when]')) {
      for (const c of store.allCommunities()) {
        const ev = (c.events || []).find((x) => x.id === el.dataset.when);
        if (ev) el.textContent = ui.eventStatus(ev).text;
      }
    }
  }, 30000);

  // the break reminder counts time you actually spend looking
  let looked = 0;
  let nudgeAt = 0;
  function scheduleBreak() {
    nudgeAt = S().breakMinutes ? Math.max(looked, 0) + S().breakMinutes * 60 : 0;
  }
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    looked += 15;
    if (!nudgeAt || looked < nudgeAt || document.querySelector('dialog[open]')) return;
    nudgeAt = 0;
    M3.dialog({
      headline: 'Time for a breather?',
      symbol: 'self_improvement',
      iconShape: 'heart',
      body: `You’ve been on Nook for about ${S().breakMinutes} minutes. Stretch, sip some water, look at something far away. The nooks will still be here.`,
      actions: [{ label: '5 more minutes', value: 'snooze' }, { label: 'Take a break', value: 'break', variant: 'filled' }],
    }).then((choice) => {
      if (choice === 'snooze') nudgeAt = looked + 5 * 60;
      else {
        scheduleBreak();
        if (choice === 'break') M3.toast('See you soon', { symbol: 'spa', shape: 'flower' });
      }
    });
  }, 15000);

  // ---- scrolling: a lifted top bar, a bottom bar that steps aside, a way back up ------------------------

  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'fab-top';
  fab.setAttribute('aria-label', 'Back to top');
  fab.dataset.tooltip = 'Back to top';
  fab.innerHTML = '<m3-shape shape="cookie9" aria-hidden="true"></m3-shape><span class="m3-icon" aria-hidden="true">arrow_upward</span>';
  document.body.appendChild(fab);
  fab.addEventListener('click', () => {
    fx.haptic(8);
    fx.play(fab.querySelector('m3-shape'), [{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 800, easing: 'cubic-bezier(.3,0,.2,1)' });
    scrollTo({ top: 0, behavior: fx.reduced() ? 'auto' : 'smooth' });
  });

  let lastY = scrollY;
  let ticking = false;
  function onScroll() {
    const y = scrollY;
    topbar.classList.toggle('scrolled', y > 4);
    fab.classList.toggle('shown', !!main.querySelector('[data-feed]') && y > innerHeight * 1.2);
    // on a phone the bottom bar steps aside while you read on, and comes back as you go up
    const delta = y - lastY;
    if (y < 80 || delta < -6) document.body.classList.remove('bars-hidden');
    else if (delta > 8) document.body.classList.add('bars-hidden');
    lastY = y;
  }
  addEventListener(
    'scroll',
    () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        onScroll();
      });
    },
    { passive: true }
  );

  // ---- pull to refresh, on touch screens ------------------------------------------------------------

  const ptr = document.createElement('div');
  ptr.className = 'ptr';
  ptr.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ptr);
  const PULL = 80;
  let pull = null;

  function resetPull() {
    ptr.classList.remove('pulling', 'refreshing');
    ptr.style.translate = '';
    ptr.style.opacity = '';
    ptr.innerHTML = '<m3-shape shape="cookie9"></m3-shape>';
  }
  resetPull();

  addEventListener(
    'touchstart',
    (e) => {
      pull = null;
      if (e.touches.length !== 1 || scrollY > 0 || ptr.classList.contains('refreshing')) return;
      if (!main.querySelector('[data-feed]') || drawer.classList.contains('open') || document.querySelector('dialog[open]')) return;
      pull = { x: e.touches[0].clientX, y: e.touches[0].clientY, d: 0, active: false, armed: false };
    },
    { passive: true }
  );
  addEventListener(
    'touchmove',
    (e) => {
      if (!pull) return;
      const dy = e.touches[0].clientY - pull.y;
      const dx = e.touches[0].clientX - pull.x;
      if (!pull.active) {
        // only a pull that heads straight down
        if (dy < 6 || Math.abs(dx) > dy) {
          if (dy < -4 || Math.abs(dx) > 12) pull = null;
          return;
        }
        pull.active = true;
        ptr.classList.add('pulling');
      }
      if (scrollY > 0) {
        pull = null;
        return resetPull();
      }
      e.preventDefault();
      pull.d = Math.min(150, dy * 0.55);
      const t = Math.min(1, pull.d / PULL);
      const shape = ptr.querySelector('m3-shape');
      ptr.style.translate = `0 ${pull.d - 64}px`;
      ptr.style.opacity = String(Math.min(1, t * 1.5));
      if (shape) {
        shape.angle = pull.d * 3;
        shape.style.scale = String(0.6 + t * 0.4);
      }
      // far enough: it changes shape and taps once, so you know letting go will refresh
      if (t >= 1 && !pull.armed) {
        pull.armed = true;
        fx.haptic(8);
        if (shape) shape.transitionTo('softBurst', { spring: true });
      } else if (t < 1 && pull.armed) {
        pull.armed = false;
        if (shape) shape.transitionTo('cookie9', { spring: true });
      }
    },
    { passive: false }
  );
  addEventListener('touchend', () => {
    if (!pull) return;
    const armed = pull.active && pull.armed;
    pull = null;
    if (!armed) return resetPull();
    ptr.classList.remove('pulling');
    ptr.classList.add('refreshing');
    ptr.style.translate = '0 18px';
    ptr.innerHTML = '<m3-loading aria-label="Refreshing"></m3-loading>';
    setTimeout(() => {
      render();
      resetPull();
      fx.haptic(6);
      M3.toast('You’re up to date', { symbol: 'refresh', shape: 'cookie9' });
    }, 900);
  });

  // ---- start ---------------------------------------------------------------------------------------

  M3.spin.subscribe((value) => (brandShape.angle = value * 30));
  store.touchStreak();
  renderMe();
  applySettings();
  render();
  renderBadges();
  // badges for a first visit (and streaks) arrive once the page has settled
  setTimeout(() => store.checkBadges(), 1200);
})();
