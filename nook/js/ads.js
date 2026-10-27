// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Ads from Google AdSense, and only between posts in feeds: never banners, never in chats,
 * settings or sign-in. They stay off until the publisher id and an in-feed ad unit are filled in
 * js/config.js; until then not one byte of Google's code is loaded.
 *
 * Ads aren't personalised unless config.js says so. Consent where the law asks for it (the EU,
 * the UK, Switzerland) comes from Google's own consent message, set up in AdSense under
 * Privacy & messaging.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const config = (window.NOOK_CONFIG && window.NOOK_CONFIG.ads) || {};
  const client = String(config.client || '');
  const slot = String(config.slot || '');
  const layoutKey = String(config.layoutKey || '');
  const on = /^ca-pub-\d{10,20}$/.test(client) && /^\d{5,15}$/.test(slot) && /^[-+\w]{4,40}$/.test(layoutKey);
  // the first ad comes after this many posts, then one every so many more
  const FIRST = Math.max(3, config.first || 4);
  const EVERY = Math.max(5, config.every || 8);

  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    window.adsbygoogle = window.adsbygoogle || [];
    if (!config.personalized) window.adsbygoogle.requestNonPersonalizedAds = 1;
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + encodeURIComponent(client);
    document.head.appendChild(script);
  }

  /** whether an ad goes after the nth post (1-based) of a feed of `total`: only ever between two posts */
  const after = (n, total) => on && n < total && n >= FIRST && (n - FIRST) % EVERY === 0;

  const slotHTML = () =>
    '<aside class="ad-card" aria-label="Sponsored"><span class="ad-label">Sponsored</span>' +
    `<ins class="adsbygoogle" style="display:block" data-ad-format="fluid" data-ad-layout-key="${layoutKey}" data-ad-client="${client}" data-ad-slot="${slot}"></ins></aside>`;

  /** asks Google to fill every new ad slot inside root */
  function fill(root) {
    if (!on) return;
    load();
    for (const ins of root.querySelectorAll('ins.adsbygoogle:not([data-asked])')) {
      ins.dataset.asked = '1';
      try {
        window.adsbygoogle.push({});
      } catch (_) {
        /* an ad that can't load leaves an empty slot, which hides itself */
      }
    }
  }

  /** opens Google's consent message again, so a choice about ad cookies can be changed */
  function choices() {
    load();
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push(() => window.googlefc.showRevocationMessage());
  }

  Nook.ads = { on, after, slotHTML, fill, choices };
})();
