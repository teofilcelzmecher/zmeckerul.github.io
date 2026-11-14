// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Videos in posts (from Budgie 1.0), made ready on this computer with ffmpeg (installed with the server):
 * whatever a phone or camera recorded becomes a plain MP4 (H.264 and AAC, at most 1280 pixels a side and
 * 30 frames a second, at most a minute long), without the hidden details a recording carries (where and
 * when it was made). Frames from across it are then checked for nudity like any picture (pictures.js).
 *
 *   available() → whether ffmpeg and ffprobe are there (without them, Budgie doesn't take videos)
 *   probe(file) → { duration, width, height, audio } of a recording, or an error if it isn't a video
 *   prepare(input, output) → makes the MP4; resolves with probe() of it
 *   frames(file, duration, count) → JPEG stills spread across it, for the nudity check
 *   poster(file, duration) → a JPEG still near its start, shown before it plays
 *
 * Only one video is made at a time (it takes the computer a while), so the server stays quick.
 */
'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MAX_SECONDS = 60;
const MAX_SIDE = 1280;

let present = null;
function available() {
  if (present === null) {
    try {
      present = ['ffmpeg', 'ffprobe'].every((tool) => spawnSync(tool, ['-version'], { timeout: 5000, stdio: 'ignore' }).status === 0);
    } catch (_) {
      present = false;
    }
  }
  return present;
}

/** runs a tool; resolves with what it wrote, or rejects with its complaint */
function run(tool, args, { timeout = 180000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${tool} took too long`));
    }, timeout);
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => (err = (err + d).slice(-2000)));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`${tool} failed: ${err.trim().split('\n').pop()}`));
    });
  });
}

// one at a time
let queue = Promise.resolve();
const oneAtATime = (job) => {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
};

async function probe(file) {
  let info;
  try {
    info = JSON.parse(String(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { timeout: 30000 })));
  } catch (_) {
    throw Object.assign(new Error('That doesn’t look like a video. Try an MP4, MOV or WebM.'), { unreadable: true });
  }
  const v = (info.streams || []).find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  if (!v) throw Object.assign(new Error('That doesn’t look like a video. Try an MP4, MOV or WebM.'), { unreadable: true });
  // a phone's portrait video is stored on its side, with a note to turn it
  const rotation = Math.abs(Number((v.tags && v.tags.rotate) || ((v.side_data_list || []).find((d) => d.rotation != null) || {}).rotation || 0)) % 180;
  const width = Number(rotation === 90 ? v.height : v.width) || 0;
  const height = Number(rotation === 90 ? v.width : v.height) || 0;
  const duration = Number((info.format && info.format.duration) || v.duration || 0);
  return { duration, width, height, audio: (info.streams || []).some((s) => s.codec_type === 'audio') };
}

function prepare(input, output) {
  return oneAtATime(async () => {
    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', input,
      '-t', String(MAX_SECONDS),
      '-map', '0:v:0', '-map', '0:a:0?',
      // at most 1280 pixels a side, in even numbers (which H.264 needs), turned the right way up
      '-vf', `scale=w='min(${MAX_SIDE},iw)':h='min(${MAX_SIDE},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      '-fpsmax', '30',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
      // nothing about where or when it was recorded, and it can start playing before it has all arrived
      '-map_metadata', '-1', '-map_chapters', '-1', '-movflags', '+faststart',
      '-threads', '2',
      output,
    ]);
    return probe(output);
  });
}

/** JPEG stills spread across a video (cut from the made MP4), small, for the nudity check */
async function frames(file, duration, count = 8) {
  const dir = fs.mkdtempSync(path.join(path.dirname(file), 'frames-'));
  try {
    const every = Math.max(0.2, duration / count);
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `fps=1/${every.toFixed(3)},scale=320:-2`, '-frames:v', String(count), '-q:v', '4', path.join(dir, 'f%02d.jpg')], { timeout: 60000 });
    return fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f)));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** a still near the start (a second in, or the middle of a very short one), to show before it plays */
async function poster(file, duration) {
  const at = Math.min(1, duration / 2);
  return run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-ss', at.toFixed(2), '-i', file, '-frames:v', '1', '-q:v', '4', '-f', 'image2pipe', '-c:v', 'mjpeg', '-'], { timeout: 30000 });
}

module.exports = { available, probe, prepare, frames, poster, MAX_SECONDS, MAX_SIDE };
