// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Achievements with tiers, the visit streak and its rewards (Budgie 1.4).
 *
 * The catalog is the app's own file (js/achievements-data.js), read here so both sides always agree. Everything is
 * counted on the server from what it already knows (posts, comments, friends, the stats module's songs and games…):
 * nobody can just say they have something. A tier, once reached, is kept for good, even if what it counted goes
 * down again later (a post deleted, a friend lost).
 *
 *   achievements         one row per tier someone reached: (user, achievement, tier, when). A special achievement
 *                        an admin gives is 'custom:<id>', with its tier (0 when it has none)
 *   custom_achievements  the special ones Budgie's admins make, "for whatever reason they want"
 *   users.streak_*       the visit streak: days in a row, best, freezes in hand, the last day (as a day number in
 *                        the person's own time zone), their time zone, and a little log of the last four weeks
 *   users.ach_*          the achievements they feature on their profile, how many they've reached, and whether the
 *                        badges from before 1.4 were carried over
 *
 * What the others use: tierOf(userId, id), streakOf(userId), check(userId), and soon(userId) (a check a moment
 * later, gathered up, for things that change in bursts).
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// the app's catalog, and its starter nests (for "visited"), read the way the server reads js/data.js
function readWindowFile(file, key) {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', file), 'utf8'), box);
  return box.window[key];
}
const CATALOG = readWindowFile('achievements-data.js', 'NOOK_ACHIEVEMENTS');
const STARTER_IDS = new Set(readWindowFile('data.js', 'NOOK_DATA').communities.map((c) => c.id));
const FAMILIES = CATALOG.families;
const FAMILY = new Map(FAMILIES.map((f) => [f.id, f]));
const ROMAN = CATALOG.tiers;
const STREAK = CATALOG.streak;
// the shapes an admin can give a special achievement (the design system's own 37)
const SHAPES = new Set(('circle square slanted arch fan arrow semiCircle oval pill triangle diamond clamShell pentagon gem sunny verySunny ' +
  'cookie4 cookie6 cookie7 cookie9 cookie12 ghostish clover4 clover8 burst softBurst boom softBoom flower puffy puffyDiamond pixelCircle ' +
  'pixelTriangle bun heart softCookie squircle').split(' '));
const SYMBOL_RE = /^[a-z0-9_]{1,40}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOG_DAYS = 28;
const FEATURED_MAX = 3;

const roman = (tier) => ROMAN[tier - 1] || '';
const clampInt = (value, lo, hi) => Math.max(lo, Math.min(hi, Math.floor(Number(value) || 0)));

function install(ctx) {
  const { db, route, limit, fail, text, notify, now, MINUTE, HOUR, DAY, USER_EXTRAS, ON_AUTHED, CLI, modules, serving, hasBlocked } = ctx;
  const stats = modules.stats;

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  tier INTEGER NOT NULL,
  at INTEGER NOT NULL,
  by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, id, tier)
);
CREATE INDEX IF NOT EXISTS achievements_id ON achievements(id);
CREATE TABLE IF NOT EXISTS custom_achievements (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  "desc" TEXT NOT NULL DEFAULT '',
  symbol TEXT NOT NULL DEFAULT 'star',
  shape TEXT NOT NULL DEFAULT 'softBurst',
  color TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);`);
  // columns on users, so a profile's streak and featured achievements come with it at no extra cost
  const COLUMNS = [
    ['streak_count', 'INTEGER NOT NULL DEFAULT 0'], ['streak_best', 'INTEGER NOT NULL DEFAULT 0'], ['streak_day', 'INTEGER NOT NULL DEFAULT 0'],
    ['streak_freezes', 'INTEGER NOT NULL DEFAULT 0'], ['streak_tz', 'INTEGER NOT NULL DEFAULT 0'], ['streak_log', "TEXT NOT NULL DEFAULT ''"],
    ['streak_hidden', 'INTEGER NOT NULL DEFAULT 0'], ['ach_featured', "TEXT NOT NULL DEFAULT ''"], ['ach_count', 'INTEGER NOT NULL DEFAULT 0'],
    ['ach_seeded', 'INTEGER NOT NULL DEFAULT 0'], ['streak_at', 'INTEGER NOT NULL DEFAULT 0'],
  ];
  const have = new Set(db.raw.prepare('PRAGMA table_info(users)').all().map((c) => c.name));
  for (const [name, type] of COLUMNS) if (!have.has(name)) db.raw.exec(`ALTER TABLE users ADD COLUMN ${name} ${type}`);
  // accounts made from now on get their first achievements with the usual fanfare; the ones already here have
  // theirs worked out quietly, once, with one note to say so
  const SINCE = Number(db.meta('achievements-since')) || Number(db.meta('achievements-since', String(now())));

  const userById = (id) => db.get('SELECT * FROM users WHERE id = ?', id);
  const userByName = (name) => db.get('SELECT * FROM users WHERE name = ?', String(name || '').replace(/^u\//i, ''));
  const prefsOf = (u) => {
    try {
      const p = JSON.parse(u.prefs || '{}');
      return p && typeof p === 'object' ? p : {};
    } catch (_) {
      return {};
    }
  };

  // ---- the streak ------------------------------------------------------------------------------------------------

  /** a day number (days since 1970) for a moment, in a time zone given as minutes ahead of UTC */
  const localDay = (t, tz) => Math.floor((t + tz * MINUTE) / DAY);
  const dayName = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  function parseDay(value) {
    const m = DAY_RE.exec(String(value || ''));
    if (!m) return 0;
    const day = Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY;
    return Number.isInteger(day) && dayName(day) === m[0] ? day : 0;
  }

  /** the streak as others see it today: one that's run out (more days missed than freezes to cover them) is 0 */
  function liveStreak(u) {
    if (!u.streak_count || !u.streak_day) return 0;
    const missed = localDay(now(), u.streak_tz) - u.streak_day - 1;
    return missed <= 0 || missed <= u.streak_freezes ? u.streak_count : 0;
  }
  const nextMilestone = (count) => STREAK.milestones.find((m) => m > count) || count + 1;

  /** the streak someone kept in the app before 1.4 (in their saved settings) comes along once, no longer than their account is old */
  function seedStreak(u, today) {
    const old = prefsOf(u).streak || {};
    const age = Math.floor((now() - u.created_at) / DAY) + 1;
    const last = parseDay(old.last);
    const best = clampInt(old.best, 0, age);
    let count = 0;
    let day = 0;
    // only a streak that's still alive carries on: kept yesterday or today
    if (last && (last === today || last === today - 1)) {
      count = clampInt(old.count, 0, age);
      if (count) day = last;
    }
    const keep = Math.max(best, count);
    db.run('UPDATE users SET streak_count = ?, streak_best = ?, streak_day = ?, streak_log = ? WHERE id = ?', count, keep, day, count ? 'v'.repeat(Math.min(count, LOG_DAYS)) : '', u.id);
    if (keep) {
      stats.max(u.id, 'streak.best', keep);
      stats.max(u.id, 'visits', keep);
    }
    return userById(u.id);
  }

  /**
   * someone opened Budgie on `day` (their own date): the streak grows by a day, carries on over missed days with
   * freezes, or starts again. What the app needs for its celebration comes back.
   */
  function visit(userId, day, tz) {
    let u = userById(userId);
    if (!u.streak_day && !u.streak_count && u.created_at < SINCE) u = seedStreak(u, day);
    const out = { grew: false, usedFreeze: 0, lost: 0, earnedFreeze: false, milestone: 0 };
    let { streak_count: count, streak_best: best, streak_freezes: freezes, streak_log: log } = u;
    // a new day reached by changing time zone needs most of a real day since the last one (a trip is fine; hopping
    // across time zones to collect yesterday, today and tomorrow in a minute isn't)
    const hopped = u.streak_day && tz !== u.streak_tz && now() - (u.streak_at || 0) < 20 * HOUR;
    // the same day again, or a day before the last one (a clock or a trip across time zones): nothing changes
    if (day > u.streak_day && !hopped) {
      const missed = u.streak_day ? day - u.streak_day - 1 : 0;
      if (!u.streak_day || !count) {
        count = 1;
        log = (u.streak_day ? '.'.repeat(Math.min(missed, LOG_DAYS)) : '') + 'v';
      } else if (missed === 0) {
        count++;
        log += 'v';
      } else if (missed <= freezes) {
        // a freeze for each day missed: the streak goes on (frozen days don't add to it)
        freezes -= missed;
        out.usedFreeze = missed;
        count++;
        log += 'f'.repeat(missed) + 'v';
      } else {
        out.lost = count;
        count = 1;
        log += '.'.repeat(Math.min(missed, LOG_DAYS)) + 'v';
      }
      out.grew = !out.lost;
      // a freeze for every week (or whatever the catalog says) of streak, up to the most you can hold
      if (count % STREAK.freezeEvery === 0 && freezes < STREAK.freezesMax) {
        freezes++;
        out.earnedFreeze = true;
      }
      if (out.grew && STREAK.milestones.includes(count)) out.milestone = count;
      best = Math.max(best, count);
      log = log.slice(-LOG_DAYS);
      db.run(
        'UPDATE users SET streak_count = ?, streak_best = ?, streak_day = ?, streak_freezes = ?, streak_tz = ?, streak_log = ?, streak_at = ?, rev = ? WHERE id = ?',
        count, best, day, freezes, tz, log, now(), db.bump(), userId
      );
      stats.add(userId, 'visits', 1);
      stats.max(userId, 'streak.best', best);
    } else if (tz !== u.streak_tz && !hopped) {
      db.run('UPDATE users SET streak_tz = ? WHERE id = ?', tz, userId);
    }
    const unlocked = check(userId);
    return Object.assign(out, {
      count, best, freezes, freezesMax: STREAK.freezesMax, freezeEvery: STREAK.freezeEvery, day: dayName(day), log, next: nextMilestone(count),
      hidden: !!u.streak_hidden, unlocked,
    });
  }

  route('POST', '/api/streak', ({ user, body }) => {
    limit('streak:' + user.id, 60, HOUR, 'Try again in a little while.');
    const day = parseDay(body.day);
    if (!day) fail(400, 'That isn’t a date.');
    // a day that can be "today" somewhere on Earth right now (UTC−12 to UTC+14), so nobody runs ahead of the calendar
    const t = now();
    if (day * DAY - t > 14 * HOUR || (day + 1) * DAY - t < -12 * HOUR) fail(400, 'Your device’s date looks wrong. Check its clock, then open Budgie again.');
    let tz = Math.round(Number(body.tz));
    if (!Number.isFinite(tz) || tz < -720 || tz > 840) tz = Math.round((day * DAY + 12 * HOUR - t) / MINUTE);
    tz = clampInt(tz, -720, 840);
    // the day must be today in the time zone the device says it's in (give or take a few minutes of clock), so a
    // day can't be picked from the three that are "today" somewhere
    if (![t - 5 * MINUTE, t, t + 5 * MINUTE].some((at) => localDay(at, tz) === day)) fail(400, 'Your device’s date looks wrong. Check its clock, then open Budgie again.');
    return visit(user.id, day, tz);
  });

  // ---- counting ----------------------------------------------------------------------------------------------------

  const nestExists = (id) => STARTER_IDS.has(id) || !!db.get('SELECT 1 AS x FROM nooks WHERE id = ?', id);
  const COUNTS = {
    streak: (u) => Math.max(u.streak_best, stats.get(u.id, 'streak.best')),
    visits: (u) => stats.get(u.id, 'visits'),
    posts: (u) => db.get('SELECT COUNT(*) AS n FROM posts WHERE author_id = ? AND removed_at IS NULL', u.id).n,
    comments: (u) => db.get('SELECT COUNT(*) AS n FROM comments WHERE author_id = ? AND removed_at IS NULL', u.id).n,
    friends: (u) => db.get("SELECT COUNT(*) AS n FROM friends WHERE (a = ? OR b = ?) AND status = 'friends'", u.id, u.id).n,
    joins: (u) => db.get('SELECT COUNT(*) AS n FROM joins WHERE user_id = ?', u.id).n,
    nests: (u) => db.get('SELECT COUNT(*) AS n FROM nooks WHERE created_by = ?', u.id).n,
    polls: (u) => db.get('SELECT COUNT(*) AS n FROM poll_votes WHERE user_id = ?', u.id).n,
    sparks: (u) => db.get('SELECT COUNT(*) AS n FROM sparks WHERE user_id = ?', u.id).n,
    // from their saved settings: only nests that are really there count, each once
    visited: (u, prefs) => new Set((Array.isArray(prefs.visited) ? prefs.visited : []).slice(0, 500).filter((id) => typeof id === 'string' && id.length <= 30 && nestExists(id))).size,
    collections: (u, prefs) => (Array.isArray(prefs.collections) ? prefs.collections : []).filter((c) => c && typeof c.name === 'string' && c.name.trim()).slice(0, 200).length,
    stickers: (u) => (modules.stickers && typeof modules.stickers.madeBy === 'function' ? Number(modules.stickers.madeBy(u.id)) || 0 : 0),
    // (1.7) games with friends in chats (server/games.js): finished, and won
    chatgames: (u) => stats.get(u.id, 'chatgames.played'),
    chatwins: (u) => stats.get(u.id, 'chatgames.won'),
  };
  /** how far someone has got with an achievement, in its own units (hours for the "minutes:" kinds) */
  function valueOf(u, count, prefs) {
    if (count.startsWith('set:')) return stats.count(u.id, count.slice(4));
    if (count.startsWith('minutes:')) return stats.get(u.id, count.slice(8)) / 60;
    const fn = COUNTS[count];
    return fn ? fn(u, prefs) : 0;
  }
  const tierFor = (family, value) => family.tiers.filter((need) => value >= need).length;

  /** the tiers someone has reached, by achievement id */
  function reachedOf(userId) {
    const out = new Map();
    for (const r of db.all('SELECT id, MAX(tier) AS tier FROM achievements WHERE user_id = ? GROUP BY id', userId)) out.set(r.id, r.tier);
    return out;
  }
  // an achievement given with no tier (0) still counts as had
  const had = (tier) => (tier === 0 ? 1 : tier || 0);

  /** the rewards a tier of an achievement unlocks (rewards from the catalog) */
  const rewardsFor = (id, tier) => CATALOG.rewards.filter((r) => r.needs && r.needs.family === id && r.needs.tier === tier).map((r) => r.id);

  /** the badges from before 1.4 (kept in the app's saved settings) become the tiers they stood for, once */
  function legacyTiers(u) {
    const badges = prefsOf(u).badges;
    const out = new Map();
    if (!badges || typeof badges !== 'object') return out;
    for (const f of FAMILIES) {
      for (const [badge, tier] of Object.entries(f.legacy || {})) {
        if (badges[badge]) out.set(f.id, Math.max(out.get(f.id) || 0, tier));
      }
    }
    return out;
  }

  /** after a change to what someone reached: their count and featured tiers, as everyone sees them */
  function refreshProfile(userId) {
    const reached = reachedOf(userId);
    const u = userById(userId);
    if (!u) return;
    const featured = parseFeatured(u.ach_featured)
      .filter((f) => reached.has(f.id))
      .map((f) => `${f.id}:${reached.get(f.id)}`)
      .join(',');
    if (reached.size !== u.ach_count || featured !== u.ach_featured) {
      db.run('UPDATE users SET ach_count = ?, ach_featured = ?, rev = ? WHERE id = ?', reached.size, featured, db.bump(), userId);
    }
  }

  /**
   * looks at everything someone has done and writes down any tier newly reached; each one is told (and pushed to
   * their phone), except the first time an account from before 1.4 is looked at. Returns what was unlocked.
   */
  function check(userId) {
    const u = userById(userId);
    if (!u || u.banned_at) return [];
    const reached = reachedOf(userId);
    const prefs = prefsOf(u);
    const first = !u.ach_seeded;
    // the badges from before 1.4 lived in people's own saved settings, which they can write: only accounts that
    // existed before achievements came to the server bring them along
    const legacy = first && u.created_at < SINCE ? legacyTiers(u) : new Map();
    const t = now();
    const unlocked = [];
    // all at once (or as part of the change that asked, if that's in a transaction already)
    const atomically = (fn) => (db.raw.isTransaction ? fn() : db.tx(fn));
    atomically(() => {
      for (const f of FAMILIES) {
        const value = valueOf(u, f.count, prefs);
        const tier = Math.max(tierFor(f, value), legacy.get(f.id) || 0);
        const before = reached.get(f.id) || 0;
        if (tier <= before) continue;
        for (let n = before + 1; n <= tier; n++) db.run('INSERT OR IGNORE INTO achievements (user_id, id, tier, at) VALUES (?, ?, ?, ?)', userId, f.id, n, t);
        const rewards = [];
        for (let n = before + 1; n <= tier; n++) rewards.push(...rewardsFor(f.id, n));
        unlocked.push({ id: f.id, tier, from: before, name: f.name, symbol: f.symbol, shape: f.shape, rewards });
      }
      if (first) db.run('UPDATE users SET ach_seeded = 1 WHERE id = ?', userId);
    });
    if (unlocked.length) refreshProfile(userId);
    const quietly = first && u.created_at < SINCE;
    if (quietly) {
      if (unlocked.length) {
        notify(userId, {
          kind: 'achievement', quiet: true, symbol: 'military_tech', shape: 'burst', href: '#/u/' + u.name,
          text: `Achievements are here: your badges became achievements with tiers, I to V, and you’ve already reached ${unlocked.length}. See them on your profile, and pick a few to show off.`,
        });
      }
      return [];
    }
    // each its own line in the inbox; a few at once reach the phone as one notification, not a burst of them
    const several = unlocked.length > 1;
    for (const a of unlocked) {
      notify(userId, { kind: 'achievement', quiet: several, text: `Achievement unlocked: ${a.name} ${roman(a.tier)}`, href: `#/u/${u.name}?achievement=${a.id}`, symbol: a.symbol, shape: a.shape });
    }
    if (several && ctx.push && typeof ctx.push.send === 'function') {
      const [top] = [...unlocked].sort((a, b) => b.tier - a.tier);
      const more = unlocked.length - 1;
      ctx.push.send([userId], {
        kind: 'activity', title: 'Budgie', href: `#/u/${u.name}`,
        body: `Achievements unlocked: ${top.name} ${roman(top.tier)} and ${more === 1 ? '1 more' : `${more} more`}`,
      });
    }
    return unlocked;
  }

  // checks that come in bursts (a song every few minutes, a stat changing twice) are gathered into one
  const waiting = new Map();
  function soon(userId, delay = 1500) {
    if (waiting.has(userId)) return;
    const timer = setTimeout(() => {
      waiting.delete(userId);
      try {
        check(userId);
      } catch (error) {
        console.error('achievements check', error);
      }
    }, delay);
    if (timer.unref) timer.unref();
    waiting.set(userId, timer);
  }
  stats.onChange((userId) => soon(userId));
  // and, so nothing is missed (a friend accepting your request, an older app), now and then while someone is
  // using Budgie: the first request after a few minutes looks again
  const looked = new Map();
  ON_AUTHED.push((user) => {
    const t = now();
    if (t - (looked.get(user.id) || 0) < 5 * MINUTE) return;
    looked.set(user.id, t);
    soon(user.id, 300);
  });
  if (serving) {
    setInterval(() => {
      const t = now();
      for (const [id, at] of looked) if (t - at > HOUR) looked.delete(id);
    }, 30 * MINUTE).unref();
  }

  // the app asks after you do something that might count (a post, a comment, joining a nest…): the server counts
  route('POST', '/api/achievements/check', ({ user }) => {
    limit('ach-check:' + user.id, 30, MINUTE, 'Try again in a moment.');
    return { unlocked: check(user.id) };
  });

  // ---- what a profile shows ------------------------------------------------------------------------------------

  function parseFeatured(value) {
    return String(value || '')
      .split(',')
      .filter(Boolean)
      .map((part) => {
        // "streak:3", or "custom:12:0" for a special one (its id has a colon of its own)
        const at = part.lastIndexOf(':');
        return at > 0 ? { id: part.slice(0, at), tier: Number(part.slice(at + 1)) || 0 } : { id: part, tier: 0 };
      })
      .filter((f) => f.id);
  }

  USER_EXTRAS.push((u) => {
    const streak = u.streak_hidden ? 0 : liveStreak(u);
    return {
      streak: streak >= 1 ? streak : undefined,
      featured: u.ach_featured ? parseFeatured(u.ach_featured) : undefined,
      achievements: u.ach_count || undefined,
    };
  });

  const customRow = (id) => db.get('SELECT * FROM custom_achievements WHERE id = ?', Number(String(id).replace(/^custom:/, '')) || 0);
  const customOut = (c) => ({ id: 'custom:' + c.id, name: c.name, desc: c.desc, symbol: c.symbol, shape: c.shape, color: c.color || undefined, special: true });

  route('GET', '/api/achievements/:name', ({ user, params }) => {
    limit('ach-read:' + user.id, 120, MINUTE);
    const u = userByName(text(params.name, 40));
    if (!u || (u.banned_at && user.role !== 'admin')) fail(404, 'There’s nobody by that name.');
    const mine = u.id === user.id;
    // someone who blocked you: nothing of theirs to see here
    if (!mine && hasBlocked(u.id, user.id)) return { streak: null, achievements: [], featured: [], custom: [], total: FAMILIES.length };
    const unlocked = mine ? check(u.id) : [];
    const fresh = mine ? userById(u.id) : u;
    const rows = db.all('SELECT id, tier, at, by_id FROM achievements WHERE user_id = ? ORDER BY tier', u.id);
    const tiersOf = new Map();
    for (const r of rows) {
      if (!tiersOf.has(r.id)) tiersOf.set(r.id, []);
      tiersOf.get(r.id).push(r);
    }
    const prefs = mine ? prefsOf(fresh) : {};
    const achievements = [];
    for (const f of FAMILIES) {
      const list = tiersOf.get(f.id) || [];
      const tier = list.length ? list[list.length - 1].tier : 0;
      if (!mine && !tier) continue;
      const item = { id: f.id, tier, at: tier ? list[list.length - 1].at : undefined, tiers: list.map((r) => r.at) };
      // how far along you are: only for yourself (others see what you've reached, not your numbers)
      if (mine) {
        const value = valueOf(fresh, f.count, prefs);
        item.value = f.count.startsWith('minutes:') ? Math.floor(value * 10) / 10 : value;
        item.next = tier < f.tiers.length ? f.tiers[tier] : undefined;
      }
      achievements.push(item);
    }
    const custom = [];
    for (const [id, list] of tiersOf) {
      if (!id.startsWith('custom:')) continue;
      const c = customRow(id);
      if (!c) continue;
      const r = list[list.length - 1];
      const by = r.by_id ? db.get('SELECT name FROM users WHERE id = ?', r.by_id) : null;
      custom.push(Object.assign(customOut(c), { tier: r.tier, at: r.at, by: by ? by.name : undefined }));
    }
    const hidden = !!fresh.streak_hidden;
    const streak = mine
      ? { count: liveStreak(fresh), best: fresh.streak_best, freezes: fresh.streak_freezes, freezesMax: STREAK.freezesMax, freezeEvery: STREAK.freezeEvery, log: fresh.streak_log, day: fresh.streak_day ? dayName(fresh.streak_day) : '', next: nextMilestone(liveStreak(fresh)), hidden }
      : hidden
        ? null
        : { count: liveStreak(fresh), best: fresh.streak_best };
    return { streak, achievements, custom, featured: parseFeatured(fresh.ach_featured), total: FAMILIES.length, unlocked };
  });

  route('PUT', '/api/achievements/featured', ({ user, body }) => {
    limit('ach-feature:' + user.id, 60, HOUR, 'Try again in a little while.');
    const ids = Array.isArray(body.featured) ? body.featured.map((f) => (f && typeof f === 'object' ? f.id : f)) : [];
    const reached = reachedOf(user.id);
    const list = [...new Set(ids.map((id) => text(id, 40)))].filter(Boolean);
    if (list.length > FEATURED_MAX) fail(400, `You can feature up to ${FEATURED_MAX}.`);
    for (const id of list) if (!reached.has(id)) fail(400, 'You can only feature achievements you’ve reached.');
    const value = list.map((id) => `${id}:${reached.get(id)}`).join(',');
    db.run('UPDATE users SET ach_featured = ?, rev = ? WHERE id = ?', value, db.bump(), user.id);
    return { featured: parseFeatured(value) };
  });

  // whether others see your streak on your profile
  route('PUT', '/api/achievements/settings', ({ user, body }) => {
    if (typeof body.showStreak === 'boolean') db.run('UPDATE users SET streak_hidden = ?, rev = ? WHERE id = ?', body.showStreak ? 0 : 1, db.bump(), user.id);
    return { showStreak: !userById(user.id).streak_hidden };
  });

  // "Export my data": every tier reached and when, the streak as the server keeps it, and what's featured
  if (Array.isArray(ctx.EXPORT_EXTRAS)) {
    ctx.EXPORT_EXTRAS.push((user) => {
      const u = userById(user.id);
      const names = new Map(db.all('SELECT id, name FROM custom_achievements').map((c) => ['custom:' + c.id, c.name]));
      return {
        achievements: db.all('SELECT id, tier, at, by_id FROM achievements WHERE user_id = ? ORDER BY at, id, tier', user.id).map((r) => ({
          id: r.id, name: FAMILY.has(r.id) ? FAMILY.get(r.id).name : names.get(r.id) || r.id, tier: r.tier ? roman(r.tier) : undefined,
          reachedAt: new Date(r.at).toISOString(), givenByAdmin: r.by_id ? true : undefined,
        })),
        streak: {
          days: liveStreak(u), best: u.streak_best, freezes: u.streak_freezes, lastDay: u.streak_day ? dayName(u.streak_day) : undefined,
          timeZoneMinutes: u.streak_tz, lastFourWeeks: u.streak_log || undefined, shownOnProfile: !u.streak_hidden,
        },
        featuredAchievements: parseFeatured(u.ach_featured),
      };
    });
  }

  // ---- special achievements, given by Budgie's admins ---------------------------------------------------------------

  function makeCustom({ name, desc, symbol, shape, color }, byId) {
    name = text(name, 40);
    desc = text(desc, 160);
    symbol = text(symbol, 40) || 'star';
    shape = text(shape, 20) || 'softBurst';
    color = text(color, 7);
    if (name.length < 2) fail(400, 'Give it a name (at least 2 characters).', { field: 'name' });
    if (!SYMBOL_RE.test(symbol)) fail(400, 'The symbol is a Material Symbols name, like star or celebration.', { field: 'symbol' });
    if (!SHAPES.has(shape)) fail(400, 'That isn’t one of the shapes.', { field: 'shape' });
    if (color && !HEX_RE.test(color)) fail(400, 'The colour is a hex code, like #e8467c.', { field: 'color' });
    if (db.get('SELECT 1 AS x FROM custom_achievements WHERE name = ? COLLATE NOCASE', name)) fail(409, 'There’s already a special achievement with that name.', { field: 'name' });
    const { lastInsertRowid } = db.run('INSERT INTO custom_achievements (name, "desc", symbol, shape, color, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', name, desc, symbol, shape, color, byId || null, now());
    return customRow(Number(lastInsertRowid));
  }
  const holders = (c) => db.get("SELECT COUNT(*) AS n FROM achievements WHERE id = ?", 'custom:' + c.id).n;
  const listCustom = () =>
    db.all('SELECT * FROM custom_achievements ORDER BY id DESC').map((c) => {
      const by = c.created_by ? db.get('SELECT name FROM users WHERE id = ?', c.created_by) : null;
      return Object.assign(customOut(c), { createdAt: c.created_at, by: by ? by.name : undefined, holders: holders(c) });
    });

  /** gives someone a special achievement (tier 1–5, or 0 for none), or a different tier of it; they're told */
  function award(u, c, tier, byId) {
    tier = clampInt(tier, 0, 5);
    const id = 'custom:' + c.id;
    const before = db.get('SELECT MAX(tier) AS tier, COUNT(*) AS n FROM achievements WHERE user_id = ? AND id = ?', u.id, id);
    if (before.n && before.tier === tier) return false;
    db.tx(() => {
      db.run('DELETE FROM achievements WHERE user_id = ? AND id = ?', u.id, id);
      db.run('INSERT INTO achievements (user_id, id, tier, at, by_id) VALUES (?, ?, ?, ?, ?)', u.id, id, tier, now(), byId || null);
    });
    refreshProfile(u.id);
    notify(u.id, {
      kind: 'achievement', symbol: c.symbol, shape: c.shape, href: `#/u/${u.name}?achievement=${id}`,
      text: `You got a special achievement from Budgie: ${c.name}${tier ? ' ' + roman(tier) : ''}${c.desc ? '. ' + c.desc : ''}`,
    });
    return true;
  }
  function unaward(u, c) {
    const { changes } = db.run('DELETE FROM achievements WHERE user_id = ? AND id = ?', u.id, 'custom:' + c.id);
    if (changes) refreshProfile(u.id);
    return !!changes;
  }
  function dropCustom(c) {
    const people = db.all('SELECT DISTINCT user_id FROM achievements WHERE id = ?', 'custom:' + c.id).map((r) => r.user_id);
    db.tx(() => {
      db.run('DELETE FROM achievements WHERE id = ?', 'custom:' + c.id);
      db.run('DELETE FROM custom_achievements WHERE id = ?', c.id);
    });
    for (const id of people) refreshProfile(id);
    return people.length;
  }

  route('GET', '/api/admin/achievements', () => ({ custom: listCustom() }), { admin: true });
  route('POST', '/api/admin/achievements', ({ user, body }) => {
    limit('ach-make:' + user.id, 60, HOUR);
    return { achievement: Object.assign(customOut(makeCustom(body, user.id)), { holders: 0, by: user.name }) };
  }, { admin: true });
  route('DELETE', '/api/admin/achievements/:id', ({ params }) => {
    const c = customRow(params.id);
    if (!c) fail(404, 'That special achievement is gone.');
    return { ok: true, taken: dropCustom(c) };
  }, { admin: true });
  route('POST', '/api/admin/achievements/:id/give', ({ user, params, body }) => {
    limit('ach-give:' + user.id, 120, HOUR);
    const c = customRow(params.id);
    if (!c) fail(404, 'That special achievement is gone.');
    const u = userByName(text(body.name, 40));
    if (!u) fail(404, 'There’s nobody by that name.');
    if (u.banned_at) fail(400, `u/${u.name} is banned.`);
    const tier = body.tier == null ? 0 : Number(body.tier);
    if (!Number.isInteger(tier) || tier < 0 || tier > 5) fail(400, 'The tier is I to V, or none.');
    return { ok: true, changed: award(u, c, tier, user.id) };
  }, { admin: true });
  route('POST', '/api/admin/achievements/:id/take', ({ params, body }) => {
    const c = customRow(params.id);
    if (!c) fail(404, 'That special achievement is gone.');
    const u = userByName(text(body.name, 40));
    if (!u) fail(404, 'There’s nobody by that name.');
    return { ok: true, changed: unaward(u, c) };
  }, { admin: true });
  // what someone already has, for the admin's "Give an achievement" sheet
  route('GET', '/api/admin/achievements/of/:name', ({ params }) => {
    const u = userByName(text(params.name, 40));
    if (!u) fail(404, 'There’s nobody by that name.');
    const mine = db.all("SELECT id, tier FROM achievements WHERE user_id = ? AND id LIKE 'custom:%'", u.id);
    return { custom: listCustom(), has: Object.fromEntries(mine.map((r) => [r.id, r.tier])) };
  }, { admin: true });

  // ---- screen sharing time (calls.js says how long, the server caps it by the time really spent in the call) -----

  const shared = new Map(); // `${userId}:${callId}` → { secs, at }
  route('POST', '/api/stats/share', ({ user, body }) => {
    limit('share-time:' + user.id, 60, HOUR, 'Try again in a little while.');
    const callId = text(body.callId, 40);
    const secs = clampInt(body.seconds, 0, 6 * 60);
    if (!/^c[A-Za-z0-9_-]{6,30}$/.test(callId) || !secs) return { counted: 0 };
    const span = typeof ctx.callSpan === 'function' ? ctx.callSpan(callId, user.id) : null;
    if (span == null) fail(404, 'That call isn’t one you were in.');
    const key = user.id + ':' + callId;
    const before = shared.get(key) || { secs: 0 };
    // never more than the time they've been in the call (and a few seconds for the clocks)
    const counted = Math.max(0, Math.min(secs, Math.floor(span / 1000) + 5 - before.secs));
    shared.set(key, { secs: before.secs + counted, at: now() });
    if (counted) {
      const total = stats.add(user.id, 'share.seconds', counted);
      stats.max(user.id, 'share.minutes', Math.floor(total / 60));
    }
    return { counted };
  });
  if (serving) {
    setInterval(() => {
      const t = now();
      for (const [key, v] of shared) if (t - v.at > 6 * HOUR) shared.delete(key);
    }, HOUR).unref();
  }

  // ---- nook commands -------------------------------------------------------------------------------------------------

  const say = (...lines) => console.log(lines.join('\n'));
  const named = (name) => {
    const u = userByName(name);
    if (!u) throw new Error(`There's no user called "${name}". Try: nook users`);
    return u;
  };
  const customNamed = (id) => {
    const c = customRow(id);
    if (!c) throw new Error(`There's no special achievement ${id}. Try: nook achievements`);
    return c;
  };
  const tierArg = (value) => {
    if (value == null || value === '' || /^(none|0|-)$/i.test(value)) return 0;
    const n = /^\d$/.test(value) ? Number(value) : ROMAN.indexOf(String(value).toUpperCase()) + 1;
    if (!(n >= 1 && n <= 5)) throw new Error('The tier is 1–5 (or I–V), or none.');
    return n;
  };
  CLI.commands.achievement = (what, name, desc, symbol, shape) => {
    if (what !== 'new' || !name) throw new Error('Usage: nook achievement new "<name>" "<description>" [symbol] [shape]');
    let c;
    try {
      c = makeCustom({ name, desc: desc || '', symbol, shape }, null);
    } catch (error) {
      throw new Error(error.message);
    }
    say(`Made special achievement ${c.id}: ${c.name} (${c.symbol} on ${c.shape}). Give it with: nook award <user> ${c.id} [tier]`);
  };
  CLI.commands.achievements = () => {
    const list = listCustom();
    if (!list.length) return say('No special achievements yet. Make one with: nook achievement new "<name>" "<description>" [symbol] [shape]');
    say('Special achievements (id, name, how many have it):', ...list.map((c) => `  ${c.id.replace('custom:', '').padEnd(4)} ${c.name.padEnd(28)} ${c.holders} ${c.holders === 1 ? 'person' : 'people'}${c.desc ? ' · ' + c.desc : ''}`));
  };
  CLI.commands.award = (name, id, tier) => {
    if (!name || !id) throw new Error('Usage: nook award <user> <achievement id> [tier]');
    const u = named(name);
    const c = customNamed(id);
    const n = tierArg(tier);
    say(award(u, c, n, null) ? `u/${u.name} has ${c.name}${n ? ' ' + roman(n) : ''} now; they've been told.` : `u/${u.name} already had ${c.name}${n ? ' ' + roman(n) : ''}.`);
  };
  CLI.commands.unaward = (name, id) => {
    if (!name || !id) throw new Error('Usage: nook unaward <user> <achievement id>');
    const u = named(name);
    const c = customNamed(id);
    say(unaward(u, c) ? `u/${u.name} no longer has ${c.name}.` : `u/${u.name} didn't have ${c.name}.`);
  };
  // for trying everything out: every achievement at its top tier (and every special one) and a long streak, all at
  // once and without a note for each. What they really had is kept, so `nook unmax` puts it back exactly
  const backupKey = (u) => `max-backup:${u.id}`;
  CLI.commands.max = (name, days) => {
    if (!name) throw new Error('Usage: nook max <user> [streak days]');
    const u = named(name);
    const n = days == null ? 200 : clampInt(days, 1, 3650);
    db.tx(() => {
      if (!db.meta(backupKey(u))) {
        const rows = db.all('SELECT id, tier, at, by_id FROM achievements WHERE user_id = ?', u.id);
        const streak = { count: u.streak_count, best: u.streak_best, day: u.streak_day, freezes: u.streak_freezes, log: u.streak_log };
        // (a visit while maxed writes the long streak into the stats as their best: that goes back too)
        db.meta(backupKey(u), JSON.stringify({ rows, streak, statBest: stats.get(u.id, 'streak.best') || 0 }));
      }
      const t = now();
      for (const f of FAMILIES) for (let tier = 1; tier <= f.tiers.length; tier++) db.run('INSERT OR IGNORE INTO achievements (user_id, id, tier, at, by_id) VALUES (?, ?, ?, ?, NULL)', u.id, f.id, tier, t);
      for (const c of listCustom()) db.run('INSERT OR IGNORE INTO achievements (user_id, id, tier, at, by_id) VALUES (?, ?, 0, ?, NULL)', u.id, c.id, t);
      // kept today, in their own time zone, with both freezes in hand
      db.run(
        'UPDATE users SET streak_count = ?, streak_best = ?, streak_day = ?, streak_freezes = ?, streak_log = ?, rev = ? WHERE id = ?',
        n, Math.max(n, u.streak_best || 0), localDay(t, u.streak_tz || 0), STREAK.freezesMax, 'v'.repeat(Math.min(n, LOG_DAYS)), db.bump(), u.id
      );
    });
    refreshProfile(u.id);
    say(
      `u/${u.name} has every achievement at its top tier now (${FAMILIES.length} of them, and ${listCustom().length} special), every reward they unlock, and a ${n}-day streak with ${STREAK.freezesMax} freezes.`,
      'Open Budgie again (or pull to refresh) to see it. Others see it on their profile too. To put back what they really had: nook unmax ' + u.name
    );
  };
  CLI.commands.unmax = (name) => {
    if (!name) throw new Error('Usage: nook unmax <user>');
    const u = named(name);
    const saved = db.meta(backupKey(u));
    if (!saved) return say(`u/${u.name} wasn't given everything with nook max, so there's nothing to put back.`);
    const { rows, streak, statBest = 0 } = JSON.parse(saved);
    db.tx(() => {
      db.run("UPDATE stats SET value = ? WHERE user_id = ? AND key = 'streak.best'", statBest, u.id);
      db.run('DELETE FROM achievements WHERE user_id = ?', u.id);
      for (const r of rows) db.run('INSERT INTO achievements (user_id, id, tier, at, by_id) VALUES (?, ?, ?, ?, ?)', u.id, r.id, r.tier, r.at, r.by_id);
      db.run(
        'UPDATE users SET streak_count = ?, streak_best = ?, streak_day = ?, streak_freezes = ?, streak_log = ?, rev = ? WHERE id = ?',
        streak.count, streak.best, streak.day, streak.freezes, streak.log, db.bump(), u.id
      );
      db.run('DELETE FROM meta WHERE key = ?', backupKey(u));
    });
    refreshProfile(u.id);
    say(`u/${u.name} has what they really earned again: ${rows.length} tier${rows.length === 1 ? '' : 's'} and a ${streak.count}-day streak.`);
  };
  CLI.help.push(
    '  nook max <user> [days]           for testing: every achievement at its top tier, every reward, and a streak (200 days unless given)',
    '  nook unmax <user>                put back the achievements and streak someone really had before nook max',
    '  nook achievement new "<name>" "<description>" [symbol] [shape]   make a special achievement to give people (symbol: a Material Symbols name)',
    '  nook achievements                list the special achievements, and how many people have each',
    '  nook award <user> <id> [tier]    give someone a special achievement (tier 1–5 or I–V; none if left out); they\'re told',
    '  nook unaward <user> <id>         take a special achievement away'
  );

  return {
    /** the tier someone has reached (0 none, 1–5 for I–V) in an achievement (a family id, or 'custom:<id>', where one given with no tier counts as 1) */
    tierOf(userId, id) {
      const r = db.get('SELECT MAX(tier) AS tier, COUNT(*) AS n FROM achievements WHERE user_id = ? AND id = ?', userId, String(id));
      return r && r.n ? had(r.tier) : 0;
    },
    /** their visit streak, as it stands today */
    streakOf(userId) {
      const u = userById(userId);
      return u ? { count: liveStreak(u), best: u.streak_best, freezes: u.streak_freezes } : { count: 0, best: 0, freezes: 0 };
    },
    /** looks again at what they've reached (after something changes); returns what was unlocked */
    check,
    /** the same, a moment later, gathered with any others for them */
    soon,
    CATALOG,
  };
}

module.exports = { install };
