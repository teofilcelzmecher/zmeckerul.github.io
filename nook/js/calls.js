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

  function tone(freq, at, length, gain = 0.1) {
    const a = sound();
    if (!a || a.state !== 'running') return;
    const t = a.currentTime + at;
    const osc = a.createOscillator();
    const env = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, t + length);
    osc.connect(env).connect(a.destination);
    osc.start(t);
    osc.stop(t + length + 0.05);
  }
  const SOUNDS = {
    // a bright three-note figure, twice, like a little bird
    ring() {
      [0, 0.15, 0.3, 0.75, 0.9, 1.05].forEach((at, i) => {
        const f = [783.99, 987.77, 1174.66][i % 3];
        tone(f, at, 0.42, 0.12);
        tone(f * 2, at, 0.12, 0.025);
      });
    },
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
        return ringing(d.call);
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

  function ringing(call) {
    if (!call || !call.id) return;
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
  const AUDIO = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const VIDEO = (facing) => ({ facingMode: facing, width: { ideal: 960 }, height: { ideal: 540 }, frameRate: { ideal: 24, max: 30 } });

  /** your microphone, and your camera for a video call: sound only when the camera can't be had */
  async function media(kind) {
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
      const local = await media(kind);
      if (!local) return;
      let r;
      try {
        r = await api.post('/api/calls', Object.assign(group ? { group } : { to }, { media: kind }));
      } catch (error) {
        stopTracks(local);
        return app().showError(error);
      }
      begin(r, local, { outgoing: true, to });
    } finally {
      starting = false;
    }
  }
  let starting = false;

  async function answer(call) {
    if (active) return;
    handled.add(call.id);
    unloop();
    const local = await media(call.media);
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

  function begin(r, local, { outgoing, to = '' }) {
    const call = r.call;
    handled.add(call.id);
    if (call.group) going.set(call.id, call);
    active = {
      id: call.id,
      call,
      ice: r.ice || { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478'] }], relay: false },
      local,
      mic: true,
      cam: local.getVideoTracks().length > 0,
      canCam: local.getVideoTracks().length > 0,
      facing: 'user',
      peers: new Map(),
      startedAt: 0,
      outgoing,
      // a call between two: who's on the other end, even before they answer
      other: call.group ? '' : to || (lower(call.from) === lower(store.state.me.name) ? call.with : call.from),
      minimised: false,
    };
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
    SOUNDS.join();
    if (!active.peers.has(lower(name))) addPeer(name);
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
    const peer = { name: store.user(name).name || name, pc: null, stream: null, queue: [], outbox: [], flush: 0, sending: Promise.resolve(), mic: true, cam: true, state: 'new', restarts: 0, offerer: false };
    active.peers.set(lower(name), peer);
    drawTile(peer);
    return peer;
  }

  function connect(name, offerer) {
    const peer = active.peers.get(lower(name)) || addPeer(name);
    if (peer.pc) return peer;
    peer.offerer = offerer;
    const pc = (peer.pc = new RTCPeerConnection({ iceServers: active.ice.iceServers, iceTransportPolicy: active.ice.relay ? 'relay' : 'all' }));
    for (const track of active.local.getTracks()) {
      const sender = pc.addTrack(track, active.local);
      if (track.kind === 'video') peer.video = sender;
    }
    // a video call where this camera couldn't start still shows everyone else's
    if (active.call.media === 'video' && !peer.video) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      peer.outbox.push(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate);
      // a moment's worth go together, rather than a request each
      clearTimeout(peer.flush);
      peer.flush = setTimeout(() => peer.outbox.length && send(peer, 'candidate', peer.outbox.splice(0)), 80);
    };
    pc.ontrack = (e) => {
      if (e.streams && e.streams[0]) peer.stream = e.streams[0];
      else {
        if (!peer.stream) peer.stream = new MediaStream();
        peer.stream.addTrack(e.track);
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
      drawTile(peer);
    }
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
  const mediaState = () => ({ mic: active.mic, cam: active.cam });

  function closePeer(peer) {
    clearTimeout(peer.flush);
    meters.unwatch(peer);
    try {
      if (peer.pc) peer.pc.close();
    } catch (_) {
      /* already closed */
    }
  }

  /** with more people, each picture is sent smaller, so everyone's connection keeps up */
  function fitBitrate() {
    const n = active.peers.size;
    const max = n <= 1 ? 1500000 : n <= 2 ? 800000 : 450000;
    active.peers.forEach((peer) => {
      if (!peer.video || !peer.video.getParameters) return;
      const params = peer.video.getParameters();
      if (!params.encodings || !params.encodings.length) return;
      params.encodings[0].maxBitrate = max;
      peer.video.setParameters(params).catch(() => {});
    });
  }

  // ---- your controls -------------------------------------------------------------------------------------

  function toggleMic() {
    active.mic = !active.mic;
    active.local.getAudioTracks().forEach((t) => (t.enabled = active.mic));
    broadcast('media', mediaState());
    controls();
    fx.haptic(8);
  }

  async function toggleCam() {
    if (!active.canCam) return;
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
    fx.haptic(8);
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
  // closing the page hangs up properly, rather than leaving the others waiting
  addEventListener('pagehide', () => active && api.post(`/api/calls/${encodeURIComponent(active.id)}/leave`, {}, { keepalive: true }).catch(() => {}));

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
    wake(false);
    poll.needed();
    SOUNDS.end();
    if (was.call.group) {
      // the group's call may carry on without you
      if (reason !== 'you') going.delete(was.id);
      changed();
    }
    const screen = was.el;
    const pill = was.pill;
    if (pill) pill.remove();
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

  function drawScreen() {
    const video = active.call.media === 'video';
    const el = document.createElement('div');
    el.className = 'call-screen';
    el.dataset.media = active.call.media;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `${kindOf(active.call.media)} with ${title()}`);
    el.innerHTML =
      '<div class="call-top">' +
      `<button type="button" class="m3-icon-btn call-min" data-call="min" aria-label="Back to Budgie (the call carries on)" data-tooltip="Minimise">${icon('picture_in_picture_alt')}</button>` +
      `<div class="call-title"><b>${esc(title())}</b><small class="call-status" aria-live="polite">${active.outgoing ? 'Calling…' : 'Connecting…'}</small></div>` +
      `<span class="call-lock" data-tooltip="Encrypted between devices, never recorded">${icon('lock')}</span></div>` +
      '<div class="call-stage"></div>' +
      (video ? '<video class="call-self" autoplay playsinline muted aria-label="You"></video>' : '') +
      '<div class="call-controls" role="toolbar" aria-label="Call controls"></div>';
    document.body.appendChild(el);
    active.el = el;
    tint(el, active.call.group ? active.call.group.color : store.user(active.other).color);
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
    const video = active.call.media === 'video';
    const toggle = (act, on, onIcon, offIcon, onLabel, offLabel) =>
      `<button type="button" class="call-btn toggle${on ? '' : ' off'}" data-call="${act}" aria-pressed="${!on}" aria-label="${on ? onLabel : offLabel}" data-tooltip="${on ? onLabel : offLabel}">${icon(on ? onIcon : offIcon)}</button>`;
    box.innerHTML =
      toggle('mic', active.mic, 'mic', 'mic_off', 'Mute', 'Unmute') +
      (video && active.canCam ? toggle('cam', active.cam, 'videocam', 'videocam_off', 'Turn camera off', 'Turn camera on') : '') +
      (video && active.flips && active.cam ? `<button type="button" class="call-btn toggle" data-call="flip" aria-label="Switch camera" data-tooltip="Switch camera">${icon('flip_camera_ios')}</button>` : '') +
      `<button type="button" class="call-btn hang wide" data-call="hang" aria-label="Hang up" data-tooltip="Hang up">${icon('call_end')}</button>`;
    if (active.pill) pillText();
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
        (active.call.media === 'video' ? '<video autoplay playsinline></video>' : '<audio autoplay></audio>') +
        `<div class="tile-face"><m3-shape class="tile-halo" shape="${esc(u.shape || 'cookie9')}" aria-hidden="true"></m3-shape><span class="tile-pic">${avatar(u, 96)}</span></div>` +
        `<div class="tile-name"><span>${esc(u.name)}</span><span class="tile-muted" hidden>${icon('mic_off')}</span><small class="tile-state"></small></div>`;
      box.appendChild(tile);
      fx.play(tile, [{ opacity: 0, transform: 'scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: fx.lively.duration, easing: fx.lively.easing });
      stage();
    }
    const player = tile.querySelector('video, audio');
    if (peer.stream && player.srcObject !== peer.stream) {
      player.srcObject = peer.stream;
      player.play().catch(() => needsTap());
    }
    const connected = peer.state === 'connected';
    const camOn = active.call.media === 'video' && peer.cam && peer.stream && peer.stream.getVideoTracks().length > 0;
    tile.dataset.state = connected ? 'on' : peer.state === 'failed' ? 'failed' : 'wait';
    tile.classList.toggle('has-video', !!camOn && connected);
    tile.querySelector('.tile-muted').hidden = peer.mic;
    tile.querySelector('.tile-state').textContent = connected ? '' : peer.state === 'failed' ? 'Couldn’t connect' : peer.state === 'disconnected' ? 'Reconnecting…' : 'Connecting…';
  }

  function removeTile(peer) {
    const tile = peer.tile;
    peer.tile = null;
    if (!tile) return;
    const out = fx.play(tile, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.85)' }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
    const done = () => {
      tile.remove();
      if (active) stage();
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
    else if (peers.some((p) => p.state === 'disconnected')) text = 'Reconnecting…';
    else text = 'Connecting…';
    const el = active.el.querySelector('.call-status');
    if (el.textContent !== text) el.textContent = text;
    if (active.pill) pillText();
  }

  // ---- minimised: the call carries on while you use the rest of Budgie ------------------------------------

  function minimise() {
    if (!active || active.minimised) return;
    active.minimised = true;
    active.el.hidden = true;
    const pill = (active.pill = document.createElement('button'));
    pill.type = 'button';
    pill.className = 'call-pill';
    pill.addEventListener('click', restore);
    document.body.appendChild(pill);
    tint(pill, active.call.group ? active.call.group.color : store.user(active.other).color);
    pillText();
    fx.play(pill, [{ opacity: 0, transform: 'translate(-50%, -16px)' }, { opacity: 1, transform: 'translate(-50%, 0)' }], { duration: fx.lively.duration, easing: fx.lively.easing });
  }
  function pillText() {
    const s = active.el.querySelector('.call-status').textContent;
    active.pill.innerHTML = `<span class="pill-dot"></span>${icon(active.mic ? (active.call.media === 'video' ? 'videocam' : 'call') : 'mic_off')}<span>${esc(title())} · ${esc(s)}</span><b>Return</b>`;
    active.pill.setAttribute('aria-label', `On a call with ${title()}. Return to the call`);
  }
  function restore() {
    if (!active) return;
    if (active.pill) active.pill.remove();
    active.pill = null;
    active.minimised = false;
    active.el.hidden = false;
    playAll();
    if (matchMedia('(hover: hover)').matches) active.el.querySelector('[data-call="hang"]').focus({ preventScroll: true });
  }

  // ---- getting going -------------------------------------------------------------------------------------

  // calls the server says are ringing, for when the live connection couldn't say so itself
  store.on('ringing', (list = []) => list.forEach(ringing));
  if (serverCalls()) listen();

  Nook.calls = {
    available: () => able() && serverCalls(),
    start,
    groupCall,
    inCall: () => !!active,
    listen,
  };
})();
