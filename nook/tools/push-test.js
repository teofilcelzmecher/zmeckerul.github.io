// Notifications on phones (1.1), end to end against fake Google and Firebase servers: the Android app's address is let
// in, phones sign up, and messages, pictures, replies, group messages and calls each reach the right phones, in each
// phone's language, but not anyone who blocked the sender, not a signed-out phone, and not a phone that's gone.
//   node nook/tools/push-test.js
const { spawn, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const SERVER = path.join(__dirname, '..', 'server');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'budgie-push-'));
const FAKE = 8798;
const env = { ...process.env, NOOK_DATA: DATA, NOOK_PORT: '8797', NOOK_ORIGINS: 'http://localhost:*', NOOK_PICTURE_CHECK: 'off', NOOK_TEXT_CHECK: 'off', NOOK_RING_MS: '1500', NOOK_PUSH: 'test', NOOK_FCM_URL: `http://127.0.0.1:${FAKE}` };
const BASE = 'http://127.0.0.1:8797';
const cli = (...a) => execFileSync('node', ['--disable-warning=ExperimentalWarning', SERVER + '/cli.js', ...a], { env, encoding: 'utf8' });
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

(async () => {
  await new Promise((r) => fake.listen(FAKE, '127.0.0.1', r));
  const proc = spawn('node', ['--disable-warning=ExperimentalWarning', SERVER + '/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', (d) => /Warning|notification didn/.test(d) || process.stderr.write('[server] ' + d));
  await new Promise((r) => proc.stdout.once('data', r));
  const to = (token) => sent.filter((s) => s.message.token === token);
  const wait = () => sleep(400);

  // the app's own address
  const health = await api(null, 'GET', '/api/health', null, 'https://app.budgiesocial.com');
  ok(health.headers.get('access-control-allow-origin') === 'https://app.budgiesocial.com', 'the Android app’s address may call the server', health.json.version);
  ok(health.json.version === '1.1.0', 'the server says 1.1.0');

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

  proc.kill('SIGTERM');
  fake.close();
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
