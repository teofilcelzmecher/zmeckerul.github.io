#!/usr/bin/env node
// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * Turns ad.html into an MP4 for TikTok, Reels and Shorts (1080×1920).
 *
 *   node nook/promo/render.js                    → nook/promo/budgie-ad.mp4, 60 fps, with sound
 *   node nook/promo/render.js --fps 30 --out x.mp4
 *   node nook/promo/render.js --stills 0.5,2,7  → PNGs of those moments, to check a change quickly
 *
 * Needs Playwright with Chromium, and ffmpeg. The soundtrack (soft marimba notes, pops,
 * taps and whooshes on the animation's cues) is made here from plain sine waves and noise,
 * so there's no music licence to worry about.
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

// ---------------------------------------------------------------- the soundtrack
const RATE = 48000;
const PENTA = [0, 2, 4, 7, 9];
const pitch = (degree) => 261.63 * Math.pow(2, (PENTA[degree % 5] + 12 * Math.floor(degree / 5)) / 12);

function soundtrack(events, seconds) {
  const out = new Float32Array(Math.ceil(seconds * RATE));
  const add = (start, length, fn) => {
    const s0 = Math.round(start * RATE);
    for (let i = 0; i < length * RATE; i++) {
      const j = s0 + i;
      if (j >= 0 && j < out.length) out[j] += fn(i / RATE);
    }
  };
  const attack = (t) => Math.min(1, t / 0.002);
  let seed = 7;
  const noise = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

  const marimba = (start, f, gain) =>
    add(start, 1.2, (t) => attack(t) * gain * (
      Math.exp(-t / 0.32) * Math.sin(2 * Math.PI * f * t) +
      0.32 * Math.exp(-t / 0.06) * Math.sin(2 * Math.PI * f * 3.93 * t) +
      0.1 * Math.exp(-t / 0.012) * Math.sin(2 * Math.PI * f * 9.5 * t)));
  const pop = (start, f, gain) =>
    add(start, 0.18, (t) => {
      const sweep = f * (0.7 + 0.6 * Math.min(1, t / 0.05));
      return attack(t) * gain * Math.exp(-t / 0.045) * Math.sin(2 * Math.PI * sweep * t);
    });
  const tap = (start, gain) => {
    let lp = 0;
    add(start, 0.05, (t) => {
      lp += 0.35 * (noise() - lp);
      return gain * Math.exp(-t / 0.008) * (0.6 * lp + 0.5 * Math.sin(2 * Math.PI * 1900 * t));
    });
  };
  const whoosh = (start, gain) => {
    let lp = 0;
    const length = 0.5;
    add(start - 0.05, length, (t) => {
      const p = t / length;
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * Math.min(1, p * 1.2));
      lp += cutoff * (noise() - lp);
      return gain * Math.pow(Math.sin(Math.PI * Math.pow(p, 0.8)), 2) * lp;
    });
  };
  const pad = (start, freqs, gain) =>
    add(start, 2.6, (t) => {
      const env = Math.min(1, t / 0.08) * Math.exp(-t / 1.1);
      return gain * env * freqs.reduce((sum, f, k) => sum + Math.sin(2 * Math.PI * f * t + k) * (1 + 0.003 * Math.sin(5 * t)), 0) / freqs.length;
    });

  for (const e of events) {
    if (e.kind === 'note') marimba(e.t, pitch(e.note + 5), 0.42);
    else if (e.kind === 'pop') pop(e.t, pitch(e.note + 8), 0.3);
    else if (e.kind === 'tap') tap(e.t, 0.25);
    else if (e.kind === 'whoosh') whoosh(e.t, 0.9);
    else if (e.kind === 'chord') {
      [5, 7, 8, 10].forEach((d, i) => marimba(e.t + i * 0.035, pitch(d + 5), 0.3));
      pad(e.t, [5, 7, 8].map((d) => pitch(d)), 0.22);
    }
  }

  // a little room around it
  const wet = new Float32Array(out.length);
  for (const [ms, fb] of [[37, 0.32], [53, 0.28], [71, 0.24], [97, 0.2]]) {
    const d = Math.round((ms / 1000) * RATE);
    const comb = new Float32Array(out.length);
    for (let i = 0; i < out.length; i++) comb[i] = out[i] + (i >= d ? fb * comb[i - d] : 0);
    for (let i = 0; i < out.length; i++) wet[i] += comb[i] * 0.07;
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs((out[i] += wet[i])));
  const scale = peak > 0 ? 0.85 / peak : 1;
  const fade = RATE * 0.25;
  const pcm = Buffer.alloc(out.length * 4);
  for (let i = 0; i < out.length; i++) {
    const end = Math.min(1, (out.length - i) / fade);
    const v = Math.round(Math.max(-1, Math.min(1, out[i] * scale * end)) * 32767);
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
  const { DURATION, EVENTS } = await page.evaluate(() => ({ DURATION: window.AD.DURATION, EVENTS: window.AD.EVENTS }));
  const shot = (t) => page.evaluate((t) => window.AD.renderAt(t), t).then(() => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } }));

  if (STILLS) {
    const dir = path.resolve(opt('dir', path.join(os.tmpdir(), 'budgie-stills')));
    fs.mkdirSync(dir, { recursive: true });
    for (const t of STILLS.split(',').map(Number)) fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await shot(t));
    console.log('Stills in', dir);
  } else {
    const wav = path.join(os.tmpdir(), `budgie-ad-${process.pid}.wav`);
    fs.writeFileSync(wav, soundtrack(EVENTS, DURATION));
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
