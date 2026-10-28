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
  };
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
  const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const VIDEO = (facing) => ({ facingMode: facing, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } });

  /** your microphone, and your camera for a video call (unless it's to be off): sound only when the camera can't be had */
  async function media(kind, { cam = true } = {}) {
    if (kind === 'video' && !cam) kind = 'voice';
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: kind === 'video' ? VIDEO('user') : false });
    } catch (error) {
      if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
        M3.snackbar(`Budgie needs your microphone${kind === 'video' ? ' and camera' : ''} for calls. Allow ${kind === 'video' ? 'them' : 'it'} in your browser’s settings for this site, then try again.`, { timeout: 8000 });
        return null;
      }
      if (kind === 'video') {
        try {
          const sound = await navigator.mediaDevices.getUserMedia({ audio: AUDIO });
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
        local = await navigator.mediaDevices.getUserMedia({ audio: AUDIO, video: cam ? VIDEO('user') : false });
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
      facing: 'user',
      peers: new Map(),
      startedAt: 0,
      outgoing,
      // a call between two: who's on the other end, even before they answer
      other: call.group ? '' : to || (lower(call.from) === lower(store.state.me.name) ? call.with : call.from),
      minimised: false,
    };
    local.getAudioTracks().forEach((t) => (t.enabled = mic));
    drawScreen();
    changed();
    // whoever arrives calls everyone already there, and they answer
    for (const name of r.peers || []) connect(name, true);
    if (outgoing && !(r.peers || []).length) loop('ringback', 3000);
    wake(true);
    poll.needed();
    meters.start();
    active.tick = setInterval(status, 1000);
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
    const peer = { name: store.user(name).name || name, pc: null, stream: null, screenStream: null, queue: [], outbox: [], flush: 0, sending: Promise.resolve(), mic: true, cam: false, sharing: false, state: 'new', restarts: 0, offerer: false };
    active.peers.set(lower(name), peer);
    drawTile(peer);
    return peer;
  }

  function connect(name, offerer) {
    const peer = active.peers.get(lower(name)) || addPeer(name);
    if (peer.pc) return peer;
    peer.offerer = offerer;
    const pc = (peer.pc = new RTCPeerConnection({ iceServers: active.ice.iceServers, iceTransportPolicy: active.ice.relay ? 'relay' : 'all' }));
    // three ways each way, always in this order: sound, camera, screen. A camera or a screen that's off sends nothing,
    // and turning one on later swaps a picture in, with nothing to negotiate again. The one answering takes the
    // same three from the offer (wire, below).
    if (offerer) {
      peer.audio = pc.addTransceiver(micTrack() || 'audio', { direction: 'sendrecv', streams: [active.local] }).sender;
      peer.video = pc.addTransceiver(camTrack() || 'video', { direction: 'sendrecv', streams: [active.local] }).sender;
      peer.screen = pc.addTransceiver(active.screen || 'video', { direction: 'sendrecv' }).sender;
      peer.wired = true;
    }
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      peer.outbox.push(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate);
      // a moment's worth go together, rather than a request each
      clearTimeout(peer.flush);
      peer.flush = setTimeout(() => peer.outbox.length && send(peer, 'candidate', peer.outbox.splice(0)), 80);
    };
    pc.ontrack = (e) => {
      // the third way in is their screen; sound and camera go together
      if (e.track.kind === 'video' && pc.getTransceivers().indexOf(e.transceiver) === 2) peer.screenStream = new MediaStream([e.track]);
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
      send(peer, 'media', mediaState());
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
      send(peer, 'media', mediaState());
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
      peer.mic = !data || data.mic !== false;
      peer.cam = !data || data.cam !== false;
      peer.sharing = !!(data && data.screen);
      drawTile(peer);
    }
  }

  const micTrack = () => active.local.getAudioTracks()[0] || null;
  const camTrack = () => (active.cam ? active.local.getVideoTracks()[0] || null : null);
  /** the one answering sends on the three ways the offer opened: sound, camera, screen */
  async function wire(peer) {
    const [a, v, sc] = peer.pc.getTransceivers();
    const use = async (t, track) => {
      if (!t) return null;
      t.direction = 'sendrecv';
      await t.sender.replaceTrack(track).catch(() => {});
      return t.sender;
    };
    peer.audio = await use(a, micTrack());
    peer.video = await use(v, camTrack());
    peer.screen = await use(sc, active.screen);
    peer.wired = true;
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
  const broadcast = (type, data) => active && active.peers.forEach((peer) => peer.pc && send(peer, type, data));
  const mediaState = () => ({ mic: active.mic, cam: active.cam, screen: !!active.screen });

  function closePeer(peer) {
    clearTimeout(peer.flush);
    meters.unwatch(peer);
    try {
      if (peer.pc) peer.pc.close();
    } catch (_) {
      /* already closed */
    }
  }

  /** with more people, each picture is sent smaller, so everyone's connection keeps up; a screen stays sharp */
  function fitBitrate() {
    const n = active.peers.size;
    const camera = (n <= 1 ? 1500000 : n <= 2 ? 800000 : 450000) / (active.screen ? 2 : 1);
    const limit = (sender, max, sharp) => {
      if (!sender || !sender.getParameters) return;
      const params = sender.getParameters();
      if (!params.encodings || !params.encodings.length) return;
      params.encodings[0].maxBitrate = max;
      if (sharp) params.degradationPreference = 'maintain-resolution';
      sender.setParameters(params).catch(() => {});
    };
    active.peers.forEach((peer) => {
      limit(peer.video, camera);
      limit(peer.screen, n <= 2 ? 1500000 : 900000, true);
    });
  }

  // ---- your controls -------------------------------------------------------------------------------------

  function toggleMic() {
    if (!active) return;
    active.mic = !active.mic;
    active.local.getAudioTracks().forEach((t) => (t.enabled = active.mic));
    broadcast('media', mediaState());
    controls();
    fx.haptic(8);
  }

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
    broadcast('media', mediaState());
    selfView();
    controls();
    layout();
    fx.haptic(8);
  }

  // ---- sharing your screen (on a computer; phones' browsers can't) ----------------------------------------------

  const canShare = () => !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
  async function toggleShare() {
    if (!active || !canShare()) return;
    if (active.screen) return stopShare();
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15, max: 30 } }, audio: false });
    } catch (error) {
      if (error.name !== 'NotAllowedError' && error.name !== 'AbortError') M3.snackbar('Couldn’t share your screen.');
      return;
    }
    const track = stream.getVideoTracks()[0];
    if (!active || !track) return stopTracks(stream);
    if ('contentHint' in track) track.contentHint = 'detail';
    // the browser's own "Stop sharing" button ends it too
    track.addEventListener('ended', stopShare);
    active.screen = track;
    active.peers.forEach((peer) => peer.screen && peer.screen.replaceTrack(track).catch(() => {}));
    fitBitrate();
    broadcast('media', mediaState());
    controls();
    layout();
  }
  function stopShare() {
    if (!active || !active.screen) return;
    const track = active.screen;
    active.screen = null;
    track.stop();
    active.peers.forEach((peer) => peer.screen && peer.screen.replaceTrack(null).catch(() => {}));
    fitBitrate();
    broadcast('media', mediaState());
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
      broadcast('media', mediaState());
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
    meters.stop();
    was.peers.forEach(closePeer);
    stopTracks(was.local);
    if (was.screen) was.screen.stop();
    if (was.bar) dropBar(was.bar);
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
        el.classList.toggle('speaking', m.level > 0.12 && (key === 'me' ? active.mic : key.mic));
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
      `<button type="button" class="m3-icon-btn" data-call="look" aria-label="Call look" data-tooltip="Call look">${icon('palette')}</button>` +
      (keys ? `<button type="button" class="m3-icon-btn" data-call="keys" aria-label="Keyboard shortcuts" data-tooltip="Shortcuts (?)">${icon('keyboard')}</button>` : '') +
      `<span class="call-lock" data-tooltip="Encrypted between devices, never recorded">${icon('lock')}</span></div>` +
      '<div class="call-stage"></div>' +
      '<video class="call-self" autoplay playsinline muted aria-label="You" hidden></video>' +
      '<div class="call-controls" role="toolbar" aria-label="Call controls"></div>';
    document.body.appendChild(el);
    active.el = el;
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
      else if (act === 'keys') shortcutsSheet();
    });
    el.addEventListener('keydown', (e) => e.key === 'Escape' && minimise());
    stage();
    selfView();
    controls();
    fx.play(el, [{ opacity: 0, transform: 'translateY(6%)' }, { opacity: 1, transform: 'none' }], { duration: fx.gentle.duration, easing: fx.gentle.easing });
    if (matchMedia('(hover: hover)').matches) el.querySelector('[data-call="hang"]').focus({ preventScroll: true });
    // more than one camera (a phone's front and back): you can switch
    if (active.canCam && navigator.mediaDevices.enumerateDevices) {
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
    box.innerHTML =
      toggle('mic', active.mic, 'mic', 'mic_off', 'Mute', 'Unmute', 'M') +
      (active.canCam ? toggle('cam', active.cam, 'videocam', 'videocam_off', 'Turn camera off', 'Turn camera on', 'V') : '') +
      (active.flips && active.cam ? `<button type="button" class="call-btn toggle" data-call="flip" aria-label="Switch camera" data-tooltip="Switch camera">${icon('flip_camera_ios')}</button>` : '') +
      (canShare() ? `<button type="button" class="call-btn toggle${active.screen ? ' sharing' : ''}" data-call="share" aria-pressed="${!!active.screen}" aria-label="${active.screen ? 'Stop sharing your screen' : 'Share your screen'}" data-tooltip="${active.screen ? 'Stop sharing' : 'Share your screen'} (Shift+S)">${icon(active.screen ? 'stop_screen_share' : 'present_to_all')}</button>` : '') +
      `<button type="button" class="call-btn hang wide" data-call="hang" aria-label="Hang up" data-tooltip="Hang up">${icon('call_end')}</button>`;
    if (active.bar) barText(true);
  }

  function selfView() {
    const self = active.el && active.el.querySelector('.call-self');
    if (!self) return;
    self.hidden = !active.cam;
    self.classList.toggle('mirror', active.facing === 'user');
    // a fresh stream each time, so a browser shows the camera that's on now
    self.srcObject = active.cam ? new MediaStream(active.local.getVideoTracks()) : null;
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
      tile.innerHTML =
        '<video autoplay playsinline></video>' +
        `<div class="tile-face"><m3-shape class="tile-halo" shape="${esc(u.shape || 'cookie9')}" aria-hidden="true"></m3-shape><span class="tile-pic">${avatar(u, 96)}</span></div>` +
        `<div class="tile-name"><span>${esc(u.name)}</span><span class="tile-muted" hidden>${icon('mic_off')}</span><small class="tile-state"></small></div>`;
      box.appendChild(tile);
      fx.play(tile, [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
      stage();
    }
    const player = tile.querySelector('video');
    // a camera's picture arriving after the sound is a new track in the same stream: the player is told again
    const count = peer.stream ? peer.stream.getTracks().length : 0;
    if (peer.stream && (player.srcObject !== peer.stream || player._tracks !== count)) {
      player.srcObject = peer.stream;
      player._tracks = count;
      // only a browser that won't play sound needs a tap (a play cut short by the next one is fine)
      player.play().catch((error) => error && error.name === 'NotAllowedError' && needsTap());
    }
    const connected = peer.state === 'connected';
    const camOn = peer.cam && peer.stream && peer.stream.getVideoTracks().length > 0;
    tile.dataset.state = connected ? 'on' : peer.state === 'failed' ? 'failed' : 'wait';
    tile.classList.toggle('has-video', !!camOn && connected);
    tile.querySelector('.tile-muted').hidden = peer.mic;
    tile.querySelector('.tile-state').textContent = connected
      ? ''
      : peer.state === 'failed' ? 'Couldn’t connect' : peer.state === 'disconnected' || peer.state === 'away' ? 'Reconnecting…' : 'Connecting…';
    screenTile(peer, connected);
    layout();
  }

  /** someone sharing their screen: it gets the big tile, and everyone's faces go in a row beneath */
  function screenTile(peer, connected) {
    const box = active.el.querySelector('.call-stage');
    const showing = peer.sharing && peer.screenStream && connected;
    if (!showing) {
      if (peer.screenTile) peer.screenTile.remove();
      peer.screenTile = null;
      return;
    }
    if (!peer.screenTile) {
      const tile = (peer.screenTile = document.createElement('div'));
      tile.className = 'call-tile screen-tile has-video';
      tile.innerHTML = `<video autoplay playsinline muted></video><div class="tile-name">${icon('present_to_all')}<span>${esc(peer.name)}’s screen</span></div>`;
      box.prepend(tile);
    }
    const player = peer.screenTile.querySelector('video');
    if (player.srcObject !== peer.screenStream) {
      player.srcObject = peer.screenStream;
      player.play().catch(() => {});
    }
  }

  /** how the stage is laid out: faces for voice, tiles once anyone's camera or screen is on */
  function layout() {
    if (!active || !active.el) return;
    const peers = [...active.peers.values()];
    const presenting = peers.some((p) => p.screenTile);
    const pictures = presenting || active.cam || peers.some((p) => p.tile && p.tile.classList.contains('has-video'));
    active.el.dataset.media = pictures ? 'video' : 'voice';
    const box = active.el.querySelector('.call-stage');
    box.classList.toggle('presenting', presenting);
    box.dataset.count = String(peers.length);
    // what you're sharing yourself isn't shown back to you (it would repeat forever), just said
    let note = active.el.querySelector('.share-note');
    if (active.screen && !note) {
      note = document.createElement('div');
      note.className = 'share-note';
      note.innerHTML = `${icon('present_to_all')}<span>You’re sharing your screen</span><button type="button" class="m3-btn tonal small" data-call="share">Stop</button>`;
      active.el.querySelector('.call-top').after(note);
    } else if (!active.screen && note) note.remove();
  }

  function removeTile(peer, quick = false) {
    const tile = peer.tile;
    peer.tile = null;
    if (peer.screenTile) peer.screenTile.remove();
    peer.screenTile = null;
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
    active.el.querySelectorAll('.call-tile video').forEach((m) => m.play().catch(() => {}));
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
    active.minimised = true;
    active.el.hidden = true;
    active.bar = makeBar('', '');
    active.bar.setAttribute('aria-label', 'Your call');
    active.bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-bar]');
      if (!b) return;
      if (b.dataset.bar === 'mic') toggleMic();
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
            return `<div class="team-row">${avatar(u, 40)}<span class="row-text"><b>${esc(u.name)}${store.isMe(n) ? ' <span class="muted">(you)</span>' : ''}</b><small>${state}</small></span>${
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
    [['V'], 'Camera on or off (Ctrl+E or ⌘E)'],
    [['Shift', 'S'], 'Share your screen, or stop'],
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
      if (mod && !e.shiftKey && key === 'd') act = toggleMic;
      else if (mod && !e.shiftKey && key === 'e') act = toggleCam;
      else if (!mod && !typing && !inSheet) {
        if (key === 'm' && !e.shiftKey) act = toggleMic;
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

  // ---- a page reloaded mid-call: the call is still going, and this device can go back to it ----------------

  function offerRejoin(call) {
    if (!call || active) return;
    const name = call.group ? call.group.name : 'u/' + (lower(call.from) === lower(store.state.me.name) ? call.with : call.from);
    const bar = makeBar(
      'rejoin',
      `<span class="pill-dot"></span>${icon(call.media === 'video' ? 'videocam' : 'call')}<span class="call-bar-text">You’re still in the call with ${esc(name)}</span>` +
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
