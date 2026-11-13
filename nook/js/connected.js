// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * The page Spotify sends someone back to once they've said yes (or no) to Budgie seeing what they play (1.7). Spotify's
 * answer (a one-time code, and the state Budgie's server gave the link) goes to the server, which finishes linking; the
 * state says whose account it is, so this page needs no sign-in of its own (it may open in another browser, from the
 * phone or computer app). The code leaves the address bar at once, so it's never kept in the browser's history.
 */
(function () {
  'use strict';
  const q = new URLSearchParams(location.search);
  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const base = String(read('nook-api') || (window.NOOK_CONFIG && window.NOOK_CONFIG.api) || '').replace(/\/$/, '');
  const box = document.getElementById('linked');
  const shape = document.getElementById('linked-shape');
  const say = (title, text, ok) => {
    document.getElementById('linked-title').textContent = title;
    document.getElementById('linked-text').textContent = text;
    box.classList.toggle('ok', ok === true);
    box.classList.toggle('no', ok === false);
    if (shape.transitionTo) shape.transitionTo(ok ? 'sunny' : 'ghostish', { spring: true });
  };
  history.replaceState(null, '', location.pathname);
  if (!q.get('state')) return say('Nothing to link here', 'Link Spotify from Settings → Activity in Budgie.', false);
  if (!base) return say('Budgie’s server isn’t set up', 'Try again in a moment.', false);
  fetch(base + '/api/music/spotify/done', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: JSON.stringify({ code: q.get('code') || '', state: q.get('state') || '', error: q.get('error') || '' }),
  })
    .then((res) => res.json().then((answer) => ({ ok: res.ok, answer }), () => ({ ok: false, answer: {} })))
    .then(({ ok, answer }) => {
      if (ok) say('Spotify is linked', `${answer.account ? `Linked as ${answer.account}. ` : ''}Your friends can now see what you play on Spotify. You can close this page and go back to Budgie.`, true);
      else say('Spotify didn’t link', answer.error || 'Try again from Settings → Activity in Budgie.', false);
    })
    .catch(() => say('Can’t reach Budgie’s server', 'Check your connection, then try again from Settings → Activity in Budgie.', false));
})();
