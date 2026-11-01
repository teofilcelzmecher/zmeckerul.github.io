// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Calls: voice and video between friends, and in group chats with up to six people. Budgie's server rings people
 * and passes on what WebRTC needs to connect them (offers, answers and network candidates); the sound and pictures
 * go straight between the devices, encrypted, or through Cloudflare's relay once the server's owner has set one up.
 * Nothing is recorded.
 *
 * Here: the live connection to the server (an event stream, or asking every moment while that can't stay open),
 * the screen that rings, the call screen, and one connection to each other person in the call.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  if (Nook.calls) return;
  const store = Nook.store;
  const api = Nook.api;
  const ui = Nook.ui;
  const fx = Nook.fx;
  const { esc, icon, avatar } = ui;
  const app = () => Nook.app;

  const able = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  // calls came with the server's 0.9.0
  const serverCalls = () => {
    const [major, minor] = String(Nook.serverVersion || '0.0').split('.').map(Number);
    return major > 0 || minor >= 9;
  };
  // ringing again and coming back after a reload need the server's 0.9.5
  const server095 = () => !!(Nook.views && Nook.views.serverAt && Nook.views.serverAt('0.9.5'));
  const server100 = () => !!(Nook.views && Nook.views.serverAt && Nook.views.serverAt('1.0.0'));
  // a phone or tablet (a finger, no mouse): its cameras can be switched, and it can't share its screen
  const touchOnly = () => matchMedia('(hover: none) and (pointer: coarse)').matches;
  const lower = (name) => String(name || '').toLowerCase();
  const clock = (ms) => {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
    return (h ? h + ':' : '') + mm + ':' + String(s % 60).padStart(2, '0');
  };
  const who = (call) => (call.group ? call.group.name : 'u/' + call.from);
  const kindOf = (media) => (media === 'video' ? 'Video call' : 'Voice call');

  // ---- sounds, made here: nothing to download ------------------------------------------------------------

  let audio = null;
  function sound() {
    if (!audio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audio = new AC();
    }
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    return audio;
  }
  // a page may only make sound after a tap, so the first tap anywhere gets it ready for a ring later
  addEventListener('pointerdown', () => sound(), { once: true, capture: true });

  function tone(freq, at, length, gain = 0.1, type = 'sine') {
    const a = sound();
    if (!a || a.state !== 'running') return;
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const env = a.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(env).connect(a.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  // the ringtones to pick from in Settings → Calls; "silent" only vibrates
  const RINGTONES = {
    // a bright three-note figure, twice, like a little bird
    budgie() {
      [0, 0.15, 0.3, 0.75, 0.9, 1.05].forEach((at, i) => {
        const f = [783.99, 987.77, 1174.66][i % 3];
        tone(f, at, 0.42, 0.12);
        tone(f * 2, at, 0.12, 0.025);
      });
    },
    // two soft bells
    chime() {
      for (const [f, at] of [[1318.51, 0], [1046.5, 0.42], [1318.51, 1.1], [1046.5, 1.52]]) {
        tone(f, at, 1.1, 0.09);
        tone(f * 2.76, at, 0.5, 0.012);
      }
    },
    // quick bright pulses
    pulse() {
      [0, 0.12, 0.24, 0.36, 0.9, 1.02, 1.14, 1.26].forEach((at) => tone(880, at, 0.09, 0.08, 'triangle'));
    },
    // an old telephone: two buzzes
    classic() {
      for (const at of [0, 0.6]) {
        tone(400, at, 0.4, 0.05, 'square');
        tone(450, at, 0.4, 0.05, 'square');
      }
    },
    silent() {},
  };
  const ringtone = () => (RINGTONES[store.state.settings.ringtone] ? store.state.settings.ringtone : 'budgie');
  const SOUNDS = {
    ring: () => RINGTONES[ringtone()](),
    // what the caller hears while it rings: two soft pips
    ringback() {
      tone(523.25, 0, 0.32, 0.05);
      tone(659.25, 0.38, 0.4, 0.05);
    },
    join() {
      tone(523.25, 0, 0.16, 0.07);
      tone(783.99, 0.09, 0.3, 0.07);
    },
    leave() {
      tone(783.99, 0, 0.16, 0.07);
      tone(523.25, 0.09, 0.3, 0.07);
    },
    end() {
      tone(659.25, 0, 0.18, 0.07);
      tone(523.25, 0.13, 0.18, 0.07);
      tone(392, 0.26, 0.4, 0.07);
    },
    // someone started sharing their screen: three quick rising notes
    stream() {
      tone(659.25, 0, 0.1, 0.05);
      tone(783.99, 0.08, 0.1, 0.05);
      tone(1046.5, 0.16, 0.22, 0.05);
    },
    // deafened: everyone goes quiet (a falling pair); back: a rising pair
    deafen() {
      tone(587.33, 0, 0.12, 0.06, 'triangle');
      tone(392, 0.08, 0.2, 0.06, 'triangle');
    },
    undeafen() {
      tone(392, 0, 0.12, 0.06, 'triangle');
      tone(587.33, 0.08, 0.2, 0.06, 'triangle');
    },
  };

  /** a burst of noise through a filter: a clap, a cymbal, a hiss */
  function noise(at, length, gain, { type = 'bandpass', freq = 1500, q = 1 } = {}) {
    const a = sound();
    if (!a || a.state !== 'running') return;
    const t = a.currentTime + at;
    const frames = Math.ceil(a.sampleRate * (length + 0.02));
    const buffer = a.createBuffer(1, frames, a.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource();
    src.buffer = buffer;
    const filter = a.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(env).connect(a.destination);
    src.start(t);
    src.stop(t + length + 0.02);
  }
  /** a note that slides from one pitch to another, through a soft filter (a brass or a horn when it's a sawtooth),
   *  wobbling if asked */
  function glide(from, to, at, length, gain = 0.08, { type = 'sine', wobble = 0, bright = 2600 } = {}) {
    const a = sound();
    if (!a || a.state !== 'running') return;
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + length);
    const filter = a.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = bright;
    const env = a.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    env.gain.setValueAtTime(gain, t + length * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(filter).connect(env).connect(a.destination);
    if (wobble) {
      const lfo = a.createOscillator();
      const depth = a.createGain();
      lfo.frequency.value = 6;
      depth.gain.value = wobble;
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + length + 0.05);
    }
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  // the soundboard: little sounds anyone in a call can play for everyone, made here like the ringtones
  const BOARD = {
    applause: {
      label: 'Applause',
      emoji: '👏',
      play() {
        for (let i = 0; i < 70; i++) noise(Math.random() * 2.2 * Math.random() ** 0.3, 0.06 + Math.random() * 0.05, 0.03 + Math.random() * 0.05, { freq: 900 + Math.random() * 1800, q: 0.9 });
      },
    },
    tada: {
      label: 'Ta-da',
      emoji: '🎉',
      play() {
        for (const f of [523.25, 659.25, 783.99]) glide(f, f, 0, 0.13, 0.035, { type: 'sawtooth' });
        for (const f of [523.25, 659.25, 783.99, 1046.5]) glide(f, f * 1.003, 0.17, 1.1, 0.035, { type: 'sawtooth', wobble: 4 });
      },
    },
    rimshot: {
      label: 'Ba-dum-tss',
      emoji: '🥁',
      play() {
        glide(240, 110, 0, 0.16, 0.2);
        glide(170, 80, 0.2, 0.2, 0.22);
        noise(0.48, 1.1, 0.06, { type: 'highpass', freq: 7000, q: 0.7 });
        noise(0.48, 0.12, 0.08, { freq: 2500, q: 1.5 });
      },
    },
    boing: {
      label: 'Boing',
      emoji: '🌀',
      play() {
        glide(110, 440, 0, 0.12, 0.12, { type: 'triangle' });
        glide(440, 220, 0.12, 0.6, 0.1, { type: 'triangle', wobble: 40 });
      },
    },
    trombone: {
      label: 'Sad trombone',
      emoji: '😢',
      play() {
        [[293.66, 0], [277.18, 0.42], [261.63, 0.84]].forEach(([f, at]) => glide(f, f * 0.98, at, 0.38, 0.06, { type: 'sawtooth', bright: 1400 }));
        glide(246.94, 233.08, 1.26, 1.3, 0.06, { type: 'sawtooth', bright: 1400, wobble: 6 });
      },
    },
    airhorn: {
      label: 'Air horn',
      emoji: '📯',
      play() {
        for (const [at, length] of [[0, 0.16], [0.22, 0.16], [0.44, 0.8]]) {
          for (const f of [466.16, 554.37, 698.46]) glide(f, f * 1.01, at, length, 0.028, { type: 'sawtooth', bright: 4200 });
        }
      },
    },
    crickets: {
      label: 'Crickets',
      emoji: '🦗',
      play() {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) tone(4400, i * 0.55 + j * 0.06, 0.04, 0.025);
      },
    },
  };
  // the reactions anyone in a call can send: they float up from whoever sent them
  const EMOJI = ['❤️', '😂', '👍', '🔥', '😮', '😢', '🎉', '💀'];
  let looping = 0;
  function loop(name, every) {
    unloop();
    SOUNDS[name]();
    looping = setInterval(() => SOUNDS[name](), every);
  }
  function unloop() {
    clearInterval(looping);
    looping = 0;
    if (navigator.vibrate) navigator.vibrate(0);
  }

  // ---- the live connection: what the server says, as it happens -----------------------------------------------

  const live = { after: 0, ctrl: null, healthy: false, fails: 0, retry: 0, poller: 0, polling: false };

  function listen() {
    clearTimeout(live.retry);
    if (live.ctrl || !api.signedIn() || !serverCalls() || !api.stream) return;
    const ctrl = (live.ctrl = new AbortController());
    let hello = false;
    // a connection that never says hello (something on the way is holding it back) is no use: ask instead
    const wait = setTimeout(() => hello || ctrl.abort(), 10000);
    api
      .stream('/api/live?after=' + live.after, ctrl.signal)
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error('No live connection');
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
          let cut;
          while ((cut = buffer.indexOf('\n\n')) >= 0) {
            const item = parse(buffer.slice(0, cut));
            buffer = buffer.slice(cut + 2);
            if (!item) continue;
            if (item.type === 'hello') {
              hello = true;
              clearTimeout(wait);
              live.healthy = true;
              live.fails = 0;
              // a server that restarted counts from the start again
              if (item.data.next < live.after) live.after = item.data.next;
              poll.needed();
              continue;
            }
            receive(item);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        clearTimeout(wait);
        if (live.ctrl === ctrl) live.ctrl = null;
        live.healthy = false;
        if (!hello) live.fails++;
        poll.needed();
        // back in a moment; a connection that keeps failing waits longer (while a call asks every moment instead)
        const delay = Math.min(60000, 1500 * 2 ** Math.min(live.fails, 6));
        live.retry = setTimeout(listen, document.visibilityState === 'visible' ? delay : Math.max(delay, 20000));
      });
  }

  function parse(block) {
    let type = 'message';
    let data = '';
    let id = 0;
    for (const line of block.split('\n')) {
      if (!line || line[0] === ':') continue;
      const at = line.indexOf(':');
      const field = at < 0 ? line : line.slice(0, at);
      const value = at < 0 ? '' : line.slice(at + 1).replace(/^ /, '');
      if (field === 'event') type = value;
      else if (field === 'data') data += (data ? '\n' : '') + value;
      else if (field === 'id') id = Number(value) || 0;
    }
    if (!data) return null;
    try {
      return { id, type, data: JSON.parse(data) };
    } catch (_) {
      return null;
    }
  }

  // while a call is ringing or going on and the live connection is down, the app asks every moment instead
  const poll = {
    needed() {
      const want = (active || ring) && !live.healthy;
      if (want && !live.poller) {
        live.poller = setInterval(() => poll.once(), 1500);
        poll.once();
      } else if (!want && live.poller) {
        clearInterval(live.poller);
        live.poller = 0;
      }
    },
    async once() {
      if (live.polling) return;
      live.polling = true;
      try {
        let r = await api.get('/api/signals?after=' + live.after);
        // a server that restarted counts from the start again
        if (r.next < live.after) {
          live.after = 0;
          r = await api.get('/api/signals?after=0');
        }
        for (const item of r.signals) receive(item);
      } catch (_) {
        /* the next try */
      } finally {
        live.polling = false;
      }
    },
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !live.ctrl) listen();
  });

  let inbox = Promise.resolve();
  function receive(item) {
    if (item.id) {
      if (item.id <= live.after) return;
      live.after = item.id;
    }
    const d = item.data || {};
    switch (item.type) {
      case 'call-ring':
        return ringing(d.call, d.again);
      case 'call-away':
        if (active && active.id === d.call) away(d.user);
        return;
      case 'call-update':
        // who's still being rung, for the People list
        if (active && d.call && active.id === d.call.id) active.call.ringing = d.call.ringing;
        return;
      case 'call-stop':
        if (!(active && active.id === d.call)) unring(d.call);
        return;
      case 'call-joined':
        if (active && d.call && active.id === d.call.id) arrived(d.user, d.call);
        return;
      case 'call-left':
        if (active && active.id === d.call) departed(d.user);
        return;
      case 'call-ended':
        going.delete(d.call);
        changed();
        unring(d.call);
        if (active && active.id === d.call) finish(d.reason);
        // the relay's free allowance for the month ran out (1.0): calls stop until it comes back
        if (d.reason === 'limit') paused(d.until);
        return;
      case 'call-signal':
        // one at a time and in order: an answer can't be dealt with before its offer
        if (active && active.id === d.call) inbox = inbox.then(() => signalled(d.from, d.type, d.data)).catch(() => {});
        return;
      default:
    }
  }

  // group calls going on that this device has heard about, so a group's chat can offer to join
  const going = new Map(); // call id -> the call
  const changed = () => document.dispatchEvent(new CustomEvent('nook-calls'));
  const groupCall = (groupId) => [...going.values()].find((c) => c.group && c.group.id === groupId) || null;

  // ---- ringing ---------------------------------------------------------------------------------------------

  let ring = null; // { call, el, timer }
  const handled = new Set(); // calls already answered or turned down here

  function ringing(call, again = false) {
    if (!call || !call.id) return;
    // someone in a group call rang again: it rings even if it was turned down before
    if (again) handled.delete(call.id);
    if (call.group) {
      going.set(call.id, call);
      changed();
    }
    if (handled.has(call.id) || (ring && ring.call.id === call.id) || (active && active.id === call.id)) return;
    if (active || ring) {
      // already on a call: a quiet word instead of a second ring
      M3.snackbar(`${who(call)} is calling you. Hang up first to answer.`, { timeout: 5000 });
      return;
    }
    if (store.state.me && store.state.me.calls === 'off') return;
    showRing(call);
    poll.needed();
  }

  function showRing(call) {
    const el = document.createElement('div');
    el.className = 'call-ring';
    el.setAttribute('role', 'alertdialog');
    el.setAttribute('aria-labelledby', 'ring-who');
    el.setAttribute('aria-describedby', 'ring-what');
    const caller = store.user(call.from);
    const face = call.group ? ui.nookIcon({ shape: call.group.shape, symbol: 'groups', color: call.group.color }, 104, 52) : avatar(caller, 104, { moving: true });
    el.innerHTML =
      '<div class="ring-card">' +
      `<div class="ring-face"><m3-shape class="ring-halo" shape="cookie12" aria-hidden="true"></m3-shape><m3-shape class="ring-halo two" shape="sunny" aria-hidden="true"></m3-shape><span class="ring-pic">${face}</span></div>` +
      `<h2 class="m3-title" id="ring-who">${esc(who(call))}</h2>` +
      `<p class="ring-what" id="ring-what">${icon(call.media === 'video' ? 'videocam' : 'call')}${call.group ? `u/${esc(call.from)} started a ${kindOf(call.media).toLowerCase()}` : `${kindOf(call.media)} on Budgie`}</p>` +
      (call.media === 'video' ? `<button type="button" class="ring-cam" data-ring="cam" aria-pressed="${!camPref()}">${camChip(camPref())}</button>` : '') +
      '<div class="ring-actions">' +
      `<button type="button" class="call-btn hang" data-ring="decline" aria-label="Decline">${icon('call_end')}</button>` +
      `<button type="button" class="call-btn answer" data-ring="answer" aria-label="${call.group ? 'Join' : 'Answer'}">${icon(call.media === 'video' ? 'videocam' : 'call')}</button>` +
      `</div><div class="ring-labels"><span>Decline</span><span>${call.group ? 'Join' : 'Answer'}</span></div></div>`;
    document.body.appendChild(el);
    tint(el, call.group ? call.group.color : caller.color);
    ring = { call, el, halo: cycleHalo(el.querySelector('.ring-halo')) };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ring]');
      if (!b) return;
      if (b.dataset.ring === 'cam') {
        const on = !camPref();
        camPref(on);
        b.setAttribute('aria-pressed', String(!on));
        b.innerHTML = camChip(on);
        return fx.pop(b, 0.85);
      }
      if (b.dataset.ring === 'answer') answer(call);
      else decline(call);
    });
    el.addEventListener('keydown', (e) => e.key === 'Escape' && decline(call));
    fx.play(el.querySelector('.ring-card'), [{ opacity: 0, transform: 'translateY(40px) scale(0.92)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
    loop('ring', 2600);
    if (navigator.vibrate) navigator.vibrate([500, 300, 500, 300, 500, 300, 500, 300, 500, 300, 500]);
    // a keyboard can answer straight away (on a phone, focus would only bring up a tooltip)
    if (matchMedia('(hover: hover)').matches) el.querySelector('[data-ring="answer"]').focus({ preventScroll: true });
    // the server stops the ringing after 35 seconds; this is in case its word never arrives
    ring.timer = setTimeout(() => unring(call.id), 45000);
  }

  /** the ringing screen goes: answered somewhere, declined, or given up on */
  function unring(id) {
    if (!ring || ring.call.id !== id) return;
    const { el, timer, halo } = ring;
    ring = null;
    clearTimeout(timer);
    clearInterval(halo);
    unloop();
    poll.needed();
    const out = fx.play(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    if (out) fx.settled(out).then(() => el.remove());
    else el.remove();
  }

  function decline(call) {
    handled.add(call.id);
    unring(call.id);
    api.post(`/api/calls/${encodeURIComponent(call.id)}/decline`, {}).catch(() => {});
  }

  // ---- the people in a call ------------------------------------------------------------------------------

  let active = null;
  const CAMERA_PREF = 'nook-call-camera';
  /** whether video calls start with the camera on (this device remembers); with a value, sets it */
  function camPref(on) {
    try {
      if (on !== undefined) localStorage.setItem(CAMERA_PREF, on ? 'on' : 'off');
      return localStorage.getItem(CAMERA_PREF) !== 'off';
    } catch (_) {
      return on !== undefined ? on : true;
    }
  }
  const camChip = (on) => `${icon(on ? 'videocam' : 'videocam_off')}<span>Camera ${on ? 'on' : 'off'}</span>`;

  // how you're heard and what you hear with (this device remembers): the microphone and speaker picked, whether
  // background noise is taken out, and push to talk
  const HEAR = 'nook-call-audio';
  function hearPrefs(patch) {
    let p = {};
    try {
      p = JSON.parse(localStorage.getItem(HEAR) || '{}') || {};
      if (patch) localStorage.setItem(HEAR, JSON.stringify((p = Object.assign(p, patch))));
    } catch (_) {
      if (patch) p = Object.assign(p, patch);
    }
    return p;
  }
  /** what's asked of the microphone: the one picked (any, if it's gone), with the noise taken out unless that's off */
  const audioWanted = () => {
    const p = hearPrefs();
    return Object.assign({ echoCancellation: true, noiseSuppression: p.clean !== false, autoGainControl: true }, p.mic ? { deviceId: { ideal: p.mic } } : {});
  };
  const VIDEO = (facing) => ({ facingMode: facing, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } });

  /** your microphone, and your camera for a video call (unless it's to be off): sound only when the camera can't be had */
  async function media(kind, { cam = true } = {}) {
    if (kind === 'video' && !cam) kind = 'voice';
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: audioWanted(), video: kind === 'video' ? VIDEO('user') : false });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        M3.snackbar(`Budgie needs your microphone${kind === 'video' ? ' and camera' : ''} for calls. Allow ${kind === 'video' ? 'them' : 'it'} in your browser’s settings for this site, then try again.`, { timeout: 8000 });
        return null;
      }
      if (kind === 'video') {
        try {
          const sound = await navigator.mediaDevices.getUserMedia({ audio: audioWanted() });
          M3.snackbar('Couldn’t use your camera, so you’re on with sound only.');
          return sound;
        } catch (_) {
          /* no microphone either */
        }
      }
      M3.snackbar('Couldn’t use your microphone. Is another app using it?');
      return null;
    }
  }
  const stopTracks = (stream) => stream && stream.getTracks().forEach((t) => t.stop());

  async function start({ to = '', group = '', media: kind = 'voice' } = {}) {
    if (!able()) return M3.snackbar('This browser can’t make calls. Try an up-to-date Chrome, Safari, Firefox or Edge.');
    if (!serverCalls()) return M3.snackbar('Calls need Budgie’s server to be updated first.');
    if (active) {
      restore();
      return;
    }
    if (ring) return;
    if (starting) return;
    starting = true;
    try {
      const joining = !!(group && groupCall(group));
      const ready = kind === 'video' || (joining && groupCall(group).media === 'video') ? await prejoin(joining ? 'Join the video call' : 'Start a video call', joining ? 'Join' : 'Call') : { local: await media(kind), mic: true };
      if (!ready || !ready.local) return;
      const local = ready.local;
      let r;
      try {
        r = await api.post('/api/calls', Object.assign(group ? { group } : { to }, { media: kind }));
      } catch (error) {
        stopTracks(local);
        // the month's free calling allowance is used up: say until when, in the app's own words
        if (error.callsPaused) return paused(error.callsPaused);
        return app().showError(error);
      }
      begin(r, local, { outgoing: true, to, mic: ready.mic });
    } finally {
      starting = false;
    }
  }

  /**
   * before a video call: a look at your camera, and your microphone and camera to go in with (on or off).
   * Resolves with { local, mic } to go ahead, or null.
   */
  function prejoin(headline, verb) {
    let local = null;
    let cam = camPref();
    let mic = true;
    let getting = null;
    const me = store.user(store.state.me.name);
    const get = async () => {
      try {
        local = await navigator.mediaDevices.getUserMedia({ audio: audioWanted(), video: cam ? VIDEO('user') : false });
      } catch (error) {
        if (cam && !['NotAllowedError', 'SecurityError'].includes(error.name)) {
          cam = false;
          return get();
        }
        local = null;
        M3.snackbar('Budgie needs your microphone for calls. Allow it in your browser’s settings for this site, then try again.', { timeout: 8000 });
      }
      return local;
    };
    return ui
      .sheet({
        headline,
        symbol: 'videocam',
        shape: 'clover8',
        className: 'prejoin-sheet',
        html:
          `<div class="prejoin"><video autoplay playsinline muted class="mirror"></video><div class="prejoin-face">${avatar(me, 96)}<small>Camera off</small></div></div>` +
          '<div class="prejoin-controls"></div><p class="muted prejoin-note">You can change both during the call.</p>',
        setup(body, close) {
          const video = body.querySelector('video');
          const face = body.querySelector('.prejoin-face');
          const box = body.querySelector('.prejoin-controls');
          const paint = () => {
            const camOn = !!(local && local.getVideoTracks().length);
            video.srcObject = camOn ? new MediaStream(local.getVideoTracks()) : null;
            video.hidden = !camOn;
            face.hidden = camOn;
            box.innerHTML =
              `<button type="button" class="call-btn toggle${mic ? '' : ' off'}" data-pre="mic" aria-pressed="${!mic}" aria-label="${mic ? 'Microphone on' : 'Microphone off'}">${icon(mic ? 'mic' : 'mic_off')}</button>` +
              `<button type="button" class="call-btn toggle${camOn ? '' : ' off'}" data-pre="cam" aria-pressed="${!camOn}" aria-label="${camOn ? 'Camera on' : 'Camera off'}">${icon(camOn ? 'videocam' : 'videocam_off')}</button>`;
          };
          getting = get().then((got) => (got ? paint() : close(null)));
          box.addEventListener('click', async (e) => {
            const b = e.target.closest('[data-pre]');
            if (!b || !local) return;
            if (b.dataset.pre === 'mic') {
              mic = !mic;
              local.getAudioTracks().forEach((t) => (t.enabled = mic));
            } else if (local.getVideoTracks().length) {
              // off means the camera's light goes out too
              cam = false;
              local.getVideoTracks().forEach((t) => (t.stop(), local.removeTrack(t)));
              camPref(false);
            } else {
              const track = await camera('user');
              if (track) {
                cam = true;
                local.addTrack(track);
                camPref(true);
              }
            }
            paint();
          });
        },
        actions: [
          { label: 'Cancel', value: null },
          { label: verb, variant: 'filled', symbol: 'videocam', value: true },
        ],
      })
      .then(async (go) => {
        await getting;
        if (!go || !local) {
          stopTracks(local);
          return null;
        }
        return { local, mic };
      });
  }
  let starting = false;

  async function answer(call) {
    if (active) return;
    handled.add(call.id);
    unloop();
    const local = await media(call.media, { cam: camPref() });
    if (!local) {
      // nothing to answer with: it carries on ringing for the rest of their devices, and here it stops
      unring(call.id);
      return;
    }
    unring(call.id);
    let r;
    try {
      r = await api.post(`/api/calls/${encodeURIComponent(call.id)}/join`, {});
    } catch (error) {
      stopTracks(local);
      if (error.callsPaused) return paused(error.callsPaused);
      return app().showError(error);
    }
    begin(r, local, { outgoing: false });
  }

  function begin(r, local, { outgoing, to = '', mic = true }) {
    const call = r.call;
    handled.add(call.id);
    if (call.group) going.set(call.id, call);
    active = {
      id: call.id,
      call,
      ice: r.ice || { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], relay: false },
      local,
      mic,
      cam: local.getVideoTracks().length > 0,
      // a camera can be turned on in any call, a voice call too
      canCam: true,
      screen: null, // your screen's picture, while you share it
      screenSound: null, // and its sound, when the browser gives it (a tab's, or a whole screen's on Windows)
      quality: 'smooth', // how your screen goes: 'smooth' (30 frames a second) or 'sharp' (text stays crisp)
      deaf: false, // you hear nobody, and nobody hears you
      micBeforeDeaf: mic,
      // push to talk (on a computer): your microphone is on only while you hold the space bar
      ptt: !touchOnly() && hearPrefs().ptt === true,
      talking: false,
      focus: null, // the tile in the big spot: a stream ('screen:<name>'), a person ('person:<name>'), or none (a grid)
      theater: null, // the tile filling the whole screen
      reactId: 0,
      reacts: [],
      facing: 'user',
      peers: new Map(),
      startedAt: 0,
      outgoing,
      // a call between two: who's on the other end, even before they answer
      other: call.group ? '' : to || (lower(call.from) === lower(store.state.me.name) ? call.with : call.from),
      minimised: false,
    };
    micLive();
    drawScreen();
    changed();
    // whoever arrives calls everyone already there, and they answer
    for (const name of r.peers || []) connect(name, true);
    if (outgoing && !(r.peers || []).length) loop('ringback', 3000);
    wake(true);
    poll.needed();
    meters.start();
    active.tick = setInterval(status, 1000);
    // through the relay (1.0), this device says how much it got through it: the server keeps the month's total
    if (active.ice.relay && server100()) active.usage = setInterval(reportUsage, 15000);
  }

  /** what came to this device through the relay since it last said (Cloudflare counts what it sends to each device) */
  async function reportUsage() {
    const call = active;
    if (!call) return;
    let bytes = 0;
    for (const peer of call.peers.values()) {
      if (!peer.pc) continue;
      try {
        const stats = await peer.pc.getStats();
        let got = 0;
        stats.forEach((r) => {
          if (r.type !== 'candidate-pair' || r.state !== 'succeeded' || !r.nominated) return;
          const local = stats.get(r.localCandidateId);
          if (local && local.candidateType === 'relay') got += r.bytesReceived || 0;
        });
        bytes += Math.max(0, got - (peer.relayIn || 0));
        peer.relayIn = Math.max(peer.relayIn || 0, got);
      } catch (_) {
        /* a connection that's closing: its last part goes uncounted */
      }
    }
    if (bytes > 0 && active === call) api.post(`/api/calls/${encodeURIComponent(call.id)}/usage`, { bytes }).catch(() => {});
  }

  /** calls are paused until `until` (the relay's allowance for the month is used up): said once */
  function paused(until) {
    const when = until ? new Date(until).toLocaleDateString([], { day: 'numeric', month: 'long' }) : 'next month';
    M3.dialog({
      headline: 'Calls are paused for now',
      symbol: 'phone_disabled',
      iconShape: 'softBoom',
      body: `Budgie’s free calling allowance for this month is used up, so calls stop until ${when}. Messages and everything else still work.`,
      actions: [{ label: 'OK', value: true, variant: 'filled' }],
    }).catch(() => {});
  }

  /** someone joined the call: their device calls this one */
  function arrived(name, call) {
    active.call = call;
    unloop();
    const had = active.peers.get(lower(name));
    if (had) {
      // they're back after their page reloaded: their device calls again, from scratch
      closePeer(had);
      removeTile(had, true);
      active.peers.delete(lower(name));
    } else SOUNDS.join();
    addPeer(name);
    status();
  }

  /** someone's page closed or reloaded: they may be back in a moment */
  function away(name) {
    const peer = active.peers.get(lower(name));
    if (!peer) return;
    peer.state = 'away';
    drawTile(peer);
    status();
  }

  /** someone left the call */
  function departed(name) {
    const peer = active.peers.get(lower(name));
    if (!peer) return;
    closePeer(peer);
    active.peers.delete(lower(name));
    removeTile(peer);
    SOUNDS.leave();
    status();
  }

  function addPeer(name) {
    const kept = volumes()[lower(name)] || {};
    const peer = {
      name: store.user(name).name || name,
      pc: null,
      stream: null,
      screenStream: null,
      screenAudio: null, // the sound of their shared screen
      queue: [],
      outbox: [],
      flush: 0,
      sending: Promise.resolve(),
      mic: true,
      cam: false,
      sharing: false,
      deaf: false,
      sound: false, // their shared screen has sound
      watching: false, // you're watching their shared screen
      watchesMe: null, // they're watching yours (null: an older app, which always shows it)
      volume: typeof kept.v === 'number' ? Math.min(1, Math.max(0, kept.v)) : 1,
      hushed: kept.m === true, // muted for you alone
      streamVolume: typeof kept.sv === 'number' ? Math.min(1, Math.max(0, kept.sv)) : 1,
      streamHushed: false,
      reactSeen: 0,
      reactTimes: [],
      state: 'new',
      restarts: 0,
      offerer: false,
    };
    active.peers.set(lower(name), peer);
    drawTile(peer);
    return peer;
  }

  // the volume you set for each person (and for their shared screen), remembered on this device
  const VOLUMES = 'nook-call-volumes';
  function volumes() {
    try {
      return JSON.parse(localStorage.getItem(VOLUMES) || '{}') || {};
    } catch (_) {
      return {};
    }
  }
  function keepVolume(name, patch) {
    try {
      const all = volumes();
      all[lower(name)] = Object.assign(all[lower(name)] || {}, patch);
      localStorage.setItem(VOLUMES, JSON.stringify(all));
    } catch (_) {
      /* for this call only */
    }
  }
  // an iPhone or iPad plays everything at the device's own volume: there, a person can only be muted
  const volumeWorks = (() => {
    try {
      const a = document.createElement('audio');
      a.volume = 0.5;
      return a.volume === 0.5;
    } catch (_) {
      return false;
    }
  })();

  function connect(name, offerer) {
    const peer = active.peers.get(lower(name)) || addPeer(name);
    if (peer.pc) return peer;
    peer.offerer = offerer;
    const pc = (peer.pc = new RTCPeerConnection({ iceServers: active.ice.iceServers, iceTransportPolicy: active.ice.relay ? 'relay' : 'all' }));
    // four ways each way, always in this order: sound, camera, screen, and the screen's sound (1.3; an older app
    // opens the first three). A camera or a screen that's off sends nothing, and turning one on later swaps a picture
    // in, with nothing to negotiate again. The one answering takes the same ways from the offer (wire, below).
    if (offerer) {
      peer.audio = pc.addTransceiver(micTrack() || 'audio', { direction: 'sendrecv', streams: [active.local] }).sender;
      peer.video = pc.addTransceiver(camTrack() || 'video', { direction: 'sendrecv', streams: [active.local] }).sender;
      peer.screen = pc.addTransceiver(active.screen || 'video', { direction: 'sendrecv' }).sender;
      peer.screenSound = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      peer.wired = true;
      feedScreen(peer);
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      peer.outbox.push(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate);
      // a moment's worth go together, rather than a request each
      clearTimeout(peer.flush);
      peer.flush = setTimeout(() => peer.outbox.length && send(peer, 'candidate', peer.outbox.splice(0)), 80);
    };
    pc.ontrack = (e) => {
      // the third way in is their screen, the fourth its sound; their voice and camera go together
      const way = pc.getTransceivers().indexOf(e.transceiver);
      if (e.track.kind === 'video' && way === 2) peer.screenStream = new MediaStream([e.track]);
      else if (e.track.kind === 'audio' && way === 3) peer.screenAudio = new MediaStream([e.track]);
      else {
        if (!peer.stream) peer.stream = new MediaStream();
        if (!peer.stream.getTracks().includes(e.track)) peer.stream.addTrack(e.track);
      }
      drawTile(peer);
      meters.watch(peer);
    };
    const onState = () => {
      const state = pc.connectionState || { completed: 'connected', checking: 'connecting' }[pc.iceConnectionState] || pc.iceConnectionState;
      if (state === peer.state) return;
      peer.state = state;
      if (state === 'connected') {
        if (!active.startedAt) active.startedAt = Date.now();
        peer.restarts = 0;
        fitBitrate();
      }
      // a connection that fails gets another go with fresh routes, twice at most
      if (state === 'failed' && peer.offerer && peer.restarts < 2) {
        peer.restarts++;
        offer(peer, true);
      }
      drawTile(peer);
      status();
    };
    pc.onconnectionstatechange = onState;
    pc.oniceconnectionstatechange = onState;
    if (offerer) offer(peer);
    return peer;
  }

  async function offer(peer, restart = false) {
    try {
      const description = await peer.pc.createOffer(restart ? { iceRestart: true } : undefined);
      await peer.pc.setLocalDescription(description);
      send(peer, 'offer', { type: 'offer', sdp: peer.pc.localDescription.sdp });
      send(peer, 'media', mediaState(peer));
    } catch (_) {
      peer.state = 'failed';
      drawTile(peer);
    }
  }

  async function signalled(from, type, data) {
    if (!active) return;
    let peer = active.peers.get(lower(from));
    if (type === 'offer') {
      if (!peer || !peer.pc) peer = connect(from, false);
      await peer.pc.setRemoteDescription(data);
      if (!peer.wired) await wire(peer);
      await flushCandidates(peer);
      const description = await peer.pc.createAnswer();
      await peer.pc.setLocalDescription(description);
      send(peer, 'answer', { type: 'answer', sdp: peer.pc.localDescription.sdp });
      send(peer, 'media', mediaState(peer));
    } else if (type === 'answer') {
      if (peer && peer.pc && peer.pc.signalingState === 'have-local-offer') {
        await peer.pc.setRemoteDescription(data);
        await flushCandidates(peer);
      }
    } else if (type === 'candidate') {
      if (!peer) peer = addPeer(from);
      const list = [].concat(data || []);
      if (!peer.pc || !peer.pc.remoteDescription) peer.queue.push(...list);
      else for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {});
    } else if (type === 'media') {
      if (!peer) return;
      const d = data || {};
      peer.mic = d.mic !== false;
      peer.cam = d.cam !== false;
      const was = peer.sharing;
      peer.sharing = !!d.screen;
      peer.deaf = d.deaf === true;
      peer.sound = d.sound === true;
      // they stopped sharing: watching it is over (sharing again shows the card to join again)
      if (was && !peer.sharing) stopWatching(peer);
      // whether they're watching your screen: an older app doesn't say, and always shows it
      const watches = d.v >= 3 ? d.watch === true : null;
      if (watches !== peer.watchesMe) {
        peer.watchesMe = watches;
        feedScreen(peer);
      }
      if (d.react && d.react.id !== peer.reactSeen) {
        peer.reactSeen = d.react.id;
        reacted(peer, d.react);
      }
      drawTile(peer);
    }
  }

  const micTrack = () => active.local.getAudioTracks()[0] || null;
  const camTrack = () => (active.cam ? active.local.getVideoTracks()[0] || null : null);
  /** the one answering sends on the ways the offer opened: sound, camera, screen, and the screen's sound */
  async function wire(peer) {
    const [a, v, sc, ss] = peer.pc.getTransceivers();
    const use = async (t, track) => {
      if (!t) return null;
      t.direction = 'sendrecv';
      await t.sender.replaceTrack(track).catch(() => {});
      return t.sender;
    };
    peer.audio = await use(a, micTrack());
    peer.video = await use(v, camTrack());
    peer.screen = await use(sc, active.screen);
    peer.screenSound = ss && ss.receiver.track.kind === 'audio' ? await use(ss, null) : null;
    peer.wired = true;
    feedScreen(peer);
  }

  async function flushCandidates(peer) {
    const list = peer.queue.splice(0);
    for (const c of list) await peer.pc.addIceCandidate(c).catch(() => {});
  }

  function send(peer, type, data) {
    const id = active.id;
    // in order, one after another, so an answer never overtakes its offer
    peer.sending = peer.sending.then(() => api.post(`/api/calls/${encodeURIComponent(id)}/signal`, { to: peer.name, type, data })).catch(() => {});
  }
  /** what you're doing, told to one person: your microphone, camera and screen, whether you've deafened, and whether
   *  you're watching their shared screen (v: what this app says; an older one says only the first three) */
  const mediaState = (peer) => ({ v: 3, mic: active.mic, cam: active.cam, screen: !!active.screen, sound: !!active.screenSound, deaf: active.deaf, watch: !!(peer && peer.watching) });
  /** tells everyone (each their own) what you're doing, and anything else with it: a reaction */
  const tell = (extra) => active && active.peers.forEach((peer) => peer.pc && send(peer, 'media', Object.assign(mediaState(peer), extra)));

  function closePeer(peer) {
    clearTimeout(peer.flush);
    meters.unwatch(peer);
    try {
      if (peer.pc) peer.pc.close();
    } catch (_) {
      /* already closed */
    }
  }

  /** whether someone sees your shared screen in full: they asked to watch it (an older app always shows it) */
  const sees = (peer) => peer.watchesMe !== false;

  /** with more people, each picture is sent smaller, so everyone's connection keeps up. A shared screen goes in full
   *  only to those watching it, smoothly (30 frames a second; when the connection is tight, a little less sharp rather
   *  than jerky) or sharp (text stays crisp, fewer frames). Everyone else gets a small picture every so often, for the
   *  card that says you're sharing, which costs your computer next to nothing */
  function fitBitrate() {
    if (!active) return;
    const n = active.peers.size;
    const peers = [...active.peers.values()];
    const watchers = active.screen ? peers.filter(sees).length : 0;
    const tall = active.screen && active.screen.getSettings ? active.screen.getSettings().height || 0 : 0;
    const sharp = active.quality === 'sharp';
    // each watcher gets a copy made for them: 1080p for one or two, 720p for more, so your computer keeps up
    const most = watchers <= 2 ? 1080 : 720;
    const screenMax = watchers <= 1 ? 4000000 : watchers <= 2 ? 2500000 : 1800000;
    const set = (sender, change) => {
      if (!sender || !sender.getParameters) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) return;
      change(params.encodings[0], params);
      sender.setParameters(params).catch(() => {});
    };
    peers.forEach((peer) => {
      const looking = !!active.screen && sees(peer);
      set(peer.video, (e) => (e.maxBitrate = (n <= 1 ? 1500000 : n <= 2 ? 800000 : 450000) / (looking ? 2 : 1)));
      set(peer.screen, (e, params) => {
        if (looking || !active.screen) {
          e.maxBitrate = screenMax;
          e.maxFramerate = sharp ? 15 : 30;
          e.scaleResolutionDownBy = tall > most ? tall / most : 1;
          params.degradationPreference = sharp ? 'maintain-resolution' : 'balanced';
        } else {
          e.maxBitrate = 150000;
          e.maxFramerate = 3;
          e.scaleResolutionDownBy = tall > 180 ? tall / 180 : 1;
          params.degradationPreference = 'balanced';
        }
      });
    });
  }

  /** your shared screen's sound goes only to those watching it; the picture's size follows (fitBitrate) */
  function feedScreen(peer) {
    if (!active || !peer) return;
    if (peer.screenSound) peer.screenSound.replaceTrack(active.screen && active.screenSound && sees(peer) ? active.screenSound : null).catch(() => {});
    if (peer.screen) fitBitrate();
  }

  // ---- your controls -------------------------------------------------------------------------------------

  /** your microphone sends only when it's on, and, with push to talk, while you hold the space bar */
  function micLive() {
    if (!active) return;
    const on = active.mic && (!active.ptt || active.talking);
    active.local.getAudioTracks().forEach((t) => (t.enabled = on));
  }

  function toggleMic() {
    if (!active) return;
    active.mic = !active.mic;
    // turning your microphone on while deafened brings the sound back too (you'd want to hear the answer)
    if (active.mic && active.deaf) {
      active.deaf = false;
      hearAll();
      SOUNDS.undeafen();
    }
    micLive();
    tell();
    controls();
    fx.haptic(8);
  }

  /** deafen: you hear nobody (nor their shared screens' sound, nor the soundboard), and your microphone goes off too.
   *  Undeafened, your microphone is back as it was */
  function toggleDeaf() {
    if (!active) return;
    active.deaf = !active.deaf;
    if (active.deaf) {
      active.micBeforeDeaf = active.mic;
      active.mic = false;
    } else active.mic = active.micBeforeDeaf;
    micLive();
    hearAll();
    tell();
    controls();
    (active.deaf ? SOUNDS.deafen : SOUNDS.undeafen)();
    fx.haptic(8);
  }

  /** what you hear of someone: their voice (unless you've deafened or muted them for yourself) at the volume you set,
   *  and their shared screen's sound while you watch it */
  function hearing(peer) {
    if (!active) return;
    if (peer.tile) {
      const speaker = peer.tile.querySelector('audio');
      speaker.muted = !!(active.deaf || peer.hushed);
      if (volumeWorks) speaker.volume = peer.volume;
    }
    if (peer.screenTile) {
      const speaker = peer.screenTile.querySelector('audio');
      speaker.muted = !!(active.deaf || !peer.watching || peer.streamHushed);
      if (volumeWorks) speaker.volume = peer.streamVolume;
    }
  }
  const hearAll = () => active && active.peers.forEach(hearing);

  async function toggleCam() {
    if (!active || !active.canCam) return;
    if (active.cam) {
      // off means off: the camera's light goes out too
      active.cam = false;
      for (const t of active.local.getVideoTracks()) {
        t.stop();
        active.local.removeTrack(t);
      }
      active.peers.forEach((peer) => peer.video && peer.video.replaceTrack(null).catch(() => {}));
    } else {
      const track = await camera(active.facing);
      if (!track || !active) return;
      active.cam = true;
      active.local.addTrack(track);
      active.peers.forEach((peer) => peer.video && peer.video.replaceTrack(track).catch(() => {}));
    }
    tell();
    selfView();
    controls();
    layout();
    fx.haptic(8);
  }

  // ---- sharing your screen (on a computer; phones' browsers can't) ----------------------------------------------

  const canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) && !touchOnly();
  async function toggleShare() {
    if (!active || !canShare()) return;
    if (active.screen) return stopShare();
    let stream;
    try {
      // up to 1080p at 30 frames a second: a bigger screen is scaled down, which costs little sharpness and keeps it smooth
      // with its sound, where the browser can (a tab's, or the whole screen's on Windows), but not the call's own
      // (restrictOwnAudio), or everyone would hear themselves back; and not Budgie's own tab, which would show itself
      // forever
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: SCREEN,
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, restrictOwnAudio: true, suppressLocalAudioPlayback: false },
        systemAudio: 'include',
        selfBrowserSurface: 'exclude',
        surfaceSwitching: 'include',
      });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'AbortError') return;
      // a browser that can't share sound (Safari, Firefox) may say no to being asked: the picture alone, then
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({ video: SCREEN, audio: false });
      } catch (again) {
        if (again.name !== 'NotAllowedError' && again.name !== 'AbortError') M3.snackbar('Couldn’t share your screen.');
        return;
      }
    }
    const track = stream.getVideoTracks()[0];
    if (!active || !track) return stopTracks(stream);
    // what's shared is often moving (a game, a video, scrolling): the browser keeps it smooth
    if ('contentHint' in track) track.contentHint = active.quality === 'sharp' ? 'detail' : 'motion';
    // the browser's own "Stop sharing" button ends it too
    track.addEventListener('ended', stopShare);
    const sound = stream.getAudioTracks()[0] || null;
    if (sound && 'contentHint' in sound) sound.contentHint = 'music';
    active.screen = track;
    active.screenSound = sound;
    // nobody's watching yet: everyone sees the card, and joins it if they want to (an older app shows it straight away)
    active.peers.forEach((peer) => {
      if (peer.watchesMe) peer.watchesMe = false;
      if (peer.screen) peer.screen.replaceTrack(track).catch(() => {});
      feedScreen(peer);
    });
    fitBitrate();
    tell();
    controls();
    layout();
  }
  // up to 1080p at 30 frames a second: a bigger screen is scaled down, which costs little sharpness and keeps it smooth
  const SCREEN = { frameRate: { ideal: 30, max: 30 }, width: { max: 1920 }, height: { max: 1080 } };

  /** smooth (for games, videos, scrolling) or sharp (for text and code): changes as you share */
  function shareQuality(quality) {
    if (!active || active.quality === quality) return;
    active.quality = quality;
    if (active.screen && 'contentHint' in active.screen) active.screen.contentHint = quality === 'sharp' ? 'detail' : 'motion';
    fitBitrate();
    layout();
  }
  function stopShare() {
    if (!active || !active.screen) return;
    const track = active.screen;
    const sound = active.screenSound;
    active.screen = null;
    active.screenSound = null;
    track.stop();
    if (sound) sound.stop();
    active.peers.forEach((peer) => {
      if (peer.screen) peer.screen.replaceTrack(null).catch(() => {});
      feedScreen(peer);
    });
    fitBitrate();
    tell();
    controls();
    layout();
  }

  async function flip() {
    if (!active.cam) return;
    const facing = active.facing === 'user' ? 'environment' : 'user';
    // a phone can only open one camera at a time: the old one stops first
    const old = active.local.getVideoTracks();
    old.forEach((t) => t.stop());
    const track = await camera(facing);
    if (!active) return;
    old.forEach((t) => active.local.removeTrack(t));
    if (!track) {
      active.cam = false;
      tell();
    } else {
      active.facing = facing;
      active.local.addTrack(track);
      active.peers.forEach((peer) => peer.video && peer.video.replaceTrack(track).catch(() => {}));
    }
    selfView();
    controls();
  }

  async function camera(facing) {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: VIDEO(facing) });
      return s.getVideoTracks()[0] || null;
    } catch (_) {
      M3.snackbar('Couldn’t start your camera.');
      return null;
    }
  }

  function hangUp() {
    if (!active) return;
    api.post(`/api/calls/${encodeURIComponent(active.id)}/leave`, {}, { keepalive: true }).catch(() => {});
    finish('you');
  }
  // a page closing or reloading mid-call is "away": back within half a minute, it's still in the call
  // (an older server, which can't wait, is told the page left)
  addEventListener('pagehide', () => active && api.post(`/api/calls/${encodeURIComponent(active.id)}/${server095() ? 'away' : 'leave'}`, {}, { keepalive: true }).catch(() => {}));

  const ENDINGS = {
    limit: 'Calls are paused until next month',
    'no-answer': 'No answer',
    declined: 'Couldn’t talk right now',
    cancelled: 'Call cancelled',
    ended: 'Call ended',
    you: 'Call ended',
  };

  function finish(reason) {
    if (!active) return;
    const was = active;
    active = null;
    unloop();
    clearInterval(was.tick);
    clearInterval(was.usage);
    meters.stop();
    was.peers.forEach(closePeer);
    stopTracks(was.local);
    if (was.screen) was.screen.stop();
    if (was.screenSound) was.screenSound.stop();
    if (was.bar) dropBar(was.bar);
    if (document.fullscreenElement && was.el && document.fullscreenElement === was.el) document.exitFullscreen().catch(() => {});
    if (was.el) {
      was.el.classList.remove('theater');
      was.el.querySelectorAll('.call-react').forEach((pop) => pop.remove());
    }
    wake(false);
    poll.needed();
    SOUNDS.end();
    if (was.call.group) {
      // the group's call may carry on without you
      if (reason !== 'you') going.delete(was.id);
      changed();
    }
    const screen = was.el;
    if (!screen) return;
    const lasted = was.startedAt ? ' · ' + clock(Date.now() - was.startedAt) : '';
    const ending = reason === 'you' && was.call.group ? 'You left the call' : ENDINGS[reason] || 'Call ended';
    screen.querySelector('.call-status').textContent = ending + lasted;
    screen.classList.add('ended');
    // the cameras are off now: everyone's face, not a black square
    screen.querySelectorAll('.call-tile').forEach((tile) => tile.classList.remove('has-video', 'speaking'));
    screen.querySelectorAll('button').forEach((b) => (b.disabled = true));
    setTimeout(() => {
      const out = fx.play(screen, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
      if (out) fx.settled(out).then(() => screen.remove());
      else screen.remove();
    }, screen.hidden ? 0 : 1300);
  }

  // the screen stays on through a call
  let lock = null;
  async function wake(on) {
    if (!on) {
      if (lock) lock.release().catch(() => {});
      lock = null;
      return;
    }
    if (lock || !navigator.wakeLock) return;
    try {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => (lock = null));
    } catch (_) {
      /* the screen may dim, that's all */
    }
  }
  // a wake lock lapses while the page is hidden; coming back to a call takes it again
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && active && wake(true));

  // ---- how loud everyone is: their picture breathes as they speak ------------------------------------------

  const meters = {
    list: new Map(), // peer or 'me' -> { analyser, buffer, source, level }
    frame: 0,
    start() {
      if (active.local.getAudioTracks().length) this.add('me', active.local);
      this.frame = requestAnimationFrame(() => this.draw());
    },
    add(key, stream) {
      const a = sound();
      if (!a || this.list.has(key) || !stream.getAudioTracks().length) return;
      try {
        const source = a.createMediaStreamSource(stream);
        const analyser = a.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        this.list.set(key, { source, analyser, buffer: new Uint8Array(analyser.fftSize), level: 0 });
      } catch (_) {
        /* no meter, no matter */
      }
    },
    watch(peer) {
      if (peer.stream) this.add(peer, peer.stream);
    },
    unwatch(key) {
      const m = this.list.get(key);
      if (m) m.source.disconnect();
      this.list.delete(key);
    },
    stop() {
      cancelAnimationFrame(this.frame);
      for (const key of [...this.list.keys()]) this.unwatch(key);
    },
    draw() {
      if (!active) return;
      this.frame = requestAnimationFrame(() => this.draw());
      if (active.minimised || document.hidden) return;
      const still = fx.reduced();
      for (const [key, m] of this.list) {
        m.analyser.getByteTimeDomainData(m.buffer);
        let sum = 0;
        for (let i = 0; i < m.buffer.length; i++) {
          const x = (m.buffer[i] - 128) / 128;
          sum += x * x;
        }
        const level = Math.min(1, Math.sqrt(sum / m.buffer.length) * 5);
        // quick to rise, slow to fall, like a level meter
        m.level = level > m.level ? m.level * 0.4 + level * 0.6 : m.level * 0.9 + level * 0.1;
        const el = key === 'me' ? active.el && active.el.querySelector('[data-call="mic"]') : key.tile;
        if (!el) continue;
        el.style.setProperty('--level', still ? 0 : m.level.toFixed(3));
        el.classList.toggle('speaking', m.level > 0.12 && (key === 'me' ? active.mic && (!active.ptt || active.talking) : key.mic));
      }
    },
  };

  // ---- the call screen -----------------------------------------------------------------------------------

  function tint(el, seed) {
    if (!window.M3 || !M3.color || !M3.color.scheme) return;
    M3.color
      .scheme({ seed: seed || '#6750a4', dark: true, variant: store.state.settings.variant || 'tonalSpot' })
      .then((colors) => M3.color.apply(colors, el))
      .catch(() => {});
  }

  /** the shape behind a face while it rings keeps changing into another */
  function cycleHalo(halo) {
    if (fx.reduced() || !halo || !halo.transitionTo) return 0;
    const shapes = ['cookie12', 'sunny', 'flower', 'cookie9', 'clover8', 'softBurst'];
    let i = 0;
    return setInterval(() => halo.transitionTo(shapes[++i % shapes.length], { spring: true }), 1400);
  }

  function title() {
    return active.call.group ? active.call.group.name : 'u/' + store.user(active.other).name;
  }

  // ---- how calls look: colours from whoever you're calling, from you, or one you pick; a background; a ringtone ----

  const look = () => store.state.settings;
  /** the colour a call's screens are made in */
  function seedFor(call, other) {
    const pick = look().callColor || 'theirs';
    if (pick === 'mine') return store.state.me.color;
    if (/^#[0-9a-f]{6}$/i.test(pick)) return pick;
    return call.group ? call.group.color : store.user(other || call.from).color;
  }
  const BACKGROUNDS = [['plain', 'Plain', 'crop_square'], ['shapes', 'Shapes', 'interests'], ['glow', 'Glow', 'flare']];
  function applyLook() {
    if (!active) return;
    const seed = seedFor(active.call, active.other);
    for (const el of [active.el, active.bar]) if (el) tint(el, seed);
    if (active.el) active.el.dataset.bg = BACKGROUNDS.some(([id]) => id === look().callBg) ? look().callBg : 'shapes';
  }

  /** a sheet to change how calls look, which a call open now follows as you pick */
  function customise() {
    const s = look();
    const pick = s.callColor || 'theirs';
    const choice = (name, value, label, symbol, on) =>
      `<button type="button" class="chip" data-${name}="${value}" aria-pressed="${on}">${symbol ? icon(symbol) : ''}${esc(label)}</button>`;
    return ui.sheet({
      headline: 'Call look',
      symbol: 'palette',
      shape: 'flower',
      className: 'wide',
      html:
        `<div class="field"><span class="field-label">Colours</span><div class="chips" style="flex-wrap:wrap">${choice('color', 'theirs', 'Whoever you’re calling', 'person', pick === 'theirs')}${choice('color', 'mine', 'Yours', 'face', pick === 'mine')}</div>` +
        `<div class="swatches">${ui.SEEDS.map((seed, i) => `<button type="button" class="swatch" data-color="${seed}" aria-pressed="${seed === pick}" aria-label="Colour ${seed}"><m3-shape shape="${ui.SEED_SHAPES[i]}" style="color:${seed}"></m3-shape></button>`).join('')}</div></div>` +
        `<div class="field"><span class="field-label">Background</span><div class="chips">${BACKGROUNDS.map(([id, label, symbol]) => choice('bg', id, label, symbol, (s.callBg || 'shapes') === id)).join('')}</div></div>` +
        `<div class="field"><span class="field-label">Ringtone</span><div class="chips" style="flex-wrap:wrap">${Object.keys(RINGTONES)
          .map((id) => choice('tone', id, id[0].toUpperCase() + id.slice(1), id === 'silent' ? 'vibration' : 'music_note', ringtone() === id))
          .join('')}</div></div>`,
      setup(body) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-color], [data-bg], [data-tone]');
          if (!b) return;
          const [key, attr] = b.dataset.color ? ['callColor', 'color'] : b.dataset.bg ? ['callBg', 'bg'] : ['ringtone', 'tone'];
          s[key] = b.dataset[attr];
          body.querySelectorAll(`[data-${attr}]`).forEach((other) => other.setAttribute('aria-pressed', String(other === b)));
          // the colour chips and the swatches are one choice
          if (attr === 'color') body.querySelectorAll('[data-color]').forEach((other) => other.setAttribute('aria-pressed', String(other.dataset.color === s.callColor)));
          if (attr === 'tone') RINGTONES[ringtone()]();
          store.save();
          applyLook();
        });
      },
      actions: [{ label: 'Done', variant: 'filled' }],
    });
  }

  function drawScreen() {
    const el = document.createElement('div');
    el.className = 'call-screen';
    el.dataset.media = active.call.media;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${kindOf(active.call.media)} with ${title()}`);
    const keys = matchMedia('(hover: hover)').matches;
    el.innerHTML =
      `<div class="call-bg" aria-hidden="true">${['cookie12', 'flower', 'clover8', 'sunny'].map((shape) => `<m3-shape shape="${shape}"></m3-shape>`).join('')}</div>` +
      '<div class="call-top">' +
      `<button type="button" class="m3-icon-btn call-min" data-call="min" aria-label="Back to Budgie (the call carries on)" data-tooltip="Minimise (Esc)">${icon('picture_in_picture_alt')}</button>` +
      `<div class="call-title"><b>${esc(title())}</b><small class="call-status" aria-live="polite">${active.outgoing ? 'Calling…' : 'Connecting…'}</small></div>` +
      (active.call.group && server095() ? `<button type="button" class="m3-icon-btn" data-call="people" aria-label="People: ring them again" data-tooltip="People (R)">${icon('group_add')}</button>` : '') +
      `<button type="button" class="m3-icon-btn" data-call="settings" aria-label="Call settings: sound and look" data-tooltip="Sound and look">${icon('tune')}</button>` +
      (keys ? `<button type="button" class="m3-icon-btn" data-call="keys" aria-label="Keyboard shortcuts" data-tooltip="Shortcuts (?)">${icon('keyboard')}</button>` : '') +
      `<span class="call-lock" data-tooltip="Encrypted between devices, never recorded">${icon('lock')}</span></div>` +
      '<div class="call-stage"></div>' +
      '<video class="call-self" autoplay playsinline muted aria-label="You" hidden></video>' +
      '<div class="call-controls" role="toolbar" aria-label="Call controls"></div>';
    document.body.appendChild(el);
    active.el = el;
    wireSelf(el.querySelector('.call-self'));
    applyLook();
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-call]');
      if (!b || b.disabled) return;
      const act = b.dataset.call;
      if (act === 'mic') toggleMic();
      else if (act === 'cam') toggleCam();
      else if (act === 'flip') flip();
      else if (act === 'hang') hangUp();
      else if (act === 'min') minimise();
      else if (act === 'play') playAll();
      else if (act === 'share') toggleShare();
      else if (act === 'people') people();
      else if (act === 'look') customise();
      else if (act === 'settings') callSettings();
      else if (act === 'keys') shortcutsSheet();
      else if (act === 'deaf') toggleDeaf();
      else if (act === 'react') reactions();
    });
    // the stage: a stream's buttons, and a tap on someone or on a stream
    el.querySelector('.call-stage').addEventListener('click', (e) => {
      const b = e.target.closest('[data-stream], [data-quality]');
      if (b) return void (b.dataset.quality ? shareQuality(b.dataset.quality) : streamAct(b.dataset.stream, b.closest('.call-tile')));
      if (e.target.closest('button, a, input')) return;
      const tile = e.target.closest('.call-tile');
      if (tile) tileTap(tile);
    });
    el.querySelector('.call-stage').addEventListener('keydown', (e) => {
      const tile = e.target.classList && e.target.classList.contains('call-tile') ? e.target : null;
      if (tile && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        tileTap(tile);
      }
    });
    // Esc: out of full screen first, then the call hides
    el.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (active.theater) closeTheater();
      else if (closeReact()) return;
      else minimise();
    });
    stage();
    selfView();
    controls();
    fx.play(el, [{ opacity: 0, transform: 'translateY(6%)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
    if (matchMedia('(hover: hover)').matches) el.querySelector('[data-call="hang"]').focus({ preventScroll: true });
    // more than one camera on a phone (its front and back): you can switch (a computer's second webcam isn't offered)
    if (active.canCam && touchOnly() && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          if (active && devices.filter((d) => d.kind === 'videoinput').length > 1) {
            active.flips = true;
            controls();
          }
        })
        .catch(() => {});
    }
  }

  function controls() {
    const box = active.el.querySelector('.call-controls');
    const toggle = (act, on, onIcon, offIcon, onLabel, offLabel, key) =>
      `<button type="button" class="call-btn toggle${on ? '' : ' off'}" data-call="${act}" aria-pressed="${!on}" aria-label="${on ? onLabel : offLabel}" data-tooltip="${on ? onLabel : offLabel}${key ? ` (${key})` : ''}">${icon(on ? onIcon : offIcon)}</button>`;
    const open = !!active.el.querySelector('.call-react');
    box.innerHTML =
      toggle('mic', active.mic, 'mic', 'mic_off', active.ptt ? 'Mute (hold Space to talk)' : 'Mute', 'Unmute', 'M') +
      toggle('deaf', !active.deaf, 'headphones', 'headset_off', 'Deafen', 'Undeafen', 'D') +
      (active.canCam ? toggle('cam', active.cam, 'videocam', 'videocam_off', 'Turn camera off', 'Turn camera on', 'V') : '') +
      (active.flips && active.cam ? `<button type="button" class="call-btn toggle" data-call="flip" aria-label="Switch camera" data-tooltip="Switch camera">${icon('flip_camera_ios')}</button>` : '') +
      (canShare() ? `<button type="button" class="call-btn toggle${active.screen ? ' sharing' : ''}" data-call="share" aria-pressed="${!!active.screen}" aria-label="${active.screen ? 'Stop sharing your screen' : 'Share your screen'}" data-tooltip="${active.screen ? 'Stop sharing' : 'Share your screen'} (Shift+S)">${icon(active.screen ? 'stop_screen_share' : 'present_to_all')}</button>` : '') +
      `<button type="button" class="call-btn toggle${open ? ' sharing' : ''}" data-call="react" aria-expanded="${open}" aria-label="Reactions and sounds" data-tooltip="Reactions and sounds (E)">${icon('add_reaction')}</button>` +
      `<button type="button" class="call-btn hang wide" data-call="hang" aria-label="Hang up" data-tooltip="Hang up">${icon('call_end')}</button>`;
    box.dataset.n = String(box.children.length);
    if (active.bar) barText(true);
    requestAnimationFrame(() => placeSelf());
  }

  function selfView() {
    const self = active.el && active.el.querySelector('.call-self');
    if (!self) return;
    self.hidden = !active.cam;
    self.classList.toggle('mirror', active.facing === 'user');
    // a fresh stream each time, so a browser shows the camera that's on now
    self.srcObject = active.cam ? new MediaStream(active.local.getVideoTracks()) : null;
    requestAnimationFrame(() => placeSelf());
  }

  // ---- your own picture: drag it to any corner, and it stays in that corner (for the next call too) ----------------

  const CORNERS = ['tl', 'tr', 'bl', 'br'];
  function savedCorner() {
    try {
      const c = localStorage.getItem('nook-self-corner');
      return CORNERS.includes(c) ? c : 'br';
    } catch (_) {
      return 'br';
    }
  }
  /** where your picture sits in a corner: clear of the title at the top and the buttons at the bottom */
  function cornerSpot(self, corner) {
    const box = active.el.getBoundingClientRect();
    const top = active.el.querySelector('.call-top').getBoundingClientRect().bottom - box.top + 8;
    const bottom = active.el.querySelector('.call-controls').getBoundingClientRect().top - box.top - 10;
    const pad = 12;
    return {
      x: corner[1] === 'l' ? pad : box.width - self.offsetWidth - pad,
      y: corner[0] === 't' ? top : Math.max(top, bottom - self.offsetHeight),
    };
  }
  function placeSelf(glide = false) {
    const self = active && active.el && active.el.querySelector('.call-self');
    if (!self || self.hidden || self._dragging) return;
    const { x, y } = cornerSpot(self, active.corner || (active.corner = savedCorner()));
    self.classList.toggle('settling', glide);
    self.style.left = x + 'px';
    self.style.top = y + 'px';
  }
  addEventListener('resize', () => active && placeSelf());
  function wireSelf(self) {
    let drag = null;
    self.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || !active) return;
      try {
        self.setPointerCapture(e.pointerId);
      } catch (_) {
        /* it still follows while the pointer is down */
      }
      const r = self.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, box: active.el.getBoundingClientRect(), x0: e.clientX, y0: e.clientY, moved: false };
      self._dragging = true;
      self.classList.remove('settling');
    });
    self.addEventListener('pointermove', (e) => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      self.style.left = Math.min(drag.box.width - self.offsetWidth, Math.max(0, e.clientX - drag.box.left - drag.dx)) + 'px';
      self.style.top = Math.min(drag.box.height - self.offsetHeight, Math.max(0, e.clientY - drag.box.top - drag.dy)) + 'px';
    });
    const drop = () => {
      if (!drag) return;
      self._dragging = false;
      if (drag.moved && active) {
        // it goes to the corner nearest to where it was let go
        const r = self.getBoundingClientRect();
        const cx = r.left + r.width / 2 - drag.box.left;
        const cy = r.top + r.height / 2 - drag.box.top;
        active.corner = (cy < drag.box.height / 2 ? 't' : 'b') + (cx < drag.box.width / 2 ? 'l' : 'r');
        try {
          localStorage.setItem('nook-self-corner', active.corner);
        } catch (_) {
          /* it stays there for this call */
        }
        fx.haptic(6);
      }
      drag = null;
      placeSelf(true);
    };
    self.addEventListener('pointerup', drop);
    self.addEventListener('pointercancel', drop);
  }

  /** the faces (or pictures) of everyone else in the call; while it rings, whoever is being called */
  function stage() {
    const box = active.el.querySelector('.call-stage');
    box.dataset.count = String(active.peers.size);
    let waiting = box.querySelector('.call-waiting');
    if (active.peers.size) {
      if (waiting) waiting.remove();
      return;
    }
    if (waiting) return;
    waiting = document.createElement('div');
    waiting.className = 'call-waiting';
    const g = active.call.group;
    const face = g ? ui.nookIcon({ shape: g.shape, symbol: 'groups', color: g.color }, 132, 64) : avatar(store.user(active.other), 132, { moving: true });
    waiting.innerHTML = `<div class="ring-face big"><m3-shape class="ring-halo" shape="cookie12" aria-hidden="true"></m3-shape><m3-shape class="ring-halo two" shape="sunny" aria-hidden="true"></m3-shape><span class="ring-pic">${face}</span></div>`;
    box.appendChild(waiting);
    clearInterval(active.halo);
    active.halo = cycleHalo(waiting.querySelector('.ring-halo'));
  }

  function drawTile(peer) {
    if (!active || !active.el) return;
    const box = active.el.querySelector('.call-stage');
    let tile = peer.tile;
    if (!tile) {
      const u = store.user(peer.name);
      tile = peer.tile = document.createElement('div');
      tile.className = 'call-tile';
      tile.dataset.key = 'person:' + lower(peer.name);
      // a tap on someone: their volume, muting them for yourself, and showing their camera big
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.setAttribute('aria-label', `u/${u.name}: volume and more`);
      tile.innerHTML =
        '<video autoplay playsinline muted></video><audio autoplay></audio>' +
        `<div class="tile-face"><m3-shape class="tile-halo" shape="${esc(u.shape || 'cookie9')}" aria-hidden="true"></m3-shape><span class="tile-pic">${avatar(u, 96)}</span></div>` +
        `<div class="tile-name"><span translate="no">${esc(u.name)}</span><span class="tile-muted" hidden>${icon('mic_off')}</span><span class="tile-deaf" hidden>${icon('headset_off')}</span><span class="tile-hushed" hidden>${icon('volume_off')}</span><small class="tile-state"></small></div>`;
      box.appendChild(tile);
      fx.play(tile, [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
      stage();
    }
    // the sound and the picture each have a player of their own: a player given both waits for a picture before it
    // plays anything, and a camera that's off never sends one, so nobody would be heard
    const player = tile.querySelector('video');
    const speaker = tile.querySelector('audio');
    const count = peer.stream ? peer.stream.getTracks().length : 0;
    if (peer.stream && player._tracks !== count) {
      player._tracks = count;
      player.srcObject = new MediaStream(peer.stream.getVideoTracks());
      speaker.srcObject = new MediaStream(peer.stream.getAudioTracks());
      player.play().catch(() => {});
      // only a browser that won't play sound needs a tap (a play cut short by the next one is fine)
      speaker.play().catch((error) => error && error.name === 'NotAllowedError' && needsTap());
    }
    // a camera turned on: its picture should show
    if (peer.stream && peer.cam && player.readyState < 2 && !player._nudge) nudge(player, () => peer.stream.getVideoTracks());
    if (!peer.cam) player._nudge = clearTimeout(player._nudge);
    const connected = peer.state === 'connected';
    const camOn = peer.cam && peer.stream && peer.stream.getVideoTracks().length > 0;
    tile.dataset.state = connected ? 'on' : peer.state === 'failed' ? 'failed' : 'wait';
    tile.classList.toggle('has-video', !!camOn && connected);
    // deafened says more than muted (it's both)
    tile.querySelector('.tile-muted').hidden = peer.mic || peer.deaf;
    tile.querySelector('.tile-deaf').hidden = !peer.deaf;
    tile.querySelector('.tile-hushed').hidden = !peer.hushed;
    tile.querySelector('.tile-state').textContent = connected
      ? ''
      : peer.state === 'failed' ? 'Couldn’t connect' : peer.state === 'disconnected' || peer.state === 'away' ? 'Reconnecting…' : 'Connecting…';
    screenTile(peer, connected);
    hearing(peer);
    layout();
  }

  /** someone sharing their screen: a card that says so, with a small picture of it, until you choose to watch it
   *  (then it's sent to you in full, with its sound, and goes in the big spot) */
  function screenTile(peer, connected) {
    const box = active.el.querySelector('.call-stage');
    const showing = peer.sharing && peer.screenStream && connected;
    if (!showing) {
      if (peer.screenTile) {
        if (active.theater === peer.screenTile) closeTheater();
        peer.screenTile.remove();
      }
      peer.screenTile = null;
      return;
    }
    if (!peer.screenTile) {
      const tile = (peer.screenTile = document.createElement('div'));
      tile.className = 'call-tile screen-tile has-video';
      tile.dataset.key = 'screen:' + lower(peer.name);
      tile.tabIndex = 0;
      tile.setAttribute('role', 'button');
      tile.innerHTML =
        '<video autoplay playsinline muted></video><audio autoplay></audio>' +
        `<button type="button" class="stream-watch" data-stream="watch">${icon('visibility')}<span>Watch stream</span></button>` +
        `<div class="tile-name">${icon('present_to_all')}<b class="tile-what">${esc(peer.name)}’s screen</b><b class="live-chip">Live</b></div>` +
        '<div class="stream-tools"></div>';
      box.prepend(tile);
      fx.play(tile, [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
      SOUNDS.stream();
    }
    const tile = peer.screenTile;
    const player = tile.querySelector('video');
    if (player._stream !== peer.screenStream) {
      player._stream = peer.screenStream;
      player.srcObject = peer.screenStream;
      player.play().catch(() => {});
      nudge(player, () => peer.screenStream.getVideoTracks());
    }
    const speaker = tile.querySelector('audio');
    if (peer.screenAudio && speaker._stream !== peer.screenAudio) {
      speaker._stream = peer.screenAudio;
      speaker.srcObject = peer.screenAudio;
      speaker.play().catch(() => {});
    }
    tile.dataset.watching = String(!!peer.watching);
    tile.setAttribute('aria-label', peer.watching ? `${peer.name}’s screen: full screen` : `${peer.name}’s screen: watch stream`);
    streamTools(peer);
  }

  /** the buttons on a stream you watch: its sound, everyone (out of the big spot), full screen, and stop watching */
  function streamTools(peer) {
    const tile = peer.screenTile;
    if (!tile) return;
    const box = tile.querySelector('.stream-tools');
    const theater = active.theater === tile;
    const big = tile.classList.contains('focused');
    const sig = [peer.watching, peer.sound, peer.streamHushed, theater, big].join();
    if (box._sig === sig) return;
    box._sig = sig;
    const tool = (act, symbol, label) => `<button type="button" class="stream-tool" data-stream="${act}" aria-label="${label}" data-tooltip="${label}">${icon(symbol)}</button>`;
    box.innerHTML = !peer.watching
      ? ''
      : (peer.sound ? tool('sound', peer.streamHushed ? 'volume_off' : 'volume_up', peer.streamHushed ? 'Unmute the stream' : 'Mute the stream') : '') +
        (big && !theater ? tool('grid', 'grid_view', 'Show everyone') : '') +
        tool('full', theater ? 'fullscreen_exit' : 'fullscreen', theater ? 'Exit full screen' : 'Full screen') +
        (theater ? '' : tool('stop', 'visibility_off', 'Stop watching'));
  }

  /** your own screen, while you share it: a dim picture of it (shown in full it would repeat itself forever), what
   *  it's like (smooth or sharp, with or without sound), and a way to stop */
  function myScreenTile() {
    const box = active.el.querySelector('.call-stage');
    let tile = box.querySelector('.my-screen');
    if (!active.screen) {
      if (tile) {
        if (active.theater === tile) closeTheater();
        tile.remove();
      }
      return;
    }
    if (!tile) {
      tile = document.createElement('div');
      tile.className = 'call-tile screen-tile my-screen has-video';
      tile.dataset.key = 'screen:me';
      tile.innerHTML =
        '<video autoplay playsinline muted></video>' +
        `<div class="my-screen-note"><b>${icon('present_to_all')}<span>You’re sharing your screen</span></b><small class="my-screen-sound"></small>` +
        `<div class="chips"><button type="button" class="chip" data-quality="smooth">${icon('speed')}Smooth</button><button type="button" class="chip" data-quality="sharp">${icon('hd')}Sharp text</button></div>` +
        `<button type="button" class="m3-btn tonal small" data-call="share">${icon('stop_screen_share')}Stop</button></div>` +
        `<div class="tile-name">${icon('present_to_all')}<b class="tile-what">Your screen</b><b class="live-chip">Live</b></div>`;
      box.prepend(tile);
    }
    const player = tile.querySelector('video');
    if (player._track !== active.screen) {
      player._track = active.screen;
      player.srcObject = new MediaStream([active.screen]);
      player.play().catch(() => {});
    }
    tile.querySelectorAll('[data-quality]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.quality === active.quality)));
    // with sound or without (and how to have it), and how many are watching
    const watching = [...active.peers.values()].filter((p) => p.watchesMe === true).length;
    const note = tile.querySelector('.my-screen-sound');
    const said = `${!!active.screenSound} ${watching}`;
    if (note._said !== said) {
      note._said = said;
      note.innerHTML =
        (active.screenSound ? `${icon('volume_up')}<span>With sound</span>` : `${icon('no_sound')}<span>No sound. To share it, share a tab (or your whole screen, on Windows) with its audio on.</span>`) +
        (watching ? `<b>${watching === 1 ? '1 watching' : `${watching} watching`}</b>` : '');
    }
  }

  /** Safari can leave a player that was given a picture before its first frame came showing nothing for good: until
   *  one shows, it's given the picture again, once a second for a few seconds */
  function nudge(player, tracks) {
    clearTimeout(player._nudge);
    let tries = 0;
    const check = () => {
      if (!player.isConnected || player.readyState >= 2 || ++tries > 8) return;
      const live = tracks().filter((t) => t.readyState === 'live');
      if (!live.length) return;
      player.srcObject = new MediaStream(live);
      player.play().catch(() => {});
      player._nudge = setTimeout(check, 1000);
    };
    player._nudge = setTimeout(check, 1200);
  }

  // ---- watching a stream, the big spot, and full screen ---------------------------------------------------------

  const peerFor = (key) => active && active.peers.get(String(key || '').replace(/^(screen|person):/, '')) || null;

  /** you start (or stop) watching someone's shared screen: they're told, so it comes to you in full (or not) */
  function watch(peer, on = true) {
    if (!active || !peer || !peer.screenTile) return;
    peer.watching = on;
    send(peer, 'media', mediaState(peer));
    const key = 'screen:' + lower(peer.name);
    if (on) {
      active.focus = key;
      // a tap is what lets an iPhone play sound: the stream's sound starts here
      const speaker = peer.screenTile.querySelector('audio');
      if (speaker.srcObject) speaker.play().catch(() => {});
      peer.screenTile.querySelector('video').play().catch(() => {});
    } else if (active.focus === key) active.focus = nextFocus(key);
    if (!on && active.theater === peer.screenTile) closeTheater();
    drawTile(peer);
    fx.haptic(6);
  }
  /** they stopped sharing, so you stopped watching */
  function stopWatching(peer) {
    peer.watching = false;
    const key = 'screen:' + lower(peer.name);
    if (active.focus === key) active.focus = nextFocus(key);
  }
  /** after the stream in the big spot, the next one you're watching, or none (everyone in a grid) */
  function nextFocus(not) {
    const next = [...active.peers.values()].find((p) => p.watching && p.screenTile && 'screen:' + lower(p.name) !== not);
    return next ? 'screen:' + lower(next.name) : null;
  }

  function tileTap(tile) {
    const key = tile.dataset.key || '';
    if (key === 'screen:me') return;
    const peer = peerFor(key);
    if (!peer) return;
    if (key.startsWith('screen:')) {
      if (!peer.watching) return watch(peer, true);
      // full screen shows its buttons, or hides them, with a tap
      if (active.theater === tile) return void tile.classList.toggle('bare');
      active.focus = key;
      layout();
      return theater(tile);
    }
    personSheet(peer);
  }

  function streamAct(act, tile) {
    const peer = tile && peerFor(tile.dataset.key);
    if (!peer) return;
    if (act === 'watch') watch(peer, true);
    else if (act === 'stop') watch(peer, false);
    else if (act === 'full') {
      if (active.theater === tile) closeTheater();
      else {
        active.focus = tile.dataset.key;
        layout();
        theater(tile);
      }
    } else if (act === 'grid') {
      active.focus = null;
      layout();
    } else if (act === 'sound') {
      peer.streamHushed = !peer.streamHushed;
      hearing(peer);
      streamTools(peer);
    }
  }

  /** full screen: the stream fills the whole screen. Budgie does it itself (an iPhone has no full screen for a page),
   *  and asks the browser for its own too where there is one, so nothing else shows */
  function theater(tile) {
    if (!active || !tile) return;
    if (active.theater && active.theater !== tile) closeTheater();
    active.theater = tile;
    tile.classList.add('theater');
    tile.classList.remove('bare');
    active.el.classList.add('theater');
    closeReact();
    const el = active.el;
    if (document.fullscreenEnabled && el.requestFullscreen && !document.fullscreenElement) {
      active.fsAt = Date.now();
      el.requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          // a phone turns to the stream's shape
          const v = tile.querySelector('video');
          if (touchOnly() && v && v.videoWidth > v.videoHeight && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
        })
        .catch(() => {});
    }
    active.peers.forEach((p) => p.screenTile && streamTools(p));
    fx.haptic(6);
  }
  function closeTheater() {
    if (!active || !active.theater) return;
    const tile = active.theater;
    active.theater = null;
    tile.classList.remove('theater', 'bare');
    active.el.classList.remove('theater');
    if (document.fullscreenElement === active.el && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch (_) {
      /* it was never turned */
    }
    active.peers.forEach((p) => p.screenTile && streamTools(p));
    layout();
  }
  // the browser's full screen ended (Esc, or its own way out): Budgie's goes too. Unless the browser gave it up the
  // moment it began (Android's app does), when Budgie's own carries on
  document.addEventListener('fullscreenchange', () => {
    if (!active || !active.theater || document.fullscreenElement) return;
    if (Date.now() - (active.fsAt || 0) > 900) closeTheater();
  });

  /** how the stage is laid out: faces for a voice call; once anyone's camera or screen is on, tiles in a grid, as big
   *  as they can be; and with something in the big spot (a stream you're watching, someone you chose), it, with
   *  everyone else in a strip under it or beside it, whichever leaves it bigger */
  function layout() {
    if (!active || !active.el) return;
    const peers = [...active.peers.values()];
    const box = active.el.querySelector('.call-stage');
    myScreenTile();
    const tiles = [...box.children].filter((t) => t.classList.contains('call-tile'));
    let focused = active.focus ? tiles.find((t) => t.dataset.key === active.focus) || null : null;
    if (active.focus && !focused) active.focus = null;
    // someone shown big has to have something to show: a stream you watch, or a camera that's on
    if (focused && !focused.classList.contains('has-video')) focused = active.focus = null;
    const pictures = focused || active.screen || active.cam || tiles.some((t) => t.classList.contains('has-video'));
    active.el.dataset.media = pictures ? 'video' : 'voice';
    box.classList.toggle('focus', !!focused);
    tiles.forEach((t) => t.classList.toggle('focused', t === focused));
    box.dataset.count = String(peers.length);
    box.dataset.tiles = String(tiles.length);
    if (pictures) arrange(box, tiles, focused);
    peers.forEach((p) => p.screenTile && streamTools(p));
    speakers();
  }

  function arrange(box, tiles, focused) {
    const gap = 8;
    const W = box.clientWidth - 16;
    const H = box.clientHeight - 16;
    if (W <= 0 || H <= 0) return;
    if (focused) {
      const k = tiles.length - 1;
      if (!k) return void (box.dataset.strip = 'none');
      const phone = Math.min(innerWidth, innerHeight) < 560;
      const under = phone ? 104 : 150;
      const beside = phone ? 132 : 232;
      // the area of a 16:9 picture that fits w × h
      const fit = (w, h) => {
        const ww = Math.max(0, Math.min(w, (h * 16) / 9));
        return (ww * ww * 9) / 16;
      };
      const side = fit(W - beside - gap, H) > fit(W, H - under - gap);
      const length = side ? H : W;
      const least = side ? 60 : 76;
      const most = Math.max(1, Math.floor((length + gap) / (least + gap)));
      const lines = Math.min(2, Math.ceil(k / most));
      box.dataset.strip = side ? 'side' : 'under';
      box.style.setProperty('--per', String(Math.ceil(k / lines)));
      box.style.setProperty('--lines', String(lines));
      box.style.setProperty('--strip', Math.round((side ? beside : under) * (lines > 1 ? 0.78 : 1)) + 'px');
      return;
    }
    delete box.dataset.strip;
    // the grid: as many to a row as makes each tile as big as it can be (squarish on a phone, wider on a computer)
    const n = tiles.length;
    const aspect = W >= H ? 4 / 3 : 1;
    let cols = 1;
    let best = 0;
    for (let c = 1; c <= n; c++) {
      const r = Math.ceil(n / c);
      const w = (W - gap * (c - 1)) / c;
      const h = (H - gap * (r - 1)) / r;
      const bw = Math.min(w, h * aspect);
      const area = (bw * bw) / aspect;
      if (area > best + 1) {
        best = area;
        cols = c;
      }
    }
    box.style.setProperty('--cols', String(cols));
  }
  addEventListener('resize', () => active && layout());

  function removeTile(peer, quick = false) {
    const tile = peer.tile;
    peer.tile = null;
    if (peer.screenTile) {
      if (active && active.theater === peer.screenTile) closeTheater();
      peer.screenTile.remove();
    }
    peer.screenTile = null;
    if (active && active.focus && peerFor(active.focus) === peer) active.focus = null;
    if (!tile) return;
    if (quick) return void tile.remove();
    const out = fx.play(tile, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.85)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    const done = () => {
      tile.remove();
      if (active) {
        stage();
        layout();
      }
    };
    if (out) fx.settled(out).then(done);
    else done();
  }

  // ---- someone in the call: their volume, muting them for yourself, their camera big --------------------------------

  function personSheet(peer) {
    const u = store.user(peer.name);
    const key = 'person:' + lower(peer.name);
    const camera = !!(peer.tile && peer.tile.classList.contains('has-video'));
    const pct = (v) => Math.round(v * 100) + '%';
    return ui.sheet({
      headline: 'u/' + u.name,
      symbol: 'graphic_eq',
      shape: u.shape || 'cookie9',
      className: 'call-person',
      html:
        (volumeWorks
          ? `<div class="setting-row"><span class="label">Volume</span><div class="slider-row"><m3-slider data-vol="voice" min="0" max="100" step="5" value="${Math.round(peer.volume * 100)}" label="Volume"></m3-slider><output>${pct(peer.volume)}</output></div></div>` +
            (peer.sharing && peer.sound ? `<div class="setting-row"><span class="label">Their screen’s sound</span><div class="slider-row"><m3-slider data-vol="stream" min="0" max="100" step="5" value="${Math.round(peer.streamVolume * 100)}" label="Their screen’s sound"></m3-slider><output>${pct(peer.streamVolume)}</output></div></div>` : '')
          : '') +
        `<label class="switch-row">${icon('volume_off')}<span class="switch-text"><span>Mute for me</span><small>Only you stop hearing them (and their sounds). They aren’t told.</small></span><input type="checkbox" class="m3-switch" role="switch" data-hush${peer.hushed ? ' checked' : ''}></label>` +
        (camera ? `<label class="switch-row">${icon('open_in_full')}<span class="switch-text"><span>Show big</span><small>Their camera in the big spot, everyone else beside it</small></span><input type="checkbox" class="m3-switch" role="switch" data-pin${active.focus === key ? ' checked' : ''}></label>` : ''),
      setup(body) {
        body.addEventListener('input', (e) => {
          const slider = e.target.closest('[data-vol]');
          if (!slider) return;
          const v = Number(slider.value) / 100;
          if (slider.dataset.vol === 'voice') peer.volume = v;
          else peer.streamVolume = v;
          slider.closest('.slider-row').querySelector('output').textContent = pct(v);
          hearing(peer);
        });
        body.addEventListener('change', (e) => {
          const t = e.target;
          if (t.matches('[data-vol]')) keepVolume(peer.name, t.dataset.vol === 'voice' ? { v: peer.volume } : { sv: peer.streamVolume });
          else if (t.matches('[data-hush]')) {
            peer.hushed = t.checked;
            keepVolume(peer.name, { m: peer.hushed });
            drawTile(peer);
          } else if (t.matches('[data-pin]')) {
            active.focus = t.checked ? key : null;
            layout();
          }
        });
      },
      actions: [{ label: 'Done', variant: 'filled' }],
    });
  }

  // ---- reactions and the soundboard -----------------------------------------------------------------------------

  /** the little panel over the buttons: a reaction everyone sees float up from you, or a sound everyone hears */
  function reactions() {
    if (!active || closeReact()) return;
    const pop = document.createElement('div');
    pop.className = 'call-react';
    pop.setAttribute('role', 'group');
    pop.setAttribute('aria-label', 'Reactions and sounds');
    pop.innerHTML =
      `<div class="react-row">${EMOJI.map((e) => `<button type="button" class="react-emoji" data-emoji="${e}" aria-label="${e}">${e}</button>`).join('')}</div>` +
      `<span class="react-label">${icon('music_note')}Sounds everyone hears</span>` +
      `<div class="react-sounds">${Object.entries(BOARD)
        .map(([id, b]) => `<button type="button" class="chip" data-board="${id}"><span class="react-mini" aria-hidden="true">${b.emoji}</span>${esc(b.label)}</button>`)
        .join('')}</div>`;
    active.el.appendChild(pop);
    // just above the buttons, however tall they are
    const buttons = active.el.querySelector('.call-controls').getBoundingClientRect();
    pop.style.bottom = Math.round(active.el.getBoundingClientRect().bottom - buttons.top + 10) + 'px';
    fx.play(pop, [{ opacity: 0, transform: 'translate(-50%, 12px) scale(0.96)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
    pop.addEventListener('click', (e) => {
      const b = e.target.closest('[data-emoji], [data-board]');
      if (!b) return;
      react(b.dataset.board ? { s: b.dataset.board } : { e: b.dataset.emoji });
      fx.pop(b, 0.8);
    });
    // a tap anywhere else closes it
    pop._away = (e) => !pop.contains(e.target) && !e.target.closest('[data-call="react"]') && closeReact();
    document.addEventListener('pointerdown', pop._away, true);
    controls();
  }
  function closeReact() {
    const pop = active && active.el && active.el.querySelector('.call-react');
    if (!pop) return false;
    document.removeEventListener('pointerdown', pop._away, true);
    pop.remove();
    controls();
    return true;
  }

  /** you react: everyone sees it (a few at a time; a flood of them would only be noise) */
  function react(what) {
    if (!active) return;
    const now = Date.now();
    active.reacts = active.reacts.filter((t) => now - t < 10000);
    if (active.reacts.length >= 6) return fx.haptic(20);
    active.reacts.push(now);
    const r = Object.assign({ id: ++active.reactId + '-' + now.toString(36) }, what);
    tell({ react: r });
    reacted(null, r);
  }

  /** a reaction, from someone (or you): only the ones Budgie has are shown, never anything else */
  function reacted(peer, r) {
    if (!active || !active.el || !r) return;
    const board = typeof r.s === 'string' && Object.prototype.hasOwnProperty.call(BOARD, r.s) ? BOARD[r.s] : null;
    const emoji = board ? board.emoji : EMOJI.includes(r.e) ? r.e : null;
    if (!emoji) return;
    if (peer) {
      // someone sending more than a few at once: the rest are let go
      const now = Date.now();
      peer.reactTimes = peer.reactTimes.filter((t) => now - t < 10000);
      if (peer.reactTimes.length >= 8 || peer.hushed) return;
      peer.reactTimes.push(now);
    }
    floatUp(emoji, peer ? peer.tile : null);
    if (board && !active.deaf) board.play();
  }

  /** a reaction floats up from whoever sent it (yours from your buttons) */
  function floatUp(emoji, tile) {
    const host = active.el;
    const from = tile && tile.isConnected && !host.hidden ? tile : host.querySelector('.call-controls');
    if (!from || host.hidden) return;
    const r = from.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    const el = document.createElement('span');
    el.className = 'call-float';
    el.setAttribute('aria-hidden', 'true');
    el.textContent = emoji;
    el.style.left = r.left - b.left + r.width / 2 + (Math.random() - 0.5) * Math.min(80, r.width * 0.5) + 'px';
    el.style.top = r.top - b.top + Math.min(r.height * 0.55, 90) + 'px';
    host.appendChild(el);
    const rise = Math.min(220, Math.max(120, r.height * 0.8));
    const a = fx.play(
      el,
      [
        { transform: 'translate(-50%, 0) scale(0.5)', opacity: 0 },
        { transform: 'translate(-50%, -24px) scale(1.2)', opacity: 1, offset: 0.14 },
        { transform: `translate(-50%, -${rise}px) scale(1)`, opacity: 0 },
      ],
      { duration: 2000, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'forwards' }
    );
    if (a) fx.settled(a).then(() => el.remove());
    else setTimeout(() => el.remove(), 1400);
  }

  // ---- sound settings: microphone, speaker, noise, push to talk -------------------------------------------------

  async function callSettings() {
    if (!active) return;
    const p = hearPrefs();
    let devices = [];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch (_) {
      /* only the defaults, then */
    }
    if (!active) return;
    const mics = devices.filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'communications');
    const outs = 'setSinkId' in HTMLMediaElement.prototype ? devices.filter((d) => d.kind === 'audiooutput' && d.deviceId && d.deviceId !== 'communications') : [];
    const now = (micTrack() && micTrack().getSettings && micTrack().getSettings().deviceId) || p.mic || 'default';
    const option = (d, picked, i, fallback) => `<option value="${esc(d.deviceId)}"${d.deviceId === picked ? ' selected' : ''}>${esc(d.label || `${fallback} ${i + 1}`)}</option>`;
    const keys = !touchOnly();
    ui.sheet({
      headline: 'Sound and look',
      symbol: 'tune',
      shape: 'clover8',
      className: 'call-settings',
      html:
        (mics.length > 1 ? `<label class="field"><span class="field-label">Microphone</span><select class="m3-field call-select" data-pick="mic" data-no-i18n translate="no">${mics.map((d, i) => option(d, now, i, 'Microphone')).join('')}</select></label>` : '') +
        (outs.length > 1 ? `<label class="field"><span class="field-label">Speaker</span><select class="m3-field call-select" data-pick="speaker" data-no-i18n translate="no">${outs.map((d, i) => option(d, p.speaker || 'default', i, 'Speaker')).join('')}</select></label>` : '') +
        `<label class="switch-row">${icon('noise_aware')}<span class="switch-text"><span>Take out background noise</span><small>Keyboards, fans and traffic. Turn it off for music.</small></span><input type="checkbox" class="m3-switch" role="switch" data-set="clean"${p.clean !== false ? ' checked' : ''}></label>` +
        (keys ? `<label class="switch-row">${icon('keyboard')}<span class="switch-text"><span>Push to talk</span><small>Your microphone is on only while you hold the space bar</small></span><input type="checkbox" class="m3-switch" role="switch" data-set="ptt"${active.ptt ? ' checked' : ''}></label>` : '') +
        `<button type="button" class="m3-btn tonal" data-set="look">${icon('palette')}Call look: colours, background, ringtone</button>`,
      setup(body, close) {
        body.addEventListener('change', async (e) => {
          const t = e.target;
          if (!active) return;
          if (t.dataset.pick === 'mic') {
            if (await useMic(t.value)) hearPrefs({ mic: t.value });
          } else if (t.dataset.pick === 'speaker') {
            hearPrefs({ speaker: t.value });
            speakers();
          } else if (t.dataset.set === 'clean') {
            hearPrefs({ clean: t.checked });
            useMic(hearPrefs().mic);
          } else if (t.dataset.set === 'ptt') {
            hearPrefs({ ptt: t.checked });
            active.ptt = t.checked;
            active.talking = false;
            micLive();
            controls();
            if (t.checked) M3.snackbar('Hold the space bar to talk.');
          }
        });
        body.addEventListener('click', (e) => {
          if (!e.target.closest('[data-set="look"]')) return;
          close(null);
          customise();
        });
      },
      actions: [{ label: 'Done', variant: 'filled' }],
    });
  }

  /** a microphone picked (or the noise setting changed): a fresh one, sent to everyone in place of the old */
  async function useMic(device) {
    const want = audioWanted();
    if (device) want.deviceId = { exact: device };
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: want });
    } catch (_) {
      M3.snackbar('Couldn’t use that microphone.');
      return false;
    }
    const track = s.getAudioTracks()[0];
    if (!active || !track) {
      stopTracks(s);
      return false;
    }
    for (const old of active.local.getAudioTracks()) {
      old.stop();
      active.local.removeTrack(old);
    }
    active.local.addTrack(track);
    micLive();
    active.peers.forEach((peer) => peer.audio && peer.audio.replaceTrack(track).catch(() => {}));
    meters.unwatch('me');
    meters.add('me', active.local);
    return true;
  }

  /** everything you hear plays from the speaker you picked (on a computer whose browser can choose) */
  function speakers() {
    const id = hearPrefs().speaker;
    if (!active || !active.el || !id) return;
    active.el.querySelectorAll('audio').forEach((a) => a.setSinkId && a.sinkId !== id && a.setSinkId(id).catch(() => {}));
  }

  // a browser that wouldn't play sound on its own gets a button that does
  function needsTap() {
    if (!active || !active.el || active.el.querySelector('[data-call="play"]')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'm3-btn filled call-play';
    b.dataset.call = 'play';
    b.innerHTML = icon('volume_up') + 'Tap to hear the call';
    active.el.appendChild(b);
  }
  function playAll() {
    active.el.querySelectorAll('.call-tile video, .call-tile audio').forEach((m) => m.play().catch(() => {}));
    sound();
    const b = active.el.querySelector('[data-call="play"]');
    if (b) b.remove();
  }

  function status() {
    if (!active || !active.el) return;
    const peers = [...active.peers.values()];
    let text;
    if (!peers.length) text = active.outgoing && !active.call.answeredAt ? (active.call.group ? 'Ringing everyone…' : 'Ringing…') : active.call.group ? 'Waiting for others to join…' : 'Connecting…';
    else if (peers.some((p) => p.state === 'connected')) text = clock(Date.now() - (active.startedAt || Date.now())) + (active.call.group ? ` · ${peers.length + 1} in the call` : '');
    else if (peers.every((p) => p.state === 'failed')) text = 'Couldn’t connect';
    else if (peers.some((p) => p.state === 'disconnected' || p.state === 'away')) text = 'Reconnecting…';
    else text = 'Connecting…';
    const el = active.el.querySelector('.call-status');
    if (el.textContent !== text) el.textContent = text;
    if (active.bar) barText();
  }

  // ---- minimised: the call carries on while you use the rest of Budgie ------------------------------------
  // A slim bar across the very top, which moves the page down rather than covering any of it.

  function makeBar(className, html) {
    const bar = document.createElement('div');
    bar.className = 'call-bar ' + className;
    bar.setAttribute('role', 'region');
    bar.innerHTML = html;
    document.body.prepend(bar);
    document.documentElement.classList.add('has-call-bar');
    fx.play(bar, [{ transform: 'translateY(-100%)' }, { transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
    return bar;
  }
  function dropBar(bar) {
    bar.remove();
    if (!document.querySelector('.call-bar')) document.documentElement.classList.remove('has-call-bar');
  }

  function minimise() {
    if (!active || active.minimised) return;
    closeTheater();
    closeReact();
    active.minimised = true;
    active.el.hidden = true;
    active.bar = makeBar('', '');
    active.bar.setAttribute('aria-label', 'Your call');
    active.bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bar]');
      if (!b) return;
      if (b.dataset.bar === 'mic') toggleMic();
      else if (b.dataset.bar === 'deaf') toggleDeaf();
      else if (b.dataset.bar === 'hang') hangUp();
      else restore();
    });
    applyLook();
    barText(true);
  }
  /** the bar's words keep up with the call; its buttons are only drawn again when something about them changes */
  function barText(full = false) {
    const bar = active.bar;
    const words = `${title()} · ${active.el.querySelector('.call-status').textContent}`;
    if (full || !bar.querySelector('.call-bar-text')) {
      bar.innerHTML =
        `<button type="button" class="call-bar-main" data-bar="back" aria-label="Back to the call with ${esc(title())}"><span class="pill-dot"></span>${icon(active.cam ? 'videocam' : 'call')}<span class="call-bar-text"></span><b>Return</b></button>` +
        `<button type="button" class="m3-icon-btn small" data-bar="mic" aria-label="${active.mic ? 'Mute' : 'Unmute'}" data-tooltip="${active.mic ? 'Mute' : 'Unmute'} (M)">${icon(active.mic ? 'mic' : 'mic_off')}</button>` +
        `<button type="button" class="m3-icon-btn small" data-bar="deaf" aria-label="${active.deaf ? 'Undeafen' : 'Deafen'}" data-tooltip="${active.deaf ? 'Undeafen' : 'Deafen'} (D)">${icon(active.deaf ? 'headset_off' : 'headphones')}</button>` +
        `<button type="button" class="m3-icon-btn small call-bar-hang" data-bar="hang" aria-label="Hang up" data-tooltip="Hang up">${icon('call_end')}</button>`;
    }
    bar.querySelector('.call-bar-text').textContent = words;
  }
  function restore() {
    if (!active) return;
    if (active.bar) dropBar(active.bar);
    active.bar = null;
    active.minimised = false;
    active.el.hidden = false;
    layout();
    playAll();
    if (matchMedia('(hover: hover)').matches) active.el.querySelector('[data-call="hang"]').focus({ preventScroll: true });
  }

  // ---- people in a group call: ring those who aren't there (again) ----------------------------------------------

  function people() {
    if (!active || !active.call.group) return;
    const g = store.group(active.call.group.id);
    const names = g ? g.members.map((m) => m.name) : [];
    const here = new Set([lower(store.state.me.name), ...active.peers.keys()]);
    const ringing = new Set((active.call.ringing || []).map(lower));
    const missing = names.filter((n) => !here.has(lower(n)));
    return ui.sheet({
      headline: 'People',
      symbol: 'group',
      shape: active.call.group.shape,
      html:
        `<div class="list call-people">${names
          .map((n) => {
            const u = store.user(n);
            const state = here.has(lower(n)) ? 'In the call' : ringing.has(lower(n)) ? 'Ringing…' : 'Not here';
            return `<div class="team-row">${avatar(u, 40)}<span class="row-text"><b><span translate="no">${esc(u.name)}</span>${store.isMe(n) ? ' <span class="muted">(you)</span>' : ''}</b><small>${state}</small></span>${
              here.has(lower(n)) ? '' : `<button type="button" class="m3-btn tonal small" data-ring-name="${esc(u.name)}">${icon('ring_volume')}Ring</button>`
            }</div>`;
          })
          .join('')}</div>`,
      setup(body, close) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-ring-name]');
          if (!b) return;
          b.disabled = true;
          ringAgain([b.dataset.ringName]).then((ok) => (ok ? (b.innerHTML = `${icon('ring_volume')}Ringing…`) : (b.disabled = false)));
        });
      },
      actions: missing.length ? [{ label: 'Close', value: null }, { label: 'Ring everyone not here', variant: 'filled', symbol: 'ring_volume', run: () => (ringAgain(null), true) }] : [{ label: 'Close', variant: 'filled' }],
    });
  }
  async function ringAgain(names) {
    try {
      const r = await api.post(`/api/calls/${encodeURIComponent(active.id)}/ring`, names ? { names } : {});
      if (active && r.call) active.call = Object.assign(active.call, { ringing: r.call.ringing });
      M3.snackbar(`Ringing ${r.rang.map((n) => 'u/' + n).join(', ')}`);
      return true;
    } catch (error) {
      app().showError(error);
      return false;
    }
  }

  // ---- keys, for a computer -------------------------------------------------------------------------------------

  const SHORTCUTS = [
    [['M'], 'Mute or unmute (Ctrl+D or ⌘D works while you type)'],
    [['D'], 'Deafen or undeafen (Ctrl+Shift+D or ⌘⇧D)'],
    [['V'], 'Camera on or off (Ctrl+E or ⌘E)'],
    [['Shift', 'S'], 'Share your screen, or stop'],
    [['F'], 'Full screen for the stream you’re watching'],
    [['E'], 'Reactions and sounds'],
    [['Space'], 'Hold to talk, with push to talk on'],
    [['R'], 'People: ring someone again (in a group)'],
    [['C'], 'Hide the call, or bring it back'],
    [['Esc'], 'Hide the call'],
    [['Enter'], 'Answer a call that’s ringing (Esc turns it down)'],
  ];
  function shortcutsSheet() {
    ui.sheet({
      headline: 'Keys in a call',
      symbol: 'keyboard',
      shape: 'squircle',
      html: `<div class="keys">${SHORTCUTS.map(([keys, what]) => `<span>${keys.map((k) => `<kbd>${esc(k)}</kbd>`).join(' + ')}</span><span>${esc(what)}</span>`).join('')}</div>`,
      actions: [{ label: 'Got it', variant: 'filled' }],
    });
  }
  // before the app's own keys (they'd act on the page hidden behind the call)
  addEventListener(
    'keydown',
    (e) => {
      if (!active || e.defaultPrevented || e.altKey) return;
      const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"]');
      const inSheet = document.querySelector('dialog[open]');
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      let act = null;
      // push to talk: the space bar, held (and never a press of the button that has focus)
      if (active.ptt && e.key === ' ' && !mod && !typing && !inSheet) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!active.talking) {
          active.talking = true;
          micLive();
        }
        return;
      }
      if (mod && e.shiftKey && key === 'd') act = toggleDeaf;
      else if (mod && !e.shiftKey && key === 'd') act = toggleMic;
      else if (mod && !e.shiftKey && key === 'e') act = toggleCam;
      else if (!mod && !typing && !inSheet) {
        if (key === 'm' && !e.shiftKey) act = toggleMic;
        else if (key === 'd' && !e.shiftKey) act = toggleDeaf;
        else if (key === 'e' && !e.shiftKey && !active.minimised) act = reactions;
        else if (key === 'f' && !e.shiftKey && !active.minimised) act = fullKey;
        else if (key === 'v' && !e.shiftKey) act = toggleCam;
        else if (key === 's' && e.shiftKey && canShare()) act = toggleShare;
        else if (key === 'r' && !e.shiftKey && active.call.group && server095()) act = people;
        else if (key === 'c' && !e.shiftKey) act = () => (active.minimised ? restore() : minimise());
        else if (e.key === '?' && !active.minimised) act = shortcutsSheet;
      }
      if (!act) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      act();
    },
    true
  );
  // the space bar let go (or the window left while holding it): push to talk stops
  const quiet = (e) => {
    if (!active || !active.ptt || !active.talking || (e.type === 'keyup' && e.key !== ' ')) return;
    if (e.type === 'keyup') {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    active.talking = false;
    micLive();
  };
  addEventListener('keyup', quiet, true);
  addEventListener('blur', quiet);
  /** F: the stream in the big spot (or the one you're watching) fills the screen, or stops filling it */
  function fullKey() {
    if (active.theater) return closeTheater();
    const big = active.focus && active.focus.startsWith('screen:') ? peerFor(active.focus) : null;
    const peer = big && big.watching ? big : [...active.peers.values()].find((p) => p.watching && p.screenTile);
    if (!peer || !peer.screenTile || !peer.watching) return;
    active.focus = 'screen:' + lower(peer.name);
    layout();
    theater(peer.screenTile);
  }

  // ---- a page reloaded mid-call: the call is still going, and this device can go back to it ----------------

  function offerRejoin(call) {
    if (!call || active) return;
    const name = call.group ? call.group.name : 'u/' + (lower(call.from) === lower(store.state.me.name) ? call.with : call.from);
    const bar = makeBar(
      'rejoin',
      `<span class="pill-dot"></span>${icon(call.media === 'video' ? 'videocam' : 'call')}<span class="call-bar-text"><span translate="no">${esc(name)}</span> · you’re still in the call</span>` +
        `<button type="button" class="m3-btn filled small" data-rejoin="go">${icon('call')}Rejoin</button><button type="button" class="m3-icon-btn small call-bar-hang" data-rejoin="leave" aria-label="Hang up" data-tooltip="Hang up">${icon('call_end')}</button>`
    );
    tint(bar, seedFor(call, lower(call.from) === lower(store.state.me.name) ? call.with : call.from));
    bar.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rejoin]');
      if (!b) return;
      dropBar(bar);
      if (b.dataset.rejoin === 'leave') return void api.post(`/api/calls/${encodeURIComponent(call.id)}/leave`, {}).catch(() => {});
      const local = await media(call.media, { cam: camPref() });
      if (!local) return;
      let r;
      try {
        r = await api.post(`/api/calls/${encodeURIComponent(call.id)}/join`, {});
      } catch (error) {
        stopTracks(local);
        return app().showError(error);
      }
      begin(r, local, { outgoing: false });
    });
  }

  // ---- getting going -------------------------------------------------------------------------------------

  // calls the server says are ringing, for when the live connection couldn't say so itself
  store.on('ringing', (list = []) => list.forEach((call) => ringing(call)));
  if (serverCalls()) listen();
  if (window.NOOK_BOOT && window.NOOK_BOOT.call && able()) offerRejoin(window.NOOK_BOOT.call);

  Nook.calls = {
    available: () => able() && serverCalls(),
    start,
    groupCall,
    inCall: () => !!active,
    listen,
    customise,
    /** plays a ringtone once, to hear what it's like */
    preview: (name) => (RINGTONES[name] || RINGTONES[ringtone()])(),
    RINGTONES: Object.keys(RINGTONES),
    SHORTCUTS,
  };
})();
