// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nest chat (Budgie 1.5): channels in every nest, where its members talk as it happens.
 *
 * Every nest has #general (made the first time anyone looks), and its admins (the owner, Budgie's admins, and team
 * members with the "rules" permission) can add channels, give them a topic, rename them, move them up or down, and
 * delete them (up to 20). Anyone can read a channel; joining the nest is what lets you talk there, as long as you're
 * not banned from it. A message is words (up to 2000 characters), a picture or GIF, a GIF from search, or a sticker,
 * checked the way comments are: the word lists, and the text model for what it's sure of, with doubtful ones shown to
 * a moderator. Pictures go through the same check as anywhere else. The nest's team (with "remove") can delete
 * anyone's message; anyone can delete their own, and report anyone else's (the report goes to the nest's team on the
 * Moderation page, and to Budgie's admins).
 *
 * It's live: whoever has a channel open says so now and then (POST …/watch), and gets new messages over the live
 * connection as they're sent; anyone else sees them the next time they look. Messages from someone you blocked are
 * hidden by the app.
 *
 *   GET    /api/nooks/:id/channels                the channels (and whether you can talk, and manage them)
 *   POST   /api/nooks/:id/channels                { name, topic }: a new one (admins)
 *   PATCH  /api/channels/:id                      { name, topic, move: -1 | 1 } (admins)
 *   DELETE /api/channels/:id                      (admins; #general stays)
 *   GET    /api/channels/:id/messages?before=&after=   up to 50, oldest first
 *   POST   /api/channels/:id/messages             { body, image | gif | sticker }
 *   DELETE /api/channel-messages/:id              yours, or anyone's for the nest's team
 *   POST   /api/channels/:id/watch                "I have it open" (for a minute)
 */
'use strict';

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
const MAX_CHANNELS = 20;
const PAGE = 50;

function install(ctx) {
  const { db, route, limit, fail, text, now, MINUTE, HOUR, DAY, hasBlocked, autoReport, REPORT_KINDS, EXPORT_EXTRAS, notify } = ctx;
  const signal = typeof ctx.signal === 'function' ? ctx.signal : () => {};
  const nest = ctx.nest;
  // a server.js from before 1.5 doesn't hand these over: no channels then
  if (!nest || !ctx.vet || !ctx.chatMedia) return {};
  const { vet, checkText, chatMedia, keepMedia, mediaOut } = ctx;
  const dropMedia = ctx.dropMedia || (() => {});

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS nest_channels (
  id INTEGER PRIMARY KEY,
  nook TEXT NOT NULL,
  name TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS nest_channels_name ON nest_channels(nook, name);
CREATE TABLE IF NOT EXISTS channel_messages (
  id INTEGER PRIMARY KEY,
  channel_id INTEGER NOT NULL REFERENCES nest_channels(id) ON DELETE CASCADE,
  from_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS channel_messages_channel ON channel_messages(channel_id, id);
CREATE INDEX IF NOT EXISTS channel_messages_from ON channel_messages(from_id);
`);

  const joined = (userId, nook) => !!db.get('SELECT 1 AS x FROM joins WHERE user_id = ? AND nook = ?', userId, nook);
  const isAdmin = (user, nook) => nest.perms(user, nook).includes('rules');
  const canRemove = (user, nook) => nest.perms(user, nook).includes('remove');
  const nookOf = (params) => {
    const nook = text(params.id, 30);
    nest.row(nook); // (fails if there's no such nest)
    return nook;
  };
  /** a nest's channels, #general made the first time anyone looks */
  function channelsOf(nook) {
    let rows = db.all('SELECT * FROM nest_channels WHERE nook = ? ORDER BY position, id', nook);
    if (!rows.length) {
      db.run("INSERT OR IGNORE INTO nest_channels (nook, name, topic, position, created_at) VALUES (?, 'general', '', 0, ?)", nook, now());
      rows = db.all('SELECT * FROM nest_channels WHERE nook = ? ORDER BY position, id', nook);
    }
    return rows;
  }
  const channelOut = (r) => {
    const last = db.get('SELECT id, created_at FROM channel_messages WHERE channel_id = ? ORDER BY id DESC LIMIT 1', r.id);
    return { id: r.id, name: r.name, topic: r.topic || undefined, lastId: last ? last.id : 0, lastAt: last ? last.created_at : undefined };
  };
  function channel(id) {
    const row = db.get('SELECT * FROM nest_channels WHERE id = ?', Number(id) || 0);
    if (!row) fail(404, 'That channel isn’t there any more.');
    return row;
  }
  const SELECT = 'SELECT m.*, u.name AS from_name FROM channel_messages m JOIN users u ON u.id = m.from_id';
  const messageOut = (r, user) => ({ id: r.id, channel: r.channel_id, from: r.from_name, body: r.body, media: mediaOut(r.media), createdAt: r.created_at, mine: !!user && r.from_id === user.id || undefined });
  const cleanName = (raw) => {
    const name = String(raw || '').trim().toLowerCase().replace(/^#/, '').replace(/[\s_]+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    if (!NAME_RE.test(name)) fail(400, 'A channel’s name is 1–24 small letters, numbers or dashes (like memes or help-desk).', { field: 'name' });
    return name;
  };
  const cleanTopic = (raw) => text(String(raw || '').replace(/\s+/g, ' '), 120);
  /** a name or topic, checked like a nest's own */
  function checkWords(words) {
    if (!words) return;
    const verdict = vet([words], { kind: 'nook' });
    if (verdict.block) fail(422, verdict.block.why, { rule: verdict.block.rule });
  }

  // ---- channels ----------------------------------------------------------------------------------------------

  route('GET', '/api/nooks/:id/channels', ({ user, params }) => {
    const nook = nookOf(params);
    const ban = nest.ban(user.id, nook);
    return {
      channels: channelsOf(nook).map(channelOut),
      member: joined(user.id, nook),
      banned: ban ? { until: ban.until || undefined, reason: ban.reason } : undefined,
      manage: isAdmin(user, nook) || undefined,
      remove: canRemove(user, nook) || undefined,
    };
  });

  route('POST', '/api/nooks/:id/channels', ({ user, params, body }) => {
    const nook = nookOf(params);
    if (!isAdmin(user, nook)) fail(403, `Only n/${nook}’s admins can add channels.`);
    limit('channel-new:' + user.id, 30, HOUR, 'That’s a lot of new channels. Try again in a little while.');
    const name = cleanName(body.name);
    const topic = cleanTopic(body.topic);
    checkWords(name.replace(/-/g, ' '));
    checkWords(topic);
    const rows = channelsOf(nook);
    if (rows.length >= MAX_CHANNELS) fail(400, `A nest can have up to ${MAX_CHANNELS} channels.`);
    if (rows.some((r) => r.name === name)) fail(409, `There’s already #${name} in n/${nook}.`, { field: 'name' });
    const { lastInsertRowid } = db.run('INSERT INTO nest_channels (nook, name, topic, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)', nook, name, topic, rows.length, user.id, now());
    return { channel: channelOut(channel(lastInsertRowid)) };
  });

  route('PATCH', '/api/channels/:id', ({ user, params, body }) => {
    const ch = channel(params.id);
    if (!isAdmin(user, ch.nook)) fail(403, `Only n/${ch.nook}’s admins can change channels.`);
    limit('channel-edit:' + user.id, 120, HOUR);
    const next = { name: ch.name, topic: ch.topic };
    if (body.name != null && ch.name !== 'general') {
      next.name = cleanName(body.name);
      checkWords(next.name.replace(/-/g, ' '));
      if (next.name !== ch.name && db.get('SELECT 1 AS x FROM nest_channels WHERE nook = ? AND name = ?', ch.nook, next.name)) fail(409, `There’s already #${next.name} in n/${ch.nook}.`, { field: 'name' });
    }
    if (body.topic != null) {
      next.topic = cleanTopic(body.topic);
      checkWords(next.topic);
    }
    db.run('UPDATE nest_channels SET name = ?, topic = ? WHERE id = ?', next.name, next.topic, ch.id);
    // up or down the list: it swaps places with its neighbour
    if (body.move === -1 || body.move === 1) {
      const rows = channelsOf(ch.nook);
      const at = rows.findIndex((r) => r.id === ch.id);
      const other = rows[at + body.move];
      if (other)
        db.tx(() => {
          rows.forEach((r, i) => db.run('UPDATE nest_channels SET position = ? WHERE id = ?', i, r.id));
          db.run('UPDATE nest_channels SET position = ? WHERE id = ?', at + body.move, ch.id);
          db.run('UPDATE nest_channels SET position = ? WHERE id = ?', at, other.id);
        });
    }
    return { channels: channelsOf(ch.nook).map(channelOut) };
  });

  route('DELETE', '/api/channels/:id', ({ user, params }) => {
    const ch = channel(params.id);
    if (!isAdmin(user, ch.nook)) fail(403, `Only n/${ch.nook}’s admins can delete channels.`);
    if (ch.name === 'general') fail(400, '#general stays: every nest has one.');
    db.tx(() => {
      for (const r of db.all("SELECT media FROM channel_messages WHERE channel_id = ? AND media != ''", ch.id)) dropMedia(r.media);
      db.run('DELETE FROM channel_messages WHERE channel_id = ?', ch.id);
      db.run('DELETE FROM nest_channels WHERE id = ?', ch.id);
    });
    return { channels: channelsOf(ch.nook).map(channelOut) };
  });

  // ---- messages ----------------------------------------------------------------------------------------------

  route('GET', '/api/channels/:id/messages', ({ user, params, query }) => {
    const ch = channel(params.id);
    const before = Number(query.before) || 0;
    const after = Number(query.after) || 0;
    let rows;
    if (after) rows = db.all(`${SELECT} WHERE m.channel_id = ? AND m.id > ? ORDER BY m.id LIMIT ?`, ch.id, after, PAGE + 1);
    else rows = db.all(`${SELECT} WHERE m.channel_id = ? ${before ? 'AND m.id < ?' : ''} ORDER BY m.id DESC LIMIT ?`, ...[ch.id].concat(before ? [before] : [], [PAGE + 1])).reverse();
    const more = rows.length > PAGE;
    if (more) rows = after ? rows.slice(0, PAGE) : rows.slice(1);
    return { messages: rows.map((r) => messageOut(r, user)), more: !after && more };
  });

  // who has which channel open, for a minute after they last said so
  const watching = new Map(); // channel id -> Map(user id -> until)
  const watchersOf = (channelId) => {
    const w = watching.get(channelId);
    if (!w) return [];
    const t = now();
    for (const [id, until] of w) if (until < t) w.delete(id);
    return [...w.keys()];
  };
  route('POST', '/api/channels/:id/watch', ({ user, params }) => {
    const ch = channel(params.id);
    let w = watching.get(ch.id);
    if (!w) watching.set(ch.id, (w = new Map()));
    w.set(user.id, now() + MINUTE);
    return { ok: true };
  });

  route('POST', '/api/channels/:id/messages', async ({ user, params, body }) => {
    const ch = channel(params.id);
    limit('channel-message:' + user.id, 30, MINUTE, 'You’re sending messages very fast. Slow down a little.');
    if (!joined(user.id, ch.nook)) fail(403, `Join n/${ch.nook} to talk in its channels.`, { join: true });
    const ban = nest.ban(user.id, ch.nook);
    if (ban) fail(403, `You’re banned from n/${ch.nook}, so you can’t talk in its channels. Reason: ${ban.reason}`, { banned: true });
    const words = text(body.body, 2000);
    if (!words && !body.image && !body.gif && body.sticker == null) fail(400, 'Write something first.');
    // checked like a comment: the word lists, then the text model (it stops what it's sure of; a moderator sees the rest)
    const verdict = vet([words], { kind: 'comment' });
    if (verdict.block) fail(422, verdict.block.why, { rule: verdict.block.rule });
    const doubt = words ? await checkText([words], 'comment') : null;
    const attached = await chatMedia(user, body);
    const { lastInsertRowid } = db.run('INSERT INTO channel_messages (channel_id, from_id, body, media, created_at) VALUES (?, ?, ?, ?, ?)', ch.id, user.id, words, keepMedia(attached, user.id), now());
    const id = Number(lastInsertRowid);
    if (verdict.flag) autoReport('chmessage', id, verdict.flag.why);
    else if (attached && attached.review === 'review') autoReport('chmessage', id, 'this picture might be sexual. Please take a look.');
    else if (doubt) autoReport('chmessage', id, doubt);
    const out = messageOut(db.get(`${SELECT} WHERE m.id = ?`, id), user);
    // to everyone with the channel open, now (not to the sender, nor to anyone either of them blocked)
    const live = Object.assign({}, out, { mine: undefined });
    for (const other of watchersOf(ch.id)) if (other !== user.id && !hasBlocked(other, user.id) && !hasBlocked(user.id, other)) signal(other, 'channel', { nook: ch.nook, channel: ch.id, message: live });
    return { message: out };
  }, { body: 6 * 1024 * 1024 });

  route('DELETE', '/api/channel-messages/:id', ({ user, params }) => {
    const m = db.get('SELECT m.*, c.nook, c.id AS cid FROM channel_messages m JOIN nest_channels c ON c.id = m.channel_id WHERE m.id = ?', Number(params.id) || 0);
    if (!m) return { ok: true };
    if (m.from_id !== user.id && !canRemove(user, m.nook)) fail(403, 'You can only delete your own messages.');
    dropMedia(m.media);
    db.run('DELETE FROM channel_messages WHERE id = ?', m.id);
    for (const other of watchersOf(m.cid)) signal(other, 'channel', { nook: m.nook, channel: m.cid, deleted: m.id });
    return { ok: true };
  });

  // ---- reports: on the Moderation page, and taken down from there ----------------------------------------------

  if (REPORT_KINDS)
    REPORT_KINDS.chmessage = {
      label: 'nest chat message',
      target(r) {
        const m = db.get('SELECT m.*, c.nook, c.name AS cname, u.name AS from_name FROM channel_messages m JOIN nest_channels c ON c.id = m.channel_id JOIN users u ON u.id = m.from_id WHERE m.id = ?', Number(r.target) || 0);
        if (!m) return null;
        return { title: `In n/${m.nook} #${m.cname}`, body: m.body || '[a picture, GIF or sticker]', author: m.from_name, href: `#/n/${m.nook}/chat/${m.cname}`, nook: m.nook };
      },
      takeDown(id, reason) {
        const m = db.get('SELECT m.*, c.nook, c.name AS cname FROM channel_messages m JOIN nest_channels c ON c.id = m.channel_id WHERE m.id = ?', Number(id) || 0);
        if (!m) return false;
        dropMedia(m.media);
        db.run('DELETE FROM channel_messages WHERE id = ?', m.id);
        if (notify) notify(m.from_id, { kind: 'mod', text: `A moderator removed your message in n/${m.nook} #${m.cname}: ${reason}`, href: `#/n/${m.nook}/chat/${m.cname}`, symbol: 'gavel', shape: 'pixelCircle' });
        return true;
      },
    };

  // "Export my data": what you said in nests' channels
  if (Array.isArray(EXPORT_EXTRAS))
    EXPORT_EXTRAS.push((user) => ({
      nestChatMessages: db
        .all('SELECT m.*, c.nook, c.name AS cname FROM channel_messages m JOIN nest_channels c ON c.id = m.channel_id WHERE m.from_id = ? ORDER BY m.id', user.id)
        .map((m) => ({ nest: m.nook, channel: m.cname, body: m.body, media: m.media ? JSON.parse(m.media) : undefined, sentAt: new Date(m.created_at).toISOString() })),
    }));

  return { channelsOf };
}

module.exports = { install };
