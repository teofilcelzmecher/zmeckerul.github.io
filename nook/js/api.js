// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
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
    if (!base) throw new ApiError(0, { error: 'Budgie’s server isn’t set up yet.', offline: true });
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, token ? { Authorization: 'Bearer ' + token } : {}),
        body: body ? JSON.stringify(body) : undefined,
        keepalive,
      });
    } catch (_) {
      throw new ApiError(0, { error: 'Can’t reach Budgie’s server. Check your connection and try again.', offline: true });
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
    /**
     * a file sent as the whole request (a video, from 1.0), with how far it's got as it goes: onProgress(0 to 1)
     * while it's sent, then the server's answer (which can take a while: the server makes the video ready first)
     */
    upload(path, file, onProgress) {
      if (!base) return Promise.reject(new ApiError(0, { error: 'Budgie’s server isn’t set up yet.', offline: true }));
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', base + path);
        if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        xhr.upload.onprogress = (e) => e.lengthComputable && onProgress && onProgress(e.loaded / e.total);
        xhr.upload.onload = () => onProgress && onProgress(1);
        xhr.onload = () => {
          let data = {};
          try {
            data = JSON.parse(xhr.responseText || '{}');
          } catch (_) {
            /* an answer that isn't JSON says what went wrong by its status */
          }
          if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
          if (xhr.status === 401) setToken(null);
          reject(new ApiError(xhr.status, Object.assign({ error: xhr.status === 413 ? 'That file is too big.' : 'Couldn’t send it. Try again.' }, data)));
        };
        xhr.onerror = () => reject(new ApiError(0, { error: 'Couldn’t reach Budgie’s server. Check your connection and try again.', offline: true }));
        xhr.send(file);
      });
    },
    /** an answer that keeps coming (the live event stream), read as it arrives */
    stream: (path, signal) =>
      base
        ? fetch(base + path, { headers: Object.assign({ Accept: 'text/event-stream' }, token ? { Authorization: 'Bearer ' + token } : {}), cache: 'no-store', signal })
        : Promise.reject(new ApiError(0, { error: 'Budgie’s server isn’t set up yet.', offline: true })),
  };
})();
