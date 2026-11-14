// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Stickers and custom emojis (Budgie 1.4).
 *
 * Anyone can make them from a picture: an emoji is 128 × 128 and goes inside words (`<:name:ID>` in a message,
 * comment or post: just text, so moderation reads it like any other), and a sticker is up to 512 × 512 and goes
 * on its own in a chat, big and without a bubble. A still picture is cut and sized on the device (the crop tool,
 * a shape, an outline) and arrives here as a PNG or JPEG; a GIF arrives whole, with the part to keep, and is cut,
 * sized and re-made here, frame by frame, in a worker thread (omggif and pngjs, already in vendor/), so it can
 * keep moving. Either way the result goes through the same nudity check as profile pictures, and anything the
 * check is unsure of is refused rather than sent around.
 *
 * Each person has a library: what they made, and what they saved from others (tap a sticker or an emoji →
 * "Save"). Up to 50 emojis and 50 stickers in it. Deleting one you made takes it out of every library; old
 * messages then show its name in colons, or "[sticker]". Stickers can be reported, and a moderator taking one
 * down does the same, everywhere at once.
 *
 *   tables   stickers (what was made), sticker_library (who keeps what, under which name)
 *   routes   GET /api/stickers (your library), POST /api/stickers (make one), GET /api/stickers/:id (one, to save),
 *            POST /api/stickers/:id/save, PATCH /api/stickers/:id (rename), DELETE /api/stickers/:id,
 *            GET /api/stickers/:id/image[?still=1] (the picture itself, for anyone: like other pictures)
 *   chats    a message with { sticker: id } (from your library) is a sticker message
 *   sharing  (1.5) one you made can be shared with everyone (the app's switch for it is on when you make one, and
 *            you can change it): shared ones can be found in Browse (GET /api/stickers/browse: popular, newest, or
 *            by name), saved from there, and thrown in a sticker blast without saving them first. One made before
 *            1.5 stays unshared until its maker shares it
 *   reports  kind 'sticker' (emojis too), shown on the Moderation page, taken down from there
 *   others   madeBy(userId) for the 'stickers' achievement; exportFor(userId) for "Export my data"
 */
'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const VENDOR = path.join(__dirname, 'vendor', 'node_modules');
const lib = (name) => require(path.join(VENDOR, name));

// ---- re-making a GIF: the part to keep, at the size it's kept at, still moving (runs in a worker) -----------

/** a small, steady fingerprint of a frame, to spot frames that look just like the one before */
function hashOf(bytes) {
  let h = 2166136261;
  for (let i = 0; i < bytes.length; i += 3) h = Math.imul(h ^ bytes[i], 16777619);
  return h >>> 0;
}

/**
 * the square part of a picture to keep (crop, in its own pixels, which may reach past its edges: that part is
 * see-through), made `side` pixels across. Each pixel averages up to 4 × 4 points of the picture, weighted by how
 * opaque they are, so edges stay clean when it's made smaller.
 */
function resample(src, W, H, crop, side, out) {
  const k = Math.max(1, Math.min(4, Math.ceil(crop.sw / side)));
  const step = crop.sw / side / k;
  const n = k * k;
  for (let oy = 0, o = 0; oy < side; oy++) {
    for (let ox = 0; ox < side; ox++, o += 4) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < k; j++) {
        const yy = Math.floor(crop.sy + (oy * k + j + 0.5) * step);
        if (yy < 0 || yy >= H) continue;
        for (let i = 0; i < k; i++) {
          const xx = Math.floor(crop.sx + (ox * k + i + 0.5) * step);
          if (xx < 0 || xx >= W) continue;
          const p = (yy * W + xx) * 4;
          const al = src[p + 3];
          if (!al) continue;
          r += src[p] * al;
          g += src[p + 1] * al;
          b += src[p + 2] * al;
          a += al;
        }
      }
      if (a) {
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
      } else out[o] = out[o + 1] = out[o + 2] = 0;
      out[o + 3] = a / n;
    }
  }
}

// colours are counted in 32 levels a channel (15 bits), and a GIF can hold 256 of them: median cut picks which
const bin15 = (r, g, b) => ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
const expand = (v) => (v << 3) | 4;
function palette(hist, max) {
  const bins = [];
  for (let i = 0; i < hist.length; i++) if (hist[i]) bins.push(i);
  const map = new Int16Array(32768).fill(-1);
  const colour = (list) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of list) {
      const w = hist[c];
      r += expand(c >> 10) * w;
      g += expand((c >> 5) & 31) * w;
      b += expand(c & 31) * w;
      n += w;
    }
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  };
  let boxes = [bins];
  if (bins.length > max) {
    const part = (c, axis) => (axis === 0 ? c >> 10 : axis === 1 ? (c >> 5) & 31 : c & 31);
    while (boxes.length < max) {
      // the box with the most colour in the widest spread is split at its middle, along that spread
      let best = -1, bestScore = 0, bestAxis = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        let count = 0;
        const lo = [31, 31, 31], hi = [0, 0, 0];
        for (const c of box) {
          count += hist[c];
          for (let a = 0; a < 3; a++) {
            const v = part(c, a);
            if (v < lo[a]) lo[a] = v;
            if (v > hi[a]) hi[a] = v;
          }
        }
        const ranges = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
        const axis = ranges.indexOf(Math.max(...ranges));
        const score = ranges[axis] * Math.sqrt(count);
        if (score > bestScore) [best, bestScore, bestAxis] = [i, score, axis];
      });
      if (best < 0) break;
      const box = boxes[best].sort((x, y) => part(x, bestAxis) - part(y, bestAxis));
      let total = 0;
      for (const c of box) total += hist[c];
      let acc = 0, cut = 1;
      for (let i = 0; i < box.length - 1; i++) {
        acc += hist[box[i]];
        cut = i + 1;
        if (acc >= total / 2) break;
      }
      boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
  } else boxes = bins.map((c) => [c]);
  const colours = boxes.map(colour);
  boxes.forEach((box, i) => box.forEach((c) => (map[c] = i)));
  return { colours, map };
}

/**
 * the GIF, cut to `crop` and made `side` pixels square: { gif, still (a PNG of its first frame), side, frames }.
 * Frames that look the same as the one before are joined, and a long GIF keeps every second (or third…) frame.
 */
function remakeGif(bytes, crop, { side, maxFrames, budget, cap }) {
  const { GifReader, GifWriter } = lib('omggif');
  let reader;
  try {
    reader = new GifReader(Buffer.from(bytes));
  } catch (_) {
    throw Object.assign(new Error('That GIF couldn’t be read. Try another one.'), { status: 400 });
  }
  const W = reader.width, H = reader.height, count = reader.numFrames();
  if (!count || !W || !H) throw Object.assign(new Error('That GIF looks empty.'), { status: 400 });
  if (W * H * count > 160e6 || count > 1000) throw Object.assign(new Error('That GIF is too long or too large. Try a shorter one.'), { status: 413 });
  // every frame must fit inside the GIF's own picture: the decoder trusts each frame's size and makes room for all of
  // it, so a tiny file that claims one enormous frame would take gigabytes of memory
  checkFrames(reader, W, H);
  // it fits the budget of pixels a sticker may have, keeping fewer frames before it gets smaller
  let every = Math.max(1, Math.ceil(count / maxFrames));
  let size = side;
  const fits = () => size * size * Math.ceil(count / every) <= budget;
  while (!fits() && every < 4) every++;
  while (!fits() && size > 96) size = Math.round(size * 0.85);
  for (let attempt = 0; attempt < 4; attempt++) {
    const made = attemptGif(reader, W, H, count, crop, size, every, GifWriter);
    if (made.gif.length <= cap) return made;
    // too heavy for a chat: fewer frames first, then smaller
    if (every < 3) every++;
    else size = Math.max(64, Math.round(size * 0.8));
  }
  throw Object.assign(new Error('That GIF is still too big once it’s made smaller. Try a shorter one.'), { status: 413 });
}

/** refuses a GIF whose frames don't fit inside its own picture, or add up to too many pixels (shared with pictures.js) */
function checkFrames(reader, W, H, budget = 160e6) {
  let pixels = 0;
  for (let i = 0; i < reader.numFrames(); i++) {
    const f = reader.frameInfo(i);
    if (f.x + f.width > W || f.y + f.height > H || f.width < 1 || f.height < 1) throw Object.assign(new Error('That GIF looks broken. Try another one.'), { status: 400 });
    pixels += f.width * f.height;
    if (pixels > budget) throw Object.assign(new Error('That GIF is too long or too large. Try a shorter one.'), { status: 413 });
  }
}

function attemptGif(reader, W, H, count, crop, side, every, GifWriter) {
  const canvas = new Uint8ClampedArray(W * H * 4);
  const frame = new Uint8ClampedArray(side * side * 4);
  // composes each frame onto the one before, as a viewer would, and hands over the kept ones
  const play = (each) => {
    canvas.fill(0);
    for (let i = 0; i < count; i++) {
      const info = reader.frameInfo(i);
      const backup = info.disposal === 3 ? canvas.slice() : null;
      reader.decodeAndBlitFrameRGBA(i, canvas);
      // a delay of 0 or 1 hundredths of a second is drawn as 10 by browsers
      const delay = info.delay || 0;
      each(i, delay < 2 ? 10 : delay);
      if (info.disposal === 2) {
        for (let y = info.y; y < Math.min(H, info.y + info.height); y++) canvas.fill(0, (y * W + info.x) * 4, (y * W + Math.min(W, info.x + info.width)) * 4);
      } else if (backup) canvas.set(backup);
    }
  };
  // first time through: which frames are kept, how long each shows, and which colours they use
  const hist = new Uint32Array(32768);
  const kept = []; // { at (the source frame), delay }
  let transparent = false;
  let still = null;
  let lastHash = -1;
  play((i, delay) => {
    if (i % every && kept.length) {
      kept[kept.length - 1].delay += delay;
      return;
    }
    resample(canvas, W, H, crop, side, frame);
    for (let p = 0; p < frame.length; p += 4) {
      if (frame[p + 3] < 128) {
        frame[p] = frame[p + 1] = frame[p + 2] = frame[p + 3] = 0;
        transparent = true;
      } else {
        frame[p + 3] = 255;
        hist[bin15(frame[p], frame[p + 1], frame[p + 2])]++;
      }
    }
    if (!still) {
      // the still keeps soft edges: it's a PNG
      still = new Uint8ClampedArray(frame.length);
      resample(canvas, W, H, crop, side, still);
    }
    const h = hashOf(frame);
    if (h === lastHash && kept.length) kept[kept.length - 1].delay += delay;
    else kept.push({ at: i, delay });
    lastHash = h;
  });
  const { colours, map } = palette(hist, transparent ? 255 : 256);
  const clear = colours.length;
  const used = colours.length + (transparent ? 1 : 0);
  let size2 = 2;
  while (size2 < used) size2 *= 2;
  const pal = colours.concat(new Array(size2 - colours.length).fill(0));
  // second time through: each kept frame, in those colours
  let buf = Buffer.alloc(Math.ceil(side * side * 1.7 + 4096) * Math.min(kept.length, 8) + 8192);
  const writer = new GifWriter(buf, side, side, { loop: 0, palette: pal });
  const indices = new Uint8Array(side * side);
  const at = new Map(kept.map((k) => [k.at, k]));
  play((i) => {
    const k = at.get(i);
    if (!k) return;
    resample(canvas, W, H, crop, side, frame);
    for (let p = 0, q = 0; q < indices.length; p += 4, q++) indices[q] = frame[p + 3] < 128 ? clear : map[bin15(frame[p], frame[p + 1], frame[p + 2])];
    // room for the worst a frame can take, so nothing is ever written past the end
    const need = writer.getOutputBufferPosition() + Math.ceil(side * side * 1.7) + 4096;
    if (need > buf.length) {
      const bigger = Buffer.alloc(Math.max(need, buf.length * 2));
      buf.copy(bigger, 0, 0, writer.getOutputBufferPosition());
      buf = bigger;
      writer.setOutputBuffer(buf);
    }
    writer.addFrame(0, 0, side, side, indices, { delay: Math.min(65535, k.delay), disposal: transparent ? 2 : 1, transparent: transparent ? clear : undefined });
  });
  const length = writer.end();
  const { PNG } = lib('pngjs');
  const png = new PNG({ width: side, height: side });
  png.data = Buffer.from(still.buffer);
  return { gif: Buffer.from(writer.getOutputBuffer().subarray(0, length)), still: PNG.sync.write(png), side, frames: kept.length };
}

if (!isMainThread && workerData && workerData.stickerGif) {
  try {
    const made = remakeGif(workerData.bytes, workerData.crop, workerData.options);
    parentPort.postMessage({ gif: made.gif, still: made.still, side: made.side, frames: made.frames });
  } catch (error) {
    parentPort.postMessage({ error: error.message, status: error.status || 500 });
  }
}

// ---- the module ------------------------------------------------------------------------------------------------

const KINDS = ['emoji', 'sticker'];
const MAX = { emoji: 50, sticker: 50 }; // in a library, made and saved together
const SIDE = { emoji: 128, sticker: 512 };
// the picture as it arrives: a still made on the device, or a GIF to be re-made here
const STILL_BYTES = { emoji: 300 * 1024, sticker: 1536 * 1024 };
const GIF_IN = 8 * 1024 * 1024;
// what a re-made GIF may come to (it goes into chats, so it's kept light)
const GIF_OUT = {
  emoji: { side: 128, maxFrames: 120, budget: 128 * 128 * 120, cap: 1024 * 1024 },
  sticker: { side: 512, maxFrames: 100, budget: 512 * 512 * 50, cap: 3 * 1024 * 1024 },
};
const EMOJI_NAME = /^[a-z0-9_]{2,32}$/;
// ids are letters a word can't be made of (no vowels, no f, no digits that read as letters), so the word lists
// never mistake one in `<:name:ID>` for a word
const ID_ALPHABET = 'BCDGHJKLMNPQRSTVWXZbcdghjklmnpqrstvwxz26';
const ID_RE = /^[A-Za-z0-9]{6,16}$/;
const newId = () => {
  let id = '';
  for (const b of crypto.randomBytes(10)) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
};
const imagePath = (id) => `/api/stickers/${id}/image`;

/** a PNG's or JPEG's size, from its header */
function sizeOf(bytes, mime) {
  if (mime === 'image/png' && bytes.length > 24) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (mime === 'image/jpeg') {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const m = bytes[i + 1];
      if (m === 0xff) {
        i++;
        continue;
      }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) {
        i += 2;
        continue;
      }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: bytes.readUInt16BE(i + 7), height: bytes.readUInt16BE(i + 5) };
      i += 2 + bytes.readUInt16BE(i + 2);
    }
  }
  return null;
}

function install(ctx) {
  const { db, route, limit, fail, text, notify, now, MINUTE, HOUR, DAY, readImage, saveImage, hasBlocked, pictures, textmodel, autoReport, CLI, modules, serving } = ctx;
  const mod = require('../js/moderation.js');

  db.raw.exec(`
    CREATE TABLE IF NOT EXISTS stickers (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image TEXT NOT NULL,
      still TEXT NOT NULL DEFAULT '',
      width INTEGER NOT NULL DEFAULT 0,
      height INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      removed_at INTEGER,
      removed_reason TEXT
    );
    CREATE INDEX IF NOT EXISTS stickers_owner ON stickers(owner_id);
    CREATE TABLE IF NOT EXISTS sticker_library (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sticker_id TEXT NOT NULL REFERENCES stickers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      added_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, sticker_id)
    );
    CREATE INDEX IF NOT EXISTS sticker_library_sticker ON sticker_library(sticker_id);
  `);

  // 1.5: when its maker shared it with everyone (none: only in libraries and chats)
  if (!db.raw.prepare('PRAGMA table_info(stickers)').all().some((c) => c.name === 'shared_at')) db.raw.exec('ALTER TABLE stickers ADD COLUMN shared_at INTEGER');
  db.raw.exec('CREATE INDEX IF NOT EXISTS stickers_shared ON stickers(shared_at)');

  const stickerById = (id) => (ID_RE.test(String(id || '')) ? db.get('SELECT * FROM stickers WHERE id = ?', String(id)) : null);
  const ownerName = (row) => {
    const u = db.get('SELECT name, banned_at FROM users WHERE id = ?', row.owner_id);
    return u && !u.banned_at ? u.name : undefined;
  };
  const isGif = (row) => !!row.still;
  /** a sticker as the app sees it; `name` is what this person calls it in their library, if they keep it */
  function out(row, viewer, name) {
    const by = ownerName(row);
    const hidden = viewer && by && viewer.id !== row.owner_id && (hasBlocked(row.owner_id, viewer.id) || hasBlocked(viewer.id, row.owner_id));
    return {
      id: row.id, kind: row.kind, name: name != null ? name : row.name, url: imagePath(row.id), still: isGif(row) ? imagePath(row.id) + '?still=1' : undefined,
      gif: isGif(row) || undefined, width: row.width, height: row.height, by: hidden ? undefined : by, mine: viewer ? row.owner_id === viewer.id || undefined : undefined, createdAt: row.created_at,
      shared: row.shared_at ? true : undefined,
    };
  }
  const libraryOf = (userId) =>
    db.all('SELECT s.*, l.name AS kept_as, l.added_at FROM sticker_library l JOIN stickers s ON s.id = l.sticker_id WHERE l.user_id = ? AND s.removed_at IS NULL ORDER BY l.added_at DESC', userId);
  const kept = (userId, id) => db.get('SELECT * FROM sticker_library WHERE user_id = ? AND sticker_id = ?', userId, id) || null;
  const countOf = (userId, kind) => db.get('SELECT COUNT(*) AS n FROM sticker_library l JOIN stickers s ON s.id = l.sticker_id WHERE l.user_id = ? AND l.kind = ? AND s.removed_at IS NULL', userId, kind).n;
  const nameTaken = (userId, name, except = '') =>
    !!db.get("SELECT 1 AS x FROM sticker_library WHERE user_id = ? AND kind = 'emoji' AND name = ? AND sticker_id != ?", userId, name, except);
  const room = (userId, kind) => countOf(userId, kind) < MAX[kind] || fail(400, kind === 'emoji' ? `Your emojis are full (${MAX.emoji}). Delete one to make room.` : `Your stickers are full (${MAX.sticker}). Delete one to make room.`);

  // ---- names: emojis have a short one in colons; a sticker's is optional, in any words ----------------------

  /** a name, checked by the word lists and the text model like a username: returns { name, doubt } */
  async function nameFor(kind, raw) {
    let name;
    if (kind === 'emoji') {
      name = text(String(raw || ''), 40).toLowerCase().replace(/[\s-]+/g, '_').replace(/^:+|:+$/g, '');
      if (!EMOJI_NAME.test(name)) fail(400, 'An emoji’s name is 2–32 small letters, numbers or underscores (like party_budgie).', { field: 'name' });
    } else {
      name = text(String(raw || '').replace(/\p{C}/gu, ''), 40).replace(/\s+/g, ' ');
      if (name.length > 32) fail(400, 'A sticker’s name is at most 32 characters.', { field: 'name' });
      if (!name) return { name: '', doubt: null };
    }
    const words = name.replace(/_/g, ' ');
    const verdict = mod.check([words], { kind: 'profile' });
    if (verdict.block) fail(422, verdict.block.why, { rule: verdict.block.rule, field: 'name' });
    if (verdict.strong) fail(422, 'Keep swearing out of names.', { rule: 'Keep names clean', field: 'name' });
    const judged = textmodel.judge(await textmodel.scoreName(name), 'public');
    if (judged.verdict === 'block') fail(422, 'That name reads as hurtful or rude to an automatic check. Try another one.', { field: 'name', rule: mod.RULES.harassment });
    return { name, doubt: judged.verdict === 'review' ? textmodel.reason(judged).replace('this might be', 'this sticker’s name might be') : null };
  }
  /** a free name in someone's library, for an emoji saved from someone else: party, then party2, party3… */
  function freeName(userId, name) {
    if (!nameTaken(userId, name)) return name;
    for (let n = 2; n < 100; n++) {
      const next = name.slice(0, 32 - String(n).length) + n;
      if (!nameTaken(userId, next)) return next;
    }
    return name.slice(0, 22) + '_' + crypto.randomBytes(4).toString('hex');
  }

  // ---- pictures ---------------------------------------------------------------------------------------------

  /** the nudity check, as strict as for profile pictures: anything it isn't sure is fine is refused */
  async function checked(img, kind) {
    let score;
    try {
      score = await pictures.score(img.bytes, img.mime);
    } catch (error) {
      if (error.unreadable) fail(400, 'That picture couldn’t be read. Try another one.');
      console.error('sticker picture check failed:', error.message);
      fail(503, 'Pictures can’t be checked right now, so stickers can’t be made. Try again in a minute.');
    }
    if (pictures.verdict(score, 'profile') !== 'ok') {
      fail(422, `This picture might not be OK for everyone on Budgie (an automatic check flagged it), so it can’t be ${kind === 'emoji' ? 'an emoji' : 'a sticker'}. Try a different one.`, { rule: 'No sexual content' });
    }
  }

  // GIFs are re-made one at a time, each in its own worker thread, so the server keeps answering meanwhile
  let line = Promise.resolve();
  let waiting = 0;
  function remake(bytes, crop, kind) {
    // an emoji is always 128 across; a sticker is never made bigger than the part of the GIF it's cut from
    const options = Object.assign({}, GIF_OUT[kind], kind === 'sticker' ? { side: Math.max(64, Math.min(GIF_OUT.sticker.side, Math.round(crop.sw))) } : {});
    if (waiting >= 4) fail(503, 'Lots of stickers are being made right now. Try again in a minute.');
    waiting++;
    const job = line.then(
      () =>
        new Promise((resolve, reject) => {
          const worker = new Worker(__filename, { workerData: { stickerGif: true, bytes, crop, options }, resourceLimits: { maxOldGenerationSizeMb: 256 } });
          const timer = setTimeout(() => {
            worker.terminate();
            reject(Object.assign(new Error('That GIF took too long to make. Try a shorter one.'), { status: 413 }));
          }, 45000);
          worker.once('message', (m) => {
            clearTimeout(timer);
            worker.terminate();
            if (m.error) reject(Object.assign(new Error(m.error), { status: m.status }));
            else resolve(m);
          });
          worker.once('error', (error) => {
            clearTimeout(timer);
            reject(error);
          });
        })
    );
    line = job.catch(() => {}).finally(() => waiting--);
    return job.catch((error) => {
      if (error.status && error.status < 500) fail(error.status, error.message);
      console.error('sticker GIF:', error.message);
      fail(500, 'That GIF couldn’t be made into a sticker. Try another one.');
    });
  }

  /** the part of a GIF to keep, as the crop tool picked it: a square, at most a little past its edges */
  function cropOf(c, width, height) {
    const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : NaN);
    let { sx, sy, sw, sh } = { sx: n(c && c.sx), sy: n(c && c.sy), sw: n(c && c.sw), sh: n(c && c.sh) };
    if (![sx, sy, sw, sh].every(Number.isFinite) || sw <= 0 || sh <= 0) {
      // no crop: the whole GIF, in the middle of a square
      sw = sh = Math.max(width, height);
      sx = (width - sw) / 2;
      sy = (height - sh) / 2;
    }
    const side = Math.max(sw, sh);
    if (side < 8) fail(400, 'That part of the picture is too small. Zoom out a little.');
    if (side > Math.max(width, height) * 3) fail(400, 'That part of the picture is mostly empty. Zoom in a little.');
    sx += (sw - side) / 2;
    sy += (sh - side) / 2;
    return { sx, sy, sw: side, sh: side };
  }

  // ---- your library -----------------------------------------------------------------------------------------

  route('GET', '/api/stickers', ({ user }) => {
    const rows = libraryOf(user.id);
    const list = (kind) => rows.filter((r) => r.kind === kind).map((r) => out(r, user, r.kept_as));
    return { emojis: list('emoji'), stickers: list('sticker'), max: MAX };
  });

  // making one: { kind, name, image (a PNG or JPEG data URL, already cut) } or { kind, name, gif, crop }
  route('POST', '/api/stickers', async ({ user, body }) => {
    const kind = KINDS.includes(body.kind) ? body.kind : fail(400, 'Make an emoji or a sticker.');
    limit('sticker-new:' + user.id, 20, HOUR, 'That’s a lot of new stickers for one hour. Try again in a little while.');
    limit('sticker-new-day:' + user.id, 60, DAY, 'That’s a lot of new stickers for one day. Try again tomorrow.');
    room(user.id, kind);
    const { name, doubt } = await nameFor(kind, body.name);
    if (kind === 'emoji' && nameTaken(user.id, name)) fail(409, `You already have an emoji called :${name}:. Pick another name.`, { field: 'name' });
    let main, still = null, width, height;
    if (body.gif) {
      const source = readImage(body.gif, GIF_IN, { gif: 'only', maxSide: 2048 });
      const w = source.bytes.readUInt16LE(6), h = source.bytes.readUInt16LE(8);
      const made = await remake(Uint8Array.from(source.bytes), cropOf(body.crop, w, h), kind);
      main = { bytes: Buffer.from(made.gif), mime: 'image/gif' };
      still = { bytes: Buffer.from(made.still), mime: 'image/png' };
      width = height = made.side;
      // the tests mark pictures in their last bytes; a re-made GIF keeps the original's say
      if (process.env.NOOK_PICTURE_CHECK === 'test') await checked(source, kind);
    } else {
      main = readImage(body.image, STILL_BYTES[kind], { gif: false });
      const size = sizeOf(main.bytes, main.mime);
      if (!size || !size.width || !size.height) fail(400, 'That picture looks broken. Try another one.');
      if (size.width > SIDE[kind] || size.height > SIDE[kind]) fail(400, `${kind === 'emoji' ? 'Emojis' : 'Stickers'} are at most ${SIDE[kind]}×${SIDE[kind]} pixels.`);
      if (size.width < 16 || size.height < 16) fail(400, 'That picture is too small.');
      ({ width, height } = size);
    }
    await checked(main, kind);
    // room is looked at again: two made at once mustn't both squeeze into the last place
    const id = db.tx(() => {
      room(user.id, kind);
      if (kind === 'emoji' && nameTaken(user.id, name)) fail(409, `You already have an emoji called :${name}:. Pick another name.`, { field: 'name' });
      let sid = newId();
      while (stickerById(sid)) sid = newId();
      const image = saveImage(main, user.id);
      const stillId = still ? saveImage(still, user.id) : '';
      const t = now();
      db.run('INSERT INTO stickers (id, kind, name, owner_id, image, still, width, height, created_at, shared_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', sid, kind, name, user.id, image, stillId, width, height, t, body.shared === true ? t : null);
      db.run('INSERT INTO sticker_library (user_id, sticker_id, kind, name, added_at) VALUES (?, ?, ?, ?, ?)', user.id, sid, kind, name, t);
      return sid;
    });
    if (doubt) autoReport('sticker', id, doubt);
    let unlocked;
    try {
      if (modules.achievements && modules.achievements.check) unlocked = modules.achievements.check(user.id);
    } catch (error) {
      console.error('achievements after a sticker:', error.message);
    }
    return { sticker: out(stickerById(id), user, name), unlocked: Array.isArray(unlocked) && unlocked.length ? unlocked : undefined };
  }, { body: 12 * 1024 * 1024 });

  // ---- Browse (1.5): what people shared, the most saved first, the newest, or by name -------------------------

  const PAGE = 48;
  route('GET', '/api/stickers/browse', ({ user, query }) => {
    limit('sticker-browse:' + user.id, 240, HOUR, 'That’s a lot of browsing. Try again in a little while.');
    const kind = query.kind === 'emoji' ? 'emoji' : 'sticker';
    const sort = query.sort === 'new' ? 'new' : 'popular';
    const page = Math.max(0, Math.min(50, Math.floor(Number(query.page)) || 0));
    const q = text(String(query.q || ''), 32).toLowerCase();
    const like = q ? '%' + q.replace(/[\\%_]/g, (c) => '\\' + c) + '%' : null;
    // what someone who blocked you made (or someone you blocked) isn't shown, nor a banned maker's
    const rows = db.all(
      `SELECT s.*, (SELECT COUNT(*) FROM sticker_library l WHERE l.sticker_id = s.id AND l.user_id != s.owner_id) AS saves,
              (SELECT 1 FROM sticker_library l WHERE l.sticker_id = s.id AND l.user_id = ?) AS have
         FROM stickers s JOIN users u ON u.id = s.owner_id
        WHERE s.kind = ? AND s.shared_at IS NOT NULL AND s.removed_at IS NULL AND u.banned_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.user_id = s.owner_id AND b.blocked_id = ?) OR (b.user_id = ? AND b.blocked_id = s.owner_id))
          ${like ? "AND lower(s.name) LIKE ? ESCAPE '\\'" : ''}
        ORDER BY ${sort === 'new' ? 's.shared_at DESC' : 'saves DESC, s.shared_at DESC'}
        LIMIT ? OFFSET ?`,
      ...[user.id, kind, user.id, user.id].concat(like ? [like] : [], [PAGE + 1, page * PAGE])
    );
    return {
      stickers: rows.slice(0, PAGE).map((r) => Object.assign(out(r, user), { saves: r.saves, saved: !!r.have || undefined })),
      more: rows.length > PAGE,
    };
  });

  /** one that can be thrown or sent by this person: kept in their library, or shared by its maker (1.5) */
  function usable(user, id) {
    const row = stickerById(id);
    if (!row || row.removed_at || row.kind !== 'sticker') fail(404, 'That sticker isn’t there any more.');
    if (kept(user.id, row.id)) return row;
    if (!row.shared_at || hasBlocked(row.owner_id, user.id) || hasBlocked(user.id, row.owner_id)) fail(403, 'Save that sticker to your library first.');
    return row;
  }

  // one sticker, for the sheet that offers to save it
  route('GET', '/api/stickers/:id', ({ user, params }) => {
    const row = stickerById(params.id);
    if (!row || row.removed_at) fail(404, 'That one isn’t there any more.');
    const k = kept(user.id, row.id);
    return { sticker: out(row, user, k ? k.name : undefined), saved: !!k };
  });

  route('POST', '/api/stickers/:id/save', ({ user, params }) => {
    limit('sticker-save:' + user.id, 120, HOUR, 'That’s a lot of saving. Try again in a little while.');
    const row = stickerById(params.id);
    if (!row || row.removed_at) fail(404, 'That one isn’t there any more.');
    // someone who blocked you keeps what they make to themselves
    if (row.owner_id !== user.id && hasBlocked(row.owner_id, user.id)) fail(403, 'You can’t save this one.');
    const had = kept(user.id, row.id);
    if (had) return { sticker: out(row, user, had.name), saved: true };
    room(user.id, row.kind);
    const name = row.kind === 'emoji' ? freeName(user.id, row.name) : row.name;
    db.run('INSERT OR IGNORE INTO sticker_library (user_id, sticker_id, kind, name, added_at) VALUES (?, ?, ?, ?, ?)', user.id, row.id, row.kind, name, now());
    return { sticker: out(row, user, name), saved: true };
  });

  // a new name in your library (and for one you made, its own name too)
  route('PATCH', '/api/stickers/:id', async ({ user, params, body }) => {
    limit('sticker-edit:' + user.id, 200, HOUR);
    const row = stickerById(params.id);
    const k = row && !row.removed_at && kept(user.id, row.id);
    if (!k) fail(404, 'That one isn’t in your library.');
    // shared with everyone, or not (1.5): only by whoever made it
    if (body.shared != null) {
      if (row.owner_id !== user.id) fail(403, 'Only whoever made it can share it.');
      db.run('UPDATE stickers SET shared_at = ? WHERE id = ?', body.shared ? row.shared_at || now() : null, row.id);
      if (body.name == null) return { sticker: out(stickerById(row.id), user, k.name) };
    }
    const { name, doubt } = await nameFor(row.kind, body.name);
    if (row.kind === 'emoji' && nameTaken(user.id, name, row.id)) fail(409, `You already have an emoji called :${name}:.`, { field: 'name' });
    db.run('UPDATE sticker_library SET name = ? WHERE user_id = ? AND sticker_id = ?', name, user.id, row.id);
    if (row.owner_id === user.id) db.run('UPDATE stickers SET name = ? WHERE id = ?', name, row.id);
    if (doubt && row.owner_id === user.id) autoReport('sticker', row.id, doubt);
    return { sticker: out(stickerById(row.id), user, name) };
  });

  /** one someone made goes, from everyone's library (old messages show its name instead) */
  function drop(row) {
    db.tx(() => {
      for (const img of [row.image, row.still]) if (img) db.run('DELETE FROM images WHERE id = ?', img);
      db.run('DELETE FROM stickers WHERE id = ?', row.id);
    });
  }

  // deleting one you made takes it away everywhere; one you saved just leaves your library
  route('DELETE', '/api/stickers/:id', ({ user, params }) => {
    limit('sticker-edit:' + user.id, 200, HOUR);
    const row = stickerById(params.id);
    if (!row) return { ok: true, gone: true };
    if (row.owner_id === user.id) {
      drop(row);
      return { ok: true, gone: true };
    }
    db.run('DELETE FROM sticker_library WHERE user_id = ? AND sticker_id = ?', user.id, row.id);
    return { ok: true };
  });

  // the picture, for anyone who sees it (like other pictures). It's only kept in caches a short while, so one
  // that's deleted or taken down soon stops showing anywhere
  route('GET', '/api/stickers/:id/image', ({ params, query, req, res }) => {
    const row = stickerById(params.id);
    const imageId = row && !row.removed_at ? (query.still && row.still ? row.still : row.image) : null;
    const img = imageId ? db.get('SELECT mime, data FROM images WHERE id = ?', imageId) : null;
    if (!img) {
      res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'cross-origin' });
      return res.end('Not found');
    }
    const etag = `"${imageId}"`;
    const headers = { 'Cache-Control': 'public, max-age=900', ETag: etag, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'", 'Cross-Origin-Resource-Policy': 'cross-origin' };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    res.writeHead(200, Object.assign({ 'Content-Type': img.mime, 'Content-Length': img.data.length }, headers));
    res.end(Buffer.from(img.data));
  }, { auth: false, stream: true });

  // ---- in chats: a message that's a sticker -------------------------------------------------------------------

  const MEDIA_KINDS = ctx.MEDIA_KINDS || {};
  MEDIA_KINDS.sticker = {
    /** what a message being sent carries, when it's a sticker from the sender's library */
    read(user, body) {
      if (body.sticker == null) return null;
      limit('sticker-send:' + user.id, 60, MINUTE, 'That’s a lot of stickers. Slow down a little.');
      const row = stickerById(body.sticker);
      if (!row || row.removed_at || row.kind !== 'sticker') fail(404, 'That sticker isn’t there any more.');
      if (!kept(user.id, row.id)) fail(403, 'Save that sticker to your library first.');
      return { media: { type: 'sticker', id: row.id, name: row.name || undefined } };
    },
    /** a sticker message as the app sees it: the sticker, or (deleted or taken down) just that it was one */
    out(m) {
      const row = stickerById(m.id);
      if (!row || row.removed_at) return { type: 'sticker', sticker: { id: m.id, name: m.name, gone: true } };
      const s = out(row, null);
      // url, width and height at the top too: an app from before 1.4 shows it as a picture
      return { type: 'sticker', url: s.url, width: s.width, height: s.height, gif: s.gif, sticker: s };
    },
  };

  // ---- reports and taking down ----------------------------------------------------------------------------------

  /** a moderator takes one down: it goes from everyone's library and every chat, and its maker is told */
  function takeDown(id, reason, by = 'A moderator') {
    const row = stickerById(id);
    if (!row || row.removed_at) return false;
    db.tx(() => {
      for (const img of [row.image, row.still]) if (img) db.run('DELETE FROM images WHERE id = ?', img);
      db.run('UPDATE stickers SET removed_at = ?, removed_reason = ? WHERE id = ?', now(), reason, row.id);
      db.run('DELETE FROM sticker_library WHERE sticker_id = ?', row.id);
    });
    const what = row.kind === 'emoji' ? `emoji :${row.name}:` : row.name ? `sticker “${row.name}”` : 'sticker';
    notify(row.owner_id, { kind: 'moderation', text: `${by} removed your ${what}. Reason: ${reason}. If you think this was a mistake, contact Budgie.`, href: '', symbol: 'gavel', shape: 'pixelCircle' });
    return true;
  }
  const REPORT_KINDS = ctx.REPORT_KINDS || {};
  REPORT_KINDS.sticker = {
    label: 'sticker',
    target(r) {
      const row = stickerById(r.target);
      if (!row) return null;
      const by = db.get('SELECT name FROM users WHERE id = ?', row.owner_id);
      return {
        title: row.kind === 'emoji' ? `Custom emoji :${row.name}:` : row.name ? `Sticker “${row.name}”` : 'A sticker',
        picture: row.removed_at ? undefined : imagePath(row.id),
        author: by ? by.name : '[deleted]',
        removed: !!row.removed_at,
      };
    },
    takeDown,
  };

  // ---- admin commands -------------------------------------------------------------------------------------------

  const date = (t) => (t ? new Date(t).toISOString().slice(0, 16).replace('T', ' ') : '');
  CLI.help.push(
    '  nook stickers [name]             the newest stickers and emojis people made (or one person’s), with their ids',
    '  nook sticker-remove <id> [reason]   take a sticker or emoji down everywhere (its maker is told why)'
  );
  CLI.commands.stickers = (name) => {
    const u = name ? db.get('SELECT id, name FROM users WHERE name = ?', name) : null;
    if (name && !u) throw new Error(`There's no user called "${name}". Try: nook users`);
    const rows = u
      ? db.all('SELECT s.*, u.name AS by FROM stickers s JOIN users u ON u.id = s.owner_id WHERE s.owner_id = ? ORDER BY s.created_at DESC', u.id)
      : db.all('SELECT s.*, u.name AS by FROM stickers s JOIN users u ON u.id = s.owner_id ORDER BY s.created_at DESC LIMIT 50');
    const total = db.get('SELECT COUNT(*) AS n, SUM(removed_at IS NOT NULL) AS r FROM stickers').n;
    console.log(rows.length ? rows.map((r) => `${r.id}  ${r.kind.padEnd(7)} ${(r.kind === 'emoji' ? ':' + r.name + ':' : r.name || '(no name)').padEnd(34)} u/${r.by.padEnd(20)} ${date(r.created_at)}${r.still ? '  GIF' : ''}${r.removed_at ? '  removed: ' + r.removed_reason : ''}`).join('\n') : 'No stickers yet.');
    if (!u) console.log(`${total} made in all.`);
  };
  CLI.commands['sticker-remove'] = (id, ...words) => {
    if (!id) throw new Error('Usage: nook sticker-remove <id> [reason]   (nook stickers shows the ids)');
    if (!takeDown(id, words.join(' ') || 'Breaks Budgie’s rules')) throw new Error(`There's no sticker ${id} to take down (or it's already gone).`);
    console.log(`Taken down: ${id}. It's gone from every library and chat, and its maker was told.`);
  };

  return {
    /** how many stickers and emojis someone made (that are still there): the 'stickers' achievement */
    madeBy: (userId) => db.get('SELECT COUNT(*) AS n FROM stickers WHERE owner_id = ? AND removed_at IS NULL', userId).n,
    /** what "Export my data" holds about this part */
    exportFor(userId) {
      return {
        stickersMade: db.all('SELECT * FROM stickers WHERE owner_id = ? ORDER BY created_at', userId).map((r) => ({
          id: r.id, kind: r.kind, name: r.name, url: r.removed_at ? undefined : imagePath(r.id), createdAt: r.created_at, removed: r.removed_at ? r.removed_reason || true : undefined,
          sharedWithEveryone: r.shared_at ? new Date(r.shared_at).toISOString() : undefined,
        })),
        stickerLibrary: db.all('SELECT l.*, s.owner_id FROM sticker_library l JOIN stickers s ON s.id = l.sticker_id WHERE l.user_id = ? ORDER BY l.added_at', userId).map((r) => ({
          id: r.sticker_id, kind: r.kind, name: r.name, made: r.owner_id === userId || undefined, savedAt: r.added_at,
        })),
      };
    },
    takeDown,
    usable,
    MAX,
  };
}

module.exports = { install, remakeGif, sizeOf };
