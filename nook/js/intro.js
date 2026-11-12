// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie's welcome (1.6): the first time a new account opens the app, five screens say what Budgie is, each with a
 * small animation of its own: Budgie's shape coming alive, nests popping in, a post with Sparks rising from it, a
 * chat with a call ringing, and a profile made your own. Swiped or stepped through with Next, skipped any time, and
 * seen again from Settings → About (Take the tour). Moves only for whoever's happy with things moving.
 */
(function () {
  'use strict';
  const { ui, fx } = Nook;
  const { icon } = ui;
  const KEY = 'nook-intro';
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nest = (shape, symbol, color, i) => `<span class="in-nest" style="--i:${i}">${ui.nookIcon({ shape, symbol, color }, 84, 40)}</span>`;
  const ART = {
    hello: () =>
      '<div class="intro-art art-hello" aria-hidden="true"><m3-shape class="ih-blob" shape="cookie9"></m3-shape>' +
      ['flower', 'gem', 'heart', 'clover4', 'sunny'].map((s, i) => `<m3-shape class="ih-o o${i + 1}" shape="${s}"></m3-shape>`).join('') +
      '<b class="ih-word" translate="no">budgie</b></div>',
    nests: () =>
      '<div class="intro-art art-nests" aria-hidden="true">' +
      [['cookie9', 'code', '#3d7bff'], ['flower', 'rocket_launch', '#7c4dff'], ['clover4', 'eco', '#2e9d5b'], ['gem', 'sports_esports', '#e2557f'], ['softBurst', 'restaurant', '#f08a24'], ['puffy', 'menu_book', '#00897b']]
        .map(([shape, symbol, color], i) => nest(shape, symbol, color, i))
        .join('') +
      '</div>',
    post: () =>
      '<div class="intro-art art-post" aria-hidden="true"><div class="ip-card"><div class="ip-head"><span class="ip-av"></span><span class="ip-lines"><i></i><i></i></span></div>' +
      '<div class="ip-pic"><m3-shape shape="sunny"></m3-shape><m3-shape shape="pill"></m3-shape></div>' +
      `<div class="ip-actions"><span>${icon('arrow_upward')}</span><span>${icon('chat_bubble')}</span><span class="ip-spark">${icon('auto_awesome')}</span></div></div>` +
      `<span class="ip-float f1">${icon('favorite')}</span><span class="ip-float f2">${icon('celebration')}</span><span class="ip-float f3">${icon('bolt')}</span><span class="ip-float f4">${icon('mood')}</span></div>`,
    chat: () =>
      '<div class="intro-art art-chat" aria-hidden="true"><div class="ic-col">' +
      '<span class="ic-b them" style="--i:0">👋😄</span><span class="ic-b me" style="--i:1">🍿🎬?</span><span class="ic-b them" style="--i:2">🙌✨</span>' +
      '<span class="ic-b me typing" style="--i:3"><i></i><i></i><i></i></span></div>' +
      `<span class="ic-call">${icon('call')}</span></div>`,
    you: () =>
      '<div class="intro-art art-you" aria-hidden="true"><div class="iy-card"><div class="iy-banner"></div>' +
      `<span class="iy-ring"><span class="iy-av">${icon('pets')}</span></span><b class="iy-name" translate="no">you</b><span class="iy-chips"><i></i><i></i><i></i></span></div>` +
      `<span class="iy-spark s1">${icon('auto_awesome')}</span><span class="iy-spark s2">${icon('star')}</span><span class="iy-spark s3">${icon('auto_awesome')}</span></div>`,
  };
  const SLIDES = [
    { art: 'hello', title: 'Welcome to Budgie', text: 'Small, friendly communities, chats and calls. No ads, and nobody tracking you.' },
    { art: 'nests', title: 'Find your nests', text: 'Nests are communities for what you love. Join a few, and what’s posted in them fills your Home.' },
    { art: 'post', title: 'Share anything', text: 'Post words, photos, GIFs, videos and polls. Spark what you love, and reply to anyone.' },
    { art: 'chat', title: 'Chat and call', text: 'Message friends, start a group, call with video, and talk in every nest’s chat.' },
    { art: 'you', title: 'Make it yours', text: 'Colours, shapes, fonts and effects for your profile, and more as you earn achievements.' },
  ];

  // Budgie's shape on the first screen becomes another every couple of seconds, while that screen shows
  const BLOBS = ['cookie9', 'flower', 'gem', 'clover4', 'softBurst', 'puffy', 'heart'];
  function morphing(blob, on) {
    let from = blob.getAttribute('shape');
    let timer = 0;
    const step = () => {
      if (!on() || !blob.isConnected) return;
      const to = BLOBS[(BLOBS.indexOf(from) + 1) % BLOBS.length];
      blob.setAttribute('morph-to', to);
      const t0 = performance.now();
      const frame = (t) => {
        if (!blob.isConnected) return;
        const k = Math.min(1, (t - t0) / 850);
        blob.morph = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        if (k < 1) return requestAnimationFrame(frame);
        blob.setAttribute('shape', to);
        blob.removeAttribute('morph-to');
        blob.morph = 0;
        from = to;
        timer = setTimeout(step, 1600);
      };
      requestAnimationFrame(frame);
    };
    return {
      start: () => (clearTimeout(timer), (timer = setTimeout(step, 900))),
      stop: () => clearTimeout(timer),
    };
  }

  function open({ then = '' } = {}) {
    if (document.querySelector('dialog.intro')) return;
    const dlg = document.createElement('dialog');
    dlg.className = 'intro';
    dlg.setAttribute('aria-label', 'Welcome to Budgie');
    dlg.innerHTML =
      `<button type="button" class="m3-btn text intro-skip" data-intro="skip">Skip</button>` +
      '<div class="intro-track">' +
      SLIDES.map(
        (s, i) =>
          `<section class="intro-slide" data-i="${i}" aria-roledescription="slide" aria-label="${i + 1} / ${SLIDES.length}">${ART[s.art]()}<h2 class="m3-title">${s.title}</h2><p>${s.text}</p></section>`
      ).join('') +
      '</div>' +
      `<div class="intro-bar"><span class="intro-dots" aria-hidden="true">${SLIDES.map(() => '<i></i>').join('')}</span>` +
      `<button type="button" class="m3-btn filled intro-next" data-intro="next">${icon('arrow_forward')}<span class="intro-next-label">Next</span></button></div>`;
    document.body.appendChild(dlg);
    const track = dlg.querySelector('.intro-track');
    const slides = [...dlg.querySelectorAll('.intro-slide')];
    const dots = [...dlg.querySelectorAll('.intro-dots i')];
    const next = dlg.querySelector('.intro-next');
    let at = -1;
    const blob = morphing(dlg.querySelector('.ih-blob'), () => at === 0 && dlg.open);
    const show = (i) => {
      if (i === at) return;
      at = i;
      slides.forEach((s, n) => s.classList.toggle('on', n === i));
      dots.forEach((d, n) => d.classList.toggle('on', n === i));
      const last = i === SLIDES.length - 1;
      next.querySelector('.intro-next-label').textContent = last ? 'Let’s go' : 'Next';
      next.querySelector('.m3-icon').textContent = last ? 'explore' : 'arrow_forward';
      dlg.querySelector('.intro-skip').hidden = last;
      if (i === 0 && !still()) blob.start();
      else blob.stop();
      fx.haptic(6);
    };
    // the screen that's mostly showing is the one that moves
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) show(Number(e.target.dataset.i));
      },
      { root: track, threshold: 0.6 }
    );
    slides.forEach((s) => seen.observe(s));
    const go = (i) => track.scrollTo({ left: i * track.clientWidth, behavior: still() ? 'auto' : 'smooth' });
    const finish = (where) => {
      seen.disconnect();
      blob.stop();
      try {
        localStorage.removeItem(KEY);
      } catch (_) {
        /* nothing to remember */
      }
      const out = fx.play(dlg, [{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      fx.settled(out).then(() => {
        if (dlg.open) dlg.close();
        dlg.remove();
        if (where) location.hash = where;
      });
    };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-intro]');
      if (!b) return;
      if (b.dataset.intro === 'skip') return finish(then);
      if (at < SLIDES.length - 1) go(at + 1);
      else finish(then || '#/explore');
    });
    dlg.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') go(Math.min(SLIDES.length - 1, at + 1));
      if (e.key === 'ArrowLeft') go(Math.max(0, at - 1));
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      finish(then);
    });
    dlg.showModal();
    show(0);
    next.focus({ preventScroll: true });
  }

  // a new account: the welcome once the app is showing (not over the screen with the recovery code), with nothing
  // else open over it
  function maybe() {
    let pending = false;
    try {
      pending = localStorage.getItem(KEY) === '1';
    } catch (_) {
      return;
    }
    if (!pending) return;
    const started = Date.now();
    (function check() {
      const ready = !document.documentElement.classList.contains('gated') && !document.querySelector('dialog[open]');
      if (ready) return setTimeout(() => open(), 400);
      if (Date.now() - started < 60000) setTimeout(check, 300);
    })();
  }

  Nook.intro = { open, maybe, KEY };
  maybe();
})();
