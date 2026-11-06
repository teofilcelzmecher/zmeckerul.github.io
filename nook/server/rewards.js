// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Profile rewards (Budgie 1.4): what someone can wear on their profile once an achievement unlocks it.
 *
 *   effect  an animated name (glow, shimmer, fire, rainbow, neon, glitch, wave, sparkle, aurora, gold)
 *   font    a font for the name, on top of the free ones from 1.0 (kept in the same `name_font` column)
 *   frame   a decoration round the profile picture (ring, flames, vinyl, orbit, crown, …)
 *   scene   an animated background behind the profile's header (bubbles, starfield, northern lights, …)
 *
 * The rewards themselves are in js/achievements-data.js (the app reads the same file): each says which tier of
 * which achievement unlocks it (`needs`), or that everyone has it. The app draws them all; the server only keeps
 * what each person wears and checks they've unlocked it, so nobody can wear what they haven't earned.
 *
 *   GET /api/rewards        what you wear, which rewards you've unlocked, and your tier in each achievement that
 *                           unlocks one (for "Unlock: On fire II" and how close you are)
 *   PUT /api/me/style       { effect, frame, scene, font }: wear something ('' takes it off); only what you send changes
 *
 * For testing, NOOK_UNLOCK_ALL=1 in the server's environment unlocks everything for everyone (never on a real server).
 */
'use strict';

const path = require('node:path');
const vm = require('node:vm');
const fs = require('node:fs');

// the shared catalog, read the way server.js reads js/data.js: the file sets window.NOOK_ACHIEVEMENTS
function readCatalog() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'achievements-data.js'), 'utf8'), sandbox, { filename: 'achievements-data.js' });
  return sandbox.window.NOOK_ACHIEVEMENTS;
}

const KINDS = {
  effect: { column: 'name_effect', word: 'name effects' },
  frame: { column: 'name_frame', word: 'frames' },
  scene: { column: 'profile_scene', word: 'scenes' },
};

function install({ db, route, limit, fail, publicUser, USER_EXTRAS, CLI, modules, HOUR, NAME_FONTS, serving }) {
  const CATALOG = (modules.achievements && modules.achievements.CATALOG) || readCatalog();
  const REWARDS = CATALOG.rewards || [];
  const REWARD = new Map(REWARDS.map((r) => [r.id, r]));
  const FAMILY = new Map((CATALOG.families || []).map((f) => [f.id, f]));
  const TIERS = CATALOG.tiers || ['I', 'II', 'III', 'IV', 'V'];
  // the free fonts from 1.0 (server.js keeps the list); a server from before it was passed along has these
  const FREE_FONTS = Array.isArray(NAME_FONTS) ? NAME_FONTS : ['rounded', 'hand', 'serif', 'pixel', 'mono', 'sign', 'script', 'comic'];
  // the achievements that unlock something, so the app can say how close you are to each
  const UNLOCKERS = [...new Set(REWARDS.filter((r) => r.needs).map((r) => r.needs.family))];

  const UNLOCK_ALL = process.env.NOOK_UNLOCK_ALL === '1';
  if (UNLOCK_ALL && serving) console.warn('NOOK_UNLOCK_ALL=1: everyone can wear every profile reward. This is for testing only.');

  // what each person wears: a column each (the font shares 1.0's name_font), added once to an older database
  for (const { column } of Object.values(KINDS)) {
    if (!db.raw.prepare('PRAGMA table_info(users)').all().some((c) => c.name === column)) db.raw.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
  }

  // ---- what's unlocked ---------------------------------------------------------------------------------------

  /** their tier (0–5) in an achievement; 0 while the achievements part can't say */
  function tierOf(userId, family) {
    const ach = modules.achievements;
    try {
      return ach && typeof ach.tierOf === 'function' ? Number(ach.tierOf(userId, family)) || 0 : 0;
    } catch (error) {
      console.error('rewards: tierOf', error);
      return 0;
    }
  }
  /** whether they can wear a reward (tiers can be passed in when they're already known) */
  function unlocked(userId, reward, tiers) {
    if (!reward) return false;
    if (!reward.needs || UNLOCK_ALL) return true;
    const tier = tiers && reward.needs.family in tiers ? tiers[reward.needs.family] : tierOf(userId, reward.needs.family);
    return tier >= reward.needs.tier;
  }
  /** "On fire II": the achievement and tier that unlock a reward */
  const needsLabel = (reward) => {
    const f = FAMILY.get(reward.needs.family);
    return `${f ? f.name : reward.needs.family} ${TIERS[reward.needs.tier - 1] || reward.needs.tier}`;
  };

  // only ids from the catalog are ever shown, so a reward taken out of it later simply stops showing
  const known = (id, kind) => {
    const r = REWARD.get(id);
    return r && r.kind === kind ? id : undefined;
  };
  const styleOf = (u) => ({
    effect: known(u.name_effect, 'effect') || '',
    frame: known(u.name_frame, 'frame') || '',
    scene: known(u.profile_scene, 'scene') || '',
    font: u.name_font || '',
  });

  // everyone's public profile carries what they wear (the font already travels as `font`); a banned account is
  // shown plainly, so it can't keep showing off
  USER_EXTRAS.push((u) =>
    u.banned_at ? {} : { effect: known(u.name_effect, 'effect'), frame: known(u.name_frame, 'frame'), scene: known(u.profile_scene, 'scene') }
  );

  // ---- routes ------------------------------------------------------------------------------------------------

  route('GET', '/api/rewards', ({ user }) => {
    const tiers = {};
    for (const family of UNLOCKERS) tiers[family] = tierOf(user.id, family);
    return {
      wearing: styleOf(user),
      tiers,
      unlocked: REWARDS.filter((r) => unlocked(user.id, r, tiers)).map((r) => r.id),
      // so the app can say why everything is open on a test server
      everything: UNLOCK_ALL || undefined,
    };
  });

  route('PUT', '/api/me/style', ({ user, body }) => {
    limit('style:' + user.id, 120, HOUR, 'That’s a lot of changing. Wait a little and try again.');
    const next = { name_effect: user.name_effect || '', name_frame: user.name_frame || '', profile_scene: user.profile_scene || '', name_font: user.name_font || '' };
    // the reward is checked first, then whether it's theirs: a 403 says what unlocks it
    const check = (id, field, kind) => {
      const reward = REWARD.get(id);
      if (!reward || reward.kind !== kind) fail(400, `That isn’t one of Budgie’s ${kind === 'font' ? 'name fonts' : KINDS[kind].word}.`, { field });
      if (!unlocked(user.id, reward)) fail(403, `You can wear ${reward.name} once you unlock ${needsLabel(reward)}.`, { field, needs: reward.needs });
    };
    for (const [kind, { column }] of Object.entries(KINDS)) {
      if (body[kind] == null) continue;
      if (typeof body[kind] !== 'string' || body[kind].length > 40) fail(400, 'That isn’t a reward.', { field: kind });
      if (body[kind]) check(body[kind], kind, kind);
      next[column] = body[kind];
    }
    if (body.font != null) {
      if (typeof body.font !== 'string' || body.font.length > 40) fail(400, 'That isn’t one of Budgie’s name fonts.', { field: 'font' });
      // the free fonts stay free; the others are rewards (and one you already wear stays yours)
      if (body.font && !FREE_FONTS.includes(body.font) && body.font !== user.name_font) check(body.font, 'font', 'font');
      next.name_font = body.font;
    }
    const changed = Object.keys(next).some((k) => next[k] !== (user[k] || ''));
    if (changed) {
      db.run(
        'UPDATE users SET name_effect = ?, name_frame = ?, profile_scene = ?, name_font = ?, rev = ? WHERE id = ?',
        next.name_effect, next.name_frame, next.profile_scene, next.name_font, db.bump(), user.id
      );
    }
    const row = db.get('SELECT * FROM users WHERE id = ?', user.id);
    return { style: styleOf(row), user: publicUser(row) };
  });

  // ---- nook commands -----------------------------------------------------------------------------------------

  const say = (...lines) => console.log(lines.join('\n'));
  const named = (name) => {
    const u = db.get('SELECT * FROM users WHERE name = ?', String(name || ''));
    if (!u) {
      console.error(`There's no user called "${name}". Try: nook users`);
      process.exit(1);
    }
    return u;
  };
  CLI.commands.rewards = (name) => {
    if (!name) {
      // the catalog, and how many people wear each
      const wearing = (kind, id) => db.get(`SELECT COUNT(*) AS n FROM users WHERE ${kind === 'font' ? 'name_font' : KINDS[kind].column} = ?`, id).n;
      say(UNLOCK_ALL ? 'Profile rewards (NOOK_UNLOCK_ALL is on: everyone has all of them):' : 'Profile rewards:');
      for (const r of REWARDS) say(`  ${r.kind.padEnd(7)} ${r.id.padEnd(16)} ${r.needs ? ('needs ' + needsLabel(r)).padEnd(28) : 'everyone'.padEnd(28)} worn by ${wearing(r.kind, r.id)}`);
      return;
    }
    const u = named(name);
    const style = styleOf(u);
    say(
      `u/${u.name} wears: ${['effect', 'font', 'frame', 'scene'].map((k) => `${k} ${style[k] || '–'}`).join(', ')}`,
      `Unlocked: ${REWARDS.filter((r) => unlocked(u.id, r)).map((r) => r.id).join(', ') || 'nothing yet'}`
    );
  };
  CLI.commands.unstyle = (name) => {
    const u = named(name);
    db.run("UPDATE users SET name_effect = '', name_frame = '', profile_scene = '', rev = ? WHERE id = ?", db.bump(), u.id);
    if (REWARD.has(u.name_font)) db.run("UPDATE users SET name_font = '' WHERE id = ?", u.id);
    say(`u/${u.name} no longer wears a name effect, frame, scene or reward font.`);
  };
  CLI.help.push(
    '  nook rewards [user]              the profile rewards (name effects, fonts, frames, scenes) and who wears them; or what someone wears and has unlocked',
    '  nook unstyle <user>              take off someone\'s name effect, frame, scene and reward font'
  );

  return {
    /** whether someone (a users row) may wear a font: a free one, the one they wear, or a reward font they've unlocked */
    mayWearFont(user, font) {
      if (!font || FREE_FONTS.includes(font) || font === user.name_font) return true;
      const reward = REWARD.get(font);
      return !!(reward && reward.kind === 'font' && unlocked(user.id, reward));
    },
    /** what someone wears: { effect, frame, scene, font } */
    styleOf,
    unlocked: (userId, id) => unlocked(userId, REWARD.get(id)),
  };
}

module.exports = { install };
