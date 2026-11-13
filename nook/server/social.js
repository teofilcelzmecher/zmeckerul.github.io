// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nudges and network bans (Budgie 1.4).
 *
 * A nudge is a friend getting your attention: a tap on their profile (or in the More menu of a chat with them). It
 * reaches them as an inbox note and a notification on their phone ("u/alex wants your attention 👋"), and if they
 * have Budgie open, as a playful moment right away (the server tells their open devices over the live connection).
 * Only between friends, never with someone blocked either way, and only if they let friends nudge them (Settings →
 * Nudges, on unless they turn it off). At most three a person per friend per hour, and twenty an hour to everyone,
 * counted here (a nudge is kept for a day for that, then forgotten), so a restart doesn't reset them.
 *
 * A network ban stops anyone using Budgie from the internet connections (IP addresses) a banned account used. The
 * addresses themselves are never kept: each is turned into a keyed hash (HMAC-SHA256 with a secret made on this
 * server and kept in a file of its own beside the database, DATA/ip-key, readable only by the server, and never in
 * the database or its backups), so a copy of the database doesn't say where anyone was, and the same address
 * always gives the same hash, which is all a ban needs. For IPv6, where a phone or a home moves around a whole block
 * of addresses (a /64) by itself, it's the block that's hashed. Which networks someone used is noted once an hour at
 * most, and forgotten after 90 days.
 *
 * A ban (from someone's profile or the Moderation page, or `nook ipban`) bans the account and every network it used
 * in the last 90 days, for a day, a week, a month or for good; while it lasts, every request from those networks is
 * refused (signing up and signing in too), except /api/health. When it ends (or is lifted), the account is let back
 * in too, unless it was banned some other way. Networks shared by a lot of people (a phone company's, a school's)
 * are banned for all of them, so the app says so before anyone is banned.
 *
 * Budgie's admins can't be locked out by accident: an admin can't be banned, a network any admin used in the last
 * 90 days is never banned, and an admin who's signed in gets through a network ban regardless.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const NUDGES_PER_FRIEND = 3; // per hour, from one person to one friend
const NUDGES_PER_HOUR = 20; // per hour, from one person to everyone
const NUDGES_RECEIVED = 30; // per hour, to one person from everyone (so a big friends list can't drown someone)
const SEEN_FOR = 90; // days a network someone used is remembered
const BAN_DAYS = [1, 7, 30, 0]; // 0: for good
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/**
 * the network an address belongs to, written one way only: an IPv4 address as it is, an IPv6 address as its /64
 * block (an IPv4 address written as IPv6, ::ffff:1.2.3.4, is the IPv4 one). null for anything that isn't an address
 * (behind a tunnel that doesn't say who's calling, every request is "unknown", and that, like this computer's own
 * address, is never noted or banned)
 */
function networkOf(value) {
  let ip = String(value || '').trim();
  if (!ip || ip.length > 64) return null;
  if (ip[0] === '[') ip = ip.slice(1, ip.indexOf(']') > 0 ? ip.indexOf(']') : undefined);
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip);
  if (withPort) ip = withPort[1];
  ip = ip.replace(/%.*$/, ''); // a zone (fe80::1%eth0) says which card, not which network
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const kind = net.isIP(ip);
  // this computer itself (a proxy in front that didn't say who's calling) is everybody at once: never a network
  if (kind === 4) return /^(127|0)\./.test(ip) ? null : '4:' + ip.split('.').map(Number).join('.');
  if (kind !== 6 || /^(::1?|0*:(0*:)*0*:?1?)$/.test(ip)) return null;
  // the first four groups of eight, with "::" filled in (an IPv4 address at the end counts as two groups)
  const [head, tail] = ip.toLowerCase().includes('::') ? ip.toLowerCase().split('::') : [ip.toLowerCase(), null];
  const groups = (part) => (part ? part.split(':').flatMap((g) => (g.includes('.') ? ['0', '0'] : [g])) : []);
  const front = groups(head);
  const back = tail == null ? [] : groups(tail);
  const all = tail == null ? front : [...front, ...Array(Math.max(0, 8 - front.length - back.length)).fill('0'), ...back];
  return '6:' + all.slice(0, 4).map((g) => parseInt(g || '0', 16).toString(16)).join(':') + '::/64';
}

// a name from the address, or '' when its %-escapes are broken (then nobody is found, rather than an error)
const safeName = (value) => {
  try {
    return decodeURIComponent(String(value || ''));
  } catch (_) {
    return '';
  }
};

function install(ctx) {
  const { db, route, limit, fail, text, notify, now, MINUTE, HOUR, DAY, friendship, hasBlocked, ban, REQUEST_GUARDS, ON_AUTHED, CLI, modules, serving } = ctx;
  // the live connection to someone's open devices (server.js passes it on); without it, a nudge still arrives with
  // the app's next check for news, within 15 seconds
  const signal = typeof ctx.signal === 'function' ? ctx.signal : () => {};

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS nudges (
  id INTEGER PRIMARY KEY,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nudges_from ON nudges (from_id, created_at);
-- (the kind of nudge, 1.6, is added below for databases from before it)
CREATE INDEX IF NOT EXISTS nudges_to ON nudges (to_id, created_at);
CREATE TABLE IF NOT EXISTS social_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  nudges INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS ip_seen (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  first_at INTEGER NOT NULL,
  last_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, ip_hash)
);
CREATE INDEX IF NOT EXISTS ip_seen_hash ON ip_seen (ip_hash, last_at);
CREATE TABLE IF NOT EXISTS ip_bans (
  id INTEGER PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  until INTEGER,
  by TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  batch TEXT NOT NULL DEFAULT '',
  account_at INTEGER
);
CREATE INDEX IF NOT EXISTS ip_bans_hash ON ip_bans (ip_hash);
CREATE INDEX IF NOT EXISTS ip_bans_batch ON ip_bans (batch);`);
  // columns added after the table was first made (none yet): checked like db.js does, so this runs on any database
  const columns = (table) => db.raw.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  for (const [column, type] of [['name', "TEXT NOT NULL DEFAULT ''"], ['batch', "TEXT NOT NULL DEFAULT ''"], ['account_at', 'INTEGER']]) {
    if (!columns('ip_bans').includes(column)) db.raw.exec(`ALTER TABLE ip_bans ADD COLUMN ${column} ${type}`);
  }

  // ---- networks ------------------------------------------------------------------------------------------------

  // the secret the hashes are keyed with: made once, here, and never sent anywhere. Without it a hash can't be
  // worked back to an address by trying them all (there are only four billion IPv4 ones)
  // It lives in its own file (only the server's user can read it), not in the database: `nook backup` copies the
  // database, and with the key beside the hashes they could be worked back. A key a test server once kept in the
  // database moves to the file, so its hashes still match.
  const KEY = (() => {
    const file = path.join(ctx.CONFIG.data, 'ip-key');
    try {
      const saved = fs.readFileSync(file, 'utf8').trim();
      if (/^[0-9a-f]{64}$/.test(saved)) return saved;
    } catch (_) {
      /* not made yet */
    }
    const key = db.meta('ip-key') || crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(file, key + '\n', { mode: 0o600 });
    if (db.meta('ip-key')) db.meta('ip-key', '');
    return key;
  })();
  const hashes = new Map(); // address -> its hash, so the same visitor's every request doesn't hash again
  function hashOf(ip) {
    if (!ip || ip === 'unknown') return null;
    let h = hashes.get(ip);
    if (h === undefined) {
      const network = networkOf(ip);
      h = network ? crypto.createHmac('sha256', KEY).update(network).digest('hex') : null;
      if (hashes.size > 20000) hashes.clear();
      hashes.set(ip, h);
    }
    return h;
  }

  /** the ban on a network that's in force now, if there is one */
  const activeBan = (hash) => db.get("SELECT * FROM ip_bans WHERE ip_hash = ? AND ip_hash != '' AND (until IS NULL OR until > ?) ORDER BY until IS NULL DESC, until DESC LIMIT 1", hash, now());

  /** the networks any admin used lately: these are never banned, so whoever runs Budgie can't be locked out */
  const adminNetworks = () =>
    new Set(db.all("SELECT DISTINCT s.ip_hash FROM ip_seen s JOIN users u ON u.id = s.user_id WHERE u.role = 'admin' AND s.last_at > ?", now() - SEEN_FOR * DAY).map((r) => r.ip_hash));

  /** whether a request comes from an admin who's signed in (they get through a network ban) */
  function adminAsking(req) {
    const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
    if (!m) return false;
    const session = db.get('SELECT user_id FROM sessions WHERE token = ?', crypto.createHash('sha256').update(m[1]).digest('hex'));
    const u = session && db.get('SELECT role, banned_at FROM users WHERE id = ?', session.user_id);
    return !!(u && u.role === 'admin' && !u.banned_at);
  }

  // every request from a banned network is turned away before anything else happens (whether Budgie's server is up
  // is still answered, so the app can tell "not here" from "not running")
  REQUEST_GUARDS.push((req, url, ip) => {
    if (url.pathname === '/api/health') return;
    const hash = hashOf(ip);
    if (!hash) return;
    const b = activeBan(hash);
    if (!b || adminAsking(req)) return;
    fail(403, 'Budgie can’t be used from this network right now.', { network: true, until: b.until || undefined });
  });

  // which networks someone uses: noted at most once an hour per network, so it costs nothing on most requests
  const noted = new Map(); // `${user id}:${hash}` -> when it was last written down
  ON_AUTHED.push((user, request) => {
    const hash = hashOf(request.ip);
    if (!hash) return;
    const key = user.id + ':' + hash;
    const t = now();
    if (noted.get(key) > t - HOUR) return;
    noted.set(key, t);
    db.run('INSERT INTO ip_seen (user_id, ip_hash, first_at, last_at) VALUES (?, ?, ?, ?) ON CONFLICT (user_id, ip_hash) DO UPDATE SET last_at = excluded.last_at', user.id, hash, t, t);
  });

  const userNamed = (name) => (NAME_RE.test(String(name || '')) ? db.get('SELECT * FROM users WHERE name = ?', String(name)) : null);
  // 1, 7 or 30 days, or 0 for good; anything else (nothing said, say) is a week
  const daysOf = (value) => {
    const days = value === null || value === undefined || value === '' ? NaN : Number(value);
    return BAN_DAYS.includes(days) ? days : 7;
  };

  /** what banning someone's networks would do: how many, how many are an admin's, and who else uses them */
  function preview(u) {
    const since = now() - SEEN_FOR * DAY;
    const theirs = db.all('SELECT ip_hash FROM ip_seen WHERE user_id = ? AND last_at > ?', u.id, since).map((r) => r.ip_hash);
    const guarded = adminNetworks();
    const banning = theirs.filter((h) => !guarded.has(h));
    // other accounts seen on the same networks lately: they'd be locked out too (a shared Wi-Fi, a phone company)
    const others = banning.length
      ? db.get(`SELECT COUNT(DISTINCT user_id) AS n FROM ip_seen WHERE ip_hash IN (${banning.map(() => '?').join(',')}) AND user_id != ? AND last_at > ?`, ...banning, u.id, since).n
      : 0;
    const active = db.get("SELECT COUNT(DISTINCT batch) AS n FROM ip_bans WHERE user_id = ? AND (until IS NULL OR until > ?)", u.id, now()).n;
    return { name: u.name, networks: banning.length, guarded: theirs.length - banning.length, others, banned: !!u.banned_at, admin: u.role === 'admin', active, banning };
  }

  /** bans an account and the networks it used: { networks, guarded, others, until } */
  function banNetworks(name, { days = 7, reason = '', by = '' } = {}) {
    const u = userNamed(name);
    if (!u) fail(404, 'There’s nobody by that name.');
    if (u.role === 'admin') fail(400, 'Admins can’t be banned, and neither can the networks they use. Remove their admin role first.');
    const p = preview(u);
    const t = now();
    const until = days ? t + days * DAY : null;
    const why = text(reason, 200) || 'Broke Budgie’s rules';
    // an account already banned some other way stays banned however this one ends; one banned here comes back with it
    const already = !!u.banned_at;
    if (!already) ban(u.name, why, true);
    const accountAt = already ? null : db.get('SELECT banned_at FROM users WHERE id = ?', u.id).banned_at;
    const batch = crypto.randomBytes(8).toString('hex');
    db.tx(() => {
      // with no network to ban (they only ever used an admin's, or none was seen), the ban still has a row: it's
      // what lifts the account's ban when it ends, and what the list shows
      for (const hash of p.banning.length ? p.banning : ['']) {
        db.run('INSERT INTO ip_bans (ip_hash, user_id, reason, created_at, until, by, name, batch, account_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', hash, u.id, why, t, until, by, u.name, batch, accountAt);
      }
    });
    return { name: u.name, networks: p.networks, guarded: p.guarded, others: p.others, until, accountBanned: !already };
  }

  /** bans one address's network by itself (`nook ipban <address>`): the owner may have it from somewhere else */
  function banAddress(ip, { days = 7, reason = '', by = '' } = {}) {
    const hash = hashOf(ip);
    // this computer's own address (or "nobody said") stands for everyone behind a proxy: banning it would ban all
    if (!hash) fail(400, net.isIP(String(ip).replace(/^\[|\]$/g, '').replace(/%.*$/, '')) ? 'That’s this computer’s own address, which stands for everyone, so it can’t be banned.' : 'That isn’t an IP address.');
    const users = db.all("SELECT u.name, u.role FROM ip_seen s JOIN users u ON u.id = s.user_id WHERE s.ip_hash = ? AND s.last_at > ?", hash, now() - SEEN_FOR * DAY);
    const admin = users.find((u) => u.role === 'admin');
    if (admin) fail(400, `An admin (u/${admin.name}) used that network in the last ${SEEN_FOR} days, so it can’t be banned.`);
    const t = now();
    const until = days ? t + days * DAY : null;
    db.run('INSERT INTO ip_bans (ip_hash, user_id, reason, created_at, until, by, name, batch, account_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL)', hash, text(reason, 200) || 'Broke Budgie’s rules', t, until, by, '', crypto.randomBytes(8).toString('hex'));
    return { until, users: users.map((u) => u.name) };
  }

  /** the account a ban banned comes back, if nothing else banned it since */
  function letBack(row) {
    if (!row.user_id || !row.account_at) return null;
    const u = db.get('SELECT name, banned_at FROM users WHERE id = ?', row.user_id);
    if (!u || u.banned_at !== row.account_at) return null;
    ban(u.name, null, false);
    return u.name;
  }

  /** lifts a ban (all its networks): { name, account } (account: the account was let back in too) */
  function lift(id) {
    const row = db.get('SELECT * FROM ip_bans WHERE id = ?', Number(id) || 0);
    if (!row) fail(404, 'That ban is already gone.');
    const rows = row.batch ? db.all('SELECT * FROM ip_bans WHERE batch = ?', row.batch) : [row];
    const account = letBack(row);
    db.tx(() => {
      for (const r of rows) db.run('DELETE FROM ip_bans WHERE id = ?', r.id);
    });
    return { name: row.name || null, account: !!account };
  }

  /** the bans in force, one per ban (however many networks each covers), newest first */
  function list() {
    return db
      .all(
        `SELECT MIN(id) AS id, batch, user_id, name, reason, created_at, until, by, account_at, SUM(ip_hash != '') AS networks
         FROM ip_bans WHERE until IS NULL OR until > ? GROUP BY CASE WHEN batch = '' THEN 'id' || id ELSE batch END ORDER BY created_at DESC LIMIT 200`,
        now()
      )
      .map((r) => {
        const u = r.user_id ? db.get('SELECT name, banned_at FROM users WHERE id = ?', r.user_id) : null;
        return {
          id: r.id, name: (u && u.name) || r.name || null, reason: r.reason, createdAt: r.created_at, until: r.until || null, by: r.by || null, networks: r.networks,
          // whether the account comes back when it ends (it was banned by this, and nothing else since)
          account: !!(u && r.account_at && u.banned_at === r.account_at),
        };
      });
  }

  // bans that ran out: their accounts come back, and the rows go. Networks seen more than 90 days ago are forgotten,
  // and nudges after a day (they're only kept to count how many were sent)
  function sweep() {
    const t = now();
    for (const row of db.all('SELECT * FROM ip_bans WHERE until IS NOT NULL AND until <= ? AND account_at IS NOT NULL GROUP BY batch', t)) {
      try {
        letBack(row);
      } catch (error) {
        console.error('ip ban sweep', error.message);
      }
    }
    db.run('DELETE FROM ip_bans WHERE until IS NOT NULL AND until <= ?', t);
    db.run('DELETE FROM ip_seen WHERE last_at < ?', t - SEEN_FOR * DAY);
    db.run('DELETE FROM nudges WHERE created_at < ?', t - DAY);
    for (const [key, at] of noted) if (at < t - HOUR) noted.delete(key);
  }
  if (serving) {
    sweep();
    setInterval(sweep, MINUTE).unref();
  }

  // ---- the admin side ------------------------------------------------------------------------------------------

  route('GET', '/api/admin/ipbans', () => ({ bans: list(), days: BAN_DAYS }), { admin: true });

  // before banning: what it would do (no addresses or hashes ever leave the server, just numbers)
  route('GET', '/api/admin/ipbans/:name', ({ params }) => {
    const u = userNamed(safeName(params.name));
    if (!u) fail(404, 'There’s nobody by that name.');
    const p = preview(u);
    return { name: p.name, networks: p.networks, guarded: p.guarded, others: p.others, banned: p.banned, admin: p.admin, active: p.active };
  }, { admin: true });

  route('POST', '/api/admin/ipbans', ({ user, body }) => {
    limit('ipban:' + user.id, 30, HOUR);
    const name = text(body.name, 40).replace(/^u\//i, '');
    if (user.name.toLowerCase() === name.toLowerCase()) fail(400, 'You can’t ban yourself.');
    const done = banNetworks(name, { days: daysOf(body.days), reason: body.reason, by: user.name });
    console.log(new Date().toISOString(), `u/${user.name} banned u/${done.name} and ${done.networks} network(s)`, done.until ? `until ${new Date(done.until).toISOString()}` : 'for good');
    return Object.assign({ ok: true }, done);
  }, { admin: true });

  route('DELETE', '/api/admin/ipbans/:id', ({ user, params }) => {
    const done = lift(params.id);
    console.log(new Date().toISOString(), `u/${user.name} lifted the network ban #${params.id}${done.name ? ' on u/' + done.name : ''}`);
    return Object.assign({ ok: true }, done);
  }, { admin: true });

  // ---- nudges --------------------------------------------------------------------------------------------------

  const nudgesOn = (userId) => {
    const row = db.get('SELECT nudges FROM social_prefs WHERE user_id = ?', userId);
    return !row || row.nudges !== 0;
  };
  /** how many more nudges `from` may send `to` this hour, and when the next frees up */
  function allowance(fromId, toId) {
    const since = now() - HOUR;
    const sent = db.all('SELECT created_at FROM nudges WHERE from_id = ? AND to_id = ? AND created_at > ? ORDER BY created_at', fromId, toId, since);
    const all = db.all('SELECT created_at FROM nudges WHERE from_id = ? AND created_at > ? ORDER BY created_at', fromId, since);
    const left = Math.max(0, Math.min(NUDGES_PER_FRIEND - sent.length, NUDGES_PER_HOUR - all.length));
    // the oldest nudge that counts drops out of the hour: that's when there's one again
    const oldest = sent.length >= NUDGES_PER_FRIEND ? sent[sent.length - NUDGES_PER_FRIEND] : all.length >= NUDGES_PER_HOUR ? all[all.length - NUDGES_PER_HOUR] : null;
    return { left, max: NUDGES_PER_FRIEND, next: left ? null : oldest.created_at + HOUR };
  }
  const minutesUntil = (t) => {
    const m = Math.max(1, Math.ceil((t - now()) / MINUTE));
    return m === 1 ? 'a minute' : m + ' minutes';
  };

  /** the friend a nudge would go to, or why it can't */
  function friendFor(user, name) {
    const other = userNamed(text(name, 40).replace(/^u\//i, ''));
    if (!other || other.banned_at) fail(404, 'There’s nobody by that name.');
    if (other.id === user.id) fail(400, 'You can’t nudge yourself. Nice try, though.');
    const f = friendship(user.id, other.id);
    // being blocked isn't said as such, just as not being friends (as everywhere else on Budgie)
    if (!f || f.status !== 'friends' || hasBlocked(user.id, other.id) || hasBlocked(other.id, user.id)) fail(403, 'You can only nudge friends.');
    return other;
  }

  // what a friend's Nudge button says: how many are left this hour, and when the next one is possible
  route('GET', '/api/nudges/:name', ({ user, params }) => {
    const other = friendFor(user, safeName(params.name));
    return Object.assign({ on: nudgesOn(other.id) }, allowance(user.id, other.id));
  });

  // (1.6) a nudge has a kind: a wave, a hug, a high five, a poke, "thinking of you", or hype; each says its own words
  // in the inbox and on their phone, and has its own moment on their screen
  if (!db.raw.prepare('PRAGMA table_info(nudges)').all().some((c) => c.name === 'kind')) db.raw.exec("ALTER TABLE nudges ADD COLUMN kind TEXT NOT NULL DEFAULT 'wave'");
  // (each note is a whole sentence, so the app can translate it; `x` is the count, " ×2", when there's one)
  const KINDS = {
    wave: { text: (n, x) => `u/${n} wants your attention 👋${x}`, symbol: 'waving_hand' },
    hug: { text: (n, x) => `u/${n} sent you a hug 🫶${x}`, symbol: 'favorite' },
    five: { text: (n, x) => `u/${n} high-fived you 🙌${x}`, symbol: 'sign_language' },
    poke: { text: (n, x) => `u/${n} poked you 👉${x}`, symbol: 'touch_app' },
    thinking: { text: (n, x) => `u/${n} is thinking of you 💭${x}`, symbol: 'cloud' },
    hype: { text: (n, x) => `u/${n} is hyping you up 🔥${x}`, symbol: 'local_fire_department' },
  };

  route('POST', '/api/nudges', ({ user, body }) => {
    limit('nudge:' + user.id, 10, MINUTE, 'You’re nudging very fast. Give it a moment.');
    const other = friendFor(user, body.to);
    const kind = Object.prototype.hasOwnProperty.call(KINDS, body.kind) ? body.kind : 'wave';
    const K = KINDS[kind];
    if (!nudgesOn(other.id)) fail(403, `u/${other.name} isn’t taking nudges right now.`, { off: true });
    const mine = allowance(user.id, other.id);
    if (!mine.left) {
      const sent = db.get('SELECT COUNT(*) AS n FROM nudges WHERE from_id = ? AND to_id = ? AND created_at > ?', user.id, other.id, now() - HOUR).n;
      fail(429, sent >= NUDGES_PER_FRIEND
        ? `You’ve nudged u/${other.name} ${NUDGES_PER_FRIEND} times this hour. You can nudge them again in ${minutesUntil(mine.next)}.`
        : `That’s a lot of nudges this hour. You can nudge again in ${minutesUntil(mine.next)}.`, Object.assign({ retryIn: Math.ceil((mine.next - now()) / 1000) }, mine));
    }
    const received = db.get('SELECT COUNT(*) AS n FROM nudges WHERE to_id = ? AND created_at > ?', other.id, now() - HOUR).n;
    if (received >= NUDGES_RECEIVED) fail(429, `u/${other.name} has had a lot of nudges this hour. Try a message instead?`);
    const t = now();
    db.run('INSERT INTO nudges (from_id, to_id, created_at, kind) VALUES (?, ?, ?, ?)', user.id, other.id, t, kind);
    // the inbox note (and with it, the notification on their phone), which opens the chat with whoever nudged.
    // Nudged again before they've seen the last one (within the hour), it's one note that counts them, rather than
    // a row of the same words: the earlier note goes, and the new one says ×2, ×3
    const href = '#/messages/' + encodeURIComponent(user.name);
    // (the same kind counts up; another kind is a note of its own)
    const said = K.text(user.name, '');
    const earlier = db
      .all("SELECT id, text FROM notes WHERE user_id = ? AND kind = 'nudge' AND href = ? AND read_at IS NULL AND created_at > ?", other.id, href, t - HOUR)
      .filter((r) => r.text === said || r.text.startsWith(said + ' ×'));
    const times = earlier.reduce((n, r) => n + (Number((/×(\d+)$/.exec(r.text) || [])[1]) || 1), 1);
    notify(other.id, { kind: 'nudge', text: K.text(user.name, times > 1 ? ' ×' + times : ''), href, symbol: K.symbol, shape: 'sunny' });
    // (only once the new one is in: a note's number is reused if the newest goes first, and their app would think
    // it already had it)
    for (const r of earlier) db.run('DELETE FROM notes WHERE id = ?', r.id);
    // and their open devices hear it now, rather than at their next check for news
    signal(other.id, 'nudge', { from: user.name, at: t, kind });
    if (modules.stats && modules.stats.add) modules.stats.add(user.id, 'nudges.sent');
    return Object.assign({ ok: true, to: other.name, kind }, allowance(user.id, other.id));
  });

  // whether friends may nudge you (Settings → Nudges)
  route('GET', '/api/nudges', ({ user }) => ({ on: nudgesOn(user.id) }));
  route('PUT', '/api/nudges', ({ user, body }) => {
    const on = body.on !== false;
    db.run('INSERT INTO social_prefs (user_id, nudges) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET nudges = excluded.nudges', user.id, on ? 1 : 0);
    return { on };
  });

  // ---- `nook` commands -----------------------------------------------------------------------------------------

  const say = (...lines) => console.log(lines.join('\n'));
  const when = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : 'for good');
  const describe = (b) =>
    `  #${String(b.id).padEnd(5)} ${(b.name ? 'u/' + b.name : 'an address').padEnd(22)} ${String(b.networks).padStart(2)} network${b.networks === 1 ? ' ' : 's'}  ${b.until ? 'until ' + when(b.until) : 'for good'.padEnd(22)}  ${b.by ? 'by u/' + b.by : ''}${b.reason ? '  · ' + b.reason : ''}`;
  CLI.help.push(
    '  nook ipban <name|IP> [days] [reason]   ban an account and the networks it used in the last 90 days (or one IP\'s network), for 1, 7 (the default) or 30 days, or 0 for good',
    '  nook ipbans                      list the network bans in force',
    '  nook ipunban <id|name>           lift a network ban (and the account ban that came with it)'
  );
  CLI.commands.ipban = (who, ...rest) => {
    if (!who) throw new Error('Usage: nook ipban <name|IP address> [days: 1, 7, 30 or 0 for good] [reason]');
    let days = 7;
    if (rest.length && /^(\d+|forever|permanent)$/i.test(rest[0])) {
      const given = rest.shift().toLowerCase();
      days = /^\d+$/.test(given) ? Number(given) : 0;
      if (!BAN_DAYS.includes(days)) throw new Error('A network ban lasts 1, 7 or 30 days, or 0 for good.');
    }
    const reason = rest.join(' ');
    sweep();
    if (net.isIP(String(who).replace(/^\[|\]$/g, '').replace(/%.*$/, ''))) {
      const done = banAddress(who, { days, reason, by: '' });
      return say(
        `Banned that address's network ${days ? `for ${days === 1 ? 'a day' : days + ' days'} (until ${when(done.until)})` : 'for good'}.`,
        done.users.length ? `Accounts that used it in the last ${SEEN_FOR} days: ${done.users.map((n) => 'u/' + n).join(', ')} (their accounts aren't banned).` : `No account used it in the last ${SEEN_FOR} days.`,
        'Only a keyed hash of it is kept, never the address. To lift it: nook ipbans, then nook ipunban <id>'
      );
    }
    const done = banNetworks(String(who).replace(/^u\//i, ''), { days, reason, by: '' });
    say(
      `u/${done.name}${done.accountBanned ? ' is banned and signed out everywhere, and' : ' (already banned) and'} ${done.networks} network${done.networks === 1 ? '' : 's'} they used can't use Budgie ${days ? `for ${days === 1 ? 'a day' : days + ' days'} (until ${when(done.until)})` : 'for good'}.`,
      ...(done.guarded ? [`${done.guarded} network${done.guarded === 1 ? '' : 's'} an admin also used ${done.guarded === 1 ? 'was' : 'were'} left alone.`] : []),
      ...(done.others ? [`${done.others} other account${done.others === 1 ? '' : 's'} used ${done.networks === 1 ? 'that network' : 'those networks'} lately: they can't use Budgie from there either while it lasts.`] : []),
      'To lift it: nook ipunban ' + done.name
    );
  };
  CLI.commands.ipbans = () => {
    sweep();
    const bans = list();
    if (!bans.length) return say('No network bans in force.');
    say(`${bans.length} network ban${bans.length === 1 ? '' : 's'} in force (lift one with nook ipunban <id>):`, ...bans.map(describe));
  };
  CLI.commands.ipunban = (which) => {
    if (!which) throw new Error('Usage: nook ipunban <id|name> (nook ipbans lists them)');
    sweep();
    const id = /^#?\d+$/.test(which) ? Number(which.replace('#', '')) : 0;
    const byId = id && db.get('SELECT id FROM ip_bans WHERE id = ?', id);
    if (byId) {
      const done = lift(id);
      return say(`Lifted ban #${id}${done.name ? ` on u/${done.name}` : ''}.${done.account ? ` u/${done.name} can sign in again too.` : ''}`);
    }
    const u = userNamed(String(which).replace(/^u\//i, ''));
    if (!u) throw new Error(`There's no ban #${which} and nobody called "${which}". Try: nook ipbans`);
    const batches = db.all('SELECT MIN(id) AS id FROM ip_bans WHERE user_id = ? GROUP BY batch', u.id);
    if (!batches.length) throw new Error(`u/${u.name} has no network ban. (nook unban ${u.name} lifts an account ban.)`);
    let back = false;
    for (const b of batches) back = lift(b.id).account || back;
    const still = db.get('SELECT banned_at FROM users WHERE id = ?', u.id).banned_at;
    say(`Lifted ${batches.length === 1 ? 'the network ban' : batches.length + ' network bans'} on u/${u.name}.${back ? ' They can sign in again too.' : still ? ` Their account is still banned some other way: nook unban ${u.name} lifts that.` : ''}`);
  };

  return {
    networkOf,
    /** whether a request from this address would be turned away (for the tests and other parts) */
    networkBanned: (ip) => !!(hashOf(ip) && activeBan(hashOf(ip))),
    /** what an account's export holds about this part */
    exportFor(userId) {
      return {
        nudges: {
          friendsCanNudgeMe: nudgesOn(userId),
          note: 'Nudges are kept for a day, to count how many were sent.',
          sent: db.all('SELECT u.name AS to_name, n.created_at FROM nudges n JOIN users u ON u.id = n.to_id WHERE n.from_id = ? ORDER BY n.id', userId).map((r) => ({ to: r.to_name, at: r.created_at })),
          received: db.all('SELECT u.name AS from_name, n.created_at FROM nudges n JOIN users u ON u.id = n.from_id WHERE n.to_id = ? ORDER BY n.id', userId).map((r) => ({ from: r.from_name, at: r.created_at })),
        },
        networks: {
          note: `Each internet connection (IP address) you used Budgie from in the last ${SEEN_FOR} days, kept as a keyed hash (never the address itself), to stop banned accounts coming back. Only when it was first and last seen.`,
          seen: db.all('SELECT first_at, last_at FROM ip_seen WHERE user_id = ? ORDER BY first_at', userId).map((r) => ({ firstSeen: r.first_at, lastSeen: r.last_at })),
        },
      };
    },
  };
}

module.exports = { install, networkOf };
