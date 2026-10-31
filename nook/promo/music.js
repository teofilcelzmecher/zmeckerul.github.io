// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * The ad's music. It's written here as notes (a MIDI file), played by FluidSynth with the
 * FluidR3 General MIDI instruments (real recorded instruments, MIT licence), then mastered
 * with ffmpeg to -14 LUFS, the level TikTok, Reels and Shorts play at.
 *
 * Three styles share one song, timed to the video (see SONG in ad.html):
 *   sunny     strummed guitar, glockenspiel and marimba, bass, strings, claps and tambourine
 *   tropical  offbeat piano, steel drums and marimba, synth bass, four-on-the-floor, shaker
 *   lofi      Rhodes with jazzy chords, vibraphone, upright bass, a laid-back half-time beat
 *
 * soundtrack(song, style, seconds, wavFile) writes the finished WAV.
 * Needs fluidsynth and the FluidR3_GM soundfont (Debian/Ubuntu: fluidsynth fluid-soundfont-gm;
 * Arch: fluidsynth soundfont-fluid), or set BUDGIE_SOUNDFONT to another General MIDI .sf2.
 */
'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const SOUNDFONT = process.env.BUDGIE_SOUNDFONT ||
  ['/usr/share/sounds/sf2/FluidR3_GM.sf2', '/usr/share/soundfonts/FluidR3_GM.sf2', '/usr/share/soundfonts/default.sf2'].find((f) => fs.existsSync(f));
const PPQ = 480;
const REVERSE_CYMBAL_PEAK = 1.33; // seconds from the start of FluidR3's reverse cymbal to its loudest point

// ---------------------------------------------------------------- the notes
const UPPER = { C: [60, 64, 67, 72], G: [59, 62, 67, 71], Am: [57, 60, 64, 69], F: [57, 60, 65, 69] };
const LOW = { C: [48, 55, 64], G: [47, 55, 62], Am: [45, 52, 60], F: [45, 53, 60] };
const JAZZY = { C: [52, 55, 59, 62], G: [53, 57, 59, 64], Am: [55, 59, 60, 64], F: [52, 55, 57, 60] };
const ROOT = { C: 36, G: 31, Am: 33, F: 29 };
// the hook, one bar per chord: [16th, note, length in 16ths] ("sol-mi-sol-la-sol", like a playground chant)
const HOOK = {
  C: [[0, 79, 2], [2, 76, 2], [4, 79, 2], [7, 81, 3], [10, 79, 6]],
  G: [[0, 79, 2], [2, 74, 2], [4, 79, 2], [7, 81, 3], [10, 83, 6]],
  Am: [[0, 84, 2], [2, 81, 2], [4, 76, 2], [7, 79, 3], [10, 81, 6]],
  F: [[0, 81, 2], [2, 84, 2], [4, 81, 2], [7, 79, 3], [10, 77, 2], [12, 76, 2], [14, 74, 2]],
};
// the last bar, half F and half G, climbing up to the final C
const CADENCE = [[0, 81, 2], [2, 84, 2], [4, 81, 2], [6, 79, 2], [8, 79, 2], [10, 83, 2], [12, 86, 4]];

// General MIDI drum keys
const KICK = 36, SNARE = 38, CLAP = 39, HAT = 42, OPEN_HAT = 46, CRASH = 49, CRASH2 = 57, TAMB = 54, SHAKER = 70;
const TOMS = [50, 48, 47, 45];

// ---------------------------------------------------------------- a small MIDI writer
class Score {
  constructor(bpm) {
    this.bpm = bpm;
    this.events = [];
    this.seed = 5;
  }
  rnd() {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647 - 0.5;
  }
  at(beat) {
    return Math.max(0, Math.round(beat * PPQ));
  }
  channel(ch, program, { volume = 100, pan = 64, reverb = 40, chorus = 0 } = {}) {
    this.events.push([0, 1, [0xb0 | ch, 0, 0]], [0, 1, [0xc0 | ch, program]], [0, 1, [0xb0 | ch, 7, volume]],
      [0, 1, [0xb0 | ch, 10, pan]], [0, 1, [0xb0 | ch, 91, reverb]], [0, 1, [0xb0 | ch, 93, chorus]]);
  }
  // a note, a touch loose in timing and velocity like a person playing it (drums stay tight)
  note(ch, beat, length, key, velocity) {
    const b = beat + (ch === 9 ? 0 : this.rnd() * 0.01);
    const v = Math.max(1, Math.min(127, Math.round(velocity + this.rnd() * 8)));
    this.events.push([this.at(b), 2, [0x90 | ch, key, v]], [this.at(b + Math.max(0.03, length)), 0, [0x80 | ch, key, 0]]);
  }
  drum(beat, key, velocity, length = 0.2) {
    this.note(9, beat, length, key, velocity);
  }
  chord(ch, beat, length, keys, velocity) {
    keys.forEach((k) => this.note(ch, beat, length, k, velocity));
  }
  // a strummed chord: one string just after the other, down (low to high) or up
  strum(ch, beat, length, keys, velocity, up = false) {
    (up ? [...keys].reverse() : keys).forEach((k, i) => this.note(ch, beat + i * 0.03, length - i * 0.03, k, velocity - i * 4));
  }
  write(file) {
    // at the same moment: note-offs first, then settings, then note-ons
    const events = this.events.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const vlq = (n) => {
      const out = [n & 0x7f];
      while ((n >>= 7)) out.unshift((n & 0x7f) | 0x80);
      return out;
    };
    const tempo = Math.round(60e6 / this.bpm);
    const bytes = [0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255];
    let last = 0;
    for (const [tick, , data] of events) {
      bytes.push(...vlq(tick - last), ...data);
      last = tick;
    }
    bytes.push(0, 0xff, 0x2f, 0);
    const len = bytes.length;
    fs.writeFileSync(file, Buffer.concat([
      Buffer.from([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, PPQ >> 8, PPQ & 255]),
      Buffer.from('MTrk'), Buffer.from([(len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255]), Buffer.from(bytes),
    ]));
  }
}

// a held chord for a bar (or two halves, when the chord changes halfway)
function holdBar(s, ch, b, chordAt, voicing, velocity) {
  if (chordAt(b) === chordAt(b + 2)) s.chord(ch, b, 3.96, voicing[chordAt(b)], velocity);
  else [0, 2].forEach((h) => s.chord(ch, b + h, 1.96, voicing[chordAt(b + h)], velocity));
}

// ---------------------------------------------------------------- the three styles
// channels: 0 rhythm, 1 bass, 2 lead, 3 lead double, 4 pad, 5 reverse cymbal, 6 intro, 9 drums
// drums(s, n) plays beat n of the song; n % 4 is where it falls in its bar
const STYLES = {
  sunny: {
    setup(s) {
      s.channel(0, 24, { volume: 77, pan: 44, reverb: 45, chorus: 30 }); // nylon guitar
      s.channel(1, 33, { volume: 104, reverb: 10 }); // finger bass
      s.channel(2, 9, { volume: 88, pan: 80, reverb: 70 }); // glockenspiel
      s.channel(3, 12, { volume: 96, pan: 52, reverb: 50 }); // marimba
      s.channel(4, 48, { volume: 62, reverb: 80, chorus: 40 }); // strings
      s.channel(6, 0, { volume: 90, reverb: 60 }); // piano
    },
    bar(s, b, chordAt) {
      // the island strum: down, down-up, up-down-up
      const strums = [[0, 0, 98], [4, 0, 84], [6, 1, 68], [10, 1, 72], [12, 0, 90], [14, 1, 66]];
      strums.forEach(([st, up, v], i) => {
        const next = i + 1 < strums.length ? strums[i + 1][0] : 16;
        s.strum(0, b + st / 4, (next - st) / 4 - 0.02, UPPER[chordAt(b + st / 4)], v, !!up);
      });
      [[0, 0, 0.9], [6, 0, 0.4], [8, 0, 0.9], [12, 12, 0.4], [14, 7, 0.4]].forEach(([st, up, len]) => s.note(1, b + st / 4, len, ROOT[chordAt(b + st / 4)] + up, 100));
      holdBar(s, 4, b, chordAt, LOW, 58);
    },
    drums(s, n) {
      if (n % 2 === 0) s.drum(n, KICK, 112);
      if (n % 4 === 2) s.drum(n + 0.5, KICK, 80);
      if (n % 2 === 1) (s.drum(n, SNARE, 84), s.drum(n, CLAP, 96));
      s.drum(n, TAMB, 46);
      s.drum(n + 0.5, TAMB, 78);
      [0.25, 0.75].forEach((x) => s.drum(n + x, HAT, 34));
    },
    lead(s, beat, key, length, v) {
      s.note(2, beat, length, key, v);
      s.note(3, beat, length, key - 12, v - 8);
    },
    hit(s, beat, name, length) {
      s.strum(0, beat, length, UPPER[name], 118);
      s.chord(4, beat, length + 0.3, LOW[name], 92);
      s.chord(6, beat, length, UPPER[name].map((k) => k + 12), 96);
      s.note(1, beat, length, ROOT[name], 112);
    },
  },

  tropical: {
    setup(s) {
      s.channel(0, 0, { volume: 92, pan: 56, reverb: 50 }); // piano
      s.channel(1, 38, { volume: 92, reverb: 12 }); // synth bass
      s.channel(2, 114, { volume: 86, pan: 72, reverb: 55 }); // steel drums
      s.channel(3, 12, { volume: 92, pan: 50, reverb: 45 }); // marimba
      s.channel(4, 89, { volume: 58, reverb: 70, chorus: 50 }); // warm pad
      s.channel(6, 0, { volume: 90, reverb: 60 }); // piano
    },
    bar(s, b, chordAt) {
      [2, 6, 10, 14].forEach((st) => s.chord(0, b + st / 4, 0.32, UPPER[chordAt(b + st / 4)], 84));
      [[0, 0], [3, 0], [6, 12], [8, 0], [11, 0], [14, 12]].forEach(([st, up]) => s.note(1, b + st / 4, 0.36, ROOT[chordAt(b + st / 4)] + 12 + up, 98));
      holdBar(s, 4, b, chordAt, LOW, 54);
    },
    drums(s, n) {
      s.drum(n, KICK, 114);
      if (n % 2 === 1) s.drum(n, CLAP, 100);
      s.drum(n + 0.5, OPEN_HAT, 62);
      [0, 0.25, 0.5, 0.75].forEach((x, i) => s.drum(n + x, SHAKER, i % 2 ? 58 : 38));
    },
    lead(s, beat, key, length, v) {
      s.note(2, beat, length, key - 12, v);
      s.note(3, beat, length, key, v - 14);
    },
    hit(s, beat, name, length) {
      s.chord(0, beat, length, UPPER[name], 118);
      s.chord(0, beat, length, UPPER[name].map((k) => k - 12), 100);
      s.chord(4, beat, length + 0.3, LOW[name], 90);
      s.note(1, beat, length, ROOT[name] + 12, 110);
    },
  },

  lofi: {
    setup(s) {
      s.channel(0, 4, { volume: 82, pan: 58, reverb: 55, chorus: 60 }); // Rhodes
      s.channel(1, 32, { volume: 108, reverb: 15 }); // upright bass
      s.channel(2, 11, { volume: 118, pan: 72, reverb: 65 }); // vibraphone
      s.channel(3, 10, { volume: 70, pan: 44, reverb: 70 }); // music box
      s.channel(4, 49, { volume: 62, reverb: 80 }); // slow strings
      s.channel(6, 4, { volume: 92, reverb: 60, chorus: 60 }); // Rhodes
    },
    bar(s, b, chordAt) {
      [[0, 1.45, 72], [6, 0.4, 52], [10, 1.45, 64]].forEach(([st, len, v]) => s.strum(0, b + st / 4, len, JAZZY[chordAt(b + st / 4)], v));
      [[0, 0, 1.4], [7, 0, 0.35], [10, 7, 0.9]].forEach(([st, up, len]) => s.note(1, b + st / 4, len, ROOT[chordAt(b + st / 4)] + 12 + up, 96));
      holdBar(s, 4, b, chordAt, LOW, 46);
    },
    drums(s, n) {
      // half-time: kick on 1 and the "and" of 3, snare on 3, lazy swung hats
      if (n % 4 === 0) s.drum(n, KICK, 100);
      if (n % 4 === 2) (s.drum(n, SNARE, 86), s.drum(n + 0.5, KICK, 84));
      s.drum(n, HAT, 58);
      s.drum(n + 0.58, HAT, 38);
    },
    lead(s, beat, key, length, v) {
      s.note(2, beat, length, key - 12, v - 10);
      s.note(3, beat, length, key, v - 30);
    },
    hit(s, beat, name, length) {
      s.strum(0, beat, length, JAZZY[name], 110);
      s.chord(4, beat, length + 0.3, LOW[name], 80);
      s.note(1, beat, length, ROOT[name] + 12, 112);
    },
  },
};

// ---------------------------------------------------------------- the arrangement, timed to the video
function compose(song, styleName) {
  const style = STYLES[styleName];
  if (!style) throw new Error(`No music style "${styleName}". Try: ${Object.keys(STYLES).join(', ')}`);
  const s = new Score(song.bpm);
  style.setup(s);
  s.channel(5, 119, { volume: 82, reverb: 40 }); // reverse cymbal
  s.channel(9, 0, { volume: styleName === 'lofi' ? 122 : 112, reverb: 22 });
  const perSecond = song.bpm / 60;
  const chordAt = (b) => song.chords.reduce((c, [at, name]) => (b >= at - 1e-9 ? name : c), song.chords[0][1]);
  // a reverse cymbal that peaks right on beat b
  const swell = (b, v = 92) => s.note(5, b - REVERSE_CYMBAL_PEAK * perSecond, REVERSE_CYMBAL_PEAK * perSecond, 60, v);
  // snare hits that speed up into a drop (eighths, sixteenths, then thirty-seconds)
  const roll = (a, z) => {
    for (let b = a; b < z - 1e-6;) {
      const p = (b - a) / (z - a);
      s.drum(b, SNARE, 50 + 60 * p);
      b += p < 0.5 ? 0.5 : p < 0.8 ? 0.25 : 0.125;
    }
  };

  // the intro: two flat, low thuds ("Social media / got boring."), then two bright notes ("So I made / my own.")
  [[0, 112], [1, 96]].forEach(([b, v]) => {
    s.chord(6, b, 0.6, [36, 48, 55], v);
    s.drum(b, KICK, v);
  });
  style.lead(s, 2, 79, 0.9, 96);
  style.lead(s, 3, 84, 0.9, 104);
  for (const [a, z] of song.rolls) roll(a * perSecond, z * perSecond);

  // the drops: a cymbal swell into a crash; a crash on each cut; swells into the scenes after the fills
  for (const d of song.drops) {
    swell(d);
    s.drum(d, CRASH, 112, 1);
  }
  for (const c of song.cuts) s.drum(c * perSecond, CRASH2, 72, 1);
  for (const f of song.fills) swell(f + 1, 70);
  swell(song.stabs[0], 84);

  // the groove, bar by bar and beat by beat; the fills are a run down the toms
  for (const [a, z] of song.groove) {
    for (let b = a; b < z; b += 4) {
      style.bar(s, b, chordAt);
      const line = b === song.groove[song.groove.length - 1][0] ? CADENCE : HOOK[chordAt(b)];
      for (const [st, key, len] of line) style.lead(s, b + st / 4, key, len / 4 - 0.02, 100);
    }
    for (let n = a; n < z; n++) {
      if (song.fills.includes(n)) TOMS.forEach((t, i) => s.drum(n + i / 4, t, 92 + i * 6));
      else style.drums(s, n);
    }
  }

  // "Free." "No email." "No phone number.": one big hit each, then silence until the roll
  for (const b of song.stabs) {
    style.hit(s, b, chordAt(b), 0.42);
    s.drum(b, KICK, 120);
    s.drum(b, CLAP, 104);
    s.drum(b, CRASH, 100, 1);
  }

  // the end: one big C chord with a little run on top, ringing out under the address
  style.hit(s, song.end, 'C', 2.4);
  s.drum(song.end, KICK, 120);
  s.drum(song.end, CRASH, 112, 2);
  [72, 76, 79, 84].forEach((k, i) => style.lead(s, song.end + i * 0.12, k, 1.6 - i * 0.12, 92));
  return s;
}

// ---------------------------------------------------------------- playing and mastering
function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', maxBuffer: 1 << 26 });
  if (r.error) throw new Error(`${cmd} isn't installed (${r.error.message}).`);
  if (r.status !== 0) throw new Error(`${cmd} failed: ${(r.stderr || '').slice(-600)}`);
  return r;
}

function soundtrack(song, styleName, seconds, wavFile) {
  if (!SOUNDFONT) throw new Error('No General MIDI soundfont found. Install fluid-soundfont-gm (or soundfont-fluid), or set BUDGIE_SOUNDFONT.');
  const base = wavFile.replace(/\.wav$/i, '');
  const mid = base + '.mid', raw = base + '.raw.wav';
  compose(song, styleName).write(mid);
  run('fluidsynth', ['-ni', '-q', '-r', '48000', '-g', '0.45', '-o', 'audio.file.format=float',
    '-o', 'synth.reverb.room-size=0.55', '-o', 'synth.reverb.damp=0.35', '-o', 'synth.reverb.width=0.9', '-o', 'synth.reverb.level=0.75',
    '-F', raw, SOUNDFONT, mid]);
  // glue it a little (gentle compression, a limiter), then set the loudness to -14 LUFS
  const glue = `atrim=0:${seconds},highpass=f=30,acompressor=threshold=0.1:ratio=2:attack=12:release=160:makeup=1.4,alimiter=limit=0.7:level=0`;
  const measured = run('ffmpeg', ['-hide_banner', '-i', raw, '-af', `${glue},ebur128`, '-f', 'null', '-']).stderr;
  const loudness = Number((measured.match(/I:\s+(-?[\d.]+) LUFS\s*\n\s*Threshold/) || [])[1]);
  const gain = Number.isFinite(loudness) ? -14 - loudness : 0;
  run('ffmpeg', ['-y', '-v', 'error', '-i', raw, '-af', `${glue},volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=0,afade=t=out:st=${seconds - 0.5}:d=0.5`,
    '-ar', '48000', '-c:a', 'pcm_s16le', wavFile]);
  fs.rmSync(raw, { force: true });
  fs.rmSync(mid, { force: true });
  return wavFile;
}

module.exports = { soundtrack, compose, STYLES: Object.keys(STYLES) };
