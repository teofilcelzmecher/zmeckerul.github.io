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
 * Needs Playwright with Chromium, and ffmpeg. The music comes from music.js, which makes it
 * from scratch, so there's no music licence to worry about.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const { soundtrack } = require('./music');

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
