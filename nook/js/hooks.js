// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Places where the parts of Budgie added in 1.4 (activity, achievements, rewards, stickers, nudges) put their own
 * bits into pages that belong to views.js, without views.js knowing them:
 *
 *   Nook.hook('profileHero', (u, who, me) => html)   under the name and bio on a profile
 *   Nook.hook('profileActions', (u, who, me) => html) more buttons beside a profile's friend buttons (not your own)
 *   Nook.hook('profileSections', (u, who, me) => html) sections under the profile's header (where badges were)
 *   Nook.hook('profileRail', (u, who, me) => html)   cards in the profile's side column
 *   Nook.hook('profileMount', (root, u, me) => {})    wiring once the profile is on the screen
 *   Nook.hook('settingsSections', (header) => html)  sections in Settings, before Account (header(shape, symbol, title))
 *   Nook.hook('settingsMount', (root) => {})
 *   Nook.hook('personRow', (u) => html)              a line under someone's name in lists of people (friends)
 *   Nook.hook('chatHead', (u) => html)               after the subtitle in a chat with someone
 *   Nook.hook('nameTags', (u) => html)               tiny tags after someone's name on posts and comments
 *   Nook.hook('adminSections', () => html)           sections on the Moderation page
 *   Nook.hook('adminMount', (root) => {})
 *   Nook.hook('afterRender', (route, main) => {})    after every page is drawn
 *   Nook.hook('personMenu', (name, u) => [items])    more items for someone's More menu (on their profile, in a chat)
 *   Nook.hook('signal', (type, data) => {})          something the server said over the live connection that calls.js
 *                                                    doesn't handle itself (a nudge, say)
 *
 * A hook that fails is left out (and said in the console), so one part can't break a page.
 */
(function () {
  'use strict';
  const Nook = (window.Nook = window.Nook || {});
  const hooks = {};
  Nook.hook = (name, fn) => (hooks[name] = hooks[name] || []).push(fn);
  /** every hook's HTML, joined */
  Nook.hooksHTML = (name, ...args) =>
    (hooks[name] || [])
      .map((fn) => {
        try {
          return fn(...args) || '';
        } catch (error) {
          console.error('hook', name, error);
          return '';
        }
      })
      .join('');
  /** every hook's menu items ({ label, symbol, onSelect }), joined */
  Nook.hookItems = (name, ...args) =>
    (hooks[name] || []).flatMap((fn) => {
      try {
        const items = fn(...args);
        return Array.isArray(items) ? items.filter(Boolean) : [];
      } catch (error) {
        console.error('hook', name, error);
        return [];
      }
    });
  /** runs every hook */
  Nook.runHooks = (name, ...args) => {
    for (const fn of hooks[name] || []) {
      try {
        fn(...args);
      } catch (error) {
        console.error('hook', name, error);
      }
    }
  };
})();
