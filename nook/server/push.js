// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * Push notifications: so a message, a call or a reply reaches someone whose app is closed. To Budgie's Android app
 * (1.1) through Google's Firebase Cloud Messaging, and to Budgie on iPhone, iPad and Mac (1.2) straight through
 * Apple's Push Notification service. The server's owner gives it a Firebase service account (`nook push <file.json>`)
 * and Apple's push key (`nook push apple <AuthKey.p8> TEAM_ID`), kept in the database on the laptop, never in the
 * repository; without one, nothing goes to those phones.
 *
 * Each phone's token is kept with the sign-in it came from (signing out, or a sign-in expiring, takes it away) and
 * with the language the app is in: a notification is in the phone's language, put together from the same language
 * files as the app (js/lang/*.js), so "u/wren replied to your comment" reaches a Romanian phone in Romanian.
 *
 *   const push = require('./push')(db);
 *   push.send(userIds, { kind, title, body, word, then, href, tag })
 *     kind: message, call or activity (Android's channels). body is Budgie's own words (translated) for calls and
 *     activity, and someone's own words (left as they are) for messages; word stands in for an empty body, and then
 *     follows the body ("Voice call · Tap to answer"), both from WORDS
 *   push.on(platform)                                      whether that platform's key is set
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const http2 = require('node:http2');

const FCM = process.env.NOOK_FCM_URL || 'https://fcm.googleapis.com'; // a test points this at a fake one
const CHANNEL = { message: 'messages', call: 'calls', activity: 'activity' };
// Apple's push service: the real one, and the one for builds made for testing (a test points both at a fake one)
const APNS = {
  production: process.env.NOOK_APNS_URL || 'https://api.push.apple.com',
  sandbox: process.env.NOOK_APNS_URL || 'https://api.sandbox.push.apple.com',
};
const BUNDLE = 'com.budgiesocial.app'; // Budgie's app on iPhone, iPad and Mac
// the app's own notification categories (what it can do from a notification: reply to a message, answer a call)
const CATEGORY = { message: 'MESSAGE', call: 'CALL', activity: 'ACTIVITY' };
const isApple = (platform) => /^(ios|macos)/.test(platform || '');

// the few words a notification has that the app's language files don't
const WORDS = {
  picture: { en: 'Sent a picture', ro: 'A trimis o poză', es: 'Envió una foto', fr: 'A envoyé une photo', de: 'Hat ein Bild geschickt', it: 'Ha inviato una foto' },
  gif: { en: 'Sent a GIF', ro: 'A trimis un GIF', es: 'Envió un GIF', fr: 'A envoyé un GIF', de: 'Hat ein GIF geschickt', it: 'Ha inviato una GIF' },
  answer: { en: 'Tap to answer', ro: 'Atinge ca să răspunzi', es: 'Toca para responder', fr: 'Touche pour répondre', de: 'Tippe zum Annehmen', it: 'Tocca per rispondere' },
  join: { en: 'Tap to join', ro: 'Atinge ca să intri', es: 'Toca para unirte', fr: 'Touche pour rejoindre', de: 'Tippe zum Beitreten', it: 'Tocca per partecipare' },
};

/** the app's language files, as the server can use them: whole sentences, and sentences with names in them */
function languages(dir) {
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const file of fs.readdirSync(dir)) {
    if (!/^[a-z]{2}\.js$/.test(file)) continue;
    try {
      const box = { window: {} };
      vm.runInNewContext(fs.readFileSync(path.join(dir, file), 'utf8'), box, { timeout: 2000 });
      const pack = box.window.NOOK_LANG;
      if (!pack || !pack.code) continue;
      const patterns = Object.entries(pack.patterns || {}).map(([en, said]) => {
        const order = [];
        const source = en
          .split(/(\{\d+\})/)
          .map((part) => (/^\{\d+\}$/.test(part) ? (order.push(Number(part.slice(1, -1))), '(.+?)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
          .join('');
        return { re: new RegExp('^' + source + '$', 's'), order, said, fixed: en.replace(/\{\d+\}/g, '').length };
      });
      patterns.sort((a, b) => b.fixed - a.fixed);
      out[pack.code] = { strings: pack.strings || {}, patterns };
    } catch (_) {
      /* that language stays English */
    }
  }
  return out;
}

module.exports = function push(db, { langDir = path.join(__dirname, '..', 'js', 'lang'), log = console } = {}) {
  const packs = languages(langDir);
  /** a sentence in a language: as a whole, or with the names in it kept as they are */
  function t(lang, text) {
    const pack = packs[lang];
    if (!pack || !text) return text;
    if (pack.strings[text]) return pack.strings[text];
    for (const p of pack.patterns) {
      const m = p.re.exec(text);
      if (!m) continue;
      const slots = [];
      p.order.forEach((slot, i) => (slots[slot] = m[i + 1]));
      return p.said.replace(/\{(\d+)\}/g, (_, n) => (slots[n] == null ? '' : slots[n]));
    }
    return text;
  }
  const word = (key, lang) => (WORDS[key] && (WORDS[key][lang] || WORDS[key].en)) || key;

  const account = () => {
    try {
      const a = JSON.parse(db.meta('fcm-account') || 'null');
      return a && a.client_email && a.private_key && a.project_id ? a : null;
    } catch (_) {
      return null;
    }
  };
  // Google's permission to send, good for an hour
  let access = null;
  const b64 = (x) => Buffer.from(typeof x === 'string' ? x : JSON.stringify(x)).toString('base64url');
  async function permission(a) {
    if (access && access.email === a.client_email && access.until > Date.now()) return access.token;
    const iat = Math.floor(Date.now() / 1000);
    const tokenUri = a.token_uri || 'https://oauth2.googleapis.com/token';
    const head = b64({ alg: 'RS256', typ: 'JWT' });
    const claims = b64({ iss: a.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: tokenUri, iat, exp: iat + 3600 });
    const signature = crypto.createSign('RSA-SHA256').update(head + '.' + claims).sign(a.private_key).toString('base64url');
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${signature}` }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error('Google answered ' + res.status);
    const got = await res.json();
    access = { email: a.client_email, token: got.access_token, until: Date.now() + (Number(got.expires_in) || 3600) * 1000 - 60000 };
    return access.token;
  }

  /** a notification's title and text in a phone's language: Budgie's own words translated, what someone wrote as
   *  they wrote it */
  function words(note, lang) {
    const title = String(note.title || 'Budgie').slice(0, 120);
    const said = note.kind === 'message' ? note.body : t(lang, note.body);
    const body = [said || (note.word ? word(note.word, lang) : ''), note.then ? word(note.then, lang) : ''].filter(Boolean).join(' · ').slice(0, 240);
    return { title, body };
  }

  async function deliver(a, bearer, row, note) {
    const lang = row.lang || 'en';
    const { title, body } = words(note, lang);
    const call = note.kind === 'call';
    const message = {
      token: row.token,
      notification: { title, body },
      data: { href: String(note.href || ''), kind: String(note.kind || 'activity') },
      android: {
        priority: call || note.kind === 'message' ? 'HIGH' : 'NORMAL',
        ttl: call ? '35s' : '86400s',
        notification: Object.assign(
          { channel_id: CHANNEL[note.kind] || 'activity', icon: 'ic_stat_budgie', color: '#6750A4', notification_priority: call ? 'PRIORITY_MAX' : 'PRIORITY_HIGH' },
          note.tag ? { tag: String(note.tag).slice(0, 60) } : {}
        ),
      },
    };
    const res = await fetch(`${FCM}/v1/projects/${encodeURIComponent(a.project_id)}/messages:send`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + bearer, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return;
    const answer = await res.json().catch(() => ({}));
    const why = JSON.stringify(answer.error || {});
    // a phone that's gone (the app removed, or its token replaced): its token goes too
    if (res.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(why) || (res.status === 400 && /registration token|INVALID_ARGUMENT/.test(why) && /token/i.test(why))) {
      db.run('DELETE FROM push_tokens WHERE token = ?', row.token);
      return;
    }
    if (res.status === 401) access = null;
    throw new Error(`Firebase answered ${res.status}`);
  }

  // ---- Apple ----------------------------------------------------------------------------------------------------
  const appleKey = () => {
    try {
      const k = JSON.parse(db.meta('apns-key') || 'null');
      return k && k.key && k.keyId && k.teamId ? k : null;
    } catch (_) {
      return null;
    }
  };
  // Apple's permission to send is a token signed with the key, used for up to an hour (and not made more often than
  // every 20 minutes, Apple asks)
  let appleToken = null;
  function appleBearer(k) {
    if (appleToken && appleToken.kid === k.keyId && appleToken.until > Date.now()) return appleToken.token;
    const head = b64({ alg: 'ES256', kid: k.keyId });
    const claims = b64({ iss: k.teamId, iat: Math.floor(Date.now() / 1000) });
    const signature = crypto.sign('sha256', Buffer.from(head + '.' + claims), { key: k.key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    appleToken = { kid: k.keyId, token: `${head}.${claims}.${signature}`, until: Date.now() + 40 * 60000 };
    return appleToken.token;
  }
  // one HTTP/2 connection to each of Apple's servers, kept open while it's used
  const links = {};
  function link(origin) {
    const open = links[origin];
    if (open && !open.closed && !open.destroyed) return open;
    const session = http2.connect(origin);
    session.on('error', () => {});
    session.on('goaway', () => session.close());
    session.setTimeout(10 * 60000, () => session.close());
    session.unref();
    links[origin] = session;
    return session;
  }
  // the connection keeps the process going only while something is on its way (so `nook push apple` waits for Apple)
  let pending = 0;
  function post(origin, pathname, headers, body) {
    return new Promise((resolve, reject) => {
      const session = link(origin);
      pending++;
      session.ref();
      const done = () => --pending || Object.values(links).forEach((s) => !s.destroyed && s.unref());
      const req = session.request(Object.assign({ ':method': 'POST', ':path': pathname }, headers));
      let status = 0;
      let data = '';
      req.setEncoding('utf8');
      req.on('response', (h) => (status = h[':status']));
      req.on('data', (chunk) => (data += chunk));
      req.on('close', done);
      req.on('end', () => resolve({ status, data }));
      req.on('error', reject);
      req.setTimeout(10000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.end(body);
    });
  }

  async function deliverApple(k, row, note) {
    const { title, body } = words(note, row.lang || 'en');
    const call = note.kind === 'call';
    const urgent = call || note.kind === 'message';
    const payload = {
      aps: {
        alert: { title, body },
        sound: 'default',
        // a chat's notifications stack together; calls can break through a Focus, as Apple allows for them
        'thread-id': String(note.tag || note.kind || 'budgie').slice(0, 64),
        category: CATEGORY[note.kind] || 'ACTIVITY',
        'interruption-level': call ? 'time-sensitive' : 'active',
      },
      href: String(note.href || ''),
      kind: String(note.kind || 'activity'),
    };
    const headers = {
      authorization: 'bearer ' + appleBearer(k),
      'apns-topic': BUNDLE,
      'apns-push-type': 'alert',
      'apns-priority': urgent ? '10' : '5',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + (call ? 35 : 86400)),
    };
    // ringing again replaces the first ring
    if (call && note.tag) headers['apns-collapse-id'] = String(note.tag).slice(0, 64);
    const origin = row.platform.endsWith('-sandbox') ? APNS.sandbox : APNS.production;
    const res = await post(origin, '/3/device/' + encodeURIComponent(row.token), headers, JSON.stringify(payload));
    if (res.status === 200) return;
    let reason = '';
    try {
      reason = JSON.parse(res.data || '{}').reason || '';
    } catch (_) {
      /* no reason given */
    }
    // a device that's gone (the app removed, or the token replaced): its token goes too
    if (res.status === 410 || /^(BadDeviceToken|Unregistered|DeviceTokenNotForTopic)$/.test(reason)) {
      db.run('DELETE FROM push_tokens WHERE token = ?', row.token);
      return;
    }
    if (/ProviderToken/.test(reason)) appleToken = null;
    throw new Error(`Apple answered ${res.status} ${reason}`.trim());
  }

  /** a notification to these people's phones, without making whoever caused it wait */
  function send(userIds, note) {
    const a = account();
    const k = appleKey();
    const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id));
    if ((!a && !k) || !ids.length) return;
    const rows = db.all(`SELECT token, lang, platform FROM push_tokens WHERE user_id IN (${ids.map(() => '?').join(',')})`, ...ids);
    const google = a ? rows.filter((r) => !isApple(r.platform)) : [];
    const apple = k ? rows.filter((r) => isApple(r.platform)) : [];
    if (!google.length && !apple.length) return;
    (async () => {
      for (const row of apple) await deliverApple(k, row, note).catch((error) => log.error('A notification to an Apple device didn’t go:', error.message));
      if (!google.length) return;
      let bearer;
      try {
        bearer = await permission(a);
      } catch (error) {
        log.error('Couldn’t get permission from Firebase to send notifications:', error.message);
        return;
      }
      for (const row of google) await deliver(a, bearer, row, note).catch((error) => log.error('A notification didn’t go:', error.message));
    })();
  }

  /** whether a platform's notifications can go: Apple's key for iPhone, iPad and Mac, Firebase's account for Android */
  const on = (platform) => (platform === undefined ? !!(account() || appleKey()) : isApple(platform) ? !!appleKey() : !!account());

  /** checks Apple's push key with Apple: a made-up device is refused for being made up, not for the key */
  async function checkApple(k) {
    const headers = { authorization: 'bearer ' + appleBearer(k), 'apns-topic': BUNDLE, 'apns-push-type': 'alert', 'apns-priority': '5' };
    const body = JSON.stringify({ aps: { alert: { title: 'Budgie', body: 'Test' } } });
    let last = '';
    for (const origin of [APNS.production, APNS.sandbox]) {
      const res = await post(origin, '/3/device/' + '0'.repeat(64), headers, body);
      let reason = '';
      try {
        reason = JSON.parse(res.data || '{}').reason || '';
      } catch (_) {
        /* no reason given */
      }
      if (res.status === 400 && reason === 'BadDeviceToken') return { ok: true };
      last = `${res.status} ${reason}`.trim();
      appleToken = null;
    }
    return { ok: false, why: last };
  }

  return { send, on, t, checkApple, BUNDLE };
};
