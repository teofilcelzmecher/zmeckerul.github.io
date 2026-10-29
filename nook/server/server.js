#!/usr/bin/env node
// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's server: accounts, posts, comments, votes, nooks, friends and messages,
 * kept in one SQLite file. Plain Node (22.5 or newer), no packages to install.
 *
 * It listens on 127.0.0.1 only; something in front of it (Tailscale Funnel, a
 * Cloudflare tunnel, Caddy) brings it to the internet over HTTPS. The app on
 * GitHub Pages talks to it with a bearer token, so no cookies are involved.
 *
 * Settings come from the environment:
 *   NOOK_PORT     port to listen on (8787)
 *   NOOK_DATA     folder for the database (./data)
 *   NOOK_ORIGINS  comma-separated sites allowed to call the API
 *                 (https://teofilcelzmecher.github.io); "http://localhost:*" allows any local port
 */
'use strict';

const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { promisify } = require('node:util');
const { open } = require('./db');
const mod = require('../js/moderation.js');
const pictures = require('./pictures');
const textmodel = require('./textmodel');

const VERSION = '0.9.5';
const TERMS = '0.9.5, 2026-10-28';
const CONFIG = {
  port: Number(process.env.NOOK_PORT) || 8787,
  host: process.env.NOOK_HOST || '127.0.0.1',
  data: process.env.NOOK_DATA || path.join(__dirname, 'data'),
  origins: (process.env.NOOK_ORIGINS || 'https://budgiesocial.com,https://www.budgiesocial.com,https://teofilcelzmecher.github.io')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean),
};

const MINUTE = 60000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const SESSION_IDLE = 90 * DAY;
const DEFAULT_JOINS = ['budgiehq', 'houseplants', 'homecooking', 'webdev', 'cozygames', 'nightsky', 'askbudgie'];
const SPARK_KINDS = ['love', 'insight', 'funny', 'fire', 'wow'];
const COLORS = ['#6750a4', '#e8467c', '#ff8a3d', '#1db954', '#3d7bff', '#00a6a6'];
const SHAPES = ['cookie9', 'flower', 'heart', 'clover4', 'puffy', 'sunny'];
const CATEGORIES = ['Hobbies', 'Music', 'Food', 'Tech', 'Science', 'Gaming', 'Sports', 'Books', 'Art', 'Travel', 'Discussion', 'Meta'];

// the starter nooks are the app's own data file, read here so both sides agree
const STARTERS = (() => {
  const box = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'data.js'), 'utf8'), box);
  return new Map(box.window.NOOK_DATA.communities.map((c) => [c.id, c]));
})();

const db = open(CONFIG.data);
textmodel.setup(CONFIG.data);

// two starter nests were renamed with the app (Nook became Budgie): what was in them moves along, once
for (const [was, now] of [['nookhq', 'budgiehq'], ['asknook', 'askbudgie']]) {
  if (!db.get('SELECT 1 AS x FROM posts WHERE nook = ? UNION ALL SELECT 1 FROM joins WHERE nook = ?', was, was)) continue;
  db.tx(() => {
    for (const p of db.all('SELECT id FROM posts WHERE nook = ?', was)) db.run('UPDATE posts SET nook = ?, rev = ? WHERE id = ?', now, db.bump(), p.id);
    db.run('UPDATE OR IGNORE joins SET nook = ? WHERE nook = ?', now, was);
    db.run('DELETE FROM joins WHERE nook = ?', was);
    db.run('UPDATE notes SET href = ? || substr(href, ?) WHERE href LIKE ?', `#/n/${now}/`, `#/n/${was}/`.length + 1, `#/n/${was}/%`);
  });
}

// invite codes are only 6 digits, so they're stored keyed with a secret that never leaves this
// computer: a copy of the database alone isn't enough to work them out
const INVITE_KEY = db.meta('invite-key') || db.meta('invite-key', crypto.randomBytes(32).toString('hex'));

// what the Privacy Policy promises: unused sign-ins expire, old moderation records go
function tidy() {
  db.run('DELETE FROM sessions WHERE seen_at < ?', Date.now() - 90 * 24 * 3600000);
  db.run('DELETE FROM reports WHERE resolved_at IS NOT NULL AND resolved_at < ?', Date.now() - 365 * 24 * 3600000);
}
tidy();
setInterval(tidy, 24 * 3600000).unref();

// ---- small helpers --------------------------------------------------------------------------------

class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra || null;
  }
}
const fail = (status, message, extra) => {
  throw new HttpError(status, message, extra);
};

const now = () => Date.now();
const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');
const randomId = (prefix, bytes = 9) => prefix + crypto.randomBytes(bytes).toString('base64url');
const scrypt = promisify(crypto.scrypt);
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 64, SCRYPT);
  return `s1$${salt.toString('base64')}$${key.toString('base64')}`;
}
async function checkPassword(password, stored) {
  const [version, salt, key] = String(stored).split('$');
  if (version !== 's1' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = await scrypt(String(password).normalize('NFKC'), Buffer.from(salt, 'base64'), want.length, SCRYPT);
  return crypto.timingSafeEqual(want, got);
}

// recovery codes: 16 letters and digits that are hard to mix up, in four groups
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function recoveryCode() {
  const bytes = crypto.randomBytes(16);
  const chars = [...bytes].map((b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  return chars.match(/.{4}/g).join('-');
}
const recoveryHash = (code) => sha256('nook-recovery:' + String(code).toUpperCase().replace(/[^A-Z0-9]/g, ''));
const inviteHash = (code) => crypto.createHmac('sha256', INVITE_KEY).update(String(code).replace(/\D/g, '')).digest('hex');

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const WORD_RE = /^[A-Za-z0-9_]{1,40}$/;

// ---- rate limits (in memory: they reset when the server restarts) ------------------------------------

const buckets = new Map();
function limit(key, max, windowMs, message = 'That’s a lot of tries. Wait a little and try again.') {
  // behind a tunnel that doesn't pass on visitors' addresses everyone shares one "unknown" address,
  // so its limit is ten times looser rather than locking everybody out at once
  if (key.endsWith(':unknown')) max *= 10;
  const t = now();
  let b = buckets.get(key);
  if (!b || b.reset < t) {
    b = { count: 0, reset: t + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  if (b.count > max) fail(429, message, { retryIn: Math.ceil((b.reset - t) / 1000) });
}
setInterval(() => {
  const t = now();
  for (const [key, b] of buckets) if (b.reset < t) buckets.delete(key);
}, 10 * MINUTE).unref();

// ---- pictures: JPEG and PNG (and GIF, where it's allowed), checked by their first bytes and for nudity ----

const size = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(0)} MB` : `${Math.round(bytes / 1024)} KB`);

/** a picture sent as data, checked to be what it says it is: { bytes, mime }. gif: false, true or 'only' */
function readImage(dataUrl, maxBytes, { gif = false, maxSide = 2048 } = {}) {
  const m = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) fail(400, gif ? 'Pictures must be JPEG, PNG or GIF.' : 'Pictures must be JPEG or PNG.');
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > maxBytes) fail(413, `That ${gif === 'only' ? 'GIF' : 'image'} is too big (the limit is ${size(maxBytes)}).`);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isGif = /^GIF8[79]a$/.test(bytes.subarray(0, 6).toString('latin1'));
  if (isGif) {
    if (!gif) fail(400, 'GIFs can’t go here.');
    // a GIF's size is in its header; a huge one would be slow for everyone who sees it
    const width = bytes.length >= 10 ? bytes.readUInt16LE(6) : 0, height = bytes.length >= 10 ? bytes.readUInt16LE(8) : 0;
    if (!width || !height) fail(400, 'That GIF looks broken.');
    if (width > maxSide || height > maxSide) fail(413, `That GIF is too large (at most ${maxSide}×${maxSide} pixels).`);
  } else if (gif === 'only') fail(400, 'That isn’t a GIF.');
  // WebP can't be checked for nudity here, so it isn't taken (the app always sends JPEG)
  const mime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : isGif ? 'image/gif' : null;
  if (!mime) fail(400, gif ? 'That doesn’t look like a JPEG, PNG or GIF.' : 'That doesn’t look like a JPEG or PNG.');
  return { bytes, mime };
}

/** keeps a picture that's been read and checked; returns its id */
function saveImage(img, ownerId) {
  const id = crypto.randomBytes(16).toString('base64url');
  db.run('INSERT INTO images (id, owner_id, mime, data, created_at) VALUES (?, ?, ?, ?, ?)', id, ownerId, img.mime, img.bytes, now());
  return id;
}

const PICTURE_REFUSED = {
  profile: 'This picture might not be OK for everyone on Budgie (an automatic check flagged it), so it can’t be a profile picture or banner. Try a different one.',
  message: 'This picture might not be OK to send (an automatic check flagged it as possibly sexual), so it wasn’t sent.',
  post: 'This picture looks like it shows nudity or sexual content, which isn’t allowed on Budgie.',
};

/** the nudity check (pictures.js): refuses what isn't allowed; returns 'review' when a moderator should look */
async function checkPicture(img, where) {
  let score;
  try {
    score = await pictures.score(img.bytes, img.mime);
  } catch (error) {
    if (error.unreadable) fail(400, 'That picture couldn’t be read. Try another one.');
    console.error('picture check failed:', error.message);
    fail(503, 'Pictures can’t be checked right now, so they can’t be posted. Try again in a minute.');
  }
  // pictures in chats are held to the same limits as profile pictures
  const verdict = pictures.verdict(score, where === 'message' ? 'profile' : where);
  if (verdict === 'block') fail(422, PICTURE_REFUSED[where], { rule: 'No sexual content' });
  return verdict;
}

/** a report from the automatic checks, for a moderator to look at (one open one per thing) */
const KIND_LABEL = { gmessage: 'group message', group: 'group' };
function autoReport(kind, target, why) {
  if (db.get('SELECT 1 AS x FROM reports WHERE kind = ? AND target = ? AND reporter_id IS NULL AND resolved_at IS NULL', kind, String(target))) return false;
  db.run('INSERT INTO reports (reporter_id, kind, target, reason, created_at) VALUES (NULL, ?, ?, ?, ?)', kind, String(target), 'Automatic check: ' + why, now());
  for (const admin of db.all("SELECT id FROM users WHERE role = 'admin'")) {
    notify(admin.id, { kind: 'report', text: `The automatic check flagged a ${KIND_LABEL[kind] || kind} for a look`, href: '#/admin', symbol: 'flag', shape: 'pixelCircle' });
  }
  return true;
}

// ---- text: the language model's say (textmodel.js), after the word lists' ---------------------------

const TEXT_REFUSED = {
  severe_toxicity: ['bully', 'This reads as an attack on someone. Disagree or joke all you like, but not by putting people down.'],
  insult: ['bully', 'This reads as an insult aimed at someone. Disagree or joke all you like, but not by putting people down.'],
  threat: ['threat', 'This reads as a threat, or as wishing harm on someone.'],
  identity_attack: ['hate', 'This reads as attacking people for who they are: where they’re from, their religion, race, gender or sexuality.'],
  sexual_explicit: ['sexual', 'This reads as sexual. Budgie doesn’t allow sexual messages: everyone here is 13 or older, and many are teenagers.'],
};

/**
 * refuses text the model is sure is harmful; returns a reason when a moderator should look at it.
 * strict: what's doubtful is refused too (a nest's name and description, which can't be reported)
 */
async function checkText(texts, kind, { strict = false } = {}) {
  const judged = textmodel.judge(await textmodel.score(texts.filter(Boolean).join('\n\n')), kind);
  if (judged.verdict === 'block' || (strict && judged.verdict === 'review')) {
    const [rule, why] = TEXT_REFUSED[judged.label];
    fail(422, why + ' (An automatic check read it this way. If it got you wrong, try putting it differently.)', { rule: mod.RULES[rule] });
  }
  return judged.verdict === 'review' ? textmodel.reason(judged) : null;
}

const imageUrl = (id) => (id ? '/api/images/' + id : '');
// profile pictures and banners: a still (shown in feeds, and when motion is reduced) and, for a GIF, the moving one
const MEDIA = {
  photo: { still: 400 * 1024, gif: 2 * 1024 * 1024, maxSide: 1024 },
  banner: { still: 700 * 1024, gif: 4 * 1024 * 1024, maxSide: 2048 },
};
const BIO_MAX = 300;
// the fonts someone can pick for their name (the app has the font files, in fonts/)
const NAME_FONTS = ['rounded', 'hand', 'serif', 'pixel', 'mono', 'sign', 'script', 'comic'];
// the rest of what makes a profile someone's own; the app draws the flags and knows the names (js/ui.js)
const PRIDE_FLAGS = [
  'rainbow', 'philly', 'trans', 'bi', 'pan', 'lesbian', 'gay', 'nonbinary', 'ace', 'aro',
  'aroace', 'genderfluid', 'genderqueer', 'agender', 'demisexual', 'intersex', 'polysexual', 'omnisexual', 'demigirl', 'demiboy',
];
const INTERESTS = [
  'gaming', 'music', 'art', 'drawing', 'photography', 'books', 'writing', 'movies', 'anime', 'science', 'space', 'coding',
  'sports', 'fitness', 'cooking', 'baking', 'plants', 'animals', 'travel', 'nature', 'fashion', 'dance', 'theatre', 'languages',
];
const INTERESTS_MAX = 6;
// the colour styles Material 3 makes a scheme in, for someone's profile page
const PROFILE_SCHEMES = ['tonalSpot', 'vibrant', 'expressive', 'fidelity', 'content', 'rainbow', 'fruitSalad', 'neutral', 'monochrome'];
const PRONOUNS_RE = /^[\p{L}\p{M}][\p{L}\p{M} /'’.,&-]{0,23}$/u;

// ---- shaping rows for the app ------------------------------------------------------------------------

function publicUser(u) {
  const badges = badgesOf(u);
  return {
    name: u.name, color: u.color, shape: u.shape, icon: u.icon, photo: imageUrl(u.photo), photoGif: imageUrl(u.photo_gif),
    banner: imageUrl(u.banner), bannerGif: imageUrl(u.banner_gif), bio: u.bio, font: u.name_font || undefined,
    pronouns: u.pronouns || undefined, flag: u.pride_flag || undefined, interests: u.interests ? u.interests.split(',') : undefined,
    scheme: u.profile_scheme || undefined, sticker: u.sticker_shape || undefined, badges: badges.length ? badges : undefined,
    createdAt: u.created_at, admin: u.role === 'admin' || undefined, banned: u.banned_at ? true : undefined, rev: u.rev,
  };
}
function meOut(u) {
  return Object.assign(publicUser(u), { role: u.role, joinedAt: u.created_at, calls: u.calls === 'off' ? 'off' : 'on' });
}

function nookOut(row) {
  const data = JSON.parse(row.data);
  const creator = row.created_by ? db.get('SELECT name FROM users WHERE id = ?', row.created_by) : null;
  const team = teamOf(row.id);
  return Object.assign(data, {
    id: row.id, createdAt: row.created_at || undefined, owner: creator ? creator.name : undefined, mods: creator ? [creator.name] : [],
    team: team.length ? team : undefined, starter: STARTERS.has(row.id) || undefined, rev: row.rev,
  });
}

function postAggregates(id) {
  const score = db.get('SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE target = ?', id).s;
  const sparks = {};
  for (const r of db.all('SELECT kind, COUNT(*) AS n FROM sparks WHERE post_id = ? GROUP BY kind', id)) sparks[r.kind] = r.n;
  const polls = {};
  for (const r of db.all('SELECT option, COUNT(*) AS n FROM poll_votes WHERE post_id = ? GROUP BY option', id)) polls[r.option] = r.n;
  return { score, sparks, polls };
}

function postOut(row) {
  if (row.removed_at) return { id: row.id, n: row.nook, removed: true, rev: row.rev };
  const a = postAggregates(row.id);
  const out = {
    id: row.id, n: row.nook, author: row.author_name || '[deleted]', createdAt: row.created_at, title: row.title, body: row.body,
    type: row.type, flair: row.flair || null, spoiler: !!row.spoiler, score: a.score, sparks: a.sparks, rev: row.rev,
  };
  if (row.edited_at) out.edited = row.edited_at;
  if (row.pinned_at) out.pinned = Number(row.pinned_at);
  if (row.link) out.link = JSON.parse(row.link);
  if (row.image) out.image = imageUrl(row.image);
  if (row.poll) out.poll = { options: JSON.parse(row.poll).map((option, i) => [option, a.polls[i] || 0]) };
  return out;
}

function commentOut(row) {
  const base = { id: row.id, postId: row.post_id, parentId: row.parent_id || null, createdAt: row.created_at, rev: row.rev };
  if (row.removed_at) return Object.assign(base, { removed: true, author: '[deleted]', body: '' });
  const score = db.get('SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE target = ?', row.id).s;
  return Object.assign(base, { author: row.author_name || '[deleted]', body: row.body, score, edited: row.edited_at || undefined });
}

const POST_SELECT = 'SELECT p.*, u.name AS author_name FROM posts p LEFT JOIN users u ON u.id = p.author_id';
const COMMENT_SELECT = 'SELECT c.*, u.name AS author_name FROM comments c LEFT JOIN users u ON u.id = c.author_id';

function friendsOf(userId) {
  const rows = db.all(
    `SELECT f.a, f.b, f.status, f.created_at, ua.name AS a_name, ub.name AS b_name FROM friends f
     JOIN users ua ON ua.id = f.a JOIN users ub ON ub.id = f.b WHERE f.a = ? OR f.b = ?`,
    userId,
    userId
  );
  return rows.map((r) => {
    const outgoing = r.a === userId;
    return { name: outgoing ? r.b_name : r.a_name, status: r.status === 'friends' ? 'friends' : outgoing ? 'outgoing' : 'incoming', since: r.created_at };
  });
}
function friendship(aId, bId) {
  return db.get('SELECT * FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', aId, bId, bId, aId) || null;
}
/** whether userId has blocked otherId */
const hasBlocked = (userId, otherId) => !!db.get('SELECT 1 AS x FROM blocks WHERE user_id = ? AND blocked_id = ?', userId, otherId);
/** the people someone has blocked, newest first */
const blockedNames = (userId) => db.all('SELECT u.name FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.user_id = ? ORDER BY b.created_at DESC', userId).map((r) => r.name);

// a picture or GIF in a chat: one sent from a device is kept here (and checked like any picture); one found with
// KLIPY's GIF search is kept as KLIPY's link, as KLIPY asks, and loaded from KLIPY by whoever sees it
const CHAT_PICTURE = { still: 3 * 1024 * 1024, gif: 4 * 1024 * 1024, maxSide: 1600 };
const KLIPY_MEDIA_RE = /^https:\/\/static\d*\.klipy\.com\/[\w./%-]+\.(?:gif|webp|jpe?g|png|mp4|webm)(?:\?[\w=&.%-]*)?$/;
const dims = (w, h) => {
  const width = Math.round(Number(w)) || 0, height = Math.round(Number(h)) || 0;
  return width > 0 && height > 0 && width <= 8000 && height <= 8000 ? { width, height } : {};
};
function mediaOut(json) {
  if (!json) return undefined;
  const m = JSON.parse(json);
  if (m.type === 'image') return { type: 'image', url: imageUrl(m.id), width: m.width, height: m.height, gif: m.gif };
  if (m.type === 'klipy') return { type: 'klipy', url: m.url, still: m.still, width: m.width, height: m.height, title: m.title };
  return undefined;
}
/** a picture leaving with its message */
function dropMedia(json) {
  if (!json) return;
  const m = JSON.parse(json);
  if (m.type === 'image' && m.id) db.run('DELETE FROM images WHERE id = ?', m.id);
}
/** reads what's attached to a message being sent: { media (to keep), picture (to save), review } or null */
async function chatMedia(user, body) {
  if (body.gif) {
    if (!db.meta('klipy-key')) fail(400, 'GIF search is off.');
    const url = text(body.gif.url, 600);
    const still = body.gif.still ? text(body.gif.still, 600) : '';
    if (!KLIPY_MEDIA_RE.test(url) || (still && !KLIPY_MEDIA_RE.test(still))) fail(400, 'That GIF can’t be sent.');
    return { media: Object.assign({ type: 'klipy', url, still: still || undefined, title: text(body.gif.title, 120) || undefined }, dims(body.gif.width, body.gif.height)) };
  }
  if (!body.image) return null;
  limit('chat-picture:' + user.id, 40, HOUR, 'That’s a lot of pictures. Try again in a little while.');
  const gif = /^data:image\/gif/.test(String(body.image));
  const picture = readImage(body.image, gif ? CHAT_PICTURE.gif : CHAT_PICTURE.still, { gif: true, maxSide: CHAT_PICTURE.maxSide });
  // checked as strictly as profile pictures: many people on Budgie are teenagers
  const review = await checkPicture(picture, 'message');
  return { picture, review, media: Object.assign({ type: 'image', gif: picture.mime === 'image/gif' || undefined }, dims(body.width, body.height)) };
}
/** keeps a message's picture, if it has one, and returns its media as JSON */
function keepMedia(attached, ownerId) {
  if (!attached) return '';
  if (attached.picture) attached.media.id = saveImage(attached.picture, ownerId);
  return JSON.stringify(attached.media);
}

function messageOut(row, meId) {
  return { id: row.id, from: row.from_name, to: row.to_name, kind: row.kind || undefined, body: row.body, media: mediaOut(row.media), createdAt: row.created_at, read: !!row.read_at, mine: row.from_id === meId };
}
const MESSAGE_SELECT = `SELECT m.*, uf.name AS from_name, ut.name AS to_name FROM messages m
  JOIN users uf ON uf.id = m.from_id JOIN users ut ON ut.id = m.to_id`;

function conversations(meId) {
  const rows = db.all(
    `${MESSAGE_SELECT} WHERE m.id IN (
       SELECT MAX(id) FROM messages WHERE from_id = ? OR to_id = ?
       GROUP BY CASE WHEN from_id = ? THEN to_id ELSE from_id END)
     ORDER BY m.id DESC`,
    meId,
    meId,
    meId
  );
  return rows.map((r) => {
    const other = r.from_id === meId ? r.to_name : r.from_name;
    const otherId = r.from_id === meId ? r.to_id : r.from_id;
    const unread = db.get('SELECT COUNT(*) AS n FROM messages WHERE from_id = ? AND to_id = ? AND read_at IS NULL', otherId, meId).n;
    return { with: other, last: messageOut(r, meId), unread };
  });
}

function noteOut(r) {
  return { id: 'n' + r.id, kind: r.kind, text: r.text, href: r.href, symbol: r.symbol, shape: r.shape, createdAt: r.created_at, read: !!r.read_at };
}
function notify(userId, note) {
  db.run(
    'INSERT INTO notes (user_id, kind, text, href, symbol, shape, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    userId, note.kind, note.text, note.href || '', note.symbol || 'notifications', note.shape || 'cookie9', now()
  );
  // a long inbox keeps its newest 200
  db.run('DELETE FROM notes WHERE user_id = ? AND id NOT IN (SELECT id FROM notes WHERE user_id = ? ORDER BY id DESC LIMIT 200)', userId, userId);
}

// the last change to the Terms or Privacy Policy that matters to people already here: they're told once
// (the robot check on sign-up since 0.5.1 only concerns new accounts, so it isn't one)
const NOTICE = {
  version: '0.9.5, 2026-10-28',
  text: 'Budgie 0.9.5 is the last early-access version. Nest owners can now give people roles (moderators who can pin and remove posts and ban people from the nest), and write their nest’s rules. You can send pictures and GIFs in chats, find GIFs with KLIPY, and share your screen on calls. The Terms and Privacy Policy say how: pictures in chats are checked like profile pictures, and GIF searches go to KLIPY. Read the details in Settings → Privacy and legal.',
};
if (db.meta('terms-told') !== NOTICE.version) {
  for (const u of db.all('SELECT id FROM users')) notify(u.id, { kind: 'system', text: NOTICE.text, symbol: 'gavel', shape: 'pixelCircle' });
  db.meta('terms-told', NOTICE.version);
}

// ---- badges Budgie gives -------------------------------------------------------------------------------
// Developer (`nook dev`), Tester (a developer gives it, in the app or with `nook tester`), and Early Bird,
// which every account made before Budgie 1.0 keeps for good: the server notes when it first runs as 1.0
const GIVEN_BADGES = ['dev', 'tester'];
if (Number(VERSION.split('.')[0]) >= 1 && !db.meta('v1-since')) db.meta('v1-since', String(now()));
function badgesOf(u) {
  const list = String(u.badges || '').split(',').filter((b) => GIVEN_BADGES.includes(b));
  if (u.created_at < (Number(db.meta('v1-since')) || Infinity)) list.push('early');
  return list;
}
const EARLY_NOTE = { text: 'You’re an Early Bird: you joined Budgie before version 1.0, so your profile wears the Early Bird badge for good. Thanks for being here early!', symbol: 'egg', shape: 'sunny' };
const BADGE_NOTES = {
  dev: () => ({ text: 'You’re one of Budgie’s developers: your profile wears the Developer badge, and you can give people the Tester badge from their profile.', symbol: 'code', shape: 'pixelCircle' }),
  tester: (by) => ({ text: `${by ? `u/${by} gave you` : 'You’ve got'} the Tester badge: it’s on your profile now. Thanks for helping test Budgie!`, symbol: 'science', shape: 'softBurst' }),
};
/** gives or takes away a badge (whoever gets one is told); false when there was nothing to change */
function setBadge(u, badge, on, by) {
  if (!GIVEN_BADGES.includes(badge)) fail(400, 'There’s no badge like that to give.');
  const list = String(u.badges || '').split(',').filter(Boolean);
  if (list.includes(badge) === !!on) return false;
  db.run('UPDATE users SET badges = ?, rev = ? WHERE id = ?', (on ? [...list, badge] : list.filter((b) => b !== badge)).join(','), db.bump(), u.id);
  if (on) notify(u.id, Object.assign({ kind: 'badge', href: '#/u/' + u.name }, BADGE_NOTES[badge](by)));
  return true;
}
// everyone already here is told once that they're an Early Bird
if (!db.meta('v1-since') && !db.meta('early-told')) {
  for (const u of db.all('SELECT id, name FROM users')) notify(u.id, Object.assign({ kind: 'badge', href: '#/u/' + u.name }, EARLY_NOTE));
  db.meta('early-told', '1');
}
// u/teofil, the owner's account, starts out a developer: once, and only while it's an admin, so it's surely theirs
if (!db.meta('owner-dev')) {
  const owner = db.get("SELECT * FROM users WHERE name = 'teofil' AND role = 'admin'");
  if (owner) {
    setBadge(owner, 'dev', true);
    db.meta('owner-dev', '1');
  }
}

function members() {
  const out = {};
  for (const r of db.all('SELECT nook, COUNT(*) AS n FROM joins GROUP BY nook')) out[r.nook] = r.n;
  return out;
}

const nookExists = (id) => STARTERS.has(id) || !!db.get('SELECT 1 AS x FROM nooks WHERE id = ?', id);
function nookData(id) {
  const row = db.get('SELECT data FROM nooks WHERE id = ?', id);
  return row ? JSON.parse(row.data) : STARTERS.get(id) || null;
}

/** what someone posted lately, for the spam rules */
function history(userId) {
  return {
    posts: db.all('SELECT title, created_at AS createdAt FROM posts WHERE author_id = ? AND removed_at IS NULL AND created_at > ?', userId, now() - DAY),
    comments: db.all('SELECT post_id AS postId, body, created_at AS createdAt FROM comments WHERE author_id = ? AND removed_at IS NULL AND created_at > ?', userId, now() - HOUR),
  };
}

/** the moderation rules, as the server enforces them: blocks are final */
function vet(texts, options, { strongNames = false, personal = false } = {}) {
  const verdict = mod.check(texts, options);
  if (verdict.block) fail(422, verdict.block.why, { rule: verdict.block.rule });
  if (strongNames && verdict.strong) fail(422, 'Keep swearing out of names.', { rule: 'Keep names clean' });
  if (personal) {
    const info = verdict.warn.find((w) => w.rule === mod.RULES.personal);
    if (info) fail(422, info.why, { rule: info.rule });
  }
  return verdict;
}

// ---- sessions ---------------------------------------------------------------------------------------

function newSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  db.run('INSERT INTO sessions (token, user_id, created_at, seen_at) VALUES (?, ?, ?, ?)', sha256(token), userId, now(), now());
  return token;
}

function authenticate(req) {
  const m = /^Bearer ([A-Za-z0-9_-]{20,100})$/.exec(req.headers.authorization || '');
  if (!m) return null;
  const hash = sha256(m[1]);
  const session = db.get('SELECT * FROM sessions WHERE token = ?', hash);
  if (!session) return null;
  if (session.seen_at < now() - SESSION_IDLE) {
    db.run('DELETE FROM sessions WHERE token = ?', hash);
    return null;
  }
  const user = db.get('SELECT * FROM users WHERE id = ?', session.user_id);
  if (!user) return null;
  if (user.banned_at) fail(403, 'This account has been banned' + (user.ban_reason ? ': ' + user.ban_reason : '.'), { banned: true });
  if (session.seen_at < now() - 5 * MINUTE) db.run('UPDATE sessions SET seen_at = ? WHERE token = ?', now(), hash);
  return { user, session: hash };
}

// ---- the routes -------------------------------------------------------------------------------------

const routes = [];
function route(method, pattern, handler, { auth = true, admin = false, body = 64 * 1024, stream = false } = {}) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, key) => (keys.push(key), '([^/]+)')) + '$');
  routes.push({ method, re, keys, handler, auth, admin, body, stream });
}

// anyone can join, unless the owner turned invite codes back on with `nook signups invite`
const signupMode = () => (db.meta('signup') === 'invite' ? 'invite' : 'open');

// ---- the "I'm not a robot" check when someone signs up: Cloudflare Turnstile, once the owner sets it up ---
// with `nook captcha <site key> <secret key>`. NOOK_CAPTCHA=test asks no one and takes the answer "pass",
// for the tests.

const CAPTCHA_MODE = process.env.NOOK_CAPTCHA || 'on';
const CAPTCHA_VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const captchaKey = () => db.meta('turnstile-site') || '';
// the check only counts when it was passed on Budgie's own site
const SITE_HOSTS = new Set(CONFIG.origins.map((o) => o.replace(/^https?:\/\//, '').replace(/:.*$/, '')));

/** asks Cloudflare about the answer the sign-up form got from Turnstile (each answer works once, for 5 minutes) */
async function checkCaptcha(answer) {
  if (!captchaKey()) return;
  // the site key comes along, for a sign-up form opened before the check was turned on
  if (typeof answer !== 'string' || !answer || answer.length > 2048) fail(400, 'Wait for the robot check to say “Success!” (tick it if it asks).', { field: 'captcha', captcha: captchaKey() });
  if (CAPTCHA_MODE === 'test') {
    if (answer !== 'pass') fail(400, 'The robot check didn’t work, or it ran out of time. Try it again.', { field: 'captcha' });
    return;
  }
  let result;
  try {
    const res = await fetch(CAPTCHA_VERIFY, {
      method: 'POST',
      body: new URLSearchParams({ secret: db.meta('turnstile-secret') || '', response: answer }),
      signal: AbortSignal.timeout(10000),
    });
    result = await res.json();
  } catch (error) {
    console.error('Turnstile check failed:', error.message);
    fail(503, 'The robot check isn’t answering right now, so new accounts can’t be made. Try again in a minute.');
  }
  if (!result.success) {
    // a refused secret key is the owner's to fix, so the logs say so, and trying again won't help
    if ((result['error-codes'] || []).some((code) => /secret/.test(code))) {
      console.error('Turnstile refused the secret key. Set it again with: nook captcha <site key> <secret key>');
      fail(503, 'The robot check isn’t set up right on Budgie’s side, so new accounts can’t be made just now. Try again later.');
    }
    fail(400, 'The robot check didn’t work, or it ran out of time. Try it again.', { field: 'captcha' });
  }
  if (result.hostname && !SITE_HOSTS.has(result.hostname)) fail(400, 'That robot check was passed on another website. Try it again here.', { field: 'captcha' });
}

route('GET', '/api/health', () => ({ ok: true, version: VERSION, signup: signupMode(), captcha: captchaKey() || undefined }), { auth: false });

// accounts ------------------------------------------------------------------------------------------

route('POST', '/api/signup', async ({ body, ip }) => {
  limit('signup:' + ip, 10, HOUR);
  // with sign-up open to everyone, a cap for the whole site too: behind the tunnel many visitors can share one address
  limit('signup-all', 60, HOUR, 'Lots of people are joining right now. Try again in a little while.');
  const name = text(body.name, 40);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!body.age || !body.terms) fail(400, 'Please confirm your age and agree to the Terms of Use and Privacy Policy.');
  let invite = null;
  if (signupMode() === 'invite') {
    invite = db.get('SELECT * FROM invites WHERE code = ?', inviteHash(body.invite));
    if (!invite) {
      limit('bad-invite', 100, HOUR, 'Too many wrong invite codes. Try again later.');
      fail(400, 'Budgie is invite-only right now. That invite code doesn’t work. Check it and try again.', { field: 'invite' });
    }
    if (invite.used_by || invite.used_at) fail(400, 'That invite code has already been used.', { field: 'invite' });
  }
  if (!NAME_RE.test(name)) fail(400, 'Usernames are 3–20 letters, numbers or underscores.', { field: 'name' });
  vet([name.replace(/_/g, ' ')], { kind: 'profile' }, { strongNames: true });
  if (db.get('SELECT 1 AS x FROM users WHERE name = ?', name)) fail(409, `u/${name} is taken. Try another name.`, { field: 'name' });
  if (password.length < 8) fail(400, 'Use at least 8 characters for your password.', { field: 'password' });
  if (password.length > 200) fail(400, 'That password is too long.', { field: 'password' });
  if (password.toLowerCase() === name.toLowerCase()) fail(400, 'Your password can’t be your username.', { field: 'password' });
  // last of all, so a taken name or a short password doesn't use up the answer
  await checkCaptcha(body.captcha);

  const pass = await hashPassword(password);
  const recovery = recoveryCode();
  const t = now();
  const user = db.tx(() => {
    // checked again inside the transaction, so two people can't take one code or one name
    if (invite && db.get('SELECT used_by FROM invites WHERE code = ?', invite.code).used_by) fail(400, 'That invite code has already been used.', { field: 'invite' });
    if (db.get('SELECT 1 AS x FROM users WHERE name = ?', name)) fail(409, `u/${name} is taken. Try another name.`, { field: 'name' });
    const color = COLORS[crypto.randomInt(COLORS.length)];
    const shape = SHAPES[crypto.randomInt(SHAPES.length)];
    const { lastInsertRowid } = db.run(
      'INSERT INTO users (name, pass, recovery, color, shape, terms, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      name, pass, recoveryHash(recovery), color, shape, TERMS, t, db.bump()
    );
    const id = Number(lastInsertRowid);
    if (invite) db.run('UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?', id, t, invite.code);
    for (const nook of DEFAULT_JOINS) db.run('INSERT OR IGNORE INTO joins (user_id, nook, created_at) VALUES (?, ?, ?)', id, nook, t);
    return db.get('SELECT * FROM users WHERE id = ?', id);
  });
  if (badgesOf(user).includes('early')) notify(user.id, Object.assign({ kind: 'badge', href: '#/u/' + user.name }, EARLY_NOTE));
  return { token: newSession(user.id), recovery, me: meOut(user) };
}, { auth: false });

route('POST', '/api/login', async ({ body, ip }) => {
  const name = text(body.name, 40);
  limit('login-ip:' + ip, 30, 15 * MINUTE);
  limit('login-name:' + name.toLowerCase(), 10, 15 * MINUTE);
  const user = name ? db.get('SELECT * FROM users WHERE name = ?', name) : null;
  // the same work and the same answer whether or not the name exists
  const ok = await checkPassword(body.password || '', user ? user.pass : 's1$AAAAAAAAAAAAAAAAAAAAAA==$' + 'A'.repeat(86) + '==');
  if (!user || !ok) fail(401, 'Wrong username or password.');
  if (user.banned_at) fail(403, 'This account has been banned' + (user.ban_reason ? ': ' + user.ban_reason : '.'), { banned: true });
  return { token: newSession(user.id), me: meOut(user) };
}, { auth: false });

route('POST', '/api/recover', async ({ body, ip }) => {
  const name = text(body.name, 40);
  limit('recover-ip:' + ip, 10, HOUR);
  limit('recover-name:' + name.toLowerCase(), 5, HOUR);
  const user = name ? db.get('SELECT * FROM users WHERE name = ?', name) : null;
  const given = recoveryHash(body.recovery || '');
  if (!user || !crypto.timingSafeEqual(Buffer.from(user.recovery), Buffer.from(given))) fail(401, 'That username and recovery code don’t match.');
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 200) fail(400, 'Use at least 8 characters for your new password.', { field: 'password' });
  const recovery = recoveryCode();
  db.run('UPDATE users SET pass = ?, recovery = ? WHERE id = ?', await hashPassword(password), recoveryHash(recovery), user.id);
  db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
  if (user.banned_at) fail(403, 'This account has been banned' + (user.ban_reason ? ': ' + user.ban_reason : '.'), { banned: true });
  return { token: newSession(user.id), recovery, me: meOut(user) };
}, { auth: false });

route('POST', '/api/logout', ({ session }) => {
  db.run('DELETE FROM sessions WHERE token = ?', session);
  return { ok: true };
});

route('POST', '/api/account/password', async ({ user, session, body }) => {
  limit('password:' + user.id, 10, HOUR);
  if (!(await checkPassword(body.current || '', user.pass))) fail(401, 'Your current password isn’t right.', { field: 'current' });
  const password = typeof body.password === 'string' ? body.password : '';
  if (password.length < 8 || password.length > 200) fail(400, 'Use at least 8 characters for your new password.', { field: 'password' });
  db.run('UPDATE users SET pass = ? WHERE id = ?', await hashPassword(password), user.id);
  // everywhere else is signed out; this device stays in
  db.run('DELETE FROM sessions WHERE user_id = ? AND token != ?', user.id, session);
  return { ok: true };
});

route('POST', '/api/account/recovery', async ({ user, body }) => {
  if (!(await checkPassword(body.password || '', user.pass))) fail(401, 'That password isn’t right.', { field: 'password' });
  const recovery = recoveryCode();
  db.run('UPDATE users SET recovery = ? WHERE id = ?', recoveryHash(recovery), user.id);
  return { recovery };
});

route('GET', '/api/account/export', ({ user }) => {
  const id = user.id;
  return {
    exportedAt: new Date().toISOString(),
    note: 'Everything Budgie’s server holds about your account. Images are linked; open each link to download it.',
    profile: Object.assign(meOut(user), { termsAccepted: user.terms }),
    settings: JSON.parse(user.prefs || '{}'),
    nooksJoined: db.all('SELECT nook, created_at AS joinedAt FROM joins WHERE user_id = ?', id),
    nooksCreated: db.all('SELECT * FROM nooks WHERE created_by = ?', id).map(nookOut),
    posts: db.all(`${POST_SELECT} WHERE p.author_id = ?`, id).map(postOut),
    comments: db.all(`${COMMENT_SELECT} WHERE c.author_id = ?`, id).map(commentOut),
    votes: db.all('SELECT target, value FROM votes WHERE user_id = ?', id),
    sparks: db.all('SELECT post_id AS post, kind FROM sparks WHERE user_id = ?', id),
    pollVotes: db.all('SELECT post_id AS post, option FROM poll_votes WHERE user_id = ?', id),
    friends: friendsOf(id),
    messages: db.all(`${MESSAGE_SELECT} WHERE m.from_id = ? OR m.to_id = ? ORDER BY m.id`, id, id).map((r) => messageOut(r, id)),
    groups: db.all('SELECT g.* FROM chat_groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ?', id).map((g) => ({ name: g.name, members: groupOut(g, id).members, createdAt: g.created_at })),
    groupMessages: db.all(`${GMESSAGE_SELECT} WHERE m.from_id = ? ORDER BY m.id`, id).map((r) => gmessageOut(r, id)),
    notifications: db.all('SELECT * FROM notes WHERE user_id = ? ORDER BY id', id).map(noteOut),
    reportsMade: db.all('SELECT kind, target, reason, created_at AS createdAt, resolution FROM reports WHERE reporter_id = ?', id),
    nestRoles: db.all('SELECT nook, role, title, perms, created_at AS since FROM nest_team WHERE user_id = ?', id),
    nestBans: db.all('SELECT nook, reason, created_at AS since, until FROM nest_bans WHERE user_id = ?', id),
    blocked: blockedNames(id),
    images: db.all('SELECT id, mime, created_at AS createdAt FROM images WHERE owner_id = ?', id).map((r) => ({ url: imageUrl(r.id), type: r.mime, createdAt: r.createdAt })),
  };
});

/** wipes an account: its posts and comments are emptied and marked removed, everything else goes */
function eraseUser(id) {
  const t = now();
  db.tx(() => {
    for (const p of db.all('SELECT id FROM posts WHERE author_id = ? AND removed_at IS NULL', id)) {
      db.run("UPDATE posts SET title = '', body = '', link = NULL, image = NULL, poll = NULL, removed_at = ?, removed_reason = 'deleted', author_id = NULL, rev = ? WHERE id = ?", t, db.bump(), p.id);
    }
    for (const c of db.all('SELECT id FROM comments WHERE author_id = ? AND removed_at IS NULL', id)) {
      db.run("UPDATE comments SET body = '', removed_at = ?, removed_reason = 'deleted', author_id = NULL, rev = ? WHERE id = ?", t, db.bump(), c.id);
    }
    // what they voted on changes score, so it's stamped for everyone to see
    const touched = new Set([
      ...db.all('SELECT target FROM votes WHERE user_id = ?', id).map((r) => r.target),
      ...db.all('SELECT post_id AS target FROM sparks WHERE user_id = ?', id).map((r) => r.target),
      ...db.all('SELECT post_id AS target FROM poll_votes WHERE user_id = ?', id).map((r) => r.target),
    ]);
    for (const target of touched) {
      db.run('UPDATE posts SET rev = ? WHERE id = ?', db.bump(), target);
      db.run('UPDATE comments SET rev = ? WHERE id = ?', db.bump(), target);
    }
    db.run('UPDATE posts SET author_id = NULL WHERE author_id = ?', id);
    db.run('UPDATE comments SET author_id = NULL WHERE author_id = ?', id);
    db.run('UPDATE nooks SET created_by = NULL, rev = ? WHERE created_by = ?', db.bump(), id);
    for (const t of db.all('SELECT nook FROM nest_team WHERE user_id = ?', id)) touchNest(t.nook);
    db.run('UPDATE reports SET reporter_id = NULL WHERE reporter_id = ?', id);
    // their group messages go; each group they were in carries on without them (or goes, if they were the last)
    for (const m of db.all("SELECT media FROM messages WHERE to_id = ? AND media != ''", id)) dropMedia(m.media);
    db.run('DELETE FROM group_messages WHERE from_id = ?', id);
    for (const m of db.all('SELECT group_id FROM group_members WHERE user_id = ?', id)) dropMember(m.group_id, id);
    db.run('DELETE FROM users WHERE id = ?', id); // sessions, joins, votes, sparks, poll votes, friends, messages, notes and images go with it
  });
  disconnect(id);
}

route('POST', '/api/account/delete', async ({ user, body }) => {
  if (!(await checkPassword(body.password || '', user.pass))) fail(401, 'That password isn’t right.', { field: 'password' });
  eraseUser(user.id);
  return { ok: true };
});

// everything the app needs to start ------------------------------------------------------------------

route('GET', '/api/bootstrap', ({ user }) => {
  const id = user.id;
  const posts = db.all(`${POST_SELECT} WHERE p.removed_at IS NULL ORDER BY p.created_at DESC LIMIT 1000`);
  const ids = new Set(posts.map((p) => p.id));
  const comments = db.all(`${COMMENT_SELECT} ORDER BY c.created_at`).filter((c) => ids.has(c.post_id));
  const votes = {};
  for (const r of db.all('SELECT target, value FROM votes WHERE user_id = ?', id)) votes[r.target] = r.value;
  const sparks = {};
  for (const r of db.all('SELECT post_id, kind FROM sparks WHERE user_id = ?', id)) (sparks[r.post_id] = sparks[r.post_id] || {})[r.kind] = true;
  const polls = {};
  for (const r of db.all('SELECT post_id, option FROM poll_votes WHERE user_id = ?', id)) polls[r.post_id] = r.option;
  return {
    version: VERSION,
    rev: db.rev(),
    note: (db.get('SELECT COALESCE(MAX(id), 0) AS n FROM notes WHERE user_id = ?', id) || { n: 0 }).n,
    msg: (db.get('SELECT COALESCE(MAX(id), 0) AS n FROM messages WHERE from_id = ? OR to_id = ?', id, id) || { n: 0 }).n,
    me: meOut(user),
    prefs: JSON.parse(user.prefs || '{}'),
    users: db.all('SELECT * FROM users').map(publicUser),
    nooks: db.all('SELECT * FROM nooks').map(nookOut),
    members: members(),
    joined: db.all('SELECT nook FROM joins WHERE user_id = ? ORDER BY created_at DESC', id).map((r) => r.nook),
    posts: posts.map(postOut),
    comments: comments.map(commentOut),
    mine: { votes, sparks, polls },
    notes: db.all('SELECT * FROM notes WHERE user_id = ? ORDER BY id DESC LIMIT 100', id).map(noteOut),
    friends: friendsOf(id),
    conversations: conversations(id),
    groups: myGroups(id),
    gmsg: db.get('SELECT COALESCE(MAX(m.id), 0) AS n FROM group_messages m JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ?', id).n,
    ringing: [...calls.values()].filter((c) => c.ringing.has(id)).map(callOut),
    // a call this person is still in (the page was reloaded mid-call): the app offers to go back to it
    call: callOf(id) ? callOut(callOf(id)) : undefined,
    // nests they can't post in for now
    bannedFrom: db.all('SELECT nook, reason, until FROM nest_bans WHERE user_id = ? AND (until IS NULL OR until > ?)', id, now()).map((b) => ({ nook: b.nook, reason: b.reason, until: b.until || undefined })),
    // the people they've blocked
    blocked: blockedNames(id),
    // the KLIPY key for GIF search, once the owner has set one (KLIPY asks for searches to come from the app itself)
    gifs: db.meta('klipy-key') || undefined,
  };
});

// what changed since the app last looked
route('GET', '/api/updates', ({ user, query }) => {
  const id = user.id;
  const since = Math.max(0, Number(query.rev) || 0);
  const noteSince = Math.max(0, Number(query.note) || 0);
  const msgSince = Math.max(0, Number(query.msg) || 0);
  const gmsgSince = Math.max(0, Number(query.gmsg) || 0);
  const posts = db.all(`${POST_SELECT} WHERE p.rev > ? ORDER BY p.rev LIMIT 500`, since);
  const comments = db.all(`${COMMENT_SELECT} WHERE c.rev > ? ORDER BY c.rev LIMIT 1000`, since);
  const messages = db.all(`${MESSAGE_SELECT} WHERE m.id > ? AND (m.from_id = ? OR m.to_id = ?) ORDER BY m.id LIMIT 200`, msgSince, id, id);
  const notes = db.all('SELECT * FROM notes WHERE user_id = ? AND id > ? ORDER BY id LIMIT 100', id, noteSince);
  const gmessages = db.all(`${GMESSAGE_SELECT} JOIN group_members gm ON gm.group_id = m.group_id AND gm.user_id = ? WHERE m.id > ? AND m.id > gm.since_id ORDER BY m.id LIMIT 300`, id, gmsgSince);
  return {
    rev: db.rev(),
    note: notes.length ? notes[notes.length - 1].id : noteSince,
    msg: messages.length ? messages[messages.length - 1].id : msgSince,
    gmsg: gmessages.length ? gmessages[gmessages.length - 1].id : gmsgSince,
    posts: posts.map(postOut),
    comments: comments.map(commentOut),
    users: db.all('SELECT * FROM users WHERE rev > ?', since).map(publicUser),
    nooks: db.all('SELECT * FROM nooks WHERE rev > ?', since).map(nookOut),
    members: members(),
    notes: notes.map(noteOut),
    messages: messages.map((r) => messageOut(r, id)),
    friends: friendsOf(id),
    conversations: messages.length ? conversations(id) : undefined,
    // the newest of your messages each friend has read, for "Seen" in chats
    seen: Object.fromEntries(
      db.all('SELECT u.name, MAX(m.id) AS id FROM messages m JOIN users u ON u.id = m.to_id WHERE m.from_id = ? AND m.read_at IS NOT NULL GROUP BY m.to_id', id).map((r) => [r.name, r.id])
    ),
    me: user.rev > since ? meOut(user) : undefined,
    // groups: the ones that changed, the ids of all of them (so one you've left goes), and what was said
    groups: myGroups(id, since),
    groupIds: db.all('SELECT group_id FROM group_members WHERE user_id = ?', id).map((r) => r.group_id),
    gmessages: gmessages.map((r) => gmessageOut(r, id)),
    // calls ringing for you, for a device that couldn't keep its event stream open
    ringing: [...calls.values()].filter((c) => c.ringing.has(id)).map(callOut),
    blocked: blockedNames(id),
  };
});

// posts ---------------------------------------------------------------------------------------------------

route('POST', '/api/posts', async ({ user, body }) => {
  limit('post:' + user.id, 20, HOUR, 'That’s a lot of posts. Take a break and try again later.');
  const n = text(body.n, 30);
  const nook = nookData(n);
  if (!nook) fail(404, 'That nest doesn’t exist.');
  notBanned(user, n);
  const type = ['text', 'image', 'link', 'poll'].includes(body.type) ? body.type : 'text';
  const title = text(body.title, 300);
  const postBody = text(body.body, 10000);
  if (title.length < 3) fail(400, 'Give your post a title (at least 3 characters).', { field: 'title' });
  const flair = body.flair && (nook.flairs || []).includes(body.flair) ? body.flair : null;

  let link = null;
  if (type === 'link') {
    try {
      const u = new URL(text(body.link && body.link.url, 2000));
      if (!/^https?:$/.test(u.protocol)) throw new Error('scheme');
      link = { url: u.href, domain: u.hostname.replace(/^www\./, ''), title };
    } catch (_) {
      fail(400, 'That link doesn’t look right. It should start with https://', { field: 'url' });
    }
  }
  let poll = null;
  if (type === 'poll') {
    poll = (Array.isArray(body.poll) ? body.poll : []).map((o) => text(o, 120)).filter(Boolean).slice(0, 6);
    if (poll.length < 2) fail(400, 'A poll needs at least two options.', { field: 'poll' });
  }
  vet([title, postBody, ...(poll || []), link && link.url], { kind: 'post', history: history(user.id) });
  const picture = type === 'image' ? readImage(body.image, 3 * 1024 * 1024) : null;
  const doubt = await checkText([title, postBody, ...(poll || [])], 'post');
  const review = picture ? await checkPicture(picture, 'post') : 'ok';

  const id = randomId('p', 8);
  const t = now();
  db.tx(() => {
    const image = picture ? saveImage(picture, user.id) : null;
    db.run(
      'INSERT INTO posts (id, nook, author_id, type, title, body, flair, link, image, poll, spoiler, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, n, user.id, type, title, postBody, flair, link ? JSON.stringify(link) : null, image, poll ? JSON.stringify(poll) : null, body.spoiler ? 1 : 0, t, db.bump()
    );
    // you upvote your own, as tradition demands
    db.run('INSERT INTO votes (user_id, target, value) VALUES (?, ?, 1)', user.id, id);
  });
  if (review === 'review') autoReport('post', id, 'this picture might be sexual. Please take a look.');
  else if (doubt) autoReport('post', id, doubt);
  return { post: postOut(db.get(`${POST_SELECT} WHERE p.id = ?`, id)) };
}, { body: 4.5 * 1024 * 1024 });

function ownPost(user, id) {
  const p = db.get('SELECT * FROM posts WHERE id = ?', id);
  if (!p || p.removed_at) fail(404, 'That post is gone.');
  if (p.author_id !== user.id && user.role !== 'admin') fail(403, 'That isn’t your post.');
  return p;
}

route('PATCH', '/api/posts/:id', async ({ user, params, body }) => {
  let p = ownPost(user, params.id);
  if (p.author_id !== user.id) fail(403, 'Only the person who wrote a post can edit it.');
  notBanned(user, p.nook);
  const title = body.title == null ? p.title : text(body.title, 300);
  const postBody = body.body == null ? p.body : text(body.body, 10000);
  if (title.length < 3) fail(400, 'Give your post a title (at least 3 characters).', { field: 'title' });
  vet([title, postBody], { kind: 'post', editing: true });
  const doubt = await checkText([title, postBody], 'post');
  p = ownPost(user, params.id); // it may have been taken down while the model read it
  db.run('UPDATE posts SET title = ?, body = ?, edited_at = ?, rev = ? WHERE id = ?', title, postBody, now(), db.bump(), p.id);
  if (doubt) autoReport('post', p.id, doubt);
  return { post: postOut(db.get(`${POST_SELECT} WHERE p.id = ?`, p.id)) };
});

function removePost(p, reason) {
  db.tx(() => {
    if (p.image) db.run('DELETE FROM images WHERE id = ?', p.image);
    db.run("UPDATE posts SET title = '', body = '', link = NULL, image = NULL, poll = NULL, pinned_at = '', removed_at = ?, removed_reason = ?, rev = ? WHERE id = ?", now(), reason, db.bump(), p.id);
  });
}

route('DELETE', '/api/posts/:id', ({ user, params }) => {
  const p = ownPost(user, params.id);
  if (p.author_id !== user.id) fail(403, 'Moderators remove posts from the moderation page, with a reason.');
  removePost(p, 'deleted');
  return { ok: true };
});

// comments ------------------------------------------------------------------------------------------------

route('POST', '/api/comments', async ({ user, body }) => {
  limit('comment:' + user.id, 60, HOUR, 'That’s a lot of comments. Take a break and try again later.');
  const commentBody = text(body.body, 5000);
  if (!commentBody) fail(400, 'Write something first.');
  const find = () => {
    const post = db.get(`${POST_SELECT} WHERE p.id = ?`, text(body.postId, 40));
    if (!post || post.removed_at) fail(404, 'That post is gone.');
    const parentId = body.parentId ? text(body.parentId, 40) : null;
    const parent = parentId ? db.get(`${COMMENT_SELECT} WHERE c.id = ? AND c.post_id = ?`, parentId, post.id) : null;
    if (parentId && !parent) fail(404, 'The comment you’re replying to is gone.');
    notBanned(user, post.nook);
    return { post, parentId, parent };
  };
  vet([commentBody], { kind: 'comment', postId: find().post.id, history: history(user.id) });
  const doubt = await checkText([commentBody], 'comment');
  // the post may have been taken down while the model read the comment
  const { post, parentId, parent } = find();

  const id = randomId('c', 8);
  db.tx(() => {
    db.run('INSERT INTO comments (id, post_id, parent_id, author_id, body, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?)', id, post.id, parentId, user.id, commentBody, now(), db.bump());
    db.run('INSERT INTO votes (user_id, target, value) VALUES (?, ?, 1)', user.id, id);
  });
  if (doubt) autoReport('comment', id, doubt);
  const href = `#/n/${post.nook}/p/${post.id}?c=${id}`;
  const short = post.title.length > 60 ? post.title.slice(0, 59) + '…' : post.title;
  if (parent && parent.author_id && parent.author_id !== user.id && !hasBlocked(parent.author_id, user.id)) {
    notify(parent.author_id, { kind: 'reply', text: `u/${user.name} replied to your comment`, href, symbol: 'reply', shape: 'cookie6' });
  }
  if (post.author_id && post.author_id !== user.id && (!parent || parent.author_id !== post.author_id) && !hasBlocked(post.author_id, user.id)) {
    notify(post.author_id, { kind: 'reply', text: `u/${user.name} commented on your post “${short}”`, href, symbol: 'chat', shape: 'clover4' });
  }
  return { comment: commentOut(db.get(`${COMMENT_SELECT} WHERE c.id = ?`, id)) };
});

function ownComment(user, id) {
  const c = db.get('SELECT * FROM comments WHERE id = ?', id);
  if (!c || c.removed_at) fail(404, 'That comment is gone.');
  if (c.author_id !== user.id) fail(403, 'That isn’t your comment.');
  return c;
}

route('PATCH', '/api/comments/:id', async ({ user, params, body }) => {
  let c = ownComment(user, params.id);
  notBanned(user, db.get('SELECT nook FROM posts WHERE id = ?', c.post_id).nook);
  const commentBody = text(body.body, 5000);
  if (!commentBody) fail(400, 'Write something first.');
  vet([commentBody], { kind: 'comment', postId: c.post_id, editing: true });
  const doubt = await checkText([commentBody], 'comment');
  c = ownComment(user, params.id);
  db.run('UPDATE comments SET body = ?, edited_at = ?, rev = ? WHERE id = ?', commentBody, now(), db.bump(), c.id);
  if (doubt) autoReport('comment', c.id, doubt);
  return { comment: commentOut(db.get(`${COMMENT_SELECT} WHERE c.id = ?`, c.id)) };
});

route('DELETE', '/api/comments/:id', ({ user, params }) => {
  const c = ownComment(user, params.id);
  db.run("UPDATE comments SET body = '', removed_at = ?, removed_reason = 'deleted', rev = ? WHERE id = ?", now(), db.bump(), c.id);
  return { ok: true };
});

// votes, sparks and polls ---------------------------------------------------------------------------------

route('POST', '/api/votes', ({ user, body }) => {
  limit('vote:' + user.id, 300, HOUR);
  const id = text(body.id, 40);
  const dir = [-1, 0, 1].includes(body.dir) ? body.dir : 0;
  const table = db.get('SELECT 1 AS x FROM posts WHERE id = ? AND removed_at IS NULL', id) ? 'posts' : db.get('SELECT 1 AS x FROM comments WHERE id = ? AND removed_at IS NULL', id) ? 'comments' : null;
  if (!table) fail(404, 'That’s gone.');
  db.tx(() => {
    if (dir) db.run('INSERT INTO votes (user_id, target, value) VALUES (?, ?, ?) ON CONFLICT(user_id, target) DO UPDATE SET value = excluded.value', user.id, id, dir);
    else db.run('DELETE FROM votes WHERE user_id = ? AND target = ?', user.id, id);
    db.run(`UPDATE ${table} SET rev = ? WHERE id = ?`, db.bump(), id);
  });
  return { score: db.get('SELECT COALESCE(SUM(value), 0) AS s FROM votes WHERE target = ?', id).s };
});

route('POST', '/api/sparks', ({ user, body }) => {
  limit('spark:' + user.id, 300, HOUR);
  const post = text(body.post, 40);
  if (!SPARK_KINDS.includes(body.kind)) fail(400, 'That’s not a Spark.');
  if (!db.get('SELECT 1 AS x FROM posts WHERE id = ? AND removed_at IS NULL', post)) fail(404, 'That post is gone.');
  db.tx(() => {
    if (body.on) db.run('INSERT OR IGNORE INTO sparks (user_id, post_id, kind) VALUES (?, ?, ?)', user.id, post, body.kind);
    else db.run('DELETE FROM sparks WHERE user_id = ? AND post_id = ? AND kind = ?', user.id, post, body.kind);
    db.run('UPDATE posts SET rev = ? WHERE id = ?', db.bump(), post);
  });
  return { sparks: postAggregates(post).sparks };
});

route('POST', '/api/polls', ({ user, body }) => {
  const p = db.get('SELECT * FROM posts WHERE id = ? AND removed_at IS NULL', text(body.post, 40));
  if (!p || !p.poll) fail(404, 'That poll is gone.');
  const option = Number(body.option);
  if (!Number.isInteger(option) || option < 0 || option >= JSON.parse(p.poll).length) fail(400, 'That’s not one of the options.');
  db.tx(() => {
    db.run('INSERT OR IGNORE INTO poll_votes (user_id, post_id, option) VALUES (?, ?, ?)', user.id, p.id, option);
    db.run('UPDATE posts SET rev = ? WHERE id = ?', db.bump(), p.id);
  });
  return { post: postOut(db.get(`${POST_SELECT} WHERE p.id = ?`, p.id)) };
});

// nooks -----------------------------------------------------------------------------------------------------

route('POST', '/api/nooks', async ({ user, body }) => {
  limit('nook:' + user.id, 3, DAY, 'You can create up to 3 nests a day.');
  const id = text(body.id, 30).toLowerCase();
  if (!/^[a-z0-9_]{3,21}$/.test(id)) fail(400, 'Use 3–21 letters, numbers or underscores.', { field: 'id' });
  if (nookExists(id)) fail(409, `n/${id} already exists. Try another name.`, { field: 'id' });
  const title = text(body.title, 60) || id.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  const tagline = text(body.tagline, 200) || `A brand new nest about ${title.toLowerCase()}.`;
  const description = text(body.description, 500) || tagline;
  vet([id.replace(/_/g, ' '), title, tagline, description], { kind: 'nook' }, { strongNames: true, personal: true });
  await checkText([title, tagline, description], 'nook', { strict: true });
  if (nookExists(id)) fail(409, `n/${id} already exists. Try another name.`, { field: 'id' });
  const data = {
    title, tagline, description,
    category: CATEGORIES.includes(body.category) ? body.category : 'Hobbies',
    color: HEX_RE.test(body.color) ? body.color : '#6750a4',
    shape: WORD_RE.test(body.shape) ? body.shape : 'cookie9',
    symbol: WORD_RE.test(body.symbol) ? body.symbol : 'forum',
    rules: ['Be kind', 'Stay on topic'],
    flairs: ['Discussion', 'Question', 'Show off'],
  };
  const t = now();
  db.tx(() => {
    db.run('INSERT INTO nooks (id, data, created_by, created_at, rev) VALUES (?, ?, ?, ?, ?)', id, JSON.stringify(data), user.id, t, db.bump());
    db.run('INSERT OR IGNORE INTO joins (user_id, nook, created_at) VALUES (?, ?, ?)', user.id, id, t);
  });
  return { nook: nookOut(db.get('SELECT * FROM nooks WHERE id = ?', id)) };
});

route('POST', '/api/joins', ({ user, body }) => {
  const nook = text(body.nook, 30);
  if (!nookExists(nook)) fail(404, 'That nest doesn’t exist.');
  if (body.on) db.run('INSERT OR IGNORE INTO joins (user_id, nook, created_at) VALUES (?, ?, ?)', user.id, nook, now());
  else db.run('DELETE FROM joins WHERE user_id = ? AND nook = ?', user.id, nook);
  return { members: members()[nook] || 0 };
});

// nest teams, bans, rules and pins ----------------------------------------------------------------------------
// A nest's owner (whoever made it; for the starter nests, Budgie's admins) can give people who joined it a role:
// Admin, Moderator, Helper, or one they name themselves. A role is a set of things its holder may do in that nest:
// pin posts, remove posts and comments, ban people from the nest (which only stops them posting and commenting in
// it), edit its rules and description, and manage its team. Budgie's own admins can do all of it, in every nest.

const NEST_PERMS = ['pin', 'remove', 'ban', 'rules', 'team'];
const NEST_ROLES = { admin: ['pin', 'remove', 'ban', 'rules', 'team'], moderator: ['pin', 'remove', 'ban'], helper: ['pin', 'remove'] };
const ROLE_LABEL = { admin: 'Admin', moderator: 'Moderator', helper: 'Helper' };
const NEST_TEAM_MAX = 20;
const PIN_MAX = 3;
const RULES_MAX = 10;

const ownerOf = (nook) => (db.get('SELECT created_by FROM nooks WHERE id = ?', nook) || {}).created_by || null;
/** everyone's who can run a nest: its owner and Budgie's admins */
const nestBoss = (user, nook) => user.role === 'admin' || ownerOf(nook) === user.id;
/** what someone may do in a nest: everything for its owner and Budgie's admins, their role's share for its team */
function nestPerms(user, nook) {
  if (!user) return [];
  if (nestBoss(user, nook)) return NEST_PERMS;
  const t = db.get('SELECT perms FROM nest_team WHERE nook = ? AND user_id = ?', nook, user.id);
  return t ? t.perms.split(',').filter((p) => NEST_PERMS.includes(p)) : [];
}
const nestCan = (user, nook, perm, what) => nestPerms(user, nook).includes(perm) || fail(403, `You can’t ${what} in n/${nook}.`);
function teamOf(nook) {
  return db
    .all('SELECT t.role, t.title, t.perms, u.name FROM nest_team t JOIN users u ON u.id = t.user_id WHERE t.nook = ? AND u.banned_at IS NULL ORDER BY t.created_at', nook)
    .map((r) => ({ name: r.name, role: r.role, title: r.title || undefined, perms: r.perms.split(',').filter(Boolean) }));
}
/** a starter nest lives in the app's data file until someone changes it: then it gets a row of its own, which wins */
function nestRow(nook) {
  let row = db.get('SELECT * FROM nooks WHERE id = ?', nook);
  if (!row && STARTERS.has(nook)) {
    const data = Object.assign({}, STARTERS.get(nook));
    delete data.id;
    db.run('INSERT INTO nooks (id, data, created_by, created_at, rev) VALUES (?, ?, NULL, 0, ?)', nook, JSON.stringify(data), db.bump());
    row = db.get('SELECT * FROM nooks WHERE id = ?', nook);
  }
  if (!row) fail(404, 'That nest doesn’t exist.');
  return row;
}
const touchNest = (nook) => db.run('UPDATE nooks SET rev = ? WHERE id = ?', db.bump(), nestRow(nook).id);
const nestBan = (userId, nook) => db.get('SELECT * FROM nest_bans WHERE nook = ? AND user_id = ? AND (until IS NULL OR until > ?)', nook, userId, now()) || null;
const shortDate = (t) => new Date(t).toUTCString().slice(5, 16);
function notBanned(user, nook) {
  const b = nestBan(user.id, nook);
  if (b) fail(403, `You’re banned from posting and commenting in n/${nook}${b.until ? ' until ' + shortDate(b.until) : ''}. Reason: ${b.reason}`, { banned: true });
}
function nestFrom(params) {
  const nook = text(params.id, 30);
  if (!nookExists(nook)) fail(404, 'That nest doesn’t exist.');
  return nook;
}
const someone = (name) => {
  const u = db.get('SELECT * FROM users WHERE name = ?', text(name, 40));
  if (!u || u.banned_at) fail(404, 'There’s nobody by that name.');
  return u;
};

/** what a nest's team sees on its Manage page: what they may do, who's banned, and reports about the nest */
route('GET', '/api/nooks/:id/manage', ({ user, params }) => {
  const nook = nestFrom(params);
  const perms = nestPerms(user, nook);
  if (!perms.length) fail(403, 'You’re not on this nest’s team.');
  const out = { perms, boss: nestBoss(user, nook) };
  if (perms.includes('ban')) {
    out.bans = db
      .all('SELECT b.*, u.name, ub.name AS by_name FROM nest_bans b JOIN users u ON u.id = b.user_id LEFT JOIN users ub ON ub.id = b.by_id WHERE b.nook = ? AND (b.until IS NULL OR b.until > ?) ORDER BY b.created_at DESC', nook, now())
      .map((b) => ({ name: b.name, reason: b.reason, by: b.by_name || undefined, createdAt: b.created_at, until: b.until || undefined }));
  }
  if (perms.includes('remove')) {
    // reports about posts and comments in this nest (who reported them stays with Budgie's own moderators)
    out.reports = db
      .all(
        `SELECT * FROM reports WHERE resolved_at IS NULL AND ((kind = 'post' AND target IN (SELECT id FROM posts WHERE nook = ? AND removed_at IS NULL))
          OR (kind = 'comment' AND target IN (SELECT c.id FROM comments c JOIN posts p ON p.id = c.post_id WHERE p.nook = ? AND c.removed_at IS NULL)))
         ORDER BY created_at DESC LIMIT 100`,
        nook, nook
      )
      .map((r) => ({ id: r.id, kind: r.kind, target: r.target, reason: r.reason.replace(/^Automatic check: /, ''), automatic: !r.reporter_id || undefined, createdAt: r.created_at, item: reportTarget(r) }));
  }
  return out;
});

/** gives someone a role in a nest, or changes it */
route('PUT', '/api/nooks/:id/team/:name', ({ user, params, body }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'team', 'manage the team');
  limit('nest-team:' + user.id, 60, HOUR);
  const boss = nestBoss(user, nook);
  const mine = nestPerms(user, nook);
  const who = someone(params.name);
  if (who.id === user.id) fail(400, 'You can’t change your own role.');
  if (ownerOf(nook) === who.id) fail(400, `u/${who.name} owns n/${nook}.`);
  if (!db.get('SELECT 1 AS x FROM joins WHERE user_id = ? AND nook = ?', who.id, nook)) fail(400, `u/${who.name} has to join n/${nook} first.`);
  if (nestBan(who.id, nook)) fail(400, `u/${who.name} is banned from n/${nook}. Unban them first.`);
  const had = db.get('SELECT * FROM nest_team WHERE nook = ? AND user_id = ?', nook, who.id);
  if (had && had.perms.split(',').includes('team') && !boss) fail(403, 'Only the nest’s owner can change the role of someone who manages the team.');
  const role = NEST_ROLES[body.role] ? body.role : 'custom';
  const perms = role === 'custom' ? [...new Set((Array.isArray(body.perms) ? body.perms : []).filter((p) => NEST_PERMS.includes(p)))] : NEST_ROLES[role];
  if (!perms.length) fail(400, 'Pick at least one thing they can do.', { field: 'perms' });
  if (perms.includes('team') && !boss) fail(403, 'Only the nest’s owner can let someone manage the team.');
  if (perms.some((p) => !mine.includes(p))) fail(403, 'You can only give the kinds of access you have yourself.');
  const title = role === 'custom' ? text(body.title, 24) : '';
  if (role === 'custom' && !title) fail(400, 'Give the role a name.', { field: 'title' });
  if (title) vet([title], { kind: 'profile' }, { strongNames: true });
  if (!had && db.get('SELECT COUNT(*) AS n FROM nest_team WHERE nook = ?', nook).n >= NEST_TEAM_MAX) fail(400, `A nest’s team can have up to ${NEST_TEAM_MAX} people.`);
  // NEST_PERMS order, so the same access always reads the same way
  const ordered = NEST_PERMS.filter((p) => perms.includes(p)).join(',');
  db.run(
    `INSERT INTO nest_team (nook, user_id, role, title, perms, added_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(nook, user_id) DO UPDATE SET role = excluded.role, title = excluded.title, perms = excluded.perms`,
    nook, who.id, role, title, ordered, user.id, now()
  );
  touchNest(nook);
  if (!had || had.role !== role || had.title !== title || had.perms !== ordered) {
    notify(who.id, { kind: 'nest', text: `u/${user.name} made you ${title ? `“${title}”` : /^[aeiou]/i.test(ROLE_LABEL[role]) ? 'an ' + ROLE_LABEL[role] : 'a ' + ROLE_LABEL[role]} in n/${nook}`, href: '#/n/' + nook, symbol: 'shield_person', shape: 'gem' });
  }
  return { nook: nookOut(nestRow(nook)) };
});

/** takes someone off a nest's team; anyone on a team can step down */
route('DELETE', '/api/nooks/:id/team/:name', ({ user, params }) => {
  const nook = nestFrom(params);
  const who = someone(params.name);
  const had = db.get('SELECT * FROM nest_team WHERE nook = ? AND user_id = ?', nook, who.id);
  if (!had) fail(404, `u/${who.name} isn’t on n/${nook}’s team.`);
  if (who.id !== user.id) {
    nestCan(user, nook, 'team', 'manage the team');
    if (had.perms.split(',').includes('team') && !nestBoss(user, nook)) fail(403, 'Only the nest’s owner can take away the role of someone who manages the team.');
    notify(who.id, { kind: 'nest', text: `You’re no longer on n/${nook}’s team.`, href: '#/n/' + nook, symbol: 'shield_person', shape: 'gem' });
  }
  db.run('DELETE FROM nest_team WHERE nook = ? AND user_id = ?', nook, who.id);
  touchNest(nook);
  return { nook: nookOut(nestRow(nook)) };
});

/** bans someone from posting and commenting in a nest, for some days or for good */
route('POST', '/api/nooks/:id/bans', ({ user, params, body }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'ban', 'ban people');
  limit('nest-ban:' + user.id, 60, HOUR);
  const who = someone(body.name);
  if (who.id === user.id) fail(400, 'You can’t ban yourself.');
  if (who.role === 'admin' || ownerOf(nook) === who.id) fail(403, `u/${who.name} can’t be banned from n/${nook}.`);
  if (db.get('SELECT 1 AS x FROM nest_team WHERE nook = ? AND user_id = ?', nook, who.id)) fail(400, `u/${who.name} is on the team. Take their role away first.`);
  const reason = text(body.reason, 200) || 'Broke the nest’s rules';
  vet([reason], { kind: 'comment' });
  const days = Math.max(0, Math.min(365, Math.round(Number(body.days) || 0)));
  const until = days ? now() + days * DAY : null;
  db.run('INSERT OR REPLACE INTO nest_bans (nook, user_id, reason, by_id, created_at, until) VALUES (?, ?, ?, ?, ?, ?)', nook, who.id, reason, user.id, now(), until);
  notify(who.id, {
    kind: 'moderation',
    text: `You can’t post or comment in n/${nook} ${days ? `for ${days === 1 ? 'a day' : days + ' days'}` : 'any more'}. Reason: ${reason}`,
    href: '#/n/' + nook, symbol: 'block', shape: 'pixelCircle',
  });
  return { ok: true };
});

route('DELETE', '/api/nooks/:id/bans/:name', ({ user, params }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'ban', 'unban people');
  const who = someone(params.name);
  if (!db.run('DELETE FROM nest_bans WHERE nook = ? AND user_id = ?', nook, who.id).changes) fail(404, `u/${who.name} isn’t banned from n/${nook}.`);
  notify(who.id, { kind: 'moderation', text: `You can post and comment in n/${nook} again.`, href: '#/n/' + nook, symbol: 'check_circle', shape: 'pixelCircle' });
  return { ok: true };
});

/** a nest's rules, tagline and description */
route('PATCH', '/api/nooks/:id', async ({ user, params, body }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'rules', 'edit the rules');
  const read = () => JSON.parse(nestRow(nook).data);
  const change = {};
  if (body.rules != null) {
    const rules = (Array.isArray(body.rules) ? body.rules : []).map((r) => text(r, 120)).filter(Boolean);
    if (rules.length > RULES_MAX) fail(400, `A nest can have up to ${RULES_MAX} rules.`, { field: 'rules' });
    change.rules = rules;
  }
  if (body.tagline != null) {
    change.tagline = text(body.tagline, 200);
    if (!change.tagline) fail(400, 'Say in a line what the nest is about.', { field: 'tagline' });
  }
  if (body.description != null) change.description = text(body.description, 500) || change.tagline || read().tagline;
  const words = [...(change.rules || []), change.tagline, change.description].filter(Boolean);
  if (!words.length) return { nook: nookOut(nestRow(nook)) };
  vet(words, { kind: 'nook' }, { strongNames: true, personal: true });
  await checkText(words, 'nook', { strict: true });
  nestCan(user, nook, 'rules', 'edit the rules'); // still allowed once the check is done
  db.run('UPDATE nooks SET data = ?, rev = ? WHERE id = ?', JSON.stringify(Object.assign(read(), change)), db.bump(), nook);
  return { nook: nookOut(nestRow(nook)) };
});

/** pins a post to the top of its nest, or unpins it */
route('POST', '/api/posts/:id/pin', ({ user, params, body }) => {
  const p = db.get('SELECT * FROM posts WHERE id = ?', text(params.id, 40));
  if (!p || p.removed_at) fail(404, 'That post is gone.');
  nestCan(user, p.nook, 'pin', 'pin posts');
  const on = body.on !== false;
  if (on && !p.pinned_at && db.get("SELECT COUNT(*) AS n FROM posts WHERE nook = ? AND pinned_at != '' AND removed_at IS NULL", p.nook).n >= PIN_MAX) {
    fail(400, `A nest can have up to ${PIN_MAX} pinned posts. Unpin one first.`);
  }
  db.run('UPDATE posts SET pinned_at = ?, rev = ? WHERE id = ?', on ? String(p.pinned_at || now()) : '', db.bump(), p.id);
  return { post: postOut(db.get(`${POST_SELECT} WHERE p.id = ?`, p.id)) };
});

/** a nest's team takes down a post or comment in it; its author is told why, and reports about it close */
route('POST', '/api/nooks/:id/remove', ({ user, params, body }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'remove', 'remove posts and comments');
  const kind = body.kind === 'comment' ? 'comment' : 'post';
  const id = text(body.id, 40);
  const at = kind === 'post' ? db.get('SELECT nook FROM posts WHERE id = ?', id) : db.get('SELECT p.nook FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?', id);
  if (!at || at.nook !== nook) fail(404, 'That isn’t in this nest.');
  const reason = text(body.reason, 200) || 'Breaks the nest’s rules';
  if (!takeDown(kind, id, reason, `A moderator of n/${nook}`)) fail(404, 'That’s already gone.');
  db.run('UPDATE reports SET resolved_at = ?, resolution = ? WHERE kind = ? AND target = ? AND resolved_at IS NULL', now(), `removed in n/${nook}: ${reason}`, kind, id);
  return { ok: true };
});

/** a nest's team says a report about something in it needs nothing doing */
route('POST', '/api/nooks/:id/reports/:rid/dismiss', ({ user, params }) => {
  const nook = nestFrom(params);
  nestCan(user, nook, 'remove', 'handle reports');
  const r = db.get('SELECT * FROM reports WHERE id = ? AND resolved_at IS NULL', Number(params.rid));
  const at = r && (r.kind === 'post' ? db.get('SELECT nook FROM posts WHERE id = ?', r.target) : r.kind === 'comment' ? db.get('SELECT p.nook FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?', r.target) : null);
  if (!at || at.nook !== nook) fail(404, 'That report is gone.');
  db.run('UPDATE reports SET resolved_at = ?, resolution = ? WHERE kind = ? AND target = ? AND resolved_at IS NULL', now(), `dismissed in n/${nook}`, r.kind, r.target);
  return { ok: true };
});

// you ---------------------------------------------------------------------------------------------------------

route('PATCH', '/api/me', async ({ user, body }) => {
  const next = { name: user.name, color: user.color, shape: user.shape, icon: user.icon, bio: user.bio, photo: user.photo, photo_gif: user.photo_gif, banner: user.banner, banner_gif: user.banner_gif, name_font: user.name_font,
    pronouns: user.pronouns, pride_flag: user.pride_flag, interests: user.interests, profile_scheme: user.profile_scheme, sticker_shape: user.sticker_shape };
  if (body.name != null && body.name !== user.name) {
    limit('rename:' + user.id, 5, DAY, 'You can change your username up to 5 times a day.');
    const name = text(body.name, 40);
    if (!NAME_RE.test(name)) fail(400, 'Usernames are 3–20 letters, numbers or underscores.', { field: 'name' });
    vet([name.replace(/_/g, ' ')], { kind: 'profile' }, { strongNames: true });
    const taken = db.get('SELECT id FROM users WHERE name = ?', name);
    if (taken && taken.id !== user.id) fail(409, `u/${name} is taken. Try another name.`, { field: 'name' });
    next.name = name;
  }
  if (body.bio != null) {
    // line breaks are kept (at most eight lines, and no more than one empty line in a row)
    next.bio = text(String(body.bio).replace(/\r/g, ''), BIO_MAX).replace(/\n{3,}/g, '\n\n').split('\n').slice(0, 8).join('\n').trim();
    vet([next.bio], { kind: 'profile' }, { personal: true });
  }
  const bioDoubt = next.bio !== user.bio ? await checkText([next.bio], 'profile') : null;
  if (body.font != null) {
    if (body.font !== '' && !NAME_FONTS.includes(body.font)) fail(400, 'That isn’t one of Budgie’s name fonts.', { field: 'font' });
    next.name_font = body.font;
  }
  if (body.pronouns != null) {
    const pronouns = text(String(body.pronouns), 40).replace(/\s+/g, ' ');
    if (pronouns && !PRONOUNS_RE.test(pronouns)) fail(400, 'Pronouns are up to 24 letters, with / or spaces between them (like she/they).', { field: 'pronouns' });
    if (pronouns) vet([pronouns], { kind: 'profile' }, { strongNames: true });
    next.pronouns = pronouns;
  }
  if (body.flag != null) {
    if (body.flag !== '' && !PRIDE_FLAGS.includes(body.flag)) fail(400, 'That isn’t one of Budgie’s pride flags.', { field: 'flag' });
    next.pride_flag = body.flag;
  }
  if (body.interests != null) {
    const list = Array.isArray(body.interests) ? [...new Set(body.interests)] : [];
    if (list.length > INTERESTS_MAX || list.some((i) => !INTERESTS.includes(i))) fail(400, `Pick up to ${INTERESTS_MAX} of Budgie’s interests.`, { field: 'interests' });
    next.interests = list.join(',');
  }
  if (body.scheme != null) {
    if (body.scheme !== '' && !PROFILE_SCHEMES.includes(body.scheme)) fail(400, 'That isn’t one of the colour styles.', { field: 'scheme' });
    next.profile_scheme = body.scheme;
  }
  if (body.sticker != null) {
    // a shape's name (the app knows which exist), 'none', or '' for a mix
    if (body.sticker !== '' && !WORD_RE.test(body.sticker)) fail(400, 'That isn’t a shape.', { field: 'sticker' });
    next.sticker_shape = body.sticker;
  }
  if (body.color != null) next.color = HEX_RE.test(body.color) ? body.color : user.color;
  if (body.shape != null) next.shape = WORD_RE.test(body.shape) ? body.shape : user.shape;
  if (body.icon != null) next.icon = body.icon === '' || WORD_RE.test(body.icon) ? body.icon : user.icon;
  // a new picture or banner arrives as data (a still, plus the GIF when it moves); '' removes it; its old URL keeps it
  const changing = ['photo', 'banner'].filter((k) => body[k] != null && !String(body[k]).includes('/api/images/'));
  if (changing.some((k) => body[k])) limit('media:' + user.id, 20, DAY, 'You can change your picture or banner up to 20 times a day.');
  // every new picture (the still and the GIF) is read and checked before anything changes
  const incoming = {};
  for (const k of changing) {
    if (!body[k]) continue;
    const rules = MEDIA[k];
    incoming[k] = readImage(body[k], rules.still);
    if (body[k + 'Gif']) incoming[k + '_gif'] = readImage(body[k + 'Gif'], rules.gif, { gif: 'only', maxSide: rules.maxSide });
  }
  let review = false;
  for (const img of Object.values(incoming)) if ((await checkPicture(img, 'profile')) === 'review') review = true;
  db.tx(() => {
    for (const k of changing) {
      for (const old of [user[k], user[k + '_gif']]) if (old) db.run('DELETE FROM images WHERE id = ?', old);
      next[k] = incoming[k] ? saveImage(incoming[k], user.id) : '';
      next[k + '_gif'] = incoming[k] && incoming[k + '_gif'] ? saveImage(incoming[k + '_gif'], user.id) : '';
    }
    db.run(
      `UPDATE users SET name = ?, color = ?, shape = ?, icon = ?, bio = ?, photo = ?, photo_gif = ?, banner = ?, banner_gif = ?, name_font = ?,
         pronouns = ?, pride_flag = ?, interests = ?, profile_scheme = ?, sticker_shape = ?, rev = ? WHERE id = ?`,
      next.name, next.color, next.shape, next.icon, next.bio, next.photo, next.photo_gif, next.banner, next.banner_gif, next.name_font,
      next.pronouns, next.pride_flag, next.interests, next.profile_scheme, next.sticker_shape, db.bump(), user.id
    );
    // posts and comments show the new name, so they're stamped for everyone
    if (next.name !== user.name) {
      for (const p of db.all('SELECT id FROM posts WHERE author_id = ?', user.id)) db.run('UPDATE posts SET rev = ? WHERE id = ?', db.bump(), p.id);
      for (const c of db.all('SELECT id FROM comments WHERE author_id = ?', user.id)) db.run('UPDATE comments SET rev = ? WHERE id = ?', db.bump(), c.id);
    }
  });
  if (review) autoReport('user', next.name, 'this profile picture or banner might not be OK for everyone. Please take a look.');
  else if (bioDoubt) autoReport('user', next.name, bioDoubt.replace('this might be', 'this bio might be'));
  return { me: meOut(db.get('SELECT * FROM users WHERE id = ?', user.id)) };
}, { body: 10 * 1024 * 1024 });

// a developer gives someone the Tester badge, or takes it away (the Developer badge only comes from `nook dev`)
route('POST', '/api/badges', ({ user, body }) => {
  if (!badgesOf(user).includes('dev')) fail(403, 'Only Budgie’s developers can give badges.');
  limit('badges:' + user.id, 60, HOUR);
  if (body.badge !== 'tester') fail(400, 'Developers can give the Tester badge, and only that one.');
  const target = db.get('SELECT * FROM users WHERE name = ?', text(body.name, 40));
  if (!target) fail(404, 'There’s no one by that name.');
  setBadge(target, 'tester', !!body.on, user.name);
  return { user: publicUser(db.get('SELECT * FROM users WHERE id = ?', target.id)) };
});

// your own settings, saved posts, collections, streak and badges travel between your devices
route('PUT', '/api/prefs', ({ user, body }) => {
  const json = JSON.stringify(body.prefs || {});
  if (json.length > 256 * 1024) fail(413, 'Your settings are too big to save.');
  db.run('UPDATE users SET prefs = ? WHERE id = ?', json, user.id);
  return { ok: true };
}, { body: 300 * 1024 });

route('POST', '/api/notes/read', ({ user, body }) => {
  if (body.all) db.run('UPDATE notes SET read_at = ? WHERE user_id = ? AND read_at IS NULL', now(), user.id);
  for (const id of (Array.isArray(body.ids) ? body.ids : []).slice(0, 200)) {
    db.run('UPDATE notes SET read_at = ? WHERE user_id = ? AND id = ?', now(), user.id, Number(String(id).replace(/^n/, '')));
  }
  return { ok: true };
});

// reports ---------------------------------------------------------------------------------------------------

route('POST', '/api/reports', ({ user, body }) => {
  limit('report:' + user.id, 30, DAY);
  const kind = ['post', 'comment', 'user', 'message', 'gmessage', 'group'].includes(body.kind) ? body.kind : null;
  if (!kind) fail(400, 'Report a post, a comment, a person, a message or a group.');
  const target = text(body.id, 60);
  const reason = text(body.reason, 300) || 'No reason given';
  db.run('INSERT INTO reports (reporter_id, kind, target, reason, created_at) VALUES (?, ?, ?, ?, ?)', user.id, kind, target, reason, now());
  for (const admin of db.all("SELECT id FROM users WHERE role = 'admin'")) {
    notify(admin.id, { kind: 'report', text: `New report: a ${KIND_LABEL[kind] || kind} for “${reason}”`, href: '#/admin', symbol: 'flag', shape: 'pixelCircle' });
  }
  return { ok: true };
});

// friends -------------------------------------------------------------------------------------------------------

route('POST', '/api/friends', ({ user, body }) => {
  limit('friend:' + user.id, 60, HOUR);
  const other = db.get('SELECT * FROM users WHERE name = ?', text(body.name, 40));
  if (!other || other.banned_at) fail(404, 'There’s nobody by that name.');
  if (other.id === user.id) fail(400, 'You’re already your own best friend.');
  if (hasBlocked(user.id, other.id)) fail(403, `You’ve blocked u/${other.name}. Unblock them first.`);
  if (hasBlocked(other.id, user.id)) fail(403, `You can’t send u/${other.name} a friend request.`);
  const existing = friendship(user.id, other.id);
  if (existing && existing.status === 'friends') return { status: 'friends' };
  if (existing && existing.a === user.id) return { status: 'outgoing' };
  if (existing) {
    // they asked first: this accepts
    db.run("UPDATE friends SET status = 'friends', rev = ? WHERE a = ? AND b = ?", db.bump(), existing.a, existing.b);
    notify(other.id, { kind: 'friend', text: `u/${user.name} accepted your friend request`, href: '#/u/' + user.name, symbol: 'how_to_reg', shape: 'heart' });
    return { status: 'friends' };
  }
  db.run("INSERT INTO friends (a, b, status, created_at, rev) VALUES (?, ?, 'pending', ?, ?)", user.id, other.id, now(), db.bump());
  notify(other.id, { kind: 'friend', text: `u/${user.name} sent you a friend request`, href: '#/friends', symbol: 'person_add', shape: 'heart' });
  return { status: 'outgoing' };
});

route('DELETE', '/api/friends/:name', ({ user, params }) => {
  const other = db.get('SELECT id FROM users WHERE name = ?', decodeURIComponent(params.name));
  if (other) db.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', user.id, other.id, other.id, user.id);
  return { ok: true };
});

// blocking: you stop being friends, and neither of you can ask again, message or call the other. They aren't told.
route('POST', '/api/blocks', ({ user, body }) => {
  limit('block:' + user.id, 60, HOUR);
  const other = db.get('SELECT * FROM users WHERE name = ?', text(body.name, 40));
  if (!other) fail(404, 'There’s nobody by that name.');
  if (other.id === user.id) fail(400, 'You can’t block yourself.');
  db.tx(() => {
    db.run('INSERT OR IGNORE INTO blocks (user_id, blocked_id, created_at) VALUES (?, ?, ?)', user.id, other.id, now());
    db.run('DELETE FROM friends WHERE (a = ? AND b = ?) OR (a = ? AND b = ?)', user.id, other.id, other.id, user.id);
  });
  for (const c of [...calls.values()]) {
    // a call between the two of you ends
    if (!c.group && [c.by, c.peer].includes(user.id) && [c.by, c.peer].includes(other.id)) endCall(c, 'ended');
    // a group call they're in stops ringing you
    else if (c.group && c.joined.has(other.id) && c.ringing.delete(user.id)) {
      signal(user.id, 'call-stop', { call: c.id });
      ringsChanged(c);
    }
  }
  return { blocked: blockedNames(user.id) };
});

route('DELETE', '/api/blocks/:name', ({ user, params }) => {
  const other = db.get('SELECT id FROM users WHERE name = ?', decodeURIComponent(params.name));
  if (other) db.run('DELETE FROM blocks WHERE user_id = ? AND blocked_id = ?', user.id, other.id);
  return { blocked: blockedNames(user.id) };
});

// messages ---------------------------------------------------------------------------------------------------

route('GET', '/api/messages', ({ user, query }) => {
  const other = db.get('SELECT id FROM users WHERE name = ?', text(query.with, 40));
  if (!other) fail(404, 'There’s nobody by that name.');
  const before = Number(query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.all(
    `${MESSAGE_SELECT} WHERE m.id < ? AND ((m.from_id = ? AND m.to_id = ?) OR (m.from_id = ? AND m.to_id = ?)) ORDER BY m.id DESC LIMIT 50`,
    before, user.id, other.id, other.id, user.id
  );
  return { messages: rows.reverse().map((r) => messageOut(r, user.id)), more: rows.length === 50 };
});

route('POST', '/api/messages', async ({ user, body }) => {
  limit('message:' + user.id, 40, MINUTE, 'You’re sending messages very fast. Slow down a little.');
  const other = db.get('SELECT * FROM users WHERE name = ?', text(body.to, 40));
  if (!other || other.banned_at) fail(404, 'There’s nobody by that name.');
  const f = friendship(user.id, other.id);
  if (!f || f.status !== 'friends') fail(403, 'You can only message friends.');
  const messageBody = text(body.body, 2000);
  if (!messageBody && !body.image && !body.gif) fail(400, 'Write something first.');
  const verdict = vet([messageBody], { kind: 'message' });
  // in private messages the model only stops what it's very sure of, and only sexual ones are shown to a moderator
  const doubt = messageBody ? await checkText([messageBody], 'message') : null;
  const attached = await chatMedia(user, body);
  const still = friendship(user.id, other.id);
  if (!still || still.status !== 'friends') fail(403, 'You can only message friends.');
  const { lastInsertRowid } = db.tx(() => db.run('INSERT INTO messages (from_id, to_id, body, media, created_at) VALUES (?, ?, ?, ?, ?)', user.id, other.id, messageBody, keepMedia(attached, user.id), now()));
  // a warning sign (someone asked to keep secrets, say) isn't blocked, but a moderator gets to see it
  if (verdict.flag) autoReport('message', Number(lastInsertRowid), verdict.flag.why);
  else if (attached && attached.review === 'review') autoReport('message', Number(lastInsertRowid), 'this picture might be sexual. Please take a look.');
  else if (doubt) autoReport('message', Number(lastInsertRowid), doubt);
  return { message: messageOut(db.get(`${MESSAGE_SELECT} WHERE m.id = ?`, Number(lastInsertRowid)), user.id) };
}, { body: 6 * 1024 * 1024 });

route('POST', '/api/messages/read', ({ user, body }) => {
  const other = db.get('SELECT id FROM users WHERE name = ?', text(body.with, 40));
  if (other) db.run('UPDATE messages SET read_at = ? WHERE from_id = ? AND to_id = ? AND read_at IS NULL', now(), other.id, user.id);
  return { ok: true };
});

// group chats ---------------------------------------------------------------------------------------------------
// Friends make groups of up to 32 people. Anyone in a group can add their own friends; its owner (who made it)
// can rename it and remove people; anyone can leave. Someone added later sees the chat from when they joined.
// Messages are checked like private messages.

const GROUP_MAX = 32;
const GROUP_SHAPES = ['cookie9', 'heart', 'sunny', 'clover4', 'clover8', 'flower', 'puffy', 'gem', 'softBurst', 'cookie6', 'ghostish', 'pixelCircle'];
const GMESSAGE_SELECT = 'SELECT m.*, u.name AS from_name FROM group_messages m LEFT JOIN users u ON u.id = m.from_id';
const membership = (groupId, userId) => db.get('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId) || null;

function gmessageOut(r, meId) {
  return { id: r.id, group: r.group_id, from: r.from_name || null, kind: r.kind === 'text' ? undefined : r.kind, body: r.body, media: mediaOut(r.media), createdAt: r.created_at, mine: !!r.from_id && r.from_id === meId };
}
function groupOut(g, meId) {
  const me = membership(g.id, meId);
  const seen = me ? Math.max(me.read_id, me.since_id) : 0;
  const last = me && db.get(`${GMESSAGE_SELECT} WHERE m.group_id = ? AND m.id > ? ORDER BY m.id DESC LIMIT 1`, g.id, me.since_id);
  return {
    id: g.id, name: g.name, color: g.color, shape: g.shape, createdAt: g.created_at,
    members: db.all('SELECT u.name, gm.role FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? ORDER BY gm.joined_at, u.name', g.id),
    role: me ? me.role : null,
    unread: me ? db.get('SELECT COUNT(*) AS n FROM group_messages WHERE group_id = ? AND id > ? AND (from_id IS NULL OR from_id != ?)', g.id, seen, meId).n : 0,
    last: last ? gmessageOut(last, meId) : null,
  };
}
const myGroups = (userId, since = -1) =>
  db.all('SELECT g.* FROM chat_groups g JOIN group_members gm ON gm.group_id = g.id WHERE gm.user_id = ? AND g.rev > ?', userId, since).map((g) => groupOut(g, userId));
/** a line in a group's chat about the group itself (who joined, left or renamed it) or a call; returns its id */
function groupEvent(groupId, fromId, kind, data) {
  return Number(db.run('INSERT INTO group_messages (group_id, from_id, kind, body, created_at) VALUES (?, ?, ?, ?, ?)', groupId, fromId, kind, JSON.stringify(data), now()).lastInsertRowid);
}
const touchGroup = (groupId) => db.run('UPDATE chat_groups SET rev = ? WHERE id = ?', db.bump(), groupId);
const lastGroupMessage = (groupId) => db.get('SELECT COALESCE(MAX(id), 0) AS n FROM group_messages WHERE group_id = ?', groupId).n;

/** someone leaves a group (or is removed, or deletes their account): an owner hands over to whoever has been there longest, and an empty group goes */
function dropMember(groupId, userId) {
  const was = membership(groupId, userId);
  if (!was) return;
  db.run('DELETE FROM group_members WHERE group_id = ? AND user_id = ?', groupId, userId);
  const left = db.all('SELECT * FROM group_members WHERE group_id = ? ORDER BY joined_at, user_id', groupId);
  if (!left.length) {
    // an empty group goes, with everything said in it
    for (const m of db.all("SELECT media FROM group_messages WHERE group_id = ? AND media != ''", groupId)) dropMedia(m.media);
    return void db.run('DELETE FROM chat_groups WHERE id = ?', groupId);
  }
  if (was.role === 'owner' && !left.some((m) => m.role === 'owner')) {
    db.run("UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?", groupId, left[0].user_id);
    groupEvent(groupId, left[0].user_id, 'event', { type: 'owner' });
  }
  touchGroup(groupId);
}

function groupFor(user, id) {
  const g = db.get('SELECT * FROM chat_groups WHERE id = ?', text(id, 40));
  if (!g || !membership(g.id, user.id)) fail(404, 'That group isn’t there any more, or you’re not in it.');
  return g;
}
const ownerOnly = (g, user, what) => membership(g.id, user.id).role === 'owner' || fail(403, `Only the group’s owner can ${what}.`);

/** the people being added: each has to be a friend of whoever adds them */
function friendsToAdd(user, names, groupId) {
  const list = Array.isArray(names) ? [...new Set(names.map((n) => text(n, 40)).filter(Boolean))] : [];
  return list.map((n) => {
    const u = db.get('SELECT * FROM users WHERE name = ?', n);
    if (!u || u.banned_at || u.id === user.id) fail(400, `There’s no friend called ${n}.`, { field: 'members' });
    const f = friendship(user.id, u.id);
    if (!f || f.status !== 'friends') fail(403, `You can only add your friends, and u/${u.name} isn’t one yet.`, { field: 'members' });
    if (groupId && membership(groupId, u.id)) fail(409, `u/${u.name} is already in the group.`, { field: 'members' });
    return u;
  });
}
const addedNote = (who, by, g) => notify(who.id, { kind: 'group', text: `u/${by.name} added you to the group “${g.name}”`, href: '#/messages/g/' + g.id, symbol: 'groups', shape: g.shape });
const groupNamed = (id, userId) => groupOut(db.get('SELECT * FROM chat_groups WHERE id = ?', id), userId);

route('POST', '/api/groups', ({ user, body }) => {
  limit('group-new:' + user.id, 20, DAY, 'That’s a lot of new groups for one day. Try again tomorrow.');
  const name = text(body.name, 40);
  if (!name) fail(400, 'Give your group a name.', { field: 'name' });
  vet([name], { kind: 'profile' }, { strongNames: true });
  const members = friendsToAdd(user, body.members);
  if (!members.length) fail(400, 'Add at least one friend.', { field: 'members' });
  if (members.length + 1 > GROUP_MAX) fail(400, `A group can have up to ${GROUP_MAX} people.`, { field: 'members' });
  const id = randomId('g', 9);
  const color = HEX_RE.test(body.color || '') ? body.color.toLowerCase() : COLORS[crypto.randomInt(COLORS.length)];
  const shape = GROUP_SHAPES.includes(body.shape) ? body.shape : GROUP_SHAPES[crypto.randomInt(GROUP_SHAPES.length)];
  const t = now();
  db.tx(() => {
    db.run('INSERT INTO chat_groups (id, name, color, shape, created_by, created_at, rev) VALUES (?, ?, ?, ?, ?, ?, ?)', id, name, color, shape, user.id, t, db.bump());
    db.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)", id, user.id, t);
    for (const m of members) db.run("INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)", id, m.id, t);
    groupEvent(id, user.id, 'event', { type: 'created', name, names: members.map((m) => m.name) });
  });
  const g = db.get('SELECT * FROM chat_groups WHERE id = ?', id);
  for (const m of members) addedNote(m, user, g);
  return { group: groupOut(g, user.id) };
});

route('GET', '/api/groups/:id/messages', ({ user, params, query }) => {
  const g = groupFor(user, params.id);
  const me = membership(g.id, user.id);
  const before = Number(query.before) || Number.MAX_SAFE_INTEGER;
  const rows = db.all(`${GMESSAGE_SELECT} WHERE m.group_id = ? AND m.id > ? AND m.id < ? ORDER BY m.id DESC LIMIT 50`, g.id, me.since_id, before);
  return { messages: rows.reverse().map((r) => gmessageOut(r, user.id)), more: rows.length === 50 };
});

route('POST', '/api/groups/:id/messages', async ({ user, params, body }) => {
  limit('message:' + user.id, 40, MINUTE, 'You’re sending messages very fast. Slow down a little.');
  const g = groupFor(user, params.id);
  const messageBody = text(body.body, 2000);
  if (!messageBody && !body.image && !body.gif) fail(400, 'Write something first.');
  const verdict = vet([messageBody], { kind: 'message' });
  const doubt = messageBody ? await checkText([messageBody], 'message') : null;
  const attached = await chatMedia(user, body);
  groupFor(user, g.id); // still in it once the checks are done
  const id = db.tx(() => Number(db.run("INSERT INTO group_messages (group_id, from_id, kind, body, media, created_at) VALUES (?, ?, 'text', ?, ?, ?)", g.id, user.id, messageBody, keepMedia(attached, user.id), now()).lastInsertRowid));
  db.run('UPDATE group_members SET read_id = ? WHERE group_id = ? AND user_id = ?', id, g.id, user.id);
  if (verdict.flag) autoReport('gmessage', id, verdict.flag.why);
  else if (attached && attached.review === 'review') autoReport('gmessage', id, 'this picture might be sexual. Please take a look.');
  else if (doubt) autoReport('gmessage', id, doubt);
  return { message: gmessageOut(db.get(`${GMESSAGE_SELECT} WHERE m.id = ?`, id), user.id) };
}, { body: 6 * 1024 * 1024 });

route('POST', '/api/groups/:id/read', ({ user, params, body }) => {
  const g = groupFor(user, params.id);
  const upTo = Math.min(Math.max(0, Number(body.upTo) || 0) || Number.MAX_SAFE_INTEGER, lastGroupMessage(g.id));
  db.run('UPDATE group_members SET read_id = MAX(read_id, ?) WHERE group_id = ? AND user_id = ?', upTo, g.id, user.id);
  return { ok: true };
});

route('POST', '/api/groups/:id/members', ({ user, params, body }) => {
  limit('group-add:' + user.id, 60, HOUR);
  const g = groupFor(user, params.id);
  const added = friendsToAdd(user, body.names, g.id);
  if (!added.length) fail(400, 'Pick at least one friend to add.', { field: 'members' });
  if (db.get('SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?', g.id).n + added.length > GROUP_MAX) fail(400, `A group can have up to ${GROUP_MAX} people.`, { field: 'members' });
  db.tx(() => {
    // they see the chat from here on, starting with the line that says they were added
    const since = lastGroupMessage(g.id);
    for (const m of added) db.run("INSERT INTO group_members (group_id, user_id, role, joined_at, since_id, read_id) VALUES (?, ?, 'member', ?, ?, ?)", g.id, m.id, now(), since, since);
    groupEvent(g.id, user.id, 'event', { type: 'added', names: added.map((m) => m.name) });
    touchGroup(g.id);
  });
  for (const m of added) addedNote(m, user, g);
  return { group: groupNamed(g.id, user.id) };
});

route('DELETE', '/api/groups/:id/members/:name', ({ user, params }) => {
  const g = groupFor(user, params.id);
  ownerOnly(g, user, 'remove people');
  const u = db.get('SELECT * FROM users WHERE name = ?', decodeURIComponent(params.name));
  if (!u || !membership(g.id, u.id)) fail(404, 'They’re not in this group.');
  if (u.id === user.id) fail(400, 'To leave the group, use Leave group.');
  db.tx(() => {
    groupEvent(g.id, user.id, 'event', { type: 'removed', names: [u.name] });
    dropMember(g.id, u.id);
  });
  hangUpGroupCall(g.id, u.id);
  notify(u.id, { kind: 'group', text: `You were removed from the group “${g.name}”`, href: '#/messages', symbol: 'group_remove', shape: g.shape });
  return { group: groupNamed(g.id, user.id) };
});

route('POST', '/api/groups/:id/leave', ({ user, params }) => {
  const g = groupFor(user, params.id);
  db.tx(() => {
    groupEvent(g.id, user.id, 'event', { type: 'left' });
    dropMember(g.id, user.id);
  });
  hangUpGroupCall(g.id, user.id);
  return { ok: true };
});

route('PATCH', '/api/groups/:id', ({ user, params, body }) => {
  const g = groupFor(user, params.id);
  ownerOnly(g, user, 'change the group');
  const name = body.name != null ? text(body.name, 40) : g.name;
  if (!name) fail(400, 'Give your group a name.', { field: 'name' });
  if (name !== g.name) vet([name], { kind: 'profile' }, { strongNames: true });
  const color = body.color != null ? (HEX_RE.test(body.color) ? body.color.toLowerCase() : fail(400, 'Pick a colour.')) : g.color;
  const shape = body.shape != null ? (GROUP_SHAPES.includes(body.shape) ? body.shape : fail(400, 'Pick one of the shapes.')) : g.shape;
  db.tx(() => {
    db.run('UPDATE chat_groups SET name = ?, color = ?, shape = ?, rev = ? WHERE id = ?', name, color, shape, db.bump(), g.id);
    if (name !== g.name) groupEvent(g.id, user.id, 'event', { type: 'renamed', name });
  });
  return { group: groupNamed(g.id, user.id) };
});

// calls ------------------------------------------------------------------------------------------------------------
// Budgie's server only introduces the devices: it rings people, and passes on the offers, answers and network
// candidates WebRTC needs to connect them. The call itself goes between the devices, always encrypted, or through
// Cloudflare's relay (TURN) once that's set up with `nook turn`. Nothing about a call is kept but a line in the chat
// saying who called, and how long it lasted or that it was missed. Calls are between friends, or within a group.

const CALL_MAX = 6; // everyone connects to everyone, which stays smooth up to about six
const RING_MS = Number(process.env.NOOK_RING_MS) || 35 * 1000; // NOOK_RING_MS shortens it, for the tests
// a page reloaded mid-call has this long to come back before it counts as having left (NOOK_AWAY_MS, for the tests)
const AWAY_MS = Number(process.env.NOOK_AWAY_MS) || 30 * 1000;
const calls = new Map(); // id -> the call
const streams = new Map(); // user id -> their devices' open event streams
const queues = new Map(); // user id -> the last two minutes of signals, for a device that polls instead of listening
const lastSeen = new Map(); // user id -> when one of their devices was last in touch

const nameOf = (id) => (db.get('SELECT name FROM users WHERE id = ?', id) || { name: '[deleted]' }).name;
const writeEvent = (res, item) => res.write(`id: ${item.id}\nevent: ${item.type}\ndata: ${JSON.stringify(item.data)}\n\n`);

/** something for one person's devices, now if they're listening, or when they next ask */
function signal(userId, type, data) {
  let q = queues.get(userId);
  if (!q) queues.set(userId, (q = { next: 1, items: [] }));
  const item = { id: q.next++, type, data, at: now() };
  q.items.push(item);
  while (q.items.length > 300 || q.items[0].at < now() - 2 * MINUTE) q.items.shift();
  for (const res of streams.get(userId) || []) writeEvent(res, item);
}

/** a device listens for signals: an event stream (Server-Sent Events) that stays open */
route('GET', '/api/live', ({ user, query, req, res }) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.write('retry: 3000\n\n');
  let open = streams.get(user.id);
  if (!open) streams.set(user.id, (open = new Set()));
  open.add(res);
  lastSeen.set(user.id, now());
  // what it missed while it was reconnecting, then where things stand
  const q = queues.get(user.id);
  const after = Number(query.after) || 0;
  if (q && after) for (const item of q.items) if (item.id > after) writeEvent(res, item);
  res.write(`event: hello\ndata: ${JSON.stringify({ next: q ? q.next - 1 : 0 })}\n\n`);
  req.on('close', () => {
    open.delete(res);
    lastSeen.set(user.id, now());
  });
}, { stream: true });

/** the same signals, for a device that can't keep a stream open */
route('GET', '/api/signals', ({ user, query }) => {
  const q = queues.get(user.id);
  const after = Number(query.after) || 0;
  return { signals: q ? q.items.filter((i) => i.id > after).map(({ id, type, data }) => ({ id, type, data })) : [], next: q ? q.next - 1 : 0 };
});

// how devices find a way to each other: Cloudflare's free STUN server, and its TURN relay when the owner has set one up
// (calls then always go through it, so they connect on any network and nobody in a call sees another's IP address)
let turnCache = null;
async function iceConfig() {
  const stun = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], relay: false };
  const key = db.meta('turn-key');
  const token = db.meta('turn-token');
  if (!key || !token) return stun;
  if (turnCache && turnCache.key === key && turnCache.until > now()) return turnCache.value;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(key)}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error('Cloudflare answered ' + res.status);
    const { iceServers } = await res.json();
    // browsers block port 53, which would only slow a call down
    const servers = iceServers.map((s) => Object.assign({}, s, { urls: [].concat(s.urls).filter((u) => !/:53(\?|$)/.test(u)) }));
    turnCache = { key, until: now() + 12 * HOUR, value: { iceServers: servers, relay: true } };
    return turnCache.value;
  } catch (error) {
    console.error('Couldn’t get TURN credentials from Cloudflare, so calls go direct:', error.message);
    return stun;
  }
}

function callOut(c) {
  const g = c.group && db.get('SELECT name, color, shape FROM chat_groups WHERE id = ?', c.group);
  return {
    id: c.id, media: c.media, from: nameOf(c.by), with: c.peer ? nameOf(c.peer) : undefined,
    group: c.group ? { id: c.group, name: g ? g.name : 'Group', color: g ? g.color : '#6750a4', shape: g ? g.shape : 'cookie9' } : undefined,
    joined: [...c.joined].map(nameOf), ringing: c.group ? [...c.ringing].map(nameOf) : undefined, away: c.away && c.away.size ? [...c.away.keys()].map(nameOf) : undefined,
    startedAt: c.started, answeredAt: c.answered || undefined,
  };
}
const callOf = (userId) => [...calls.values()].find((c) => c.joined.has(userId)) || null;

function newCall(user, media, { group = null, peer = null, ring }) {
  const c = { id: randomId('c', 9), media, group, peer, by: user.id, ringing: new Set(ring), joined: new Set([user.id]), ever: new Set([user.id]), started: now(), answered: 0 };
  calls.set(c.id, c);
  const out = callOut(c);
  for (const id of ring) signal(id, 'call-ring', { call: out });
  c.timer = setTimeout(() => stopRinging(c, ring), RING_MS);
  return c;
}

/** someone in a group call rings people in the group again; their phones stop after 35 seconds too */
function ringAgain(c, ids) {
  const out = callOut(c);
  for (const id of ids) {
    c.ringing.add(id);
    signal(id, 'call-ring', { call: Object.assign({}, out, { ringing: undefined }), again: true });
  }
  const timer = setTimeout(() => stopRinging(c, ids), RING_MS);
  if (timer.unref) timer.unref();
}

/** after 35 seconds whoever hasn't answered stops ringing; once nobody has answered and nobody is still ringing, the call is over */
function stopRinging(c, ids) {
  if (!calls.has(c.id)) return;
  let stopped = false;
  for (const id of ids) if (c.ringing.delete(id)) (stopped = true), signal(id, 'call-stop', { call: c.id });
  if (!c.answered && !c.ringing.size) return endCall(c, 'no-answer');
  if (stopped) ringsChanged(c);
}
/** those in a group call hear who's no longer being rung (declined, or rang out), for its People list */
function ringsChanged(c) {
  if (!c.group) return;
  const out = callOut(c);
  for (const id of c.joined) signal(id, 'call-update', { call: out });
}

async function joinCall(c, user) {
  const allowed = c.group ? !!membership(c.group, user.id) : user.id === c.peer || user.id === c.by;
  if (!allowed) fail(403, 'You’re not in this call.');
  const other = callOf(user.id);
  if (other && other !== c) fail(409, 'You’re already in another call. Hang up first.');
  if (!c.joined.has(user.id) && c.joined.size >= CALL_MAX) fail(409, `This call is full: up to ${CALL_MAX} people can be in a call.`);
  back(c, user.id);
  const peers = [...c.joined].filter((id) => id !== user.id);
  c.joined.add(user.id);
  c.ever.add(user.id);
  c.ringing.delete(user.id);
  if (!c.answered && c.joined.size > 1) c.answered = now();
  const out = callOut(c);
  for (const id of peers) signal(id, 'call-joined', { call: out, user: user.name });
  // the person's other devices stop ringing
  signal(user.id, 'call-stop', { call: c.id, answered: true });
  return { call: out, ice: await iceConfig(), peers: peers.map(nameOf) };
}

/** someone who reloaded the page is back (or has gone for good): their timer stops */
function back(c, userId) {
  if (!c.away || !c.away.has(userId)) return;
  clearTimeout(c.away.get(userId));
  c.away.delete(userId);
}

/** someone hangs up: a call between two ends then, a group call when its last person goes (or when its caller gives up before anyone answers) */
function leaveCall(c, userId) {
  back(c, userId);
  if (!c.joined.delete(userId)) return void c.ringing.delete(userId);
  for (const id of c.joined) signal(id, 'call-left', { call: c.id, user: nameOf(userId) });
  if (!c.answered) return endCall(c, 'cancelled');
  if (c.group ? c.joined.size === 0 : c.joined.size < 2) endCall(c, 'ended');
}

function endCall(c, reason) {
  if (!calls.delete(c.id)) return;
  clearTimeout(c.timer);
  for (const timer of (c.away || new Map()).values()) clearTimeout(timer);
  for (const id of new Set([...c.ever, ...c.ringing, c.by, ...(c.peer ? [c.peer] : [])])) signal(id, 'call-ended', { call: c.id, reason });
  // its line in the chat: how long it went on, or that nobody picked up
  const log = JSON.stringify({ media: c.media, secs: c.answered ? Math.round((now() - c.answered) / 1000) : 0, missed: !c.answered || undefined });
  try {
    if (c.group) {
      if (db.get('SELECT 1 AS x FROM chat_groups WHERE id = ?', c.group)) db.run("INSERT INTO group_messages (group_id, from_id, kind, body, created_at) VALUES (?, ?, 'call', ?, ?)", c.group, c.by, log, now());
    } else {
      // a missed call is unread until the person who missed it opens the chat
      db.run("INSERT INTO messages (from_id, to_id, kind, body, created_at, read_at) VALUES (?, ?, 'call', ?, ?, ?)", c.by, c.peer, log, now(), c.answered ? now() : null);
    }
  } catch (error) {
    console.error('Couldn’t note a call in its chat:', error.message);
  }
}

/** someone leaving a group leaves its call too */
function hangUpGroupCall(groupId, userId) {
  for (const c of [...calls.values()]) if (c.group === groupId) leaveCall(c, userId);
}

/** someone signed out everywhere (banned, deleted): their streams close and they leave any call */
function disconnect(userId) {
  for (const res of streams.get(userId) || []) res.end();
  streams.delete(userId);
  for (const c of [...calls.values()]) leaveCall(c, userId);
}

route('POST', '/api/calls', async ({ user, body }) => {
  limit('call:' + user.id, 30, HOUR, 'That’s a lot of calls. Wait a little and try again.');
  const media = body.media === 'video' ? 'video' : 'voice';
  if (callOf(user.id)) fail(409, 'You’re already in a call. Hang up first.');
  if (body.group) {
    const g = groupFor(user, body.group);
    // a call already going on in the group: you join it
    const going = [...calls.values()].find((c) => c.group === g.id);
    if (going) return joinCall(going, user);
    const others = db.all('SELECT u.id, u.calls FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND u.id != ? AND u.banned_at IS NULL', g.id, user.id);
    const c = newCall(user, media, { group: g.id, ring: others.filter((u) => u.calls !== 'off' && !hasBlocked(u.id, user.id)).map((u) => u.id) });
    return { call: callOut(c), ice: await iceConfig(), peers: [] };
  }
  const other = db.get('SELECT * FROM users WHERE name = ?', text(body.to, 40));
  if (!other || other.banned_at || other.id === user.id) fail(404, 'There’s nobody by that name.');
  const f = friendship(user.id, other.id);
  if (!f || f.status !== 'friends') fail(403, 'You can only call friends.');
  if (other.calls === 'off') fail(403, `u/${other.name} isn’t taking calls.`);
  if (callOf(other.id)) fail(409, `u/${other.name} is on another call. Try again in a bit.`);
  const c = newCall(user, media, { peer: other.id, ring: [other.id] });
  return { call: callOut(c), ice: await iceConfig(), peers: [] };
});

route('POST', '/api/calls/:id/join', ({ user, params }) => {
  const c = calls.get(params.id);
  if (!c) fail(404, 'That call has ended.');
  return joinCall(c, user);
});

route('POST', '/api/calls/:id/signal', ({ user, params, body }) => {
  limit('signal:' + user.id, 900, MINUTE);
  const c = calls.get(params.id);
  if (!c || !c.joined.has(user.id)) fail(404, 'That call has ended.');
  const to = db.get('SELECT id FROM users WHERE name = ?', text(body.to, 40));
  if (!to || !c.joined.has(to.id)) fail(404, 'They’re not in the call any more.');
  if (!['offer', 'answer', 'candidate', 'media'].includes(body.type)) fail(400, 'That isn’t a call signal.');
  signal(to.id, 'call-signal', { call: c.id, from: user.name, type: body.type, data: body.data });
  return { ok: true };
}, { body: 64 * 1024 });

route('POST', '/api/calls/:id/decline', ({ user, params }) => {
  const c = calls.get(params.id);
  if (c && c.ringing.delete(user.id)) {
    if (!c.group) endCall(c, 'declined');
    else ringsChanged(c);
  }
  return { ok: true };
});

/** a page is closing or reloading mid-call: the others see "reconnecting", and it has a little while to come back */
route('POST', '/api/calls/:id/away', ({ user, params }) => {
  const c = calls.get(params.id);
  if (!c || !c.joined.has(user.id)) return { ok: true };
  if (!c.away) c.away = new Map();
  clearTimeout(c.away.get(user.id));
  const timer = setTimeout(() => {
    if (c.away) c.away.delete(user.id);
    if (calls.has(c.id)) leaveCall(c, user.id);
  }, AWAY_MS);
  if (timer.unref) timer.unref();
  c.away.set(user.id, timer);
  for (const id of c.joined) if (id !== user.id) signal(id, 'call-away', { call: c.id, user: user.name });
  return { ok: true };
});

/** rings people in a group call's group again: everyone not in it, or the ones named */
route('POST', '/api/calls/:id/ring', ({ user, params, body }) => {
  limit('ring:' + user.id, 30, HOUR, 'That’s a lot of ringing. Wait a little and try again.');
  const c = calls.get(params.id);
  if (!c || !c.joined.has(user.id)) fail(404, 'That call has ended.');
  if (!c.group) fail(400, 'Only a group call can ring people again.');
  const named = Array.isArray(body.names) && body.names.length ? new Set(body.names.map((n) => String(n).toLowerCase())) : null;
  const members = db.all('SELECT u.id, u.name, u.calls FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND u.banned_at IS NULL', c.group);
  const ring = members.filter((m) => !c.joined.has(m.id) && m.calls !== 'off' && !hasBlocked(m.id, user.id) && (!named || named.has(m.name.toLowerCase())));
  if (!ring.length) fail(400, named ? 'They can’t be rung right now (they may have calls turned off).' : 'Everyone who can be rung is already in the call.');
  ringAgain(c, ring.map((m) => m.id));
  return { rang: ring.map((m) => m.name), call: callOut(c) };
});

route('POST', '/api/calls/:id/leave', ({ user, params }) => {
  const c = calls.get(params.id);
  if (c) leaveCall(c, user.id);
  return { ok: true };
});

/** whether friends can call you */
route('POST', '/api/settings/calls', ({ user, body }) => {
  db.run('UPDATE users SET calls = ? WHERE id = ?', body.on === false ? 'off' : '', user.id);
  return { calls: body.on === false ? 'off' : 'on' };
});

// a device that's gone quiet for 45 seconds has left its call; old signal queues go
setInterval(() => {
  const t = now();
  for (const [id, open] of streams) if (open.size) lastSeen.set(id, t);
  for (const c of [...calls.values()]) for (const id of [...c.joined]) if ((lastSeen.get(id) || 0) < t - 45000) leaveCall(c, id);
  // (a queue keeps counting even when empty, so a device that's caught up never waits for a number already used)
  for (const q of queues.values()) while (q.items.length && q.items[0].at < t - 2 * MINUTE) q.items.shift();
}, 10000).unref();
// keeps quiet streams open through the tunnel
setInterval(() => {
  for (const open of streams.values()) for (const res of open) res.write(': ping\n\n');
}, 20000).unref();

// moderation for admins ------------------------------------------------------------------------------------

function reportTarget(r) {
  if (r.kind === 'post') {
    const p = db.get(`${POST_SELECT} WHERE p.id = ?`, r.target);
    return p ? { title: p.title, body: p.body.slice(0, 500), picture: imageUrl(p.image), author: p.author_name, removed: !!p.removed_at, href: `#/n/${p.nook}/p/${p.id}` } : null;
  }
  if (r.kind === 'comment') {
    const c = db.get(`${COMMENT_SELECT} WHERE c.id = ?`, r.target);
    const p = c && db.get('SELECT nook FROM posts WHERE id = ?', c.post_id);
    return c ? { body: c.body.slice(0, 500), author: c.author_name, removed: !!c.removed_at, href: p ? `#/n/${p.nook}/p/${c.post_id}?c=${c.id}` : '' } : null;
  }
  if (r.kind === 'user') {
    const u = db.get('SELECT * FROM users WHERE name = ?', r.target);
    return u ? { author: u.name, body: u.bio, photo: imageUrl(u.photo), banner: imageUrl(u.banner), banned: !!u.banned_at, href: '#/u/' + u.name } : null;
  }
  if (r.kind === 'message') {
    const m = db.get(`${MESSAGE_SELECT} WHERE m.id = ?`, Number(r.target));
    return m ? { body: m.body.slice(0, 500), picture: (mediaOut(m.media) || {}).url, author: m.from_name } : null;
  }
  if (r.kind === 'gmessage') {
    const m = db.get(`${GMESSAGE_SELECT} WHERE m.id = ?`, Number(r.target));
    const g = m && db.get('SELECT name FROM chat_groups WHERE id = ?', m.group_id);
    return m ? { body: m.body.slice(0, 500), picture: (mediaOut(m.media) || {}).url, author: m.from_name || '[deleted]', title: g ? `In the group “${g.name}”` : undefined } : null;
  }
  if (r.kind === 'group') {
    const g = db.get('SELECT * FROM chat_groups WHERE id = ?', r.target);
    const owner = g && db.get("SELECT u.name FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ? AND gm.role = 'owner'", g.id);
    return g ? { title: g.name, author: owner ? owner.name : '[deleted]' } : null;
  }
  return null;
}

route('GET', '/api/admin/reports', () => {
  const rows = db.all(
    'SELECT r.*, u.name AS reporter FROM reports r LEFT JOIN users u ON u.id = r.reporter_id WHERE r.resolved_at IS NULL ORDER BY r.id DESC LIMIT 200'
  );
  const automatic = (r) => !r.reporter_id && /^Automatic check/.test(r.reason);
  return { reports: rows.map((r) => ({ id: r.id, kind: r.kind, target: r.target, reason: r.reason, reporter: r.reporter || '[deleted]', automatic: automatic(r) || undefined, createdAt: r.created_at, item: reportTarget(r) })) };
}, { admin: true });

/** an admin takes something down; its author is told what and why */
function takeDown(kind, id, reason, by = 'A moderator') {
  if (kind === 'post') {
    const p = db.get('SELECT * FROM posts WHERE id = ?', id);
    if (!p || p.removed_at) return false;
    removePost(p, reason);
    if (p.author_id) notify(p.author_id, { kind: 'moderation', text: `${by} removed your post “${p.title.slice(0, 60)}”. Reason: ${reason}. If you think this was a mistake, contact Budgie.`, href: '', symbol: 'gavel', shape: 'pixelCircle' });
    return true;
  }
  if (kind === 'comment') {
    const c = db.get('SELECT * FROM comments WHERE id = ?', id);
    if (!c || c.removed_at) return false;
    db.run("UPDATE comments SET body = '', removed_at = ?, removed_reason = ?, rev = ? WHERE id = ?", now(), reason, db.bump(), c.id);
    if (c.author_id) notify(c.author_id, { kind: 'moderation', text: `${by} removed your comment. Reason: ${reason}. If you think this was a mistake, contact Budgie.`, href: '', symbol: 'gavel', shape: 'pixelCircle' });
    return true;
  }
  if (kind === 'message') {
    const m = db.get('SELECT * FROM messages WHERE id = ?', Number(id));
    if (!m) return false;
    dropMedia(m.media);
    db.run('DELETE FROM messages WHERE id = ?', m.id);
    return true;
  }
  if (kind === 'gmessage') {
    const m = db.get('SELECT * FROM group_messages WHERE id = ?', Number(id));
    if (!m) return false;
    dropMedia(m.media);
    db.run('DELETE FROM group_messages WHERE id = ?', m.id);
    touchGroup(m.group_id);
    if (m.from_id) notify(m.from_id, { kind: 'moderation', text: `A moderator removed one of your group messages. Reason: ${reason}. If you think this was a mistake, contact Budgie.`, href: '#/messages/g/' + m.group_id, symbol: 'gavel', shape: 'pixelCircle' });
    return true;
  }
  if (kind === 'group') {
    // a group's name breaking the rules is put back to a plain one
    const g = db.get('SELECT * FROM chat_groups WHERE id = ?', id);
    if (!g || g.name === 'Group chat') return false;
    db.run("UPDATE chat_groups SET name = 'Group chat', rev = ? WHERE id = ?", db.bump(), g.id);
    groupEvent(g.id, null, 'event', { type: 'renamed', name: 'Group chat', moderator: true });
    return true;
  }
  if (kind === 'user') {
    // a profile is "taken down" by clearing its picture, banner, bio and pronouns (what someone writes or uploads)
    const u = db.get('SELECT * FROM users WHERE name = ?', id);
    if (!u || !(u.photo || u.banner || u.bio || u.pronouns)) return false;
    for (const img of [u.photo, u.photo_gif, u.banner, u.banner_gif]) if (img) db.run('DELETE FROM images WHERE id = ?', img);
    db.run("UPDATE users SET photo = '', photo_gif = '', banner = '', banner_gif = '', bio = '', pronouns = '', rev = ? WHERE id = ?", db.bump(), u.id);
    notify(u.id, { kind: 'moderation', text: `A moderator cleared your profile picture, banner, bio and pronouns. Reason: ${reason}. If you think this was a mistake, contact Budgie.`, href: '#/u/' + u.name, symbol: 'gavel', shape: 'pixelCircle' });
    return true;
  }
  return false;
}

function ban(name, reason, on) {
  const u = db.get('SELECT * FROM users WHERE name = ?', name);
  if (!u) fail(404, 'There’s nobody by that name.');
  if (u.role === 'admin' && on) fail(400, 'Admins can’t be banned. Remove their admin role first.');
  db.run('UPDATE users SET banned_at = ?, ban_reason = ?, rev = ? WHERE id = ?', on ? now() : null, on ? reason : null, db.bump(), u.id);
  for (const t of db.all('SELECT nook FROM nest_team WHERE user_id = ?', u.id)) touchNest(t.nook);
  if (on) {
    db.run('DELETE FROM sessions WHERE user_id = ?', u.id);
    disconnect(u.id);
  }
  return true;
}

route('POST', '/api/admin/resolve', ({ body }) => {
  const r = db.get('SELECT * FROM reports WHERE id = ?', Number(body.id));
  if (!r) fail(404, 'That report is gone.');
  const reason = text(body.reason, 200) || r.reason;
  let resolution = 'dismissed';
  if (body.action === 'remove') {
    takeDown(r.kind, r.target, reason);
    resolution = 'removed: ' + reason;
  } else if (body.action === 'ban' && r.kind === 'user') {
    ban(r.target, reason, true);
    resolution = 'banned: ' + reason;
  }
  // every open report about the same thing closes with it
  db.run('UPDATE reports SET resolved_at = ?, resolution = ? WHERE kind = ? AND target = ? AND resolved_at IS NULL', now(), resolution, r.kind, r.target);
  return { ok: true };
}, { admin: true });

route('POST', '/api/admin/remove', ({ body }) => {
  const reason = text(body.reason, 200) || 'Breaks Budgie’s rules';
  if (!takeDown(body.kind, text(body.id, 60), reason)) fail(404, 'That’s already gone.');
  return { ok: true };
}, { admin: true });

route('POST', '/api/admin/ban', ({ body }) => {
  ban(text(body.name, 40), text(body.reason, 200) || 'Broke Budgie’s rules', body.on !== false);
  return { ok: true };
}, { admin: true });

// images ------------------------------------------------------------------------------------------------------

function serveImage(res, id) {
  const img = /^[A-Za-z0-9_-]{10,40}$/.test(id) ? db.get('SELECT mime, data FROM images WHERE id = ?', id) : null;
  if (!img) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': img.mime,
    'Content-Length': img.data.length,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'",
    'Cross-Origin-Resource-Policy': 'cross-origin',
  });
  res.end(Buffer.from(img.data));
}

// ---- the HTTP side ------------------------------------------------------------------------------------------

function allowedOrigin(origin) {
  if (!origin) return false;
  return CONFIG.origins.some((allowed) => {
    if (allowed.endsWith(':*')) return origin.startsWith(allowed.slice(0, -1)) && /^\d+$/.test(origin.slice(allowed.length - 1));
    return origin === allowed;
  });
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new HttpError(413, 'That’s too big to send.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(value && typeof value === 'object' ? value : {});
      } catch (_) {
        reject(new HttpError(400, 'That request wasn’t valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

function send(res, status, payload) {
  const json = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(json);
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://nook.local');
  const origin = req.headers.origin;
  if (allowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  } else if (origin && req.method !== 'GET') {
    fail(403, 'This site isn’t allowed to use Budgie’s server.');
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  const image = /^\/api\/images\/([^/]+)$/.exec(url.pathname);
  if (image && req.method === 'GET') return serveImage(res, image[1]);

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    const params = {};
    r.keys.forEach((key, i) => (params[key] = m[i + 1]));
    const ctx = {
      params,
      query: Object.fromEntries(url.searchParams),
      ip: req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : 'unknown',
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req, r.body) : {},
    };
    if (r.auth) {
      const who = authenticate(req);
      if (!who) fail(401, 'Please sign in again.', { signedOut: true });
      ctx.user = who.user;
      ctx.session = who.session;
      if (req.method === 'GET') limit('read:' + who.user.id, 240, MINUTE, 'Too many requests. Slow down a little.');
      if (r.admin && who.user.role !== 'admin') fail(403, 'Only admins can do that.');
      // any request means one of their devices is still there (for calls)
      lastSeen.set(who.user.id, now());
    }
    // a stream writes its own answer, and keeps writing
    if (r.stream) return r.handler(Object.assign(ctx, { req, res }));
    return send(res, 200, await r.handler(ctx));
  }
  fail(404, 'There’s nothing here.');
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (error instanceof HttpError) return send(res, error.status, Object.assign({ error: error.message }, error.extra));
    console.error(new Date().toISOString(), req.method, req.url.split('?')[0], error);
    send(res, 500, { error: 'Something went wrong on Budgie’s server. Try again in a moment.' });
  });
});
server.requestTimeout = 30000;
server.headersTimeout = 15000;

if (require.main === module) {
  server.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`Budgie server ${VERSION} on http://${CONFIG.host}:${CONFIG.port}, data in ${CONFIG.data}, allowing ${CONFIG.origins.join(', ')}`);
    pictures.warmUp();
    textmodel.warmUp();
  });
  const stop = () => server.close(() => (db.close(), process.exit(0)));
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

module.exports = { server, db, CONFIG, VERSION, inviteHash, hashPassword, recoveryCode, recoveryHash, takeDown, ban, eraseUser, pictures, textmodel, autoReport, setBadge, badgesOf };
