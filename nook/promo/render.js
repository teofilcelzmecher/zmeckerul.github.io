#!/usr/bin/env node
// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * Turns ad.html into an MP4 for TikTok, Reels and Shorts (1080×1920).
 *
 *   node nook/promo/render.js                         → nook/promo/budgie-ad.mp4, 60 fps, with the "sunny" music
 *   node nook/promo/render.js --music tropical        → the same with another style (sunny, tropical, lofi)
 *   node nook/promo/render.js --music sunny,lofi      → one video per style: budgie-ad-sunny.mp4, budgie-ad-lofi.mp4
 *   node nook/promo/render.js --video old.mp4 --music lofi   → reuse the frames of a video already made; only the music changes
 *   node nook/promo/render.js --stills 0.5,2,7        → PNGs of those moments, to check a change quickly
 *   node nook/promo/render.js --audio x.wav           → just the music
 *   --fps 30, --out x.mp4 and --dir (for stills) change where and how.
 *
 * Needs Playwright with Chromium, ffmpeg, and for the music fluidsynth with a General MIDI
 * soundfont (see music.js). The music is written note by note in music.js, so there's no
 * music licence to worry about.
 */
'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('playwright');
const { soundtrack, STYLES } = require('./music');

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
const VIDEO = opt('video', '');
const MUSIC = opt('music', 'sunny').split(',');
for (const m of MUSIC) if (!STYLES.includes(m)) throw new Error(`No music style "${m}". Try: ${STYLES.join(', ')}`);

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

// the frames, piped into ffmpeg as a silent video
async function frames(shot, duration, file) {
  const ffmpeg = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', String(FPS), file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((resolve, reject) => ffmpeg.on('close', (code) => (code ? reject(new Error('ffmpeg failed: ' + code)) : resolve())));
  const count = Math.round(duration * FPS);
  for (let f = 0; f < count; f++) {
    const png = await shot(f / FPS);
    if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
    if (f % FPS === 0) process.stdout.write(`\r${Math.round((f / count) * 100)}%`);
  }
  ffmpeg.stdin.end();
  await done;
  process.stdout.write('\r');
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/nook/promo/ad.html?render`, { waitUntil: 'load' });
  await page.evaluate(() => window.AD.ready);
  const { DURATION, SONG } = await page.evaluate(() => ({ DURATION: window.AD.DURATION, SONG: window.AD.SONG }));
  const shot = (t) => page.evaluate((t) => window.AD.renderAt(t), t).then(() => page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: 1080, height: 1920 } }));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'budgie-ad-'));

  if (AUDIO_ONLY) {
    console.log('Saved', soundtrack(SONG, MUSIC[0], DURATION, path.resolve(AUDIO_ONLY)));
  } else if (STILLS) {
    const dir = path.resolve(opt('dir', path.join(os.tmpdir(), 'budgie-stills')));
    fs.mkdirSync(dir, { recursive: true });
    for (const t of STILLS.split(',').map(Number)) fs.writeFileSync(path.join(dir, `t${t.toFixed(2)}.png`), await shot(t));
    console.log('Stills in', dir);
  } else {
    const silent = VIDEO ? path.resolve(VIDEO) : path.join(tmp, 'frames.mp4');
    if (!VIDEO) await frames(shot, DURATION, silent);
    for (const style of MUSIC) {
      const out = MUSIC.length > 1 ? OUT.replace(/\.mp4$/i, `-${style}.mp4`) : OUT;
      const wav = soundtrack(SONG, style, DURATION, path.join(tmp, `${style}.wav`));
      const r = spawnSync('ffmpeg', ['-y', '-v', 'error', '-i', silent, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
        '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out + '.part.mp4'], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error('ffmpeg failed: ' + r.stderr);
      fs.renameSync(out + '.part.mp4', out);
      console.log('Saved', out);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  await browser.close();
  server.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
