// Notifications on phones, end to end against fake Google, Firebase and Apple servers: the apps' addresses are let in,
// phones sign up, and messages, pictures, replies, group messages and calls each reach the right phones, in each
// phone's language, but not anyone who blocked the sender, not a signed-out phone, and not a phone that's gone. Then
// the same through Apple's push service (1.2), for an iPhone and a Mac.
//   node nook/tools/push-test.js
const { spawn, execFile, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const http2 = require('node:http2');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'budgie-push-'));
const FAKE = 8798;
const FAKE_APPLE = 8796;
const env = { ...process.env, NOOK_DATA: DATA, NOOK_PORT: '8797', NOOK_ORIGINS: 'http://localhost:*', NOOK_PICTURE_CHECK: 'off', NOOK_TEXT_CHECK: 'off', NOOK_RING_MS: '1500', NOOK_PUSH: 'test', NOOK_FCM_URL: `http://127.0.0.1:${FAKE}`, NOOK_APNS_URL: `http://127.0.0.1:${FAKE_APPLE}` };
const BASE = 'http://127.0.0.1:8797';
const cli = (...a) => execFileSync('node', ['--disable-warning=ExperimentalWarning', SERVER + '/cli.js', ...a], { env, encoding: 'utf8' });
// for commands that call the fake servers in this process, which a blocking call would stop from answering
const cliAsync = (...a) =>
  new Promise((resolve) => execFile('node', ['--disable-warning=ExperimentalWarning', SERVER + '/cli.js', ...a], { env, encoding: 'utf8' }, (error, stdout, stderr) => resolve({ ok: !error, text: stdout + stderr })));
let failures = 0;
const ok = (cond, label, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(token, method, p, body, origin = 'http://localhost:8790') {
  const res = await fetch(BASE + p, { method, headers: Object.assign({ 'Content-Type': 'application/json', Origin: origin }, token ? { Authorization: 'Bearer ' + token } : {}), body: body ? JSON.stringify(body) : undefined });
  return { status: res.status, json: await res.json().catch(() => ({})), headers: res.headers };
}

// Budgie's Firebase service account, with a key made here; Google's token endpoint is the fake one
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const account = {
  type: 'service_account',
  project_id: 'budgie-test',
  client_email: 'firebase-adminsdk@budgie-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  token_uri: `http://127.0.0.1:${FAKE}/token`,
};
const accountFile = path.join(DATA, 'service-account.json');

// the fake Google: a token for a correctly signed request, and Firebase, which keeps what it's sent
const sent = [];
let signedOk = null;
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    if (req.url === '/token') {
      const assertion = new URLSearchParams(body).get('assertion') || '';
      const [h, c, s] = assertion.split('.');
      signedOk = crypto.createVerify('RSA-SHA256').update(h + '.' + c).verify(publicKey, Buffer.from(s || '', 'base64url'));
      const claims = JSON.parse(Buffer.from(c || '', 'base64url').toString() || '{}');
      res.writeHead(signedOk && claims.scope === 'https://www.googleapis.com/auth/firebase.messaging' ? 200 : 401, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ access_token: 'fake-access', expires_in: 3600 }));
    }
    if (req.url === '/v1/projects/budgie-test/messages:send') {
      const { message } = JSON.parse(body);
      sent.push({ auth: req.headers.authorization, message });
      if (message.token.startsWith('gone')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ name: 'projects/budgie-test/messages/1' }));
    }
    res.writeHead(404);
    res.end();
  });
});

// the fake Apple: checks each request's signed token, keeps what it's sent, and knows a made-up device and a gone one
const apple = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const appleKeyFile = path.join(DATA, 'AuthKey_ABC123DEFG.p8');
const toApple = [];
const fakeApple = http2.createServer();
fakeApple.on('stream', (stream, headers) => {
  let body = '';
  stream.setEncoding('utf8');
  stream.on('data', (c) => (body += c));
  stream.on('end', () => {
    const answer = (status, reason) => {
      stream.respond({ ':status': status, 'content-type': 'application/json' });
      stream.end(reason ? JSON.stringify({ reason }) : '');
    };
    const [h, c, sig] = String(headers.authorization || '').replace(/^bearer /, '').split('.');
    let head = {};
    let claims = {};
    try {
      head = JSON.parse(Buffer.from(h || '', 'base64url').toString());
      claims = JSON.parse(Buffer.from(c || '', 'base64url').toString());
    } catch (_) {}
    const signed = !!sig && crypto.verify('sha256', Buffer.from(h + '.' + c), { key: apple.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    if (!signed || head.alg !== 'ES256' || head.kid !== 'ABC123DEFG' || claims.iss !== 'TEAM123456') return answer(403, 'InvalidProviderToken');
    if (headers['apns-topic'] !== 'com.budgiesocial.app') return answer(400, 'BadTopic');
    const device = decodeURIComponent(String(headers[':path']).replace('/3/device/', ''));
    if (/^0+$/.test(device)) return answer(400, 'BadDeviceToken');
    toApple.push({ device, headers, payload: JSON.parse(body) });
    if (device.startsWith('dead')) return answer(410, 'Unregistered');
    answer(200);
  });
});

(async () => {
  await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));
  await new Promise((r) => fakeApple.listen(FAKE_APPLE, '127.0.0.1', r));
  const proc = spawn('node', ['--disable-warning=ExperimentalWarning', SERVER + '/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', (d) => /Warning|notification didn/.test(d) || process.stderr.write('[server] ' + d));
  await new Promise((r) => proc.stdout.once('data', r));
  const to = (token) => sent.filter((s) => s.message.token === token);
  const wait = () => sleep(400);

  // the app's own address
  const health = await api(null, 'GET', '/api/health', null, 'https://app.budgiesocial.com');
  ok(health.headers.get('access-control-allow-origin') === 'https://app.budgiesocial.com', 'the Android app’s address may call the server', health.json.version);
  ok(health.json.version === '1.2.0', 'the server says 1.2.0');
  const fromApple = await api(null, 'GET', '/api/health', null, 'budgie://app');
  ok(fromApple.headers.get('access-control-allow-origin') === 'budgie://app', 'so may the iPhone, iPad and Mac app’s');

  const tk = {};
  for (const name of ['alice', 'bob', 'carol']) tk[name] = (await api(null, 'POST', '/api/signup', { name, password: 'correct horse', age: true, terms: true })).json.token;
  for (const [a, b] of [['alice', 'bob'], ['alice', 'carol'], ['bob', 'carol']]) {
    await api(tk[a], 'POST', '/api/friends', { name: b });
    await api(tk[b], 'POST', '/api/friends', { name: a });
  }

  // phones sign up
  ok((await api(tk.bob, 'POST', '/api/push', { token: 'short' })).status === 400, 'a token that isn’t one is refused');
  ok((await api(null, 'POST', '/api/push', { token: 'x'.repeat(40) })).status === 401, 'signing up a phone needs a sign-in');
  const bobPhone = 'bob-phone-' + 'b'.repeat(140);
  const carolPhone = 'carol-phone-' + 'c'.repeat(140);
  const before = await api(tk.bob, 'POST', '/api/push', { token: bobPhone, platform: 'android', lang: 'ro' }, 'https://app.budgiesocial.com');
  ok(before.status === 200 && before.json.on === false, 'bob’s phone signs up (in Romanian); notifications aren’t on yet', JSON.stringify(before.json));
  await api(tk.carol, 'POST', '/api/push', { token: carolPhone, platform: 'android', lang: 'en' });
  // nothing goes without Firebase's service account
  await api(tk.alice, 'POST', '/api/messages', { to: 'bob', body: 'are you there?' });
  await wait();
  ok(sent.length === 0, 'without a service account, nothing is sent');

  fs.writeFileSync(accountFile, JSON.stringify(account));
  ok(/notifications through Firebase project "budgie-test"/.test(cli('push', accountFile)), 'nook push takes the service account file');
  ok(/1|2 phones/.test(cli('push')), 'nook push says it’s on, and how many phones', cli('push').split('\n')[0]);
  ok((await api(tk.bob, 'POST', '/api/push', { token: bobPhone, platform: 'android', lang: 'ro' })).json.on === true, 'and the app hears it’s on');

  // a message
  await api(tk.alice, 'POST', '/api/messages', { to: 'bob', body: 'Home' });
  await wait();
  let m = to(bobPhone).pop();
  ok(signedOk === true, 'Google gets a request signed with Budgie’s key');
  ok(m && m.auth === 'Bearer fake-access' && m.message.notification.title === 'u/alice' && m.message.notification.body === 'Home', 'bob’s phone gets alice’s message, her words as she wrote them (not translated)', m && JSON.stringify(m.message.notification));
  ok(m && m.message.data.href === '#/messages/alice' && m.message.android.notification.channel_id === 'messages' && m.message.android.priority === 'HIGH', 'it opens the chat, in the Messages channel', m && JSON.stringify(m.message.data));
  ok(to(carolPhone).length === 0, 'carol’s phone doesn’t get it');
  // a picture, in bob's language
  const png = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '..', 'og.png')).toString('base64');
  await api(tk.alice, 'POST', '/api/messages', { to: 'bob', body: '', image: png });
  await wait();
  m = to(bobPhone).pop();
  ok(m && m.message.notification.body === 'A trimis o poză', 'a picture says so, in Romanian', m && m.message.notification.body);
  // a comment on bob's post: an inbox note, in Romanian
  const post = (await api(tk.bob, 'POST', '/api/posts', { n: 'askbudgie', title: 'Best bread?', body: 'Asking for a friend.', type: 'text' })).json.post;
  await api(tk.alice, 'POST', '/api/comments', { postId: post.id, body: 'Rye, obviously.' });
  await wait();
  m = to(bobPhone).pop();
  ok(m && /^u\/alice a comentat la postarea ta „Best bread\?”$/.test(m.message.notification.body) && m.message.android.notification.channel_id === 'activity', 'a comment on his post reaches him in Romanian, with alice’s name and his title as they are', m && m.message.notification.body);
  ok(m && /^#\/n\/askbudgie\/p\//.test(m.message.data.href), 'and opens the post', m && m.message.data.href);
  // a group: everyone in it but the one who wrote, and not whoever blocked them
  const g = (await api(tk.alice, 'POST', '/api/groups', { name: 'Picnic crew', members: ['bob', 'carol'], color: '#c0a000', shape: 'flower' })).json.group;
  await wait();
  const groupMsgs = sent.length;
  await api(tk.carol, 'POST', '/api/blocks', { name: 'alice' });
  await api(tk.alice, 'POST', `/api/groups/${g.id}/messages`, { body: 'Saturday at noon?' });
  await wait();
  const groupSent = sent.slice(groupMsgs);
  ok(groupSent.some((s) => s.message.token === bobPhone && s.message.notification.title === 'Picnic crew' && s.message.notification.body === 'u/alice: Saturday at noon?'), 'bob gets the group message, under the group’s name');
  ok(!groupSent.some((s) => s.message.token === carolPhone), 'carol, who blocked alice, doesn’t');
  // a call rings bob's phone
  await api(tk.carol, 'POST', '/api/blocks', { name: 'alice', on: false });
  const callAt = sent.length;
  const ring = await api(tk.alice, 'POST', '/api/calls', { to: 'bob', media: 'voice' });
  await wait();
  m = sent.slice(callAt).find((s) => s.message.token === bobPhone);
  ok(ring.status === 200 && m && m.message.android.notification.channel_id === 'calls' && m.message.android.ttl === '35s' && m.message.notification.body === 'Apel vocal · Atinge ca să răspunzi', 'a call rings bob’s phone (calls channel, gone after 35 s), in Romanian', m && JSON.stringify(m.message.notification));
  ok(m && m.message.data.href === '#/messages/alice', 'and opens the chat, where the call is waiting');
  await api(tk.alice, 'POST', `/api/calls/${ring.json.call.id}/hang`).catch(() => {});
  await sleep(1700);
  // a phone that's gone is forgotten
  const gone = 'gone-' + 'g'.repeat(150);
  await api(tk.carol, 'POST', '/api/push', { token: gone, platform: 'android' });
  const carolBefore = to(carolPhone).length;
  await api(tk.bob, 'POST', '/api/messages', { to: 'carol', body: 'hi carol' });
  await wait();
  const goneTries = to(gone).length;
  await api(tk.bob, 'POST', '/api/messages', { to: 'carol', body: 'hi again' });
  await wait();
  ok(goneTries === 1 && to(gone).length === 1 && to(carolPhone).length === carolBefore + 2, 'Firebase says a phone is gone: it isn’t tried again; carol’s real phone still gets both', `${goneTries}, ${to(gone).length}, ${to(carolPhone).length - carolBefore}`);
  // signing out takes the phone away
  await api(tk.bob, 'POST', '/api/logout');
  const bobBefore = to(bobPhone).length;
  const relog = (await api(null, 'POST', '/api/login', { name: 'bob', password: 'correct horse' })).json.token;
  await api(tk.alice, 'POST', '/api/messages', { to: 'bob', body: 'still there?' });
  await wait();
  ok(relog && to(bobPhone).length === bobBefore, 'after bob signs out, his phone gets nothing until the app signs it up again');
  ok((await api(relog, 'DELETE', '/api/push', { token: carolPhone })).status === 200, 'nobody can take away someone else’s phone (it does nothing)');
  await api(relog, 'POST', '/api/messages', { to: 'carol', body: 'one more' });
  await wait();
  ok(to(carolPhone).length === carolBefore + 3, 'carol’s phone still gets messages');
  ok(/won't get notifications/.test(cli('push', 'off')), 'nook push off turns them off');
  const afterOff = sent.length;
  await api(relog, 'POST', '/api/messages', { to: 'carol', body: 'after off' });
  await wait();
  ok(sent.length === afterOff, 'and nothing is sent after that');

  // ---- Apple (1.2): an iPhone (a test build, in German) and a Mac, with Firebase off ----
  const iphone = 'a1'.repeat(32);
  const mac = 'b2'.repeat(32);
  const dead = 'dead' + 'd'.repeat(60);
  const signedUp = await api(tk.alice, 'POST', '/api/push', { token: iphone, platform: 'ios', sandbox: true, lang: 'de' }, 'budgie://app');
  ok(signedUp.status === 200 && signedUp.json.on === false, 'alice’s iPhone signs up; Apple’s key isn’t set yet', JSON.stringify(signedUp.json));
  await api(tk.alice, 'POST', '/api/push', { token: mac, platform: 'macos', lang: 'en' }, 'budgie://app');
  await api(relog, 'POST', '/api/messages', { to: 'alice', body: 'before the key' });
  await wait();
  ok(toApple.length === 0, 'without Apple’s key, nothing goes to Apple');
  fs.writeFileSync(appleKeyFile, apple.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  const refused = await cliAsync('push', 'apple', appleKeyFile, 'WRONG12345');
  ok(!refused.ok && /didn't accept that key/.test(refused.text), 'a key with the wrong team is refused when it’s given', refused.text.trim().split('\n').pop());
  const taken = await cliAsync('push', 'apple', appleKeyFile, 'TEAM123456');
  ok(taken.ok && /now get notifications through Apple \(key ABC123DEFG, team TEAM123456\)/.test(taken.text), 'nook push apple takes the key (its id from the file’s name) and the team', taken.text.trim().split('\n')[0]);
  ok(/Apple with key ABC123DEFG.*2 devices/.test(cli('push')), 'nook push says both how Android and Apple are doing');
  ok((await api(tk.alice, 'POST', '/api/push', { token: iphone, platform: 'ios', sandbox: true, lang: 'de' }, 'budgie://app')).json.on === true, 'and the app hears it’s on');
  // a message
  await api(relog, 'POST', '/api/messages', { to: 'alice', body: 'Guten Morgen' });
  await wait();
  let a = toApple.find((x) => x.device === iphone);
  ok(a && a.payload.aps.alert.title === 'u/bob' && a.payload.aps.alert.body === 'Guten Morgen' && a.payload.aps.category === 'MESSAGE' && a.payload.aps['thread-id'] === 'chat-bob' && a.payload.href === '#/messages/bob', 'alice’s iPhone gets bob’s message: a reply-able notification, stacked with his chat, that opens it', a && JSON.stringify(a.payload));
  ok(a && a.headers['apns-push-type'] === 'alert' && a.headers['apns-priority'] === '10' && a.headers['apns-topic'] === 'com.budgiesocial.app', 'sent as an alert, right away, for Budgie’s app');
  ok(toApple.some((x) => x.device === mac && x.payload.aps.alert.body === 'Guten Morgen'), 'so does her Mac');
  ok(sent.length === afterOff, 'and Android’s Firebase, which is off, isn’t used');
  // a call: it can break through a Focus, and ringing again replaces the ring
  const ringAt = toApple.length;
  const call = await api(relog, 'POST', '/api/calls', { to: 'alice', media: 'voice' });
  await wait();
  a = toApple.slice(ringAt).find((x) => x.device === iphone);
  const expires = a && Number(a.headers['apns-expiration']) - Date.now() / 1000;
  ok(a && a.payload.aps['interruption-level'] === 'time-sensitive' && a.payload.aps.category === 'CALL' && a.headers['apns-collapse-id'] === 'call-' + call.json.call.id && expires > 25 && expires < 40, 'a call is time-sensitive, replaceable, and gone after 35 s', a && JSON.stringify([a.payload.aps, a.headers['apns-collapse-id'], Math.round(expires)]));
  ok(a && / · Tippe zum Annehmen$/.test(a.payload.aps.alert.body), 'and asks her to answer, in German', a && a.payload.aps.alert.body);
  await api(relog, 'POST', `/api/calls/${call.json.call.id}/hang`).catch(() => {});
  await sleep(1700);
  // a device that's gone is forgotten
  await api(tk.alice, 'POST', '/api/push', { token: dead, platform: 'ios', lang: 'en' }, 'budgie://app');
  await api(relog, 'POST', '/api/messages', { to: 'alice', body: 'one' });
  await wait();
  await api(relog, 'POST', '/api/messages', { to: 'alice', body: 'two' });
  await wait();
  ok(toApple.filter((x) => x.device === dead).length === 1 && toApple.filter((x) => x.device === iphone && /^(one|two)$/.test(x.payload.aps.alert.body)).length === 2, 'Apple says a device is gone: it isn’t tried again; the iPhone gets both');
  ok(/won't get notifications/.test(cli('push', 'apple', 'off')), 'nook push apple off turns them off');
  const appleOff = toApple.length;
  await api(relog, 'POST', '/api/messages', { to: 'alice', body: 'after off' });
  await wait();
  ok(toApple.length === appleOff, 'and nothing goes to Apple after that');

  proc.kill('SIGTERM');
  fake.close();
  fakeApple.close();
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
