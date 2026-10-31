// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Checking pictures for nudity and sexual content, on this computer: nothing is sent anywhere.
 *
 * Two small image-recognition models (NSFWJS's MobileNetV2 and MobileNetV2 Mid, MIT licence, in
 * vendor/nsfw) run on TensorFlow.js with WebAssembly (Apache licence, in vendor/node_modules), in a
 * worker thread so the server keeps answering while they look. JPEG, PNG and GIF are read in plain
 * JavaScript; for a GIF, up to six frames across it are looked at.
 *
 * Each model alone wrongly flags a few ordinary photos in a hundred, and rarely the same ones. So in
 * posts a picture is only refused when both agree, and a moderator looks at it when just one is sure.
 * Profile pictures and banners are stricter: either model being fairly sure refuses them. (Tried on
 * 218 everyday photos: no post picture refused and 1 in 100 sent for a look; about 2 in 100 refused
 * as profile pictures, with a "try another picture" message.)
 *
 *   score(bytes, mime) → { agreed: {explicit, suggestive}, peak: {explicit, suggestive} }, each 0 to 1:
 *     the worst frame's lower of the two models' answers (agreed) and higher one (peak). explicit is
 *     a model's "porn" plus "hentai"; suggestive is its "sexy" (underwear, poses).
 *   verdict(score, where) → 'block', 'review' or 'ok', with stricter limits for profiles than posts.
 *
 * NOOK_PICTURE_CHECK=off turns checking off (for an emergency only); =test scores pictures by a
 * marker in their last bytes ("#explicit", "#suggestive"), for the tests.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { Worker, isMainThread, parentPort } = require('node:worker_threads');

const VENDOR = path.join(__dirname, 'vendor');
const MODE = process.env.NOOK_PICTURE_CHECK || 'on';

// how sure the models must be, as "agreed" (both models) and "peak" (either one); above 1 means never.
// Profile pictures and banners are seen by everyone, so a doubtful one is refused there; in posts a
// picture is only refused when both models agree. "review" lets it through with a report for a moderator.
const LIMITS = {
  profile: {
    block: { agreed: { explicit: 0.35, suggestive: 0.6 }, peak: { explicit: 0.75, suggestive: 0.85 } },
    review: { agreed: { explicit: 0.15, suggestive: 0.3 }, peak: { explicit: 0.45, suggestive: 0.6 } },
  },
  post: {
    block: { agreed: { explicit: 0.5, suggestive: 0.85 }, peak: { explicit: 2, suggestive: 2 } },
    review: { agreed: { explicit: 0.25, suggestive: 0.45 }, peak: { explicit: 0.75, suggestive: 0.8 } },
  },
};

function verdict(score, where) {
  const limits = LIMITS[where] || LIMITS.post;
  const over = (level) => ['agreed', 'peak'].some((k) => score[k].explicit >= level[k].explicit || score[k].suggestive >= level[k].suggestive);
  return over(limits.block) ? 'block' : over(limits.review) ? 'review' : 'ok';
}

// ---------------------------------------------------------------- reading pictures (the worker uses these)

const SIDE = 1024; // big pictures are shrunk to about this first; the models look at 224 × 224
const MAX_PIXELS = 40e6;

/** a smaller RGB copy of an RGBA (or RGB) picture, averaging blocks of pixels; transparency becomes white */
function shrink(data, width, height, channels) {
  const scale = Math.max(1, Math.max(width, height) / SIDE);
  const w = Math.max(1, Math.round(width / scale)), h = Math.max(1, Math.round(height / scale));
  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * scale), y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * scale)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * scale), x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * scale)));
      let r = 0, g = 0, b = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * width + xx) * channels;
          const a = channels === 4 ? data[i + 3] / 255 : 1;
          r += data[i] * a + 255 * (1 - a);
          g += data[i + 1] * a + 255 * (1 - a);
          b += data[i + 2] * a + 255 * (1 - a);
          n++;
        }
      }
      const o = (y * w + x) * 3;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
    }
  }
  return { data: out, width: w, height: h };
}

/** the frames to look at: one for a photo, up to six spread across a GIF */
function frames(bytes, mime) {
  const lib = (name) => require(path.join(VENDOR, 'node_modules', name));
  if (mime === 'image/jpeg') {
    const img = lib('jpeg-js').decode(bytes, { useTArray: true, formatAsRGBA: false, maxResolutionInMP: MAX_PIXELS / 1e6, maxMemoryUsageInMB: 512 });
    return [shrink(img.data, img.width, img.height, 3)];
  }
  if (mime === 'image/png') {
    const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
    if (width * height > MAX_PIXELS) throw new Error('That picture is too large.');
    const img = lib('pngjs').PNG.sync.read(bytes);
    return [shrink(img.data, img.width, img.height, 4)];
  }
  if (mime === 'image/gif') {
    const gif = new (lib('omggif').GifReader)(bytes);
    if (gif.width * gif.height > MAX_PIXELS) throw new Error('That picture is too large.');
    const count = Math.min(gif.numFrames(), 400);
    const pick = new Set(Array.from({ length: Math.min(6, count) }, (_, k) => Math.round((k * (count - 1)) / Math.max(1, Math.min(6, count) - 1))));
    // frames draw over the ones before them, so they're drawn in order onto one canvas
    const canvas = new Uint8Array(gif.width * gif.height * 4);
    const out = [];
    for (let i = 0; i < count; i++) {
      gif.decodeAndBlitFrameRGBA(i, canvas);
      if (pick.has(i)) out.push(shrink(canvas, gif.width, gif.height, 4));
    }
    return out;
  }
  throw new Error('Pictures must be JPEG, PNG or GIF.');
}

// ---------------------------------------------------------------- the worker: the model, and looking

if (!isMainThread) {
  const lib = (name) => require(path.join(VENDOR, 'node_modules', name));
  const ready = (async () => {
    const tf = lib('@tensorflow/tfjs-core');
    const layers = lib('@tensorflow/tfjs-layers');
    const converter = lib('@tensorflow/tfjs-converter');
    const wasm = lib('@tensorflow/tfjs-backend-wasm');
    tf.env().set('WASM_HAS_MULTITHREAD_SUPPORT', false);
    wasm.setWasmPaths(path.join(VENDOR, 'node_modules', '@tensorflow', 'tfjs-backend-wasm', 'dist') + path.sep);
    await tf.setBackend('wasm');
    const artifacts = (name) => {
      const json = JSON.parse(fs.readFileSync(path.join(VENDOR, 'nsfw', name, 'model.json'), 'utf8'));
      const bin = fs.readFileSync(path.join(VENDOR, 'nsfw', name, 'weights.bin'));
      const weightData = bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
      return tf.io.fromMemory(Object.assign({}, json, { weightSpecs: json.weightsManifest.flatMap((g) => g.weights), weightData }));
    };
    const models = [await layers.loadLayersModel(artifacts('mobilenet_v2')), await converter.loadGraphModel(artifacts('mobilenet_v2_mid'))];
    return { tf, models };
  })();

  // each model's five answers, in their order: drawing, hentai, neutral, porn, sexy
  async function look(bytes, mime) {
    const { tf, models } = await ready;
    const score = { agreed: { explicit: 0, suggestive: 0 }, peak: { explicit: 0, suggestive: 0 } };
    let list;
    try {
      list = frames(Buffer.from(bytes), mime);
    } catch (error) {
      error.unreadable = true;
      throw error;
    }
    for (const f of list) {
      const answers = tf.tidy(() => {
        const img = tf.div(tf.cast(tf.tensor3d(f.data, [f.height, f.width, 3], 'int32'), 'float32'), 255);
        const input = tf.reshape(tf.image.resizeBilinear(img, [224, 224], true), [1, 224, 224, 3]);
        return models.map((m) => m.predict(input).dataSync());
      });
      const explicit = answers.map((p) => p[1] + p[3]), suggestive = answers.map((p) => p[4]);
      score.agreed.explicit = Math.max(score.agreed.explicit, Math.min(...explicit));
      score.agreed.suggestive = Math.max(score.agreed.suggestive, Math.min(...suggestive));
      score.peak.explicit = Math.max(score.peak.explicit, Math.max(...explicit));
      score.peak.suggestive = Math.max(score.peak.suggestive, Math.max(...suggestive));
    }
    return score;
  }

  parentPort.on('message', ({ id, bytes, mime }) => {
    look(bytes, mime).then(
      (score) => parentPort.postMessage({ id, score }),
      (error) => parentPort.postMessage({ id, error: error.message || String(error), unreadable: !!error.unreadable })
    );
  });
  ready.catch((error) => parentPort.postMessage({ id: 0, error: 'The picture checker couldn’t start: ' + error.message }));
}

// ---------------------------------------------------------------- the server's side: asking the worker

let worker = null;
let next = 0;
const waiting = new Map();

function failAll(error) {
  for (const [, w] of waiting) {
    clearTimeout(w.timer);
    w.reject(error);
  }
  waiting.clear();
}

function start() {
  if (worker || MODE !== 'on') return;
  worker = new Worker(__filename);
  worker.unref();
  worker.on('message', (m) => {
    if (m.id === 0) return console.error(m.error);
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    clearTimeout(w.timer);
    if (!waiting.size) worker.unref();
    if (m.error) w.reject(Object.assign(new Error(m.error), { unreadable: m.unreadable }));
    else w.resolve(m.score);
  });
  worker.on('error', (error) => {
    console.error('picture checker:', error.message);
    failAll(error);
  });
  worker.on('exit', () => {
    worker = null;
    failAll(new Error('The picture checker stopped.'));
  });
}

/** how sexual a picture looks, by both models: { agreed, peak }, each { explicit, suggestive } from 0 to 1 */
function score(bytes, mime) {
  const flat = (explicit, suggestive, peakExplicit = explicit) => ({ agreed: { explicit, suggestive }, peak: { explicit: peakExplicit, suggestive } });
  if (MODE === 'off') return Promise.resolve(flat(0, 0));
  if (MODE === 'test') {
    const tail = Buffer.from(bytes).subarray(-16).toString('latin1');
    if (/#explicit$/.test(tail)) return Promise.resolve(flat(0.9, 0));
    if (/#suggestive$/.test(tail)) return Promise.resolve(flat(0, 0.8));
    if (/#borderline$/.test(tail)) return Promise.resolve(flat(0.05, 0, 0.85));
    return Promise.resolve(flat(0, 0));
  }
  start();
  return new Promise((resolve, reject) => {
    const id = ++next;
    // the first picture waits for the model to load (a few seconds); later ones take a fraction of a second
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('The picture check took too long.'));
    }, 60000);
    waiting.set(id, { resolve, reject, timer });
    // while it's looking, the worker keeps this process running (a command waits for its answer)
    worker.ref();
    const copy = Uint8Array.from(bytes);
    worker.postMessage({ id, bytes: copy, mime }, [copy.buffer]);
  });
}

/** loads the model ahead of the first picture, so nobody waits for it */
function warmUp() {
  if (MODE === 'on') score(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'image/gif').catch(() => {});
}

function close() {
  if (worker) worker.terminate();
}

module.exports = { score, verdict, warmUp, close, LIMITS, frames };
