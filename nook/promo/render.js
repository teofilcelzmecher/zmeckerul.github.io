#!/usr/bin/env node
// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * Turns ad.html into an MP4 for TikTok, Reels and Shorts (1080×1920).
 *
 *   node nook/promo/render.js                    → nook/promo/budgie-ad.mp4, 60 fps, with music
 *   node nook/promo/render.js --fps 30 --out x.mp4
 *   node nook/promo/render.js --stills 0.5,2,7  → PNGs of those moments, to check a change quickly
 *   node nook/promo/render.js --audio x.wav     → just the soundtrack
 *
 * Needs Playwright with Chromium, and ffmpeg. The music (a 120 BPM beat: kick, clap, hats,
 * bass, chords and a marimba line, plus taps, pops and whooshes on the animation's cues) is
 * made here from sine waves and noise, so there's no music licence to worry about.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : fallback;
};
const FPS = Number(opt('fps', 60));
const OUT = path.resolve(opt('out', path.join(__dirname, 'budgie-ad.mp4')));
const STILLS = opt('stills', '');
const AUDIO_ONLY = opt('audio', '');

// a small file server for the repository, so the page's module imports work
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png' };
function serve() {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

// ---------------------------------------------------------------- the music
const RATE = 48000;
const CHORDS = { C: [60, 64, 67, 72], G: [55, 59, 62, 67], Am: [57, 60, 64, 69], F: [53, 57, 60, 65] };
const ROOTS = { C: 36, G: 43, Am: 45, F: 41 };
const LINE = [0, 2, 1, 3, 2, 1, 3, 2];
const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

function soundtrack(song, events, seconds) {
  const N = Math.ceil(seconds * RATE);
  const beat = 60 / song.bpm;
  const drums = new Float32Array(N), music = new Float32Array(N), fx = new Float32Array(N);
  let seed = 11;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  const add = (buf, start, length, fn) => {
    const s0 = Math.round(start * RATE);
    const n = Math.round(length * RATE);
    for (let i = 0; i < n; i++) {
      const j = s0 + i;
      if (j >= 0 && j < N) buf[j] += fn(i / RATE);
    }
  };
  const chordAt = (bt) => song.chords.reduce((c, [at, name]) => (bt >= at - 1e-6 ? name : c), song.chords[0][1]);
  const inGroove = (bt) => song.groove.some(([a, z]) => bt >= a - 1e-6 && bt < z - 1e-6);

  // drums
  const kick = (t0, gain) => {
    let phase = 0;
    add(drums, t0, 0.45, (t) => {
      phase += (2 * Math.PI * (52 + 130 * Math.exp(-t * 30))) / RATE;
      return gain * Math.tanh(1.6 * (Math.sin(phase) * Math.exp(-t * 9) + 0.5 * Math.exp(-t * 300) * noise()));
    });
  };
  const clap = (t0, gain) => {
    let lo = 0, hi = 0;
    add(drums, t0, 0.3, (t) => {
      const x = noise();
      lo += 0.5 * (x - lo);
      hi += 0.06 * (lo - hi);
      const band = lo - hi;
      const hits = [0, 0.011, 0.022].reduce((s, d) => s + (t >= d ? Math.exp(-(t - d) / 0.006) : 0), 0);
      return gain * band * (hits + 0.8 * Math.exp(-t / 0.11));
    });
  };
  const hat = (t0, gain, decay = 0.03) => {
    let prev = 0;
    add(drums, t0, decay * 6, (t) => {
      const x = noise();
      const h = x - prev;
      prev = x;
      return gain * h * Math.exp(-t / decay);
    });
  };
  const crash = (t0, gain) => {
    let prev = 0, lp = 0;
    add(drums, t0, 2.2, (t) => {
      const x = noise();
      const h = x - prev;
      prev = x;
      lp += 0.5 * (h - lp);
      return gain * lp * Math.exp(-t / 0.7);
    });
  };
  // instruments
  const marimba = (buf, t0, f, gain) =>
    add(buf, t0, 1.2, (t) => Math.min(1, t / 0.002) * gain * (
      Math.exp(-t / 0.3) * Math.sin(2 * Math.PI * f * t) +
      0.3 * Math.exp(-t / 0.05) * Math.sin(2 * Math.PI * f * 3.93 * t) +
      0.08 * Math.exp(-t / 0.01) * Math.sin(2 * Math.PI * f * 9.6 * t)));
  const saw = (f, t, bright) => {
    let s = 0;
    for (let n = 1; n <= 9; n++) s += (Math.sin(2 * Math.PI * f * n * t) / n) * Math.pow(bright, n - 1);
    return s;
  };
  const pad = (t0, dur, notes, gain, bright = 0.55) =>
    add(music, t0, dur + 0.4, (t) => {
      const env = Math.min(1, t / 0.04) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.12));
      let s = 0;
      for (const m of notes) s += saw(freq(m) * 1.003, t, bright) + saw(freq(m) * 0.997, t + 0.01, bright);
      return (gain * env * s) / (notes.length * 2);
    });
  const bass = (t0, dur, m, gain) =>
    add(music, t0, dur + 0.05, (t) => {
      const f = freq(m);
      const env = Math.min(1, t / 0.004) * (t < dur ? 1 : Math.exp(-(t - dur) / 0.015));
      return gain * env * Math.tanh(1.8 * (Math.sin(2 * Math.PI * f * t) + 0.45 * Math.sin(4 * Math.PI * f * t) + 0.25 * Math.sin(6 * Math.PI * f * t)));
    });
  const riser = (t0, t1, gain) => {
    let lp = 0;
    const len = t1 - t0;
    add(fx, t0, len, (t) => {
      const p = t / len;
      lp += (0.01 + 0.4 * p * p) * (noise() - lp);
      return gain * p * p * (lp + 0.25 * Math.sin(2 * Math.PI * (200 * t + 500 * t * p)));
    });
  };

  // the arrangement, beat by beat
  const totalBeats = Math.round(seconds / beat);
  for (let bt = 0; bt < totalBeats; bt++) {
    const t = bt * beat;
    const ch = chordAt(bt);
    if (inGroove(bt)) {
      kick(t, 0.8);
      if (bt % 2 === 1) clap(t, 0.5);
      hat(t + beat / 2, 0.22);
      hat(t + beat / 4, 0.07);
      hat(t + (3 * beat) / 4, 0.07);
      // bass on the off-beats, pumping against the kick
      bass(t + beat / 2, beat / 2 - 0.03, ROOTS[ch], 0.2);
      bass(t, beat / 4, ROOTS[ch], 0.09);
      // chords, ducked by the kick
      pad(t + 0.06, beat - 0.1, CHORDS[ch], 0.26);
      // a marimba line on the eighths, up and down the chord
      const notes = CHORDS[ch].map((m) => m + 12);
      for (let i = 0; i < 2; i++) marimba(music, t + (i * beat) / 2, freq(notes[LINE[(bt * 2 + i) % 8]]), i ? 0.17 : 0.23);
    }
  }
  // the intro: a soft chord, a note under each line of the hook, then the build-up
  pad(0, 4 * beat - 0.1, CHORDS.Am, 0.12, 0.35);
  // the three stops: everything hits together on each word, then silence
  for (const bt of song.stabs) {
    const t = bt * beat;
    kick(t, 1);
    clap(t, 0.55);
    crash(t, 0.12);
    pad(t, 0.3, CHORDS[chordAt(bt)], 0.32, 0.7);
    bass(t, 0.3, ROOTS[chordAt(bt)], 0.4);
  }
  for (const [a, z] of song.risers) riser(a, z, 0.3);
  // the ending: a held C chord that rings out
  const end = song.outro * beat;
  pad(end, seconds - end - 0.3, CHORDS.C.concat([76]), 0.16, 0.4);
  [72, 76, 79, 84].forEach((m, i) => marimba(music, end + i * 0.06, freq(m), 0.16));

  // sound effects on the animation's cues
  for (const e of events) {
    if (e.kind === 'pluck') marimba(fx, e.t, freq([69, 72, 76, 81][[0, 2, 4, 7].indexOf(e.note)] || 69), 0.4);
    else if (e.kind === 'crash') crash(e.t, 0.32);
    else if (e.kind === 'tap') hat(e.t, 0.18, 0.006);
    else if (e.kind === 'key') hat(e.t, 0.08, 0.004);
    else if (e.kind === 'pop' || e.kind === 'send' || e.kind === 'recv') {
      const f0 = e.kind === 'recv' ? 700 : 520 + e.note * 30;
      add(fx, e.t, 0.15, (t) => 0.22 * Math.exp(-t / 0.04) * Math.sin(2 * Math.PI * f0 * (1 + Math.min(1, t / 0.04) * 0.5) * t));
    } else if (e.kind === 'badge') {
      marimba(fx, e.t, freq(84), 0.16);
      marimba(fx, e.t + 0.06, freq(88), 0.14);
    } else if (e.kind === 'burst') {
      for (let i = 0; i < 6; i++) marimba(fx, e.t + i * 0.025, freq(72 + [0, 4, 7, 12, 16, 19][i]), 0.08);
    }
  }

  // sidechain: chords and bass duck under each kick, which is what makes it pump
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const bt = Math.floor(t / beat);
    const since = t - bt * beat;
    const ducking = inGroove(bt) || song.stabs.includes(bt) ? 1 - 0.7 * Math.exp(-since / 0.07) : 1;
    out[i] = drums[i] + music[i] * ducking + fx[i];
  }
  // a little room, then glue it together
  const wet = new Float32Array(N);
  for (const [ms, fb] of [[29, 0.3], [41, 0.27], [59, 0.24], [83, 0.2]]) {
    const d = Math.round((ms / 1000) * RATE);
    const comb = new Float32Array(N);
    for (let i = 0; i < N; i++) comb[i] = music[i] + fx[i] + (i >= d ? fb * comb[i - d] : 0);
    for (let i = 0; i < N; i++) wet[i] += comb[i] * 0.045;
  }
  // level it, then round off only the loudest peaks (a gentle limiter, so the kick still punches)
  let peak = 0;
  for (let i = 0; i < N; i++) {
    out[i] += wet[i];
    peak = Math.max(peak, Math.abs(out[i]));
  }
  const DRIVE = 1.4;
  for (let i = 0; i < N; i++) out[i] = Math.tanh((DRIVE * out[i]) / peak) / Math.tanh(DRIVE);
  const scale = 0.7;
  const fade = RATE * 0.4;
  const pcm = Buffer.alloc(N * 4);
  for (let i = 0; i < N; i++) {
    const v = Math.round(Math.max(-1, Math.min(1, out[i] * scale * Math.min(1, (N - i) / fade))) * 32767);
    pcm.writeInt16LE(v, i * 4);
    pcm.writeInt16LE(v, i * 4 + 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

// ---------------------------------------------------------------- frames
(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/nook/promo/ad.html?render`, { waitUntil: 'load' });
  await page.evaluate(() => window.AD.ready);
  const { DURATION, EVENTS, SONG } = await page.evaluate(() => ({ DURATION: window.AD.DURATION, EVENTS: window.AD.EVENTS, SONG: window.AD.SONG }));
  const shot = (t) => page.evaluate((t) => window.AD.renderAt(t), t).then(() => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } }));

  if (AUDIO_ONLY) {
    fs.writeFileSync(path.resolve(AUDIO_ONLY), soundtrack(SONG, EVENTS, DURATION));
    console.log('Saved', path.resolve(AUDIO_ONLY));
  } else if (STILLS) {
    const dir = path.resolve(opt('dir', path.join(os.tmpdir(), 'budgie-stills')));
    fs.mkdirSync(dir, { recursive: true });
    for (const t of STILLS.split(',').map(Number)) fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await shot(t));
    console.log('Stills in', dir);
  } else {
    const wav = path.join(os.tmpdir(), `budgie-ad-${process.pid}.wav`);
    fs.writeFileSync(wav, soundtrack(SONG, EVENTS, DURATION));
    const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wav,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS),
      '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', OUT], { stdio: ['pipe', 'inherit', 'inherit'] });
    const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code ? reject(new Error('ffmpeg failed: ' + code)) : resolve())));
    const frames = Math.round(DURATION * FPS);
    for (let f = 0; f < frames; f++) {
      const png = await shot(f / FPS);
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (f % FPS === 0) process.stdout.write(`\r${Math.round((f / frames) * 100)}%`);
    }
    ffmpeg.stdin.end();
    await done;
    fs.unlinkSync(wav);
    console.log('\rSaved', OUT);
  }
  await browser.close();
  server.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
