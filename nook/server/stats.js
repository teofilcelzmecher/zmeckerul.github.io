// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * The counts achievements are made of (Budgie 1.4), per person: numbers that grow (minutes listened, minutes of
 * screen shared) and sets that grow (songs heard, genres, games played).
 *
 *   stats.add(userId, key, by)          a number grows; returns the new value
 *   stats.max(userId, key, value)       a number becomes at least this (a best streak)
 *   stats.get(userId, key)              a number (0 when never counted)
 *   stats.addItem(userId, key, item, label)   one more of a set (true when it's new to them)
 *   stats.count(userId, key)            how many in a set
 *   stats.items(userId, key, { limit, by })   the set: newest first (by 'recent') or most often first (by 'top')
 *   stats.onChange(fn)                  fn(userId, key) after any change (achievements look again then)
 *
 * Keys in use: music.songs, music.artists, music.genres (sets) and music.minutes; games.played (set) and
 * games.minutes; share.minutes. They go when the account does (ON DELETE CASCADE).
 */
'use strict';

function install({ db, now }) {
  db.raw.exec(`
CREATE TABLE IF NOT EXISTS stats (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS stat_items (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  item TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 1,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, key, item)
);`);

  const listeners = [];
  const changed = (userId, key) => {
    for (const fn of listeners) {
      try {
        fn(userId, key);
      } catch (error) {
        console.error('stats listener', error);
      }
    }
  };
  const get = (userId, key) => (db.get('SELECT value FROM stats WHERE user_id = ? AND key = ?', userId, key) || { value: 0 }).value;

  function add(userId, key, by = 1) {
    by = Math.round(Number(by) || 0);
    if (!by) return get(userId, key);
    db.run(
      'INSERT INTO stats (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = value + excluded.value, updated_at = excluded.updated_at',
      userId, key, by, now()
    );
    changed(userId, key);
    return get(userId, key);
  }
  function max(userId, key, value) {
    value = Math.round(Number(value) || 0);
    if (value <= get(userId, key)) return get(userId, key);
    db.run(
      'INSERT INTO stats (user_id, key, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, key) DO UPDATE SET value = MAX(value, excluded.value), updated_at = excluded.updated_at',
      userId, key, value, now()
    );
    changed(userId, key);
    return get(userId, key);
  }
  function addItem(userId, key, item, label = '') {
    item = String(item || '').trim().toLowerCase().slice(0, 200);
    if (!item) return false;
    const t = now();
    const had = db.get('SELECT 1 AS x FROM stat_items WHERE user_id = ? AND key = ? AND item = ?', userId, key, item);
    if (had) {
      db.run('UPDATE stat_items SET count = count + 1, last_at = ? WHERE user_id = ? AND key = ? AND item = ?', t, userId, key, item);
      return false;
    }
    db.run('INSERT INTO stat_items (user_id, key, item, label, first_at, last_at) VALUES (?, ?, ?, ?, ?, ?)', userId, key, item, String(label || '').slice(0, 200), t, t);
    changed(userId, key);
    return true;
  }
  const count = (userId, key) => db.get('SELECT COUNT(*) AS n FROM stat_items WHERE user_id = ? AND key = ?', userId, key).n;
  const items = (userId, key, { limit = 20, by = 'recent' } = {}) =>
    db.all(
      `SELECT item, label, count, first_at AS firstAt, last_at AS lastAt FROM stat_items WHERE user_id = ? AND key = ? ORDER BY ${by === 'top' ? 'count DESC, last_at DESC' : 'last_at DESC'} LIMIT ?`,
      userId, key, Math.max(1, Math.min(200, limit))
    );

  // in "Export my data": every count, and every song, artist, genre and game counted, with when
  const exportFor = (userId) => ({
    stats: db.all('SELECT key, value, updated_at AS updatedAt FROM stats WHERE user_id = ? ORDER BY key', userId),
    statItems: db.all('SELECT key, item, label, count, first_at AS firstAt, last_at AS lastAt FROM stat_items WHERE user_id = ? ORDER BY key, first_at', userId),
  });

  return { get, add, max, addItem, count, items, exportFor, onChange: (fn) => listeners.push(fn) };
}

module.exports = { install };
