// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's database: one SQLite file, through Node's built-in node:sqlite.
 *
 * Every change to something the app shows (a post, a comment, a person, a nook,
 * a friendship) stamps it with the next revision number, so a client can ask
 * for "everything since revision N" and stay in step without reloading it all.
 * Deleted posts and comments stay as empty, removed rows so that the same
 * question also tells clients what disappeared.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  recovery TEXT NOT NULL,
  color TEXT NOT NULL,
  shape TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  photo TEXT NOT NULL DEFAULT '',
  photo_gif TEXT NOT NULL DEFAULT '',
  banner TEXT NOT NULL DEFAULT '',
  banner_gif TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'member',
  banned_at INTEGER,
  ban_reason TEXT,
  terms TEXT NOT NULL,
  prefs TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  seen_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS nooks (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS joins (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nook TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, nook)
);

CREATE TABLE IF NOT EXISTS posts (
  id TEXT PRIMARY KEY,
  nook TEXT NOT NULL,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  flair TEXT,
  link TEXT,
  image TEXT,
  poll TEXT,
  spoiler INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  removed_at INTEGER,
  removed_reason TEXT,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS posts_rev ON posts(rev);
CREATE INDEX IF NOT EXISTS posts_author ON posts(author_id, created_at);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id TEXT,
  author_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  edited_at INTEGER,
  removed_at INTEGER,
  removed_reason TEXT,
  rev INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS comments_post ON comments(post_id);
CREATE INDEX IF NOT EXISTS comments_rev ON comments(rev);
CREATE INDEX IF NOT EXISTS comments_author ON comments(author_id, created_at);

CREATE TABLE IF NOT EXISTS votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (user_id, target)
);
CREATE INDEX IF NOT EXISTS votes_target ON votes(target);

CREATE TABLE IF NOT EXISTS sparks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  PRIMARY KEY (user_id, post_id, kind)
);
CREATE INDEX IF NOT EXISTS sparks_post ON sparks(post_id);

CREATE TABLE IF NOT EXISTS poll_votes (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  option INTEGER NOT NULL,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS friends (
  a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  rev INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (a, b)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS messages_to ON messages(to_id, id);
CREATE INDEX IF NOT EXISTS messages_from ON messages(from_id, id);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  href TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL DEFAULT 'notifications',
  shape TEXT NOT NULL DEFAULT 'cookie9',
  created_at INTEGER NOT NULL,
  read_at INTEGER
);
CREATE INDEX IF NOT EXISTS notes_user ON notes(user_id, id);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  resolution TEXT
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
);
`;

const REV_TABLES = ['users', 'nooks', 'posts', 'comments', 'friends'];

function open(dir) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o750 });
  const db = new DatabaseSync(path.join(dir, 'nook.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000; PRAGMA synchronous = NORMAL;');
  db.exec(SCHEMA);
  // columns added since the first release, for databases made before them
  const LATER_COLUMNS = [['users', 'photo_gif'], ['users', 'banner'], ['users', 'banner_gif'], ['users', 'name_font']];
  for (const [table, column] of LATER_COLUMNS) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }

  // the revision counter carries on from the highest stamp anywhere
  let rev = 0;
  for (const table of REV_TABLES) rev = Math.max(rev, db.prepare(`SELECT COALESCE(MAX(rev), 0) AS r FROM ${table}`).get().r);

  const cache = new Map();
  const statement = (sql) => {
    if (!cache.has(sql)) cache.set(sql, db.prepare(sql));
    return cache.get(sql);
  };

  return {
    raw: db,
    /** the next revision stamp */
    bump: () => ++rev,
    rev: () => rev,
    get: (sql, ...args) => statement(sql).get(...args),
    all: (sql, ...args) => statement(sql).all(...args),
    run: (sql, ...args) => statement(sql).run(...args),
    /** runs fn inside one transaction, all or nothing */
    tx(fn) {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    meta(key, value) {
      if (value === undefined) {
        const row = statement('SELECT value FROM meta WHERE key = ?').get(key);
        return row ? row.value : null;
      }
      statement('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
      return value;
    },
    close: () => db.close(),
  };
}

module.exports = { open };
