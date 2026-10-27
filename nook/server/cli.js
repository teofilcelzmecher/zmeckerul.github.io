#!/usr/bin/env node
// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's admin commands, run on the server: `nook <command>` once installed,
 * or `node cli.js <command>` from this folder. Uses the same NOOK_DATA as the server.
 */
'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const nook = require('./server');

const { db } = nook;
const [command = 'help', ...args] = process.argv.slice(2);
const out = (...lines) => console.log(lines.join('\n'));
const quit = (message) => {
  console.error(message);
  process.exit(1);
};
const userNamed = (name) => db.get('SELECT * FROM users WHERE name = ?', name || '') || quit(`There's no user called "${name}". Try: nook users`);
const date = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');

const COMMANDS = {
  help() {
    out(
      'Budgie admin commands:',
      '  nook invite [count] [note]       make new single-use invite codes',
      '  nook invites                     list invite codes (used and unused)',
      '  nook users                       list accounts',
      '  nook admin <name>                give someone the admin role (moderation page)',
      '  nook unadmin <name>              take the admin role away',
      '  nook ban <name> [reason]         ban an account and sign it out everywhere',
      '  nook unban <name>                lift a ban',
      '  nook reset-password <name>       give someone a temporary password and a new recovery code',
      '  nook remove <post|comment> <id> [reason]   take something down; its author is told why',
      '  nook delete-user <name>          erase an account and wipe what it posted (for deletion requests)',
      '  nook stats                       how much is stored',
      '  nook backup <file>               copy the whole database to a file, safely, while running'
    );
  },

  invite(count = '1', ...note) {
    const n = Math.min(50, Math.max(1, parseInt(count, 10) || 1));
    const codes = [];
    while (codes.length < n) {
      const code = String(crypto.randomInt(100000, 1000000));
      const hash = nook.inviteHash(code);
      if (db.get('SELECT 1 AS x FROM invites WHERE code = ?', hash)) continue;
      db.run('INSERT INTO invites (code, note, created_at) VALUES (?, ?, ?)', hash, note.join(' '), Date.now());
      codes.push(code);
    }
    out(`New invite code${n > 1 ? 's' : ''} (each works once; write ${n > 1 ? 'them' : 'it'} down, ${n > 1 ? 'they' : 'it'} can't be shown again):`, ...codes.map((c) => '  ' + c));
  },

  invites() {
    const rows = db.all('SELECT i.*, u.name FROM invites i LEFT JOIN users u ON u.id = i.used_by ORDER BY i.created_at');
    const unused = rows.filter((r) => !r.used_at);
    out(`${rows.length} invite codes, ${unused.length} unused.`);
    for (const r of rows) out(`  ${date(r.created_at)}  ${r.used_at ? `used by u/${r.name || '[deleted]'} on ${date(r.used_at)}` : 'unused'}${r.note ? '  (' + r.note + ')' : ''}`);
  },

  users() {
    const rows = db.all('SELECT * FROM users ORDER BY created_at');
    out(`${rows.length} accounts:`);
    for (const u of rows) out(`  u/${u.name.padEnd(20)} joined ${date(u.created_at)}${u.role === 'admin' ? '  [admin]' : ''}${u.banned_at ? `  [banned: ${u.ban_reason || ''}]` : ''}`);
  },

  admin(name) {
    const u = userNamed(name);
    db.run("UPDATE users SET role = 'admin', rev = ? WHERE id = ?", db.bump(), u.id);
    out(`u/${u.name} is now an admin. They'll see the Moderation page after reloading Budgie.`);
  },

  unadmin(name) {
    const u = userNamed(name);
    db.run("UPDATE users SET role = 'member', rev = ? WHERE id = ?", db.bump(), u.id);
    out(`u/${u.name} is no longer an admin.`);
  },

  ban(name, ...reason) {
    const u = userNamed(name);
    nook.ban(u.name, reason.join(' ') || 'Broke Budgie’s rules', true);
    out(`u/${u.name} is banned and signed out everywhere.`);
  },

  unban(name) {
    const u = userNamed(name);
    nook.ban(u.name, null, false);
    out(`u/${u.name} can sign in again.`);
  },

  async 'reset-password'(name) {
    const u = userNamed(name);
    const temporary = crypto.randomBytes(9).toString('base64url');
    const recovery = nook.recoveryCode();
    db.run('UPDATE users SET pass = ?, recovery = ? WHERE id = ?', await nook.hashPassword(temporary), nook.recoveryHash(recovery), u.id);
    db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    out(`u/${u.name} has been signed out everywhere. Give them, privately:`, `  temporary password: ${temporary}`, `  new recovery code:  ${recovery}`, 'and ask them to change the password in Settings → Account.');
  },

  remove(kind, id, ...reason) {
    if (!['post', 'comment'].includes(kind) || !id) quit('Usage: nook remove <post|comment> <id> [reason]');
    if (!nook.takeDown(kind, id, reason.join(' ') || 'Breaks Budgie’s rules')) quit(`No ${kind} ${id}, or it's already removed.`);
    out(`Removed ${kind} ${id}; its author has been told why.`);
  },

  'delete-user'(name) {
    const u = userNamed(name);
    nook.eraseUser(u.id);
    out(`u/${u.name} is erased: the account, its votes, friends, messages and images are gone, and its posts and comments are wiped.`);
  },

  stats() {
    const count = (sql) => db.get(sql).n;
    const size = fs.statSync(path.join(nook.CONFIG.data, 'nook.db')).size;
    out(
      `Budgie ${nook.VERSION}, database ${(size / 1024 / 1024).toFixed(1)} MB in ${nook.CONFIG.data}`,
      `  accounts:  ${count('SELECT COUNT(*) AS n FROM users')}`,
      `  posts:     ${count('SELECT COUNT(*) AS n FROM posts WHERE removed_at IS NULL')}`,
      `  comments:  ${count('SELECT COUNT(*) AS n FROM comments WHERE removed_at IS NULL')}`,
      `  messages:  ${count('SELECT COUNT(*) AS n FROM messages')}`,
      `  images:    ${count('SELECT COUNT(*) AS n FROM images')}`,
      `  open reports: ${count('SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NULL')}`,
      `  unused invites: ${count('SELECT COUNT(*) AS n FROM invites WHERE used_at IS NULL')}`
    );
  },

  backup(file) {
    if (!file) quit('Usage: nook backup <file>');
    const target = path.resolve(file);
    if (fs.existsSync(target)) quit(`${target} already exists.`);
    db.raw.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`);
    out(`Backed up to ${target}`);
  },
};

Promise.resolve()
  .then(() => (COMMANDS[command] || COMMANDS.help)(...args))
  .catch((error) => quit(error.message || String(error)))
  .finally(() => db.close());
