// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See ../LICENSE.
/*
 * Push notifications (1.1): to Budgie's Android app through Google's Firebase Cloud Messaging, so a message, a call
 * or a reply reaches someone whose app is closed. The server's owner gives it a Firebase service account with
 * `nook push <file.json>` (kept in the database on the laptop, never in the repository); without one, nothing is sent.
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
 *   push.on()                                              whether a service account is set
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const FCM = process.env.NOOK_FCM_URL || 'https://fcm.googleapis.com'; // a test points this at a fake one
const CHANNEL = { message: 'messages', call: 'calls', activity: 'activity' };

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

  async function deliver(a, bearer, row, note) {
    const lang = row.lang || 'en';
    const title = String(note.title || 'Budgie').slice(0, 120);
    // Budgie's own words in the phone's language; what someone wrote, as they wrote it
    const said = note.kind === 'message' ? note.body : t(lang, note.body);
    const body = [said || (note.word ? word(note.word, lang) : ''), note.then ? word(note.then, lang) : ''].filter(Boolean).join(' · ').slice(0, 240);
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

  /** a notification to these people's phones, without making whoever caused it wait */
  function send(userIds, note) {
    const a = account();
    const ids = [...new Set(userIds)].filter((id) => Number.isInteger(id));
    if (!a || !ids.length) return;
    const rows = db.all(`SELECT token, lang FROM push_tokens WHERE user_id IN (${ids.map(() => '?').join(',')})`, ...ids);
    if (!rows.length) return;
    (async () => {
      let bearer;
      try {
        bearer = await permission(a);
      } catch (error) {
        log.error('Couldn’t get permission from Firebase to send notifications:', error.message);
        return;
      }
      for (const row of rows) await deliver(a, bearer, row, note).catch((error) => log.error('A notification didn’t go:', error.message));
    })();
  }

  return { send, on: () => !!account(), t };
};
