// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * The ad's music, made from scratch (oscillators, filters and noise), so there's no licence to worry about.
 * A 120 BPM pop beat in C major: a supersaw chord pad that pumps with the kick, a bassline, and a bright
 * pluck-and-bell hook in a 3-3-2 rhythm, with risers, snare rolls and impacts timed to the video's cuts.
 *
 * soundtrack(song, events, seconds) → a 48 kHz stereo WAV file (Buffer). `song` comes from ad.html (SONG),
 * `events` are the animation's cues (taps, pops, badges) that get small sounds of their own.
 */
'use strict';

const RATE = 48000;
const TAU = Math.PI * 2;
const hz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// chord voicings that move smoothly from one to the next, and the bass roots under them
const VOICINGS = { C: [60, 64, 67, 72], G: [59, 62, 67, 71], Am: [57, 60, 64, 69], F: [57, 60, 65, 69] };
const ROOTS = { C: 36, G: 43, Am: 45, F: 41 };
// the hook, one bar per chord: [16th, note, length in 16ths], in a 3-3-2 rhythm
const HOOK = {
  C: [[0, 79, 2], [3, 76, 2], [6, 79, 2], [8, 81, 2], [10, 79, 2], [12, 76, 4]],
  G: [[0, 79, 2], [3, 74, 2], [6, 79, 2], [8, 81, 2], [10, 83, 2], [12, 74, 4]],
  Am: [[0, 76, 2], [3, 72, 2], [6, 76, 2], [8, 79, 2], [10, 81, 2], [12, 76, 4]],
  F: [[0, 84, 2], [3, 81, 2], [6, 77, 2], [8, 79, 2], [10, 81, 2], [12, 79, 4]],
};
// the last bar: half a bar of F, half of G, climbing up to the final C
const CADENCE = [[0, 84, 2], [3, 81, 2], [6, 77, 2], [8, 79, 2], [11, 83, 2], [14, 86, 2]];
// the bassline: [16th, octave up?, length in 16ths]
const BASS = [[0, 0, 2], [3, 0, 2], [6, 12, 1], [8, 0, 2], [11, 0, 1], [12, 12, 2], [14, 0, 2]];

// ---------------------------------------------------------------- building blocks
// a state-variable filter (Zavalishin's TPT form): stable even when the cutoff moves every sample
class Filter {
  constructor() {
    this.a = 0;
    this.b = 0;
  }
  run(x, cutoff, q) {
    const g = Math.tan((Math.PI * Math.min(cutoff, RATE * 0.45)) / RATE);
    const k = 1 / q;
    const a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v3 = x - this.b;
    const v1 = a1 * this.a + a2 * v3;
    const v2 = this.b + a2 * this.a + a3 * v3;
    this.a = 2 * v1 - this.a;
    this.b = 2 * v2 - this.b;
    this.lp = v2;
    this.bp = v1;
    this.hp = x - k * v1 - v2;
    return v2;
  }
}
// a sawtooth without aliasing (PolyBLEP)
const blep = (t, dt) => (t < dt ? ((t /= dt), t + t - t * t - 1) : t > 1 - dt ? ((t = (t - 1) / dt), t * t + t + t + 1) : 0);
class Saw {
  constructor(freq, phase) {
    this.dt = freq / RATE;
    this.p = phase;
  }
  next() {
    const v = 2 * this.p - 1 - blep(this.p, this.dt);
    this.p += this.dt;
    if (this.p >= 1) this.p -= 1;
    return v;
  }
}
const pan = (p) => [Math.cos(((p + 1) * Math.PI) / 4), Math.sin(((p + 1) * Math.PI) / 4)];

// Freeverb (eight damped combs and four all-passes per side), for a soft room around everything
function reverb(inL, inR, n, { room = 0.83, damp = 0.4 } = {}) {
  const k = RATE / 44100;
  const side = (spread) => {
    const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * k)), i: 0, z: 0 }));
    const passes = [556, 441, 341, 225].map((d) => ({ buf: new Float32Array(Math.round((d + spread) * k)), i: 0 }));
    const out = new Float32Array(n);
    for (let j = 0; j < n; j++) {
      const x = (inL[j] + inR[j]) * 0.5 * 0.015;
      let s = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.z = y * (1 - damp) + c.z * damp;
        c.buf[c.i] = x + c.z * room;
        if (++c.i === c.buf.length) c.i = 0;
        s += y;
      }
      for (const a of passes) {
        const b = a.buf[a.i];
        a.buf[a.i] = s + b * 0.5;
        if (++a.i === a.buf.length) a.i = 0;
        s = b - s;
      }
      out[j] = s * 3;
    }
    return out;
  };
  return [side(0), side(23)];
}

// a ping-pong echo on dotted eighths, darker with every repeat
function echo(inL, inR, n, delay, feedback = 0.38) {
  const d = Math.round(delay * RATE);
  const L = new Float32Array(n), R = new Float32Array(n);
  let lpL = 0, lpR = 0;
  for (let j = 0; j < n; j++) {
    const back = j >= d;
    const into = back ? (inL[j - d] + inR[j - d]) * 0.5 : 0;
    lpL += 0.45 * ((back ? into + feedback * R[j - d] : 0) - lpL);
    lpR += 0.45 * ((back ? feedback * L[j - d] : 0) - lpR);
    L[j] = lpL;
    R[j] = lpR;
  }
  return [L, R];
}

// ---------------------------------------------------------------- the song
function soundtrack(song, events, seconds) {
  const N = Math.ceil(seconds * RATE);
  const beat = 60 / song.bpm, step = beat / 4;
  const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
  const drums = bus(), music = bus(), lead = bus(), fx = bus(), verb = bus(), delay = bus();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const noise = () => rnd() * 2 - 1;

  // add a sound; fn(t) returns [left, right]; part of it can also go to the reverb and the echo
  function play(target, start, length, fn, { room = 0, echoes = 0 } = {}) {
    const s0 = Math.round(start * RATE), len = Math.round(length * RATE);
    for (let i = 0; i < len; i++) {
      const j = s0 + i;
      if (j < 0 || j >= N) continue;
      const [l, r] = fn(i / RATE);
      target.L[j] += l;
      target.R[j] += r;
      if (room) (verb.L[j] += l * room), (verb.R[j] += r * room);
      if (echoes) (delay.L[j] += l * echoes), (delay.R[j] += r * echoes);
    }
  }

  // --- drums
  const kicks = [];
  function kick(t0, gain = 1) {
    kicks.push(t0);
    let ph = 0;
    const f = new Filter();
    play(drums, t0, 0.42, (t) => {
      ph += (TAU * (50 + 120 * Math.exp(-t * 32) + 260 * Math.exp(-t * 400))) / RATE;
      const click = f.run(noise(), 3500, 0.7) * Math.exp(-t * 700) * 0.6;
      const v = gain * Math.tanh(1.5 * (Math.sin(ph) * Math.exp(-t * 8) + click));
      return [v, v];
    });
  }
  function clap(t0, gain = 1) {
    const fl = new Filter(), fr = new Filter();
    play(drums, t0, 0.4, (t) => {
      const bursts = [0, 0.009, 0.018].reduce((s, d) => s + (t >= d ? Math.exp(-(t - d) / 0.004) : 0), 0);
      const env = bursts * 0.7 + Math.exp(-t / 0.09);
      const body = Math.sin(TAU * 190 * t) * Math.exp(-t * 32) * 0.35;
      fl.run(noise(), 1500, 0.9);
      fr.run(noise(), 1650, 0.9);
      return [gain * (fl.bp * 2.4 * env + body), gain * (fr.bp * 2.4 * env + body)];
    }, { room: 0.2 });
  }
  function snare(t0, gain) {
    const fl = new Filter(), fr = new Filter();
    play(drums, t0, 0.2, (t) => {
      const env = Math.exp(-t / 0.05);
      const body = Math.sin(TAU * 210 * t) * Math.exp(-t * 40) * 0.5;
      fl.run(noise(), 2200, 0.8);
      fr.run(noise(), 2400, 0.8);
      return [gain * (fl.bp * 2 + body) * env, gain * (fr.bp * 2 + body) * env];
    }, { room: 0.15 });
  }
  function hat(t0, gain, open = false, side = 0) {
    const f = new Filter(), [gl, gr] = pan(side), decay = open ? 0.1 : 0.022;
    play(drums, t0, decay * 6, (t) => {
      f.run(noise(), 8000, 0.75);
      const v = gain * f.hp * Math.exp(-t / decay);
      return [v * gl, v * gr];
    }, { room: open ? 0.06 : 0 });
  }
  function crash(t0, gain, length = 2.4) {
    const fl = new Filter(), fr = new Filter();
    play(drums, t0, length, (t) => {
      const e = gain * Math.min(1, t / 0.002) * Math.exp(-t / 0.6);
      fl.run(noise(), 5000, 0.6);
      fr.run(noise(), 5300, 0.6);
      return [fl.hp * e, fr.hp * e];
    }, { room: 0.3 });
  }
  // a cymbal played backwards, swelling into a hit
  function swell(tEnd, length, gain) {
    const fl = new Filter(), fr = new Filter();
    play(fx, tEnd - length, length, (t) => {
      const e = gain * Math.pow(t / length, 3);
      fl.run(noise(), 4000, 0.6);
      fr.run(noise(), 4300, 0.6);
      return [fl.hp * e, fr.hp * e];
    });
  }
  // a deep boom and a crash, for the drops
  function impact(t0, gain) {
    let ph = 0;
    play(fx, t0, 1.6, (t) => {
      ph += (TAU * (34 + 46 * Math.exp(-t * 7))) / RATE;
      const v = gain * Math.min(1, t / 0.003) * Math.sin(ph) * Math.exp(-t * 2.8);
      return [v, v];
    });
    crash(t0, gain * 0.5);
  }
  // noise and a saw sweeping up, for the build-ups
  function riser(t0, t1, gain) {
    const fl = new Filter(), fr = new Filter(), sf = new Filter(), saw = new Saw(180, 0), length = t1 - t0;
    play(fx, t0, length, (t) => {
      const p = t / length, cut = 300 * Math.pow(30, p);
      fl.run(noise(), cut, 2.2);
      fr.run(noise(), cut * 1.06, 2.2);
      saw.dt = (180 * Math.pow(6, p)) / RATE;
      const s = sf.run(saw.next(), 1500 + 4000 * p, 0.9) * 0.12;
      const e = gain * Math.pow(p, 1.8);
      return [(fl.bp * 1.6 + s) * e, (fr.bp * 1.6 + s) * e];
    }, { room: 0.25 });
  }
  // a quick sweep up into a cut
  function whoosh(tEnd, gain) {
    const fl = new Filter(), fr = new Filter(), length = 0.42;
    play(fx, tEnd - length, length + 0.06, (t) => {
      const p = Math.min(1, t / length), cut = 600 * Math.pow(12, p);
      fl.run(noise(), cut, 1.6);
      fr.run(noise(), cut * 1.1, 1.6);
      const e = gain * p * p * (t > length ? Math.exp(-(t - length) * 60) : 1);
      return [fl.bp * e, fr.bp * e];
    }, { room: 0.35 });
  }
  // snare hits that speed up: eighths, then sixteenths, then thirty-seconds
  function roll(t0, t1, gain) {
    for (let t = t0; t < t1 - 1e-6;) {
      const p = (t - t0) / (t1 - t0);
      snare(t, gain * (0.25 + 0.75 * p));
      t += p < 0.5 ? step * 2 : p < 0.75 ? step : step / 2;
    }
  }

  // --- instruments
  // seven-ish detuned saws per note, spread across the stereo field, through a low-pass filter
  function pad(t0, length, notes, gain, { cutoff = () => 2600, attack = 0.03, release = 0.3, room = 0.3 } = {}) {
    const voices = [];
    for (const m of notes)
      for (const [cents, side] of [[-17, -0.75], [-8, -0.35], [0, 0], [8, 0.35], [17, 0.75]])
        voices.push({ osc: new Saw(hz(m) * Math.pow(2, cents / 1200), rnd()), g: pan(side) });
    const fl = new Filter(), fr = new Filter(), norm = gain / Math.sqrt(voices.length);
    play(music, t0, length + release * 5, (t) => {
      let l = 0, r = 0;
      for (const v of voices) {
        const s = v.osc.next();
        l += s * v.g[0];
        r += s * v.g[1];
      }
      const env = Math.min(1, t / attack) * (t < length ? 1 : Math.exp(-(t - length) / release));
      const c = cutoff(t0 + t);
      return [fl.run(l, c, 0.8) * env * norm, fr.run(r, c, 0.8) * env * norm];
    }, { room });
  }
  // a sine for the weight, a filtered saw for the bite (so phone speakers can hear it)
  function bass(t0, length, m, gain) {
    const saw = new Saw(hz(m), 0), f = new Filter(), w = (TAU * hz(m)) / RATE;
    let ph = 0;
    play(music, t0, length + 0.04, (t) => {
      ph += w;
      const env = Math.min(1, t / 0.003) * (t < length ? 1 : Math.exp(-(t - length) / 0.012));
      const bite = f.run(saw.next(), 260 + 1500 * Math.exp(-t * 18), 1.1);
      const v = gain * env * Math.tanh(1.3 * (Math.sin(ph) * 0.9 + bite * 0.7));
      return [v, v];
    });
  }
  // the hook: a plucked pair of saws with a bell on top
  function pluck(t0, length, m, gain) {
    const a = new Saw(hz(m) * 1.004, rnd()), b = new Saw(hz(m) * 0.996, rnd()), fl = new Filter(), fr = new Filter();
    const wc = (TAU * hz(m)) / RATE, wm = wc * 3.5;
    let pc = 0, pm = 0;
    play(lead, t0, length + 0.7, (t) => {
      const env = Math.min(1, t / 0.002) * (0.3 + 0.7 * Math.exp(-t / 0.11)) * (t < length ? 1 : Math.exp(-(t - length) / 0.07));
      const cut = 900 + 5500 * Math.exp(-t * 15);
      const l = fl.run(a.next(), cut, 1.3), r = fr.run(b.next(), cut, 1.3);
      pc += wc;
      pm += wm;
      const ding = Math.sin(pc + 2.3 * Math.exp(-t * 7) * Math.sin(pm)) * Math.exp(-t * 2.8) * 0.6;
      return [gain * (l * env * 0.75 + ding), gain * (r * env * 0.75 + ding)];
    }, { room: 0.22, echoes: 0.26 });
  }
  // an FM bell, for the intro and the little sounds
  function bell(target, t0, m, gain, side = 0) {
    const wc = (TAU * hz(m)) / RATE, wm = wc * 3.5, [gl, gr] = pan(side);
    let pc = 0, pm = 0;
    play(target, t0, 1.8, (t) => {
      pc += wc;
      pm += wm;
      const v = gain * Math.min(1, t / 0.002) * Math.sin(pc + 2.2 * Math.exp(-t * 5) * Math.sin(pm)) * Math.exp(-t * 2.3);
      return [v * gl, v * gr];
    }, { room: 0.35, echoes: 0.18 });
  }

  // ---------------------------------------------------------------- the arrangement
  const chordAt = (bt) => song.chords.reduce((c, [at, name]) => (bt >= at - 1e-9 ? name : c), song.chords[0][1]);
  const grooving = (bt) => song.groove.some(([a, z]) => bt >= a && bt < z);
  const at = (bt) => bt * beat;

  // the intro: a muffled chord that opens up, a bell under each line of the hook, and a build into the drop
  pad(0, at(4) - 0.05, VOICINGS.Am, 0.22, { cutoff: (t) => 300 * Math.pow(12, Math.min(1, t / at(4))), release: 0.12 });
  impact(0, 0.35);
  for (const [a, z] of song.rolls) roll(a, z, 0.42);
  for (const [a, z] of song.risers) riser(a, z, 0.3);
  for (const d of song.drops) {
    swell(at(d), at(2), 0.3);
    impact(at(d), 0.6);
  }
  for (const t of song.cuts) {
    whoosh(t, 0.3);
    crash(t, 0.1);
  }

  // drums: four on the floor, claps on 2 and 4, swung sixteenth hats with an open hat on every "and"
  const lastBeat = Math.round(seconds / beat);
  for (let bt = 0; bt < lastBeat; bt++) {
    if (!grooving(bt)) continue;
    const t = at(bt);
    if (song.fills.includes(bt)) {
      [0, 1, 2, 3].forEach((s) => snare(t + s * step, 0.3 + s * 0.1));
      continue;
    }
    kick(t);
    if (bt % 2 === 1) clap(t, 0.5);
    [0.26, 0.12, 0, 0.16].forEach((g, s) => {
      const ts = t + s * step + (s % 2 ? 0.014 : 0);
      if (s === 2) hat(ts, 0.24, true, 0.2);
      else hat(ts, g, false, s % 2 ? -0.3 : 0.1);
    });
  }

  // chords, held for each chord and pumped by the kick (see the sidechain below)
  song.chords.forEach(([a, name], i) => {
    const next = i + 1 < song.chords.length ? song.chords[i + 1][0] : a + 1;
    if (grooving(a)) pad(at(a), at(next - a) - 0.02, VOICINGS[name], 0.32);
  });

  // bass and hook, bar by bar
  const bars = [];
  for (const [a, z] of song.groove) for (let bar = a; bar < z; bar += 4) bars.push(bar);
  for (const bar of bars) {
    for (const [s, up, len] of BASS) {
      const bt = bar + s / 4;
      if (grooving(Math.floor(bt))) bass(at(bt), len * step - 0.02, ROOTS[chordAt(bt)] + up, 0.5);
    }
    const line = bar === song.groove[song.groove.length - 1][0] ? CADENCE : HOOK[chordAt(bar)];
    for (const [s, m, len] of line) pluck(at(bar + s / 4), len * step - 0.01, m, 0.42);
  }

  // the three stops ("Free." "No email." "No phone number."): everything hits at once, then the room rings
  for (const bt of song.stabs) {
    const t = at(bt), name = chordAt(bt);
    kick(t, 1);
    clap(t, 0.55);
    crash(t, 0.2);
    pad(t, 0.24, VOICINGS[name], 0.65, { cutoff: () => 5000, release: 0.3, room: 0.5 });
    bass(t, 0.3, ROOTS[name], 0.5);
    bell(lead, t, VOICINGS[name][3] + 12, 0.16);
  }

  // the end: one big C chord that rings out under the address
  const end = at(song.end);
  kick(end, 1);
  impact(end, 0.55);
  pad(end, seconds - end - 0.5, VOICINGS.C.concat([76]), 0.55, { release: 0.5, room: 0.5 });
  bass(end, 0.9, 36, 0.5);
  [72, 76, 79, 84].forEach((m, i) => bell(lead, end + i * 0.07, m, 0.18, (i - 1.5) * 0.3));

  // little sounds on the animation's cues
  const PLUCKS = { 0: 69, 2: 72, 4: 76, 7: 81 };
  for (const e of events) {
    if (e.kind === 'pluck') bell(fx, e.t, PLUCKS[e.note] || 69, 0.32);
    else if (e.kind === 'tap') hat(e.t, 0.1, false, 0.3);
    else if (e.kind === 'key') hat(e.t, 0.05, false, -0.3);
    else if (e.kind === 'pop' || e.kind === 'send') bell(fx, e.t, 88, 0.07, 0.3);
    else if (e.kind === 'recv') bell(fx, e.t, 91, 0.07, -0.3);
    else if (e.kind === 'badge') (bell(fx, e.t, 84, 0.08, -0.2), bell(fx, e.t + 0.07, 91, 0.07, 0.2));
    else if (e.kind === 'burst') [84, 88, 91, 96].forEach((m, i) => bell(fx, e.t + i * 0.03, m, 0.05, (i - 1.5) * 0.4));
  }

  // ---------------------------------------------------------------- mixing
  // sidechain: the chords and bass duck under every kick, which is what makes it pump
  kicks.sort((a, b) => a - b);
  const [verbL, verbR] = reverb(verb.L, verb.R, N);
  const [echoL, echoR] = echo(delay.L, delay.R, N, beat * 0.75);
  const L = new Float32Array(N), R = new Float32Array(N);
  let k = 0;
  for (let j = 0; j < N; j++) {
    const t = j / RATE;
    while (k + 1 < kicks.length && kicks[k + 1] <= t) k++;
    const since = kicks.length && kicks[k] <= t ? t - kicks[k] : 9;
    const duck = 1 - 0.65 * Math.exp(-since / 0.1);
    const duckLead = 1 - 0.2 * Math.exp(-since / 0.08);
    L[j] = drums.L[j] + music.L[j] * duck + lead.L[j] * duckLead + fx.L[j] + verbL[j] * 0.9 + echoL[j] * 0.8;
    R[j] = drums.R[j] + music.R[j] * duck + lead.R[j] * duckLead + fx.R[j] + verbR[j] * 0.9 + echoR[j] * 0.8;
  }
  // glue: a gentle compressor, then a soft limiter
  let peak = 0;
  for (let j = 0; j < N; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
  const attack = Math.exp(-1 / (0.005 * RATE)), releaseC = Math.exp(-1 / (0.15 * RATE));
  let env = 0;
  for (let j = 0; j < N; j++) {
    const x = Math.max(Math.abs(L[j]), Math.abs(R[j])) / peak;
    env = x > env ? attack * env + (1 - attack) * x : releaseC * env + (1 - releaseC) * x;
    const over = 20 * Math.log10(env + 1e-9) + 10;
    const g = over > 0 ? Math.pow(10, (-over * (1 - 1 / 2)) / 20) : 1;
    L[j] = (L[j] / peak) * g;
    R[j] = (R[j] / peak) * g;
  }
  peak = 0;
  for (let j = 0; j < N; j++) peak = Math.max(peak, Math.abs(L[j]), Math.abs(R[j]));
  const DRIVE = 1.2, LEVEL = 0.69;
  const shape = (v) => (LEVEL * Math.tanh((DRIVE * v) / peak)) / Math.tanh(DRIVE);
  const fade = RATE * 0.35;
  const pcm = Buffer.alloc(N * 4);
  for (let j = 0; j < N; j++) {
    const f = Math.min(1, (N - j) / fade);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, shape(L[j]) * f)) * 32767), j * 4);
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, shape(R[j]) * f)) * 32767), j * 4 + 2);
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

module.exports = { soundtrack };
