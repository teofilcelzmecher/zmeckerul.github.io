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
      '  nook signups [open|invite]       anyone can join (open), or only with an invite code',
      '  nook invite [count] [note]       make new single-use invite codes',
      '  nook invites                     list invite codes (used and unused)',
      '  nook push [file.json|paste|off]  notifications on phones (the Android app), through Firebase',
      '  nook captcha <site key> <secret key>   turn on Cloudflare Turnstile (the robot check) for new accounts; nook captcha off turns it off',
      '  nook turn <key id> <api token>   send calls through Cloudflare\'s TURN relay (they always connect, and nobody sees another\'s IP); nook turn off goes back to direct calls',
      '  nook turn                        whether calls go through the relay, and how much of the month\'s free allowance is used',
      '  nook turn-limit <GB>             when calls stop for the month (950 GB unless set; Cloudflare\'s free allowance is 1,000 GB)',
      '  nook turn-usage <account> <token>   also check Cloudflare\'s own count every hour (an API token with Account Analytics: Read)',
      '  nook gifs <KLIPY app key>        turn on GIF search in chats (KLIPY); nook gifs off turns it off',
      '  nook users                       list accounts',
      '  nook admin <name>                give someone the admin role (moderation page)',
      '  nook unadmin <name>              take the admin role away',
      '  nook dev <name>                  give someone the Developer badge (they can then give people the Tester badge)',
      '  nook undev <name>                take the Developer badge away',
      '  nook tester <name>               give someone the Tester badge',
      '  nook untester <name>             take the Tester badge away',
      '  nook rename <name> <new name>    change someone\'s username (for one that breaks the rules)',
      '  nook clear-profile <name> [reason]   remove someone\'s picture, banner, bio and pronouns; they\'re told why',
      '  nook scan-images                 check every picture already posted for nudity; doubtful ones go to the Moderation page',
      '  nook text-check [text]           get the text model ready (downloads it the first time), and see what it makes of some text',
      '  nook scan-text                   read every post and comment already there with the text model; doubtful ones go to the Moderation page',
      '  nook ban <name> [reason]         ban an account and sign it out everywhere',
      '  nook unban <name>                lift a ban',
      '  nook reset-password <name>       give someone a temporary password and a new recovery code',
      '  nook remove <post|comment> <id> [reason]   take something down; its author is told why',
      '  nook delete-user <name>          erase an account and wipe what it posted (for deletion requests)',
      '  nook stats                       how much is stored',
      '  nook backup <file>               copy the whole database to a file, safely, while running'
    );
  },

  signups(mode) {
    if (mode === 'open' || mode === 'invite') db.meta('signup', mode);
    else if (mode) quit('Usage: nook signups [open|invite]');
    const now = db.meta('signup') === 'invite' ? 'invite' : 'open';
    out(now === 'open' ? 'Sign-up is open: anyone can create an account.' : 'Sign-up is invite-only: new accounts need a code from `nook invite`.');
  },

  async captcha(site, secret) {
    if (site === 'off') {
      db.meta('turnstile-site', '');
      db.meta('turnstile-secret', '');
      return out('The robot check is off: new accounts are made without it.');
    }
    if (!site) {
      const key = db.meta('turnstile-site');
      return out(key ? `The robot check (Cloudflare Turnstile) is on, with the site key ${key}. Turn it off with: nook captcha off` : 'The robot check is off. Turn it on with: nook captcha <site key> <secret key>');
    }
    if (!/^[A-Za-z0-9_-]{20,100}$/.test(site) || !/^[A-Za-z0-9_-]{20,100}$/.test(secret || '')) quit('Usage: nook captcha <site key> <secret key>   (both from the widget\'s page under Turnstile in the Cloudflare dashboard)');
    if (site === secret) quit('The site key and the secret key are different keys: copy both from the widget\'s page in Cloudflare.');
    if (/^6L/.test(site)) quit('That looks like a Google reCAPTCHA key. Budgie uses Cloudflare Turnstile: its keys come from the Cloudflare dashboard, under Turnstile.');
    // Cloudflare says straight away when it doesn't know a secret key, so it's checked before it's kept
    if (process.env.NOOK_CAPTCHA !== 'test') {
      let result;
      try {
        const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: new URLSearchParams({ secret, response: 'checking-the-key' }), signal: AbortSignal.timeout(15000) });
        result = await res.json();
      } catch (error) {
        quit(`Couldn't reach Cloudflare to check the key (${error.message}). Is the laptop online?`);
      }
      if ((result['error-codes'] || []).some((code) => /secret/.test(code))) quit('Cloudflare doesn\'t know that secret key. Copy it again from the widget\'s page under Turnstile.');
    }
    db.meta('turnstile-site', site);
    db.meta('turnstile-secret', secret);
    out('The robot check is on: new accounts go through Cloudflare Turnstile first. No restart needed.', 'If it ever causes trouble: nook captcha off');
  },

  async turn(key, token) {
    if (key === 'off') {
      db.meta('turn-key', '');
      db.meta('turn-token', '');
      return out('Calls go straight between devices now, with Cloudflare\'s free STUN server helping them find each other.', 'To use the relay again: nook turn <key id> <api token>');
    }
    if (!key) {
      const gb = (b) => (b / 1e9).toFixed(b < 1e10 ? 2 : 0);
      return out(
        db.meta('turn-key')
          ? `Calls go through Cloudflare's TURN relay (key ${db.meta('turn-key')}): they connect on any network, and nobody in a call sees another's IP address. Go back to direct calls with: nook turn off`
          : 'Calls go straight between devices, with Cloudflare\'s free STUN server helping them find each other. Some networks block that, and people in a call can see each other\'s IP address. For calls that always connect: nook turn <key id> <api token>',
        ...(db.meta('turn-key')
          ? [
              `This month (${nook.monthKey()}): ${gb(nook.relayUsed())} GB of ${gb(nook.relayLimit())} GB used${db.meta('cf-account') ? ' (the higher of Budgie\'s count and Cloudflare\'s)' : ' (Budgie\'s own count)'}. At the limit, calls stop until the month turns.`,
              'Change the limit with: nook turn-limit <GB>' + (db.meta('cf-account') ? '' : '   Check against Cloudflare\'s own count with: nook turn-usage <account id> <analytics api token>'),
            ]
          : [])
      );
    }
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(key) || !/^[A-Za-z0-9_.-]{20,300}$/.test(token || '')) quit('Usage: nook turn <TURN key id> <API token>   (both from Realtime → TURN in the Cloudflare dashboard)');
    // Cloudflare is asked for a minute-long credential, so a wrong key or token shows up now rather than in a call
    if (process.env.NOOK_TURN !== 'test') {
      let res;
      try {
        res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(key)}/credentials/generate-ice-servers`, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ ttl: 60 }),
          signal: AbortSignal.timeout(15000),
        });
      } catch (error) {
        quit(`Couldn't reach Cloudflare to check the key (${error.message}). Is the laptop online?`);
      }
      if (!res.ok) quit(`Cloudflare didn't accept that key id and API token (it answered ${res.status}). Copy both again from Realtime → TURN in the Cloudflare dashboard.`);
    }
    db.meta('turn-key', key);
    db.meta('turn-token', token);
    out('Calls now go through Cloudflare\'s TURN relay: they connect on any network, and nobody in a call sees another\'s IP address. The first 1,000 GB a month are free. No restart needed.', 'To go back to direct calls: nook turn off');
  },

  /**
   * notifications on phones (1.1): Firebase's service account for Budgie's project, from a file (nook push key.json)
   * or pasted in (nook push paste, then paste the file's contents). It stays in the database on this laptop.
   */
  async push(source) {
    if (source === 'off') {
      db.meta('fcm-account', '');
      return out('Phones won\'t get notifications any more (the app still works). To turn them back on: nook push <file.json>');
    }
    if (!source) {
      const a = (() => {
        try {
          return JSON.parse(db.meta('fcm-account') || 'null');
        } catch (_) {
          return null;
        }
      })();
      const phones = db.get('SELECT COUNT(*) AS n FROM push_tokens').n;
      return out(
        a ? `Notifications go to phones through Firebase project "${a.project_id}". ${phones} phone${phones === 1 ? '' : 's'} signed up for them. Turn them off with: nook push off` : `Phones don't get notifications yet. ${phones} phone${phones === 1 ? '' : 's'} already asked for them.`,
        a ? '' : 'Turn them on with Firebase\'s service account file: nook push <file.json>   (or: nook push paste, and paste the file\'s contents)'
      );
    }
    let text;
    if (source === 'paste' || source === '-') {
      out('Paste the whole file (it starts with { and ends with }). It\'s read as soon as it\'s complete.');
      text = await new Promise((resolve) => {
        let got = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
          got += chunk;
          try {
            JSON.parse(got);
            process.stdin.pause();
            resolve(got);
          } catch (_) {
            /* not all of it yet */
          }
        });
        process.stdin.on('end', () => resolve(got));
      });
    } else {
      if (!fs.existsSync(source)) quit(`There's no file at ${source}.`);
      text = fs.readFileSync(source, 'utf8');
    }
    let a;
    try {
      a = JSON.parse(text);
    } catch (_) {
      quit('That isn\'t the whole file: it should start with { and end with }. Try again.');
    }
    if (a.type !== 'service_account' || !a.project_id || !a.client_email || !a.private_key) quit('That isn\'t a Firebase service account file. In Firebase: Project settings → Service accounts → Generate new private key.');
    // Google is asked for permission to send now, so a wrong file shows up here rather than as silence later
    if (process.env.NOOK_PUSH !== 'test') {
      try {
        const iat = Math.floor(Date.now() / 1000);
        const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
        const head = b64({ alg: 'RS256', typ: 'JWT' });
        const claims = b64({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: a.token_uri || 'https://oauth2.googleapis.com/token', iat, exp: iat + 600 });
        const signature = crypto.createSign('RSA-SHA256').update(head + '.' + claims).sign(a.private_key).toString('base64url');
        const res = await fetch(a.token_uri || 'https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) quit(`Google didn't accept that service account (it answered ${res.status}). Make a new key in Firebase and try again.`);
      } catch (error) {
        quit(`Couldn't check the service account with Google (${error.message}). Is the laptop online?`);
      }
    }
    db.meta('fcm-account', JSON.stringify({ type: a.type, project_id: a.project_id, client_email: a.client_email, private_key: a.private_key, token_uri: a.token_uri }));
    out(`Phones now get notifications through Firebase project "${a.project_id}": messages, calls and replies. No restart needed.`, 'You can delete the file now (it\'s kept in Budgie\'s database). To turn them off: nook push off');
  },

  /** the most the relay may send in a month before calls stop (Cloudflare's free allowance is 1,000 GB) */
  'turn-limit'(gb) {
    if (gb == null) return out(`Calls stop when the relay has sent ${(nook.relayLimit() / 1e9).toFixed(0)} GB in a month. Change it with: nook turn-limit <GB>`);
    const n = Number(gb);
    if (!Number.isFinite(n) || n < 1 || n > 100000) quit('Usage: nook turn-limit <GB>   (Cloudflare\'s free allowance is 1000 a month; 950 leaves a little room)');
    db.meta('turn-limit-gb', String(n));
    out(`Calls now stop when the relay has sent ${n} GB in a month, until the month turns.${n > 1000 ? ' That\'s over Cloudflare\'s free 1,000 GB: what goes over costs $0.05 a GB.' : ''}`);
  },

  /** Cloudflare's own count of the relay's use, as well as Budgie's (an API token with Account Analytics: Read) */
  async 'turn-usage'(account, token) {
    if (account === 'off') {
      db.meta('cf-account', '');
      db.meta('cf-analytics-token', '');
      return out('Budgie counts the relay\'s use on its own now.');
    }
    if (!/^[0-9a-f]{32}$/.test(account || '') || !/^[A-Za-z0-9_.-]{20,300}$/.test(token || '')) quit('Usage: nook turn-usage <account id> <api token>   (the account id is in the Cloudflare dashboard\'s address; the token needs Account Analytics: Read)');
    db.meta('cf-account', account);
    db.meta('cf-analytics-token', token);
    try {
      const bytes = await nook.checkRelayUsage();
      out(`Cloudflare says the relay has sent ${(bytes / 1e9).toFixed(2)} GB this month. Budgie checks again every hour, and goes by whichever count is higher.`);
    } catch (error) {
      db.meta('cf-account', '');
      db.meta('cf-analytics-token', '');
      quit(`Cloudflare didn't answer with the relay's use (${error.message}). Check the account id, and that the token has Account Analytics: Read.`);
    }
  },

  async gifs(key) {
    if (key === 'off') {
      db.meta('klipy-key', '');
      return out('GIF search is off. People can still send GIFs from their own device.', 'To turn it on again: nook gifs <KLIPY app key>');
    }
    if (!key) {
      return out(
        db.meta('klipy-key')
          ? `GIF search is on, with the KLIPY app key ${db.meta('klipy-key').slice(0, 6)}…. Turn it off with: nook gifs off`
          : 'GIF search is off. People can still send GIFs from their own device. To turn it on: nook gifs <KLIPY app key>'
      );
    }
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(key)) quit('Usage: nook gifs <KLIPY app key>   (from API Keys in KLIPY’s Partner Panel, https://partner.klipy.com)');
    // one search, so a wrong key shows up now rather than in the app
    if (process.env.NOOK_GIFS !== 'test') {
      let res;
      try {
        res = await fetch(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/gifs/trending?per_page=8`, { signal: AbortSignal.timeout(15000) });
      } catch (error) {
        quit(`Couldn't reach KLIPY to check the key (${error.message}). Is the laptop online?`);
      }
      const body = await res.json().catch(() => null);
      if (!res.ok || !body || body.result === false) quit(`KLIPY didn't accept that key (it answered ${res.status}). Copy it again from API Keys in the Partner Panel.`);
    }
    db.meta('klipy-key', key);
    out(
      'GIF search is on: people see it the next time they open Budgie. No restart needed.',
      'While the key is in KLIPY’s testing mode, everyone together gets 100 searches an hour; ask for production access in the Partner Panel to lift that.',
      'To turn it off: nook gifs off'
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
    for (const u of rows) out(`  u/${u.name.padEnd(20)} joined ${date(u.created_at)}${u.role === 'admin' ? '  [admin]' : ''}${nook.badgesOf(u).map((b) => `  [${b}]`).join('')}${u.banned_at ? `  [banned: ${u.ban_reason || ''}]` : ''}`);
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

  dev(name) {
    const u = userNamed(name);
    out(nook.setBadge(u, 'dev', true) ? `u/${u.name} has the Developer badge now, and can give people the Tester badge from their profile.` : `u/${u.name} already has the Developer badge.`);
  },

  undev(name) {
    const u = userNamed(name);
    out(nook.setBadge(u, 'dev', false) ? `u/${u.name} no longer has the Developer badge.` : `u/${u.name} didn't have the Developer badge.`);
  },

  tester(name) {
    const u = userNamed(name);
    out(nook.setBadge(u, 'tester', true) ? `u/${u.name} has the Tester badge now; they've been told.` : `u/${u.name} already has the Tester badge.`);
  },

  untester(name) {
    const u = userNamed(name);
    out(nook.setBadge(u, 'tester', false) ? `u/${u.name} no longer has the Tester badge.` : `u/${u.name} didn't have the Tester badge.`);
  },

  rename(name, to) {
    const u = userNamed(name);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(to || '')) quit('Usage: nook rename <name> <new name>  (3–20 letters, numbers or underscores)');
    if (db.get('SELECT 1 AS x FROM users WHERE name = ? AND id != ?', to, u.id)) quit(`u/${to} is taken. Pick another name.`);
    db.run('UPDATE users SET name = ?, rev = ? WHERE id = ?', to, db.bump(), u.id);
    out(`u/${u.name} is now u/${to}. Their posts, friends and messages stay with them.`);
  },

  'clear-profile'(name, ...reason) {
    const u = userNamed(name);
    if (!nook.takeDown('user', u.name, reason.join(' ') || 'Breaks Budgie’s rules')) quit(`u/${u.name} has no picture, banner or bio to clear.`);
    out(`Cleared u/${u.name}'s picture, banner, bio and pronouns; they've been told why.`);
  },

  async 'scan-images'() {
    // profile pictures and banners (the strict rules), then post pictures
    const users = db.all("SELECT name, photo, photo_gif, banner, banner_gif FROM users WHERE photo != '' OR banner != ''");
    const list = users.flatMap((u) => [u.photo, u.photo_gif, u.banner, u.banner_gif].filter(Boolean).map((id) => ({ id, where: 'profile', kind: 'user', target: u.name })));
    for (const p of db.all('SELECT id, image FROM posts WHERE image IS NOT NULL AND removed_at IS NULL')) list.push({ id: p.image, where: 'post', kind: 'post', target: p.id });
    out(`Checking ${list.length} pictures (the first takes a few seconds while the checker loads)…`);
    let reported = 0, skipped = 0;
    try {
      for (const item of list) {
        const img = db.get('SELECT mime, data FROM images WHERE id = ?', item.id);
        if (!img || img.mime === 'image/webp') {
          skipped++;
          continue;
        }
        let verdict;
        try {
          verdict = nook.pictures.verdict(await nook.pictures.score(Buffer.from(img.data), img.mime), item.where);
        } catch (error) {
          out(`  couldn't check ${item.kind} ${item.target}: ${error.message}`);
          skipped++;
          continue;
        }
        if (verdict === 'ok') continue;
        const why = item.kind === 'user' ? 'this profile picture or banner might not be OK for everyone. Please take a look.' : 'this picture might be sexual. Please take a look.';
        if (nook.autoReport(item.kind, item.target, why)) {
          reported++;
          out(`  ${verdict === 'block' ? 'likely' : 'maybe'} not OK: ${item.kind === 'user' ? 'u/' + item.target + "'s profile" : 'post ' + item.target}`);
        }
      }
    } finally {
      nook.pictures.close();
    }
    out(`Done: ${reported} reported to the Moderation page${skipped ? `, ${skipped} couldn't be checked (old WebP pictures, or unreadable)` : ''}.`);
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

  async 'text-check'(...words) {
    const tm = nook.textmodel;
    try {
      if (!(await tm.ready({ log: out }))) quit(`The text model isn't available: ${tm.status().problem || 'it couldn’t start'}. Posts are still checked by the word lists.`);
      out(`The text model is ready (in ${tm.status().dir}).`);
      const text = words.join(' ').trim();
      if (!text) return;
      const score = await tm.score(text);
      for (const [label, p] of Object.entries(score.labels)) out(`  ${label.replace(/_/g, ' ').padEnd(16)} ${(p * 100).toFixed(0).padStart(3)}%${tm.HARMS.includes(label) ? '' : '  (not used: swearing is allowed)'}`);
      for (const kind of ['post', 'message']) {
        const j = tm.judge(score, kind);
        out(`As a ${kind}: ${j.verdict === 'block' ? 'refused' : j.verdict === 'review' ? 'posted, and sent to the Moderation page' : 'fine'}${j.label ? ` (${j.label.replace(/_/g, ' ')})` : ''}`);
      }
    } finally {
      tm.close();
    }
  },

  async 'scan-text'() {
    const tm = nook.textmodel;
    const list = [
      ...db.all('SELECT id, title, body FROM posts WHERE removed_at IS NULL').map((p) => ({ kind: 'post', id: p.id, text: [p.title, p.body] })),
      ...db.all('SELECT id, body FROM comments WHERE removed_at IS NULL').map((c) => ({ kind: 'comment', id: c.id, text: [c.body] })),
    ];
    let reported = 0;
    try {
      if (!(await tm.ready({ log: out }))) quit(`The text model isn't available: ${tm.status().problem || 'it couldn’t start'}.`);
      out(`Reading ${list.length} posts and comments…`);
      for (const item of list) {
        const j = tm.judge(await tm.score(item.text.filter(Boolean).join('\n\n')), item.kind);
        if (j.verdict === 'ok') continue;
        if (nook.autoReport(item.kind, item.id, tm.reason(j))) {
          reported++;
          out(`  ${j.verdict === 'block' ? 'likely' : 'maybe'} not OK: ${item.kind} ${item.id}`);
        }
      }
    } finally {
      tm.close();
    }
    out(`Done: ${reported} reported to the Moderation page.`);
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
      `  groups:    ${count('SELECT COUNT(*) AS n FROM chat_groups')}, with ${count('SELECT COUNT(*) AS n FROM group_messages')} messages`,
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
