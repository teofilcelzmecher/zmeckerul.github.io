// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Reading text for bullying, threats, hate and sexual talk with a language model, on this computer:
 * nothing is sent anywhere. The word lists in moderation.js catch known words and their disguises;
 * the model reads whole sentences, in many languages (Romanian included), so it also catches
 * insults the lists don't know ("you're a waste of oxygen", "ești un ratat jalnic").
 *
 * The model is Horizon Labs' multilingual-toxicity-small (Apache licence), a small mmBERT. At 268 MB
 * it's too big for the repository, so the server downloads it once from Hugging Face into the data
 * folder: always the same version, checked against its fingerprint. It runs on ONNX Runtime (MIT
 * licence, in vendor/node_modules, for Linux on x86-64) in a worker thread, in about 20–40 ms a message.
 *
 * It answers seven questions from 0 to 1: toxicity, severe toxicity, obscene, threat, insult,
 * identity attack and sexual explicit. Swearing is allowed on Budgie (with a filter for anyone who
 * doesn't want to see it), so "toxicity" and "obscene" aren't used. Text is read as it was written
 * and again with its disguises undone (w0rthl3ss, s.t.u.p.i.d, 𝐢𝐝𝐢𝐨𝐭), in overlapping pieces and
 * sentence by sentence, so a long, friendly post can't hide an insult.
 *
 * It's a small model and it makes mistakes both ways: "I'm going to kill this exam" sounds like a
 * threat to it, and "nobody would miss you" doesn't. So it only stops what it's very sure of, sends
 * what it's fairly sure of to a moderator, and the word lists and people's reports do the rest.
 *
 *   score(text) → { labels: {name: 0 to 1} }, or null when the model isn't there (the word lists
 *     still apply then, and nothing waits for it)
 *   judge(score, kind) → { verdict: 'block', 'review' or 'ok', label, sure }
 *   reason(judged) → what a moderator is told about a doubtful one
 *
 * NOOK_TEXT_CHECK=off turns it off; =test scores by a marker in the text ("#harmful", "#doubtful",
 * "#sexual"), for the tests.
 */
'use strict';

const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const crypto = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const VENDOR = path.join(__dirname, 'vendor');
const MODE = process.env.NOOK_TEXT_CHECK || 'on';

const REVISION = 'b3c8c8198a53437f63d911ad4b926367d299f573';
const SOURCE = `https://huggingface.co/Horizon-Labs/multilingual-toxicity-small/resolve/${REVISION}/`;
const FILES = [
  { name: 'model.onnx', from: 'onnx/model_quantized.onnx', size: 268416934, sha256: '44d470dcb255c3b369dcfb2b0bab12610513e5cca635325ea86bf104a14f0080' },
  { name: 'tokenizer.json', from: 'tokenizer.json', size: 34363286, sha256: '4379fe7f4a7af10b1ac15ffc8ae90f446f92082393699e9dd54b8c3b5ec0abad' },
];
const LABELS = ['toxicity', 'severe_toxicity', 'obscene', 'threat', 'insult', 'identity_attack', 'sexual_explicit'];
const HARMS = ['severe_toxicity', 'threat', 'insult', 'identity_attack', 'sexual_explicit'];

// How sure the model must be, for each kind of harm, to stop something ("block") or to post it and
// have a moderator look ("review"). Tried on everyday sentences in English and Romanian, many of
// them built to fool it (the villain's "I will kill you all", "I'm so stupid, I forgot my keys",
// "I'm gay and proud of it"): threats and insults need it to be very sure, because ordinary talk is
// full of "kill" and "stupid". Private messages between friends are only stopped when it's very
// sure, and only sexual ones are shown to a moderator, as the grooming warning signs are.
const LIMITS = {
  public: {
    block: { severe_toxicity: 0.5, threat: 0.9, insult: 0.85, identity_attack: 0.85, sexual_explicit: 0.85 },
    review: { severe_toxicity: 0.3, threat: 0.85, insult: 0.65, identity_attack: 0.65, sexual_explicit: 0.45 },
  },
  message: {
    block: { severe_toxicity: 0.5, threat: 0.9, insult: 0.93, identity_attack: 0.9, sexual_explicit: 0.6 },
    review: { severe_toxicity: 2, threat: 2, insult: 2, identity_attack: 2, sexual_explicit: 0.45 },
  },
};

/** what to do with text the model has read: the verdict, and the kind of harm behind it */
function judge(score, kind) {
  if (!score) return { verdict: 'ok' };
  const limits = LIMITS[kind === 'message' ? 'message' : 'public'];
  for (const verdict of ['block', 'review']) {
    const over = HARMS.filter((l) => score.labels[l] >= limits[verdict][l]);
    if (!over.length) continue;
    // the kind it's furthest over the line for
    const label = over.reduce((a, b) => (score.labels[b] - limits[verdict][b] > score.labels[a] - limits[verdict][a] ? b : a));
    return { verdict, label, sure: score.labels[label] };
  }
  return { verdict: 'ok' };
}

// ---------------------------------------------------------------- undoing disguises

const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's' };
const LOOKALIKES = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'м': 'm', 'т': 't', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
  'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
};
const EMOJI_LETTERS = /[\u{1F1E6}-\u{1F1FF}\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]/gu;

/** the text with the usual disguises undone, keeping accents and everything else as written */
function unmask(text) {
  let t = String(text)
    .replace(EMOJI_LETTERS, (ch) => {
      const c = ch.codePointAt(0);
      for (const start of [0x1f1e6, 0x1f130, 0x1f150, 0x1f170]) if (c >= start && c < start + 26) return String.fromCharCode(97 + c - start);
      return ch;
    })
    .normalize('NFKC') // 𝐢𝐝𝐢𝐨𝐭 and ｉｄｉｏｔ become plain letters; ă and ș stay
    .replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, '');
  // inside a word that mixes Latin letters with look-alike Cyrillic or Greek ones, or with digits
  // and symbols standing for letters (іdіot, w0rthl3ss, @ss), they become the letters they stand for
  t = t.replace(/[\p{L}\p{M}0-9@$]+/gu, (word) => {
    if (!/[a-z]/i.test(word)) return word;
    let w = word.replace(/[аеорсухкмтіјѕԁαεικνορτυχ]/g, (ch) => LOOKALIKES[ch]);
    if (/[a-z]/i.test(w.replace(/[0-9@$]/g, '')) && /[0-9@$]/.test(w) && !/^[0-9]+[a-z]{1,2}$/i.test(w)) w = w.replace(/[0-9@$]/g, (ch) => LEET[ch] || ch);
    return w;
  });
  // single letters split by dots, stars, dashes or spaces join up: s.t.u.p.i.d, i d i o t
  // (a wider gap between them, "y o u   a r e", is still a gap between words)
  t = t.replace(/(?<![\p{L}\p{N}])\p{L}(?:[\s.*_~-]+\p{L}(?![\p{L}\p{N}])){2,}/gu, (run) => run.replace(/\s{2,}/g, '\0').replace(/[\s.*_~-]+/g, '').replace(/\0/g, ' '));
  // stretched letters (stuuuupid) shrink back
  t = t.replace(/(\p{L})\1{2,}/gu, '$1');
  return t;
}

// ---------------------------------------------------------------- the tokenizer: text into the model's word pieces

/**
 * The model's tokenizer (Gemma's, as used by mmBERT), doing exactly what Hugging Face's tokenizers
 * library does with its tokenizer.json: spaces become "▁", the text splits before each "▁", and each
 * piece is put together from its letters by merging the most common pairs first. Letters the
 * vocabulary doesn't have become their UTF-8 bytes. Runs of new lines, tabs and a few HTML tags are
 * tokens of their own; the model's control tokens are never read from the text, so nobody can type
 * them in.
 */
const TEXT_TOKENS = /^(?:[\n\t▁]+|<\/?(?:table|caption|thead|tbody|tfoot|tr|th|td|h[1-6]|blockquote|strong|em|b|i|u|s|sub|sup|code)>)$/;

/**
 * What the tokenizer needs from tokenizer.json, small and quick to read: the 34 MB file takes a few
 * hundred MB of memory to read, so that's done once, in a worker of its own, and this is kept.
 */
function compact(json) {
  const vocab = new Map(Object.entries(json.model.vocab));
  const tokens = [];
  for (const [t, id] of vocab) tokens[id] = t;
  const merges = new Int32Array(json.model.merges.length * 2);
  json.model.merges.forEach((m, rank) => {
    const [a, b] = Array.isArray(m) ? m : [m.slice(0, m.indexOf(' ')), m.slice(m.indexOf(' ') + 1)];
    merges[2 * rank] = vocab.has(a) ? vocab.get(a) : -1;
    merges[2 * rank + 1] = vocab.has(b) ? vocab.get(b) : -1;
  });
  const special = (name) => vocab.get(json.post_processor.special_tokens[name].tokens[0]);
  return {
    tokens,
    merges: Buffer.from(merges.buffer).toString('base64'),
    added: json.added_tokens.filter((t) => !t.special && TEXT_TOKENS.test(t.content)).map((t) => [t.content, t.id]),
    unk: vocab.get(json.model.unk_token),
    bos: special('<bos>'),
    eos: special('<eos>'),
  };
}

function makeTokenizer(small) {
  const { tokens, unk, bos: BOS, eos: EOS } = small;
  const vocab = new Map(tokens.map((t, id) => [t, id]));
  const raw = Buffer.from(small.merges, 'base64');
  const pairs = new Int32Array(raw.length / 4);
  Buffer.from(pairs.buffer).set(raw);
  // the merges, as a hash table of pairs of token ids in plain arrays: half a million of them
  // would take three times the memory as a Map
  let size = 1;
  while (size < pairs.length) size <<= 1;
  const mask = size - 1;
  const left = new Int32Array(size).fill(-1), right = new Int32Array(size), rankOf = new Int32Array(size), idOf = new Int32Array(size);
  const find = (a, b) => {
    let h = (Math.imul(a, 0x9e3779b1) ^ Math.imul(b + 1, 0x85ebca77)) & mask;
    while (left[h] !== -1 && (left[h] !== a || right[h] !== b)) h = (h + 1) & mask;
    return h;
  };
  for (let rank = 0; rank < pairs.length / 2; rank++) {
    const a = pairs[2 * rank], b = pairs[2 * rank + 1];
    const id = a >= 0 && b >= 0 ? vocab.get(tokens[a] + tokens[b]) : undefined;
    if (id === undefined) continue;
    const h = find(a, b);
    left[h] = a;
    right[h] = b;
    rankOf[h] = rank;
    idOf[h] = id;
  }
  /** the slot of a pair that merges, or -1 */
  const merge = (a, b) => {
    const h = find(a, b);
    return left[h] === -1 ? -1 : h;
  };
  const bytes = Array.from({ length: 256 }, (_, b) => vocab.get(`<0x${b.toString(16).toUpperCase().padStart(2, '0')}>`));
  const added = new Map(small.added);
  const ADDED = new RegExp([...added.keys()].sort((a, b) => b.length - a.length).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  small = null; // the file's contents aren't needed any more

  const cache = new Map();
  function word(w, out) {
    const known = cache.get(w);
    if (known) return out.push(...known);
    const ids = [];
    for (const ch of w) {
      const id = vocab.get(ch);
      if (id != null) ids.push(id);
      else {
        const b = [...Buffer.from(ch, 'utf8')].map((x) => bytes[x]);
        if (b.every((x) => x != null)) ids.push(...b);
        else if (ids[ids.length - 1] !== unk) ids.push(unk);
      }
    }
    // merging: the lowest-ranked pair first, the leftmost when they tie, as tokenizers' word.rs does
    const n = ids.length;
    const next = Int32Array.from({ length: n }, (_, i) => (i + 1 < n ? i + 1 : -1));
    const prev = Int32Array.from({ length: n }, (_, i) => i - 1);
    const gone = new Uint8Array(n);
    const heap = [];
    const before = (x, y) => x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
    const push = (item) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (!before(heap[i], heap[p])) break;
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < heap.length && before(heap[l], heap[m])) m = l;
          if (r < heap.length && before(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    const offer = (pos) => {
      const h = merge(ids[pos], ids[next[pos]]);
      if (h !== -1) push([rankOf[h], pos, idOf[h]]);
    };
    for (let i = 0; i + 1 < n; i++) offer(i);
    while (heap.length) {
      const [, pos, id] = pop();
      if (gone[pos] || next[pos] === -1) continue;
      const after = next[pos];
      const h = merge(ids[pos], ids[after]);
      if (h === -1 || idOf[h] !== id) continue; // out of date: one side has merged since
      ids[pos] = id;
      gone[after] = 1;
      next[pos] = next[after];
      if (next[after] !== -1) prev[next[after]] = pos;
      if (prev[pos] !== -1) offer(prev[pos]);
      if (next[pos] !== -1) offer(pos);
    }
    const result = ids.filter((_, i) => !gone[i]);
    if (cache.size > 50000) cache.clear();
    cache.set(w, result);
    out.push(...result);
  }

  function plain(segment, out) {
    let s = segment.replace(/ /g, '▁');
    if (!s.startsWith('▁')) s = '▁' + s;
    for (const w of s.split(/(?=▁)/)) if (w) word(w, out);
  }

  /** the text's token ids, without the start and end tokens */
  function encode(text) {
    const out = [];
    let last = 0;
    for (const m of text.matchAll(ADDED)) {
      if (m.index > last) plain(text.slice(last, m.index), out);
      out.push(added.get(m[0]));
      last = m.index + m[0].length;
    }
    if (last < text.length) plain(text.slice(last), out);
    return out;
  }
  return { encode, BOS, EOS };
}

// ---------------------------------------------------------------- the worker: the model, and reading

// Text is read in overlapping pieces of up to 128 tokens (about 80 words), so sentences are read in
// their context, and longer text sentence by sentence as well, so an insult at the end of a long,
// kind post isn't watered down by everything around it. Very long text is read in at most 48 pieces
// and 192 sentences, spread across it: a whole 10,000-character post takes a few seconds.
const sentences = (text) => [...new Set(text.split(/(?<=[.!?…。！？])\s+|\n+/u).map((x) => x.trim()).filter(Boolean))];

/** some of a list, spread evenly across it, keeping its first and last */
function spread(list, max) {
  if (list.length <= max) return list;
  return Array.from({ length: max }, (_, k) => list[Math.round((k * (list.length - 1)) / (max - 1))]);
}

/** a list of token ids in overlapping pieces */
function pieces(ids, size = 126, step = 96, max = 48) {
  const starts = [];
  for (let s = 0; ; s += step) {
    starts.push(s);
    if (s + size >= ids.length) break;
  }
  return spread(starts, max).map((s) => ids.slice(s, s + size));
}

// the small tokenizer file, named after the tokenizer.json it came from
const SMALL = `tokenizer-${FILES[1].sha256.slice(0, 12)}.json`;

if (!isMainThread && workerData && workerData.compact) {
  const { dir } = workerData;
  const part = path.join(dir, `${SMALL}.${process.pid}.part`);
  fs.writeFileSync(part, JSON.stringify(compact(JSON.parse(fs.readFileSync(path.join(dir, 'tokenizer.json'), 'utf8')))));
  fs.renameSync(part, path.join(dir, SMALL));
}

if (!isMainThread && workerData && workerData.textModel) {
  const { dir } = workerData;
  const ready = (async () => {
    if (!fs.existsSync(path.join(dir, SMALL))) {
      await new Promise((resolve, reject) => {
        const w = new Worker(__filename, { workerData: { compact: true, dir } });
        w.on('error', reject);
        w.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('The tokenizer couldn’t be prepared.'))));
      });
    }
    const tokenizer = makeTokenizer(JSON.parse(fs.readFileSync(path.join(dir, SMALL), 'utf8')));
    const ort = require(path.join(VENDOR, 'node_modules', 'onnxruntime-node'));
    const session = await ort.InferenceSession.create(path.join(dir, 'model.onnx'), {
      // all but one of the computer's cores (up to 4), so the server itself stays quick
      graphOptimizationLevel: 'all', enableCpuMemArena: false, executionMode: 'sequential', interOpNumThreads: 1,
      intraOpNumThreads: Math.max(1, Math.min(4, os.availableParallelism() - 1)),
    });
    return { ort, tokenizer, session };
  })();

  async function read(texts) {
    const { ort, tokenizer, session } = await ready;
    const rows = [];
    const seen = new Set();
    const add = (ids) => {
      const key = ids.join();
      if (!ids.length || seen.has(key)) return;
      seen.add(key);
      rows.push(ids);
    };
    texts.forEach((text, i) => {
      const ids = tokenizer.encode(text);
      // long text with its disguises undone only adds the sentences that changed (the rest are there already)
      if (i === 0 || ids.length <= 126) for (const piece of pieces(ids)) add(piece);
      // short text is read whole: on its own, "Super tare!" says less than the sentence around it
      if (ids.length > 48) for (const piece of spread(sentences(text).flatMap((x) => pieces(tokenizer.encode(x), 62, 48, 4)), 192)) add(piece);
    });
    // read in batches of similar lengths, so little of each batch is padding (the answers are the same)
    rows.sort((a, b) => a.length - b.length);
    const labels = Object.fromEntries(LABELS.map((l) => [l, 0]));
    for (let i = 0; i < rows.length; ) {
      let n = 1;
      while (i + n < rows.length && n < 64 && (n + 1) * (rows[i + n].length + 2) <= 2048) n++;
      const batch = rows.slice(i, i + n).map((r) => [tokenizer.BOS, ...r, tokenizer.EOS]);
      i += n;
      const width = batch[batch.length - 1].length;
      const ids = new BigInt64Array(batch.length * width), mask = new BigInt64Array(batch.length * width);
      batch.forEach((row, r) => row.forEach((id, c) => ((ids[r * width + c] = BigInt(id)), (mask[r * width + c] = 1n))));
      const out = await session.run({
        input_ids: new ort.Tensor('int64', ids, [batch.length, width]),
        attention_mask: new ort.Tensor('int64', mask, [batch.length, width]),
      });
      const logits = out[session.outputNames[0]].data;
      for (let r = 0; r < batch.length; r++) {
        LABELS.forEach((l, k) => (labels[l] = Math.max(labels[l], 1 / (1 + Math.exp(-logits[r * LABELS.length + k])))));
      }
    }
    return labels;
  }

  parentPort.on('message', ({ id, texts }) => {
    read(texts).then(
      (labels) => parentPort.postMessage({ id, labels }),
      (error) => parentPort.postMessage({ id, error: error.message || String(error) })
    );
  });
  ready.then(
    () => parentPort.postMessage({ id: 0, ready: true }),
    (error) => parentPort.postMessage({ id: 0, error: error.message || String(error) })
  );
}

// ---------------------------------------------------------------- the server's side: the files, and asking the worker

let dir = path.join(process.env.NOOK_DATA || path.join(__dirname, 'data'), 'text-model');
let state = MODE === 'on' ? 'missing' : 'off'; // missing → downloading → loading → ready, or failed
let problem = '';
let worker = null;
let next = 0;
const waiting = new Map();
let fetching = null;

const usable = () => process.platform === 'linux' && process.arch === 'x64';
const NEEDS = 700e6; // the memory the model takes once it's loaded, with some to spare

/** how much memory this process may use and has left, when something (systemd's MemoryMax) limits it */
function room() {
  try {
    const lines = fs.readFileSync('/proc/self/cgroup', 'utf8').split('\n');
    const v2 = lines.find((l) => l.startsWith('0::'));
    const v1 = lines.find((l) => /^\d+:memory:/.test(l));
    let files;
    if (v2 && fs.existsSync(`/sys/fs/cgroup${v2.slice(3)}/memory.max`)) files = [`/sys/fs/cgroup${v2.slice(3)}/memory.max`, `/sys/fs/cgroup${v2.slice(3)}/memory.current`];
    else if (v1) files = ['memory.limit_in_bytes', 'memory.usage_in_bytes'].map((f) => `/sys/fs/cgroup/memory${v1.replace(/^\d+:memory:/, '')}/${f}`);
    const limit = Number(fs.readFileSync(files[0], 'utf8').trim()); // "max" when there's no limit
    if (!Number.isFinite(limit) || limit > 2 ** 50) return null;
    return { limit, left: limit - Number(fs.readFileSync(files[1], 'utf8').trim()) };
  } catch (_) {
    return null;
  }
}
const present = () => FILES.every((f) => {
  try {
    return fs.statSync(path.join(dir, f.name)).size === f.size;
  } catch (_) {
    return false;
  }
});

/** where the model's files live: a "text-model" folder in the data folder */
function setup(dataDir) {
  dir = path.join(dataDir, 'text-model');
}

/** downloads whatever's missing, checking each file's fingerprint before keeping it */
function download({ log = () => {} } = {}) {
  if (fetching) return fetching;
  fetching = (async () => {
    fs.mkdirSync(dir, { recursive: true });
    for (const f of FILES) {
      const target = path.join(dir, f.name);
      if (fs.existsSync(target) && fs.statSync(target).size === f.size) continue;
      log(`Downloading the text model's ${f.name} (${Math.round(f.size / 1e6)} MB)…`);
      const part = `${target}.${process.pid}.part`;
      const res = await fetch(SOURCE + f.from);
      if (!res.ok) throw new Error(`Hugging Face answered ${res.status} for ${f.from}`);
      const hash = crypto.createHash('sha256');
      let got = 0, shown = 0;
      const count = new Transform({
        transform(chunk, _, done) {
          hash.update(chunk);
          got += chunk.length;
          if (got - shown >= f.size / 10) log(`  ${Math.round((100 * (shown = got)) / f.size)}%`);
          done(null, chunk);
        },
      });
      try {
        await pipeline(Readable.fromWeb(res.body), count, fs.createWriteStream(part));
        if (hash.digest('hex') !== f.sha256) throw new Error(`${f.name} didn't match its fingerprint, so it wasn't kept`);
        fs.renameSync(part, target);
      } catch (error) {
        fs.rmSync(part, { force: true });
        throw error;
      }
    }
  })().finally(() => (fetching = null));
  return fetching;
}

function failAll(error) {
  for (const [, w] of waiting) {
    clearTimeout(w.timer);
    w.reject(error);
  }
  waiting.clear();
}

function start() {
  if (worker || state === 'off' || state === 'failed' || !present()) return;
  state = 'loading';
  worker = new Worker(__filename, { workerData: { textModel: true, dir } });
  worker.unref();
  worker.on('message', (m) => {
    if (m.id === 0) {
      if (m.ready) state = 'ready';
      else {
        state = 'failed';
        problem = m.error;
        console.error('text model couldn’t start:', m.error);
        worker.terminate();
      }
      return;
    }
    const w = waiting.get(m.id);
    if (!w) return;
    waiting.delete(m.id);
    clearTimeout(w.timer);
    if (!waiting.size && worker) worker.unref();
    if (m.error) w.reject(new Error(m.error));
    else w.resolve(m.labels);
  });
  worker.on('error', (error) => {
    console.error('text model:', error.message);
    problem = error.message;
    failAll(error);
  });
  worker.on('exit', () => {
    worker = null;
    if (state !== 'failed') state = 'missing';
    failAll(new Error('The text model stopped.'));
  });
}

function ask(texts) {
  start();
  if (!worker) return Promise.reject(new Error('The text model isn’t running.'));
  return new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error('The text model took too long.'));
    }, 60000);
    waiting.set(id, { resolve, reject, timer });
    worker.ref();
    worker.postMessage({ id, texts });
  });
}

/**
 * How harmful some text reads: { labels }, read as written and with its disguises undone.
 * Null when the model isn't available (not downloaded yet, or broken): the word lists still apply
 * then, and nothing waits for the model.
 */
async function score(text) {
  text = String(text || '').trim();
  if (!text) return null;
  if (MODE === 'test') {
    const labels = Object.fromEntries(LABELS.map((l) => [l, 0.01]));
    if (/#harmful\b/.test(text)) labels.insult = 0.97;
    if (/#doubtful\b/.test(text)) labels.insult = 0.8;
    if (/#sexual\b/.test(text)) labels.sexual_explicit = 0.5;
    return { labels };
  }
  if (state === 'missing') start(); // after the worker stopped, the next text starts it again
  if (state !== 'ready' && state !== 'loading') return null;
  const texts = [text];
  const undone = unmask(text);
  if (undone !== text) texts.push(undone);
  try {
    return { labels: await ask(texts) };
  } catch (error) {
    console.error('text check failed:', error.message);
    return null;
  }
}

const DESCRIBE = {
  severe_toxicity: 'very hostile', insult: 'an insult or bullying', threat: 'a threat', identity_attack: 'an attack on people for who they are', sexual_explicit: 'sexual',
};

/** a doubtful verdict from judge(), in words for a moderator */
function reason(judged) {
  return `the text check thinks this might be ${DESCRIBE[judged.label]} (${Math.round(judged.sure * 100)}% sure). Please take a look.`;
}

/** whether the model can run here at all; if not, why not is in status().problem */
function available() {
  const limited = MODE === 'on' && usable() ? room() : null;
  if (MODE !== 'on') problem = 'it’s turned off (NOOK_TEXT_CHECK)';
  else if (!usable()) problem = `it runs on Linux on x86-64 only (this is ${process.platform} ${process.arch})`;
  else if (os.totalmem() < 2.5e9) problem = `it needs about ${Math.round(NEEDS / 1e6)} MB of memory, and this computer has ${(os.totalmem() / 1e9).toFixed(1)} GB in all`;
  else if (limited && limited.left < NEEDS && state !== 'ready' && state !== 'loading') {
    problem = `the server may only use ${Math.round(limited.limit / 2 ** 20)} MB of memory, and the model needs about ${Math.round(NEEDS / 1e6)} MB more. Run "sudo /opt/nook/server/install.sh" once to raise that limit`;
  } else return true;
  state = 'off';
  return false;
}

/** gets the model ready ahead of the first post: downloads it if it's missing, then loads it */
function warmUp() {
  if (!available()) {
    if (MODE === 'on') console.error(`Note: the text model is off, as ${problem}; the word lists still apply.`);
    return;
  }
  if (present()) return start();
  state = 'downloading';
  download({ log: (line) => console.log(line.trim()) }).then(
    () => {
      state = 'missing';
      start();
    },
    (error) => {
      // tries again in a while; meanwhile only the word lists apply
      state = 'missing';
      problem = error.message;
      console.error(`The text model couldn’t be downloaded (${error.message}). Trying again in 15 minutes.`);
      setTimeout(warmUp, 15 * 60000).unref();
    }
  );
}

/** downloads the model if it's missing and waits until it has loaded (or failed to): for commands */
async function ready({ log } = {}) {
  if (MODE === 'test') return true;
  if (!available()) return false;
  try {
    await download({ log });
  } catch (error) {
    problem = error.message;
    return false;
  }
  if (state === 'downloading') state = 'missing';
  start();
  for (let i = 0; i < 600 && state === 'loading'; i++) await new Promise((r) => setTimeout(r, 100));
  return state === 'ready';
}

function status() {
  return { state, problem, dir };
}

function close() {
  if (worker) worker.terminate();
}

module.exports = { setup, score, judge, reason, warmUp, ready, status, close, unmask, compact, makeTokenizer, pieces, sentences, LIMITS, HARMS, FILES };
