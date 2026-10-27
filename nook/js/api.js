/*
 * Talking to Nook's server: one JSON request helper and the sign-in token,
 * which lives in this browser's storage (no cookies). A server error comes
 * back as an ApiError carrying the server's own explanation.
 */
(function () {
  'use strict';

  const Nook = (window.Nook = window.Nook || {});
  const TOKEN_KEY = 'nook-token';

  const read = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  };
  const write = (key, value) => {
    try {
      if (value == null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch (_) {
      /* a private window may refuse: you'll just sign in again next time */
    }
  };

  // a "nook-api" entry in storage points this browser at another server, for testing
  const base = String(read('nook-api') || (window.NOOK_CONFIG && window.NOOK_CONFIG.api) || '').replace(/\/$/, '');

  class ApiError extends Error {
    constructor(status, payload) {
      super((payload && payload.error) || 'Something went wrong. Try again.');
      this.status = status;
      Object.assign(this, payload || {});
    }
  }

  let token = read(TOKEN_KEY);
  const signedOutListeners = new Set();

  async function request(method, path, body, { keepalive = false } = {}) {
    if (!base) throw new ApiError(0, { error: 'Nook’s server isn’t set up yet.', offline: true });
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
        body: body ? JSON.stringify(body) : undefined,
        keepalive,
      });
    } catch (_) {
      throw new ApiError(0, { error: 'Can’t reach Nook’s server. Check your connection and try again.', offline: true });
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch (_) {
      payload = null;
    }
    if (!res.ok) {
      const error = new ApiError(res.status, payload);
      if (res.status === 401 && payload && payload.signedOut) {
        setToken(null);
        for (const fn of signedOutListeners) fn(error);
      }
      throw error;
    }
    return payload;
  }

  function setToken(next) {
    token = next || null;
    write(TOKEN_KEY, token);
  }

  Nook.api = {
    base,
    ApiError,
    configured: () => !!base,
    signedIn: () => !!token,
    setToken,
    onSignedOut: (fn) => signedOutListeners.add(fn),
    /** the server's address for a path it gave us, like /api/images/… */
    url: (path) => (path && path.startsWith('/') ? base + path : path || ''),
    get: (path) => request('GET', path),
    post: (path, body, options) => request('POST', path, body || {}, options),
    put: (path, body, options) => request('PUT', path, body || {}, options),
    patch: (path, body) => request('PATCH', path, body || {}),
    del: (path) => request('DELETE', path),
  };
})();
