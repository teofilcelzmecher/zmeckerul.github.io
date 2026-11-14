// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Sticker blasts (Budgie 1.5): tap a sticker in a chat with a friend as fast as you like (or hold it down), and it
 * goes to them as one burst: the sticker and how many times, "×37". It's a line in your chat, and if they have
 * Budgie open it comes flying across their screen as it arrives (their open devices hear it over the live
 * connection; the others with the next check for news).
 *
 *   POST /api/blasts          { to, sticker, count }            a burst, to a friend
 *   GET  /api/blasts/prefs    { on }                            whether friends may blast you
 *   PUT  /api/blasts/prefs    { on }
 *
 * What can be thrown: a sticker in your library, or one someone shared with everyone (a still picture or a GIF;
 * see stickers.js). Only between friends, never with someone
 * blocked either way, and only if they let friends blast them (Settings → Sticker blasts, on unless they turn it
 * off). A burst counts as high as you can tap (there's no top to it, on purpose), and there can be lots of them;
 * only a flood is stopped: from you, 60 bursts a minute and 600 an hour, 30 a minute to one friend, and to anyone,
 * 600 an hour. Their phone gets a notification for the first burst of a run, and not again for two minutes.
 */
'use strict';

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;

function install(ctx) {
  const { db, route, limit, fail, text, now, MINUTE, HOUR, friendship, hasBlocked, push, modules, EXPORT_EXTRAS } = ctx;
  const signal = typeof ctx.signal === 'function' ? ctx.signal : () => {};

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS blast_prefs (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  off INTEGER NOT NULL DEFAULT 0
);`);
  const blastsOn = (userId) => !(db.get('SELECT off FROM blast_prefs WHERE user_id = ?', userId) || {}).off;

  route('POST', '/api/blasts', ({ user, body }) => {
    limit('blast:' + user.id, 60, MINUTE, 'That’s a lot of blasts. Give your friends a moment!');
    limit('blast-hour:' + user.id, 600, HOUR, 'That’s a lot of blasts for one hour. Try again a little later.');
    const name = text(body.to, 40).replace(/^u\//i, '');
    const other = NAME_RE.test(name) ? db.get('SELECT * FROM users WHERE name = ?', name) : null;
    if (!other || other.banned_at) fail(404, 'There’s nobody by that name.');
    if (other.id === user.id) fail(400, 'Blast a friend, not yourself.');
    const f = friendship(user.id, other.id);
    // being blocked isn't said as such, just as not being friends (as everywhere else on Budgie)
    if (!f || f.status !== 'friends' || hasBlocked(user.id, other.id) || hasBlocked(other.id, user.id)) fail(403, 'You can only blast friends.');
    if (!blastsOn(other.id)) fail(403, `u/${other.name} isn’t taking sticker blasts right now.`, { off: true });
    // as many as were thrown, however many that is (any whole number a computer counts exactly)
    const thrown = Math.floor(Number(body.count));
    const count = Number.isSafeInteger(thrown) && thrown > 0 ? thrown : 1;
    if (body.sticker == null || !modules.stickers || !modules.stickers.usable) fail(400, 'Pick a sticker to blast.');
    const row = modules.stickers.usable(user, String(body.sticker));
    // (counted once it's a real burst: a refused one doesn't use any up)
    limit(`blast-to:${user.id}:${other.id}`, 30, MINUTE, `Give u/${other.name} a moment to catch up!`);
    limit('blast-in:' + other.id, 600, HOUR, `u/${other.name} has had a lot of blasts this hour. Try again later.`);
    const what = { sticker: row.id, name: row.name || undefined, gif: row.still ? true : undefined };
    const t = now();
    // a notification for the first burst of a run, not one for every burst
    const lately = db.get("SELECT id FROM messages WHERE from_id = ? AND to_id = ? AND kind = 'blast' AND created_at > ? LIMIT 1", user.id, other.id, t - 2 * MINUTE);
    const { lastInsertRowid } = db.run("INSERT INTO messages (from_id, to_id, kind, body, created_at) VALUES (?, ?, 'blast', ?, ?)", user.id, other.id, JSON.stringify(Object.assign({ count }, what)), t);
    const id = Number(lastInsertRowid);
    signal(other.id, 'blast', Object.assign({ from: user.name, count, id, at: t }, what));
    if (!lately)
      push.send([other.id], {
        kind: 'message',
        title: 'u/' + user.name,
        body: count > 1 ? `Blasted you with ${count.toLocaleString('en')} stickers` : 'Blasted you with a sticker',
        href: '#/messages/' + encodeURIComponent(user.name),
        tag: 'chat-' + user.name,
      });
    if (modules.stats && modules.stats.add) modules.stats.add(user.id, 'blasts.sent');
    return { ok: true, id, count };
  });

  route('GET', '/api/blasts/prefs', ({ user }) => ({ on: blastsOn(user.id) }));
  route('PUT', '/api/blasts/prefs', ({ user, body }) => {
    const on = body.on !== false;
    db.run('INSERT INTO blast_prefs (user_id, off) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET off = excluded.off', user.id, on ? 0 : 1);
    return { on };
  });

  // "Export my data": the setting (the blasts themselves are in the chats, with the messages)
  if (Array.isArray(EXPORT_EXTRAS)) EXPORT_EXTRAS.push((user) => ({ stickerBlasts: { friendsMayBlastMe: blastsOn(user.id) } }));

  return { blastsOn };
}

module.exports = { install };
