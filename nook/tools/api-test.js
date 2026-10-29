// End-to-end test of the Nook server's API, against a fresh database in a temporary folder.
// Run: node nook/tools/api-test.js   (it starts its own server on port 8799)
const { spawn, execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const SERVER = path.join(__dirname, '..', 'server');
const DATA = path.join(os.tmpdir(), 'nook-api-test');
fs.rmSync(DATA, { recursive: true, force: true });
// the picture and text checks score by markers in test mode ("#explicit" at a picture's end, "#harmful" in text)
// and the robot check on sign-up asks no one: the answer "pass" passes
const env = { ...process.env, NOOK_DATA: DATA, NOOK_PORT: '8799', NOOK_ORIGINS: 'http://localhost:*', NOOK_PICTURE_CHECK: 'test', NOOK_TEXT_CHECK: 'test', NOOK_CAPTCHA: 'test', NOOK_RING_MS: '1500', NOOK_AWAY_MS: '1200', NOOK_TURN: 'test', NOOK_GIFS: 'test' };
const BASE = 'http://127.0.0.1:8799';
const cli = (...a) => execFileSync('node', [SERVER + '/cli.js', ...a], { env, encoding: 'utf8' });

let failures = 0;
const ok = (cond, label, extra = '') => {
  if (!cond) failures++;
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`);
};
async function api(token, method, path, body, origin = 'http://localhost:8790') {
  const res = await fetch(BASE + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json', Origin: origin }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json, headers: res.headers };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** a device's live event stream (Server-Sent Events, read the way the app reads it: fetch with a token) */
function listen(token) {
  const events = [];
  const stop = new AbortController();
  fetch(BASE + '/api/live', { headers: { Authorization: 'Bearer ' + token, Origin: 'http://localhost:8790' }, signal: stop.signal })
    .then(async (res) => {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let end;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let type = 'message';
          let data = '';
          for (const line of block.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            else if (line.startsWith('data: ')) data += line.slice(6);
          }
          if (data) events.push({ type, data: JSON.parse(data) });
        }
      }
    })
    .catch(() => {});
  return {
    events,
    close: () => stop.abort(),
    async wait(type, test = () => true, ms = 3000) {
      for (let t = 0; t < ms; t += 50) {
        const e = events.find((x) => x.type === type && test(x.data));
        if (e) return e;
        await sleep(50);
      }
      return null;
    },
  };
}

let proc; // the test server, stopped however the tests end
process.on('exit', () => proc && proc.kill('SIGTERM'));

(async () => {
  proc = spawn('node', [SERVER + '/server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  proc.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
  await new Promise((r) => proc.stdout.once('data', r));

  const health = await api(null, 'GET', '/api/health');
  ok(health.status === 200 && health.json.ok, 'health', JSON.stringify(health.json));
  ok(health.headers.get('access-control-allow-origin') === 'http://localhost:8790', 'CORS for an allowed origin');
  const evil = await api(null, 'POST', '/api/login', { name: 'x', password: 'y' }, 'https://evil.example');
  ok(evil.status === 403, 'other sites are refused', evil.json.error);
  ok(health.json.signup === 'open', 'sign-up is open by default');

  // sign-up with codes, after the owner switches invite-only back on; codes only come from the admin command
  ok(/invite-only/.test(cli('signups', 'invite')), 'the cli turns invite-only on');
  ok((await api(null, 'GET', '/api/health')).json.signup === 'invite', 'health says invite-only');
  const [codeA] = cli('invite', '1').match(/\b\d{6}\b/g);
  const published = await api(null, 'POST', '/api/signup', { invite: '210945', name: 'mallory', password: 'correct horse', age: true, terms: true });
  ok(published.status === 400 && published.json.field === 'invite', 'an old published code is refused', published.json.error);
  const noCode = await api(null, 'POST', '/api/signup', { invite: '000000', name: 'alice', password: 'correct horse', age: true, terms: true });
  ok(noCode.status === 400 && noCode.json.field === 'invite', 'wrong invite refused', noCode.json.error);
  const noTerms = await api(null, 'POST', '/api/signup', { invite: codeA, name: 'alice', password: 'correct horse' });
  ok(noTerms.status === 400, 'terms must be agreed', noTerms.json.error);
  const badName = await api(null, 'POST', '/api/signup', { invite: codeA, name: 'fuck_you', password: 'correct horse', age: true, terms: true });
  ok(badName.status === 422, 'swearing username refused', badName.json.error);
  const crude = await api(null, 'POST', '/api/signup', { invite: codeA, name: 'Penis', password: 'correct horse', age: true, terms: true });
  ok(crude.status === 422, 'crude username refused', crude.json.error);
  const a = await api(null, 'POST', '/api/signup', { invite: codeA, name: 'alice', password: 'correct horse', age: true, terms: true });
  ok(a.status === 200 && a.json.token && /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/.test(a.json.recovery), 'alice signs up with a code from the CLI', a.json.recovery);
  const reuse = await api(null, 'POST', '/api/signup', { invite: codeA, name: 'carol', password: 'correct horse', age: true, terms: true });
  ok(reuse.status === 400 && /already been used/.test(reuse.json.error), 'a code works once', reuse.json.error);
  const fresh = cli('invite', '2', 'for tests').match(/\b\d{6}\b/g);
  ok(fresh && fresh.length === 2, 'cli makes invite codes', fresh && fresh.join(' '));
  const dup = await api(null, 'POST', '/api/signup', { invite: fresh[0], name: 'ALICE', password: 'correct horse', age: true, terms: true });
  ok(dup.status === 409, 'names are unique, ignoring case', dup.json.error);
  const b = await api(null, 'POST', '/api/signup', { invite: fresh[0], name: 'bob', password: 'battery staple', age: true, terms: true });
  ok(b.status === 200, 'bob signs up with a new code');
  // and open again: no code needed
  ok(/open/.test(cli('signups', 'open')), 'the cli opens sign-up');
  const open = await api(null, 'POST', '/api/signup', { name: 'dora', password: 'correct horse', age: true, terms: true });
  ok(open.status === 200 && open.json.token, 'with sign-up open, no code is needed', open.json.error);
  const A = a.json.token;
  const B = b.json.token;

  // the robot check (Cloudflare Turnstile): off until the owner sets it up, then needed for every new account
  ok(!health.json.captcha && /is off/.test(cli('captcha')), 'the robot check is off at first');
  ok(/is on: new accounts go through Cloudflare Turnstile/.test(cli('captcha', '0x4AAAAAAATestSiteKey00000', '0x4AAAAAAATestSecretKey000000000000000')), 'the cli turns it on');
  ok((await api(null, 'GET', '/api/health')).json.captcha === '0x4AAAAAAATestSiteKey00000', 'health hands the app the site key (and nothing secret)');
  const robot = await api(null, 'POST', '/api/signup', { name: 'robotron', password: 'correct horse', age: true, terms: true });
  ok(robot.status === 400 && robot.json.field === 'captcha' && robot.json.captcha === '0x4AAAAAAATestSiteKey00000', 'without the check, no account (and the form is told the site key)', robot.json.error);
  const failed = await api(null, 'POST', '/api/signup', { name: 'robotron', password: 'correct horse', age: true, terms: true, captcha: 'nope' });
  ok(failed.status === 400 && failed.json.field === 'captcha', 'a failed check, no account', failed.json.error);
  const takenFirst = await api(null, 'POST', '/api/signup', { name: 'alice', password: 'correct horse', age: true, terms: true, captcha: 'nope' });
  ok(takenFirst.status === 409, 'a taken name is said first, before the check is used up', takenFirst.json.error);
  const human = await api(null, 'POST', '/api/signup', { name: 'human_one', password: 'correct horse', age: true, terms: true, captcha: 'pass' });
  ok(human.status === 200 && human.json.token, 'a passed check makes the account');
  ok(/is off/.test(cli('captcha', 'off')) && !(await api(null, 'GET', '/api/health')).json.captcha, 'the cli turns it off again');
  const refused = (...a) => { try { return cli(...a); } catch (e) { return String(e.stderr); } };
  ok(/Usage/.test(refused('captcha', 'short', 'x')), 'the cli refuses keys that can’t be keys');
  ok(/Google reCAPTCHA key/.test(refused('captcha', '6LcExampleExampleExampleExampleExample00', '6LcExampleSecretExampleSecretExample0000')), 'and says so when it’s given a Google reCAPTCHA key');

  // login
  const wrong = await api(null, 'POST', '/api/login', { name: 'alice', password: 'nope nope' });
  ok(wrong.status === 401, 'wrong password', wrong.json.error);
  const login = await api(null, 'POST', '/api/login', { name: 'Alice', password: 'correct horse' });
  ok(login.status === 200 && login.json.me.name === 'alice', 'login is case-insensitive on the name');
  const unauth = await api(null, 'GET', '/api/bootstrap');
  ok(unauth.status === 401 && unauth.json.signedOut, 'nothing without signing in');

  // bootstrap
  const boot = await api(A, 'GET', '/api/bootstrap');
  ok(boot.status === 200 && boot.json.joined.length === 7 && boot.json.users.length === 4, 'bootstrap (alice, bob, dora and human_one)', `joined ${boot.json.joined.length}, users ${boot.json.users.length}`);

  // posts, moderation
  const kys = await api(A, 'POST', '/api/posts', { n: 'askbudgie', title: 'kys everyone', type: 'text' });
  ok(kys.status === 422 && kys.json.rule, 'server blocks threats', kys.json.rule);
  const noNook = await api(A, 'POST', '/api/posts', { n: 'nope', title: 'Hello there', type: 'text' });
  ok(noNook.status === 404, 'post needs a real nook');
  const post = await api(A, 'POST', '/api/posts', { n: 'askbudgie', title: 'What is your favourite bread?', body: 'Mine is **sourdough**.', type: 'text', flair: 'Fun' });
  ok(post.status === 200 && post.json.post.score === 1 && post.json.post.flair === 'Fun', 'alice posts (with her own upvote)', post.json.post && post.json.post.id);
  const P = post.json.post.id;
  const again = await api(A, 'POST', '/api/posts', { n: 'askbudgie', title: 'What is your favourite bread?', type: 'text' });
  ok(again.status === 422 && /already posted/.test(again.json.error), 'duplicate post blocked', again.json.error);
  const png = 'data:image/png;base64,' + Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a3e5f9e60000000049454e44ae426082', 'hex').toString('base64');
  const img = await api(B, 'POST', '/api/posts', { n: 'photography', title: 'A tiny photo', type: 'image', image: png });
  ok(img.status === 200 && /^\/api\/images\//.test(img.json.post.image), 'image post', img.json.post && img.json.post.image);
  const imgRes = await fetch(BASE + img.json.post.image);
  ok(imgRes.status === 200 && imgRes.headers.get('content-type') === 'image/png', 'image is served', imgRes.headers.get('content-type'));
  const fakeImg = await api(B, 'POST', '/api/posts', { n: 'photography', title: 'Not a photo', type: 'image', image: 'data:image/png;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') });
  ok(fakeImg.status === 400, 'a fake image is refused', fakeImg.json.error);
  const poll = await api(B, 'POST', '/api/posts', { n: 'cozygames', title: 'Which game next?', type: 'poll', poll: ['Stardew', 'A Short Hike', ''] });
  ok(poll.status === 200 && poll.json.post.poll.options.length === 2, 'poll post (empty option dropped)');

  // comments + notifications
  const c1 = await api(B, 'POST', '/api/comments', { postId: P, body: 'Rye, obviously.' });
  ok(c1.status === 200 && c1.json.comment.score === 1, 'bob comments');
  const c2 = await api(A, 'POST', '/api/comments', { postId: P, parentId: c1.json.comment.id, body: 'Rye is great too!' });
  ok(c2.status === 200, 'alice replies');
  const bad = await api(B, 'POST', '/api/comments', { postId: P, body: 'k y s' });
  ok(bad.status === 422, 'spaced-out threat blocked in a comment', bad.json.error);

  // votes, sparks, polls
  const v = await api(B, 'POST', '/api/votes', { id: P, dir: 1 });
  ok(v.json.score === 2, 'bob upvotes: score 2', String(v.json.score));
  const v2 = await api(B, 'POST', '/api/votes', { id: P, dir: -1 });
  ok(v2.json.score === 0, 'bob switches to a downvote: score 0', String(v2.json.score));
  const sp = await api(B, 'POST', '/api/sparks', { post: P, kind: 'love', on: true });
  ok(sp.json.sparks.love === 1, 'spark');
  const pv = await api(A, 'POST', '/api/polls', { post: poll.json.post.id, option: 1 });
  ok(pv.json.post.poll.options[1][1] === 1, 'poll vote counted');
  const pv2 = await api(A, 'POST', '/api/polls', { post: poll.json.post.id, option: 0 });
  ok(pv2.json.post.poll.options[0][1] === 0 && pv2.json.post.poll.options[1][1] === 1, 'one poll vote each');

  // updates since bootstrap
  const up = await api(A, 'GET', `/api/updates?rev=${boot.json.rev}&note=${boot.json.note}&msg=${boot.json.msg}`);
  ok(up.json.posts.length >= 3 && up.json.comments.length === 2, 'updates carry new posts and comments', `${up.json.posts.length} posts, ${up.json.comments.length} comments`);
  ok(up.json.notes.some((n) => /commented on your post/.test(n.text)), 'alice is told bob commented', up.json.notes.map((n) => n.text).join(' | '));
  const bobUp = await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(bobUp.json.notes.some((n) => /replied to your comment/.test(n.text)), 'bob is told alice replied');

  // nooks and joins
  const nook = await api(A, 'POST', '/api/nooks', { id: 'pottery_club', title: 'Pottery Club', tagline: 'Wobbly mugs.', category: 'Art', color: '#e8467c', shape: 'flower', symbol: 'coffee' });
  ok(nook.status === 200 && nook.json.nook.mods[0] === 'alice', 'alice makes a nook');
  const nookDup = await api(B, 'POST', '/api/nooks', { id: 'pottery_club' });
  ok(nookDup.status === 409, 'nook names are unique');
  const starterDup = await api(B, 'POST', '/api/nooks', { id: 'webdev' });
  ok(starterDup.status === 409, 'starter nook names are taken');
  const j = await api(B, 'POST', '/api/joins', { nook: 'pottery_club', on: true });
  ok(j.json.members === 2, 'bob joins: 2 members');

  // profile, prefs
  const me = await api(A, 'PATCH', '/api/me', { bio: 'Bread enthusiast', icon: 'rocket_launch', photo: png });
  ok(me.status === 200 && me.json.me.icon === 'rocket_launch' && /\/api\/images\//.test(me.json.me.photo), 'profile update with photo');
  const meAgain = await api(A, 'PATCH', '/api/me', { bio: 'Bread enthusiast!', photo: 'https://x.ts.net' + me.json.me.photo });
  ok(meAgain.json.me.photo === me.json.me.photo, 'sending the same photo back keeps it');
  const bioPhone = await api(A, 'PATCH', '/api/me', { bio: 'call me on +40 712 345 678' });
  ok(bioPhone.status === 422, 'phone number in a bio refused', bioPhone.json.error);

  // GIF pictures and banners: each comes with a still for feeds; GIFs are checked
  const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const gifBytes = Buffer.from(GIF.split(',')[1], 'base64');
  const gifMe = await api(A, 'PATCH', '/api/me', { photo: png, photoGif: GIF, banner: png, bannerGif: GIF, bio: 'Line one\n\n\n\nLine two **bold**' });
  const m = gifMe.json.me || {};
  ok(gifMe.status === 200 && [m.photo, m.photoGif, m.banner, m.bannerGif].every((u) => /^\/api\/images\//.test(u)), 'a GIF picture and a GIF banner, each with a still', gifMe.json.error);
  ok(m.bio === 'Line one\n\nLine two **bold**', 'a bio keeps its line breaks, but not piles of them', JSON.stringify(m.bio));
  const gifServed = await fetch(BASE + m.bannerGif);
  ok(gifServed.headers.get('content-type') === 'image/gif', 'the GIF is served as a GIF', gifServed.headers.get('content-type'));
  const gifAsStill = await api(A, 'PATCH', '/api/me', { banner: GIF });
  ok(gifAsStill.status === 400, 'a GIF can’t stand in for the still', gifAsStill.json.error);
  const fakeGif = await api(A, 'PATCH', '/api/me', { photo: png, photoGif: 'data:image/gif;base64,' + Buffer.from('<svg onload=alert(1)>').toString('base64') });
  ok(fakeGif.status === 400, 'a fake GIF is refused', fakeGif.json.error);
  const hugeBytes = Buffer.from(gifBytes);
  hugeBytes.writeUInt16LE(5000, 6);
  const hugeGif = await api(A, 'PATCH', '/api/me', { photo: png, photoGif: 'data:image/gif;base64,' + hugeBytes.toString('base64') });
  ok(hugeGif.status === 413, 'a GIF too large in pixels is refused', hugeGif.json.error);
  ok((await fetch(BASE + m.photoGif)).status === 200, 'a refused change keeps the old picture');
  const heavy = Buffer.concat([gifBytes, Buffer.alloc(4.2 * 1024 * 1024)]).toString('base64');
  const heavyGif = await api(A, 'PATCH', '/api/me', { banner: png, bannerGif: 'data:image/gif;base64,' + heavy });
  ok(heavyGif.status === 413, 'a GIF banner over 4 MB is refused', heavyGif.json.error);
  const longBio = await api(A, 'PATCH', '/api/me', { bio: 'I bake sourdough on weekends and read on trains. '.repeat(9) });
  ok(longBio.status === 200 && longBio.json.me.bio.length <= 300, 'bios stop at 300 characters', longBio.json.error || longBio.json.me.bio.length);
  const noBanner = await api(A, 'PATCH', '/api/me', { banner: '' });
  ok(noBanner.json.me.banner === '' && noBanner.json.me.bannerGif === '' && /^\/api\/images\//.test(noBanner.json.me.photoGif), 'removing the banner removes its GIF, and leaves the picture');
  ok((await fetch(BASE + m.bannerGif)).status === 404, 'and the old banner is deleted from the server');
  const prefs = await api(A, 'PUT', '/api/prefs', { prefs: { settings: { mode: 'dark' }, saved: [P] } });
  ok(prefs.status === 200, 'prefs saved');
  const boot2 = await api(A, 'GET', '/api/bootstrap');
  ok(boot2.json.prefs.settings.mode === 'dark' && boot2.json.prefs.saved[0] === P, 'prefs come back');

  // a font for your name: one of Budgie's, seen by everyone, and back to the usual one with ''
  const fontMe = await api(A, 'PATCH', '/api/me', { font: 'pixel' });
  ok(fontMe.status === 200 && fontMe.json.me.font === 'pixel', 'a name font is saved', fontMe.json.error);
  const badFont = await api(A, 'PATCH', '/api/me', { font: 'comic-sans"><script>' });
  ok(badFont.status === 400 && badFont.json.field === 'font', 'only Budgie’s own name fonts', badFont.json.error);
  ok((await api(B, 'GET', '/api/bootstrap')).json.users.find((u) => u.name === 'alice').font === 'pixel', 'everyone sees the name font');
  const keepFont = await api(A, 'PATCH', '/api/me', { bio: 'Bread enthusiast!' });
  ok(keepFont.json.me.font === 'pixel', 'other changes leave the font alone');
  const noFont = await api(A, 'PATCH', '/api/me', { font: '' });
  ok(noFont.status === 200 && !noFont.json.me.font, 'and it goes back to Budgie’s own font');

  // pronouns, a pride flag, interests, a profile colour style and background shapes
  const styled = await api(A, 'PATCH', '/api/me', { pronouns: 'she/they', flag: 'trans', interests: ['music', 'plants', 'space'], scheme: 'vibrant', sticker: 'heart' });
  const sm = styled.json.me || {};
  ok(styled.status === 200 && sm.pronouns === 'she/they' && sm.flag === 'trans' && sm.interests.join() === 'music,plants,space' && sm.scheme === 'vibrant' && sm.sticker === 'heart', 'pronouns, a flag, interests, a colour style and shapes are saved', styled.json.error || JSON.stringify(sm));
  ok((await api(B, 'GET', '/api/bootstrap')).json.users.find((u) => u.name === 'alice').flag === 'trans', 'everyone sees them');
  const refusedField = async (body, field, label) => {
    const r = await api(A, 'PATCH', '/api/me', body);
    ok(r.status >= 400 && r.json.field === field, label, r.json.error);
  };
  await refusedField({ pronouns: '<img src=x>' }, 'pronouns', 'pronouns must be letters (no markup)');
  await refusedField({ pronouns: 'a'.repeat(30) }, 'pronouns', 'pronouns stay short');
  const swearing = await api(A, 'PATCH', '/api/me', { pronouns: 'fuck/off' });
  ok(swearing.status === 422, 'no swearing in pronouns', swearing.json.error);
  await refusedField({ flag: 'pirate' }, 'flag', 'only Budgie’s pride flags');
  await refusedField({ interests: ['music', 'art', 'books', 'space', 'plants', 'anime', 'dance'] }, 'interests', 'up to 6 interests');
  await refusedField({ interests: ['music', 'crime'] }, 'interests', 'only Budgie’s interests');
  await refusedField({ scheme: 'rgb' }, 'scheme', 'only Material’s colour styles');
  await refusedField({ sticker: 'a b' }, 'sticker', 'shapes are shape names');
  const plainAgain = await api(A, 'PATCH', '/api/me', { pronouns: '', flag: '', interests: [], scheme: '', sticker: 'none' });
  const pm = plainAgain.json.me || {};
  ok(plainAgain.status === 200 && !pm.pronouns && !pm.flag && !pm.interests && !pm.scheme && pm.sticker === 'none', 'each can be taken off again', JSON.stringify(pm));

  // friends + messages
  const notFriends = await api(A, 'POST', '/api/messages', { to: 'bob', body: 'hi' });
  ok(notFriends.status === 403, 'only friends can message', notFriends.json.error);
  const fr = await api(A, 'POST', '/api/friends', { name: 'bob' });
  ok(fr.json.status === 'outgoing', 'alice sends a friend request');
  const bobSees = await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(bobSees.json.friends.some((f) => f.name === 'alice' && f.status === 'incoming'), 'bob sees the request');
  const acc = await api(B, 'POST', '/api/friends', { name: 'alice' });
  ok(acc.json.status === 'friends', 'bob accepts');
  const m1 = await api(A, 'POST', '/api/messages', { to: 'bob', body: 'Want to bake rye on Saturday?' });
  ok(m1.status === 200 && m1.json.message.mine, 'alice messages bob');
  const m2 = await api(B, 'POST', '/api/messages', { to: 'alice', body: 'kill yourself' });
  ok(m2.status === 422, 'threats blocked in messages too');
  const bobMsgs = await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(bobMsgs.json.messages.length === 1 && bobMsgs.json.conversations[0].unread === 1, 'bob gets the message, unread');
  await api(B, 'POST', '/api/messages/read', { with: 'alice' });
  const thread = await api(B, 'GET', '/api/messages?with=alice');
  ok(thread.json.messages.length === 1 && thread.json.messages[0].read, 'thread history, read');

  // the automatic checks: what they're sure of is refused, what's doubtful is posted and reported
  const marked = (marker) => 'data:image/png;base64,' + Buffer.concat([Buffer.from(png.split(',')[1], 'base64'), Buffer.from(marker)]).toString('base64');
  const harmPost = await api(B, 'POST', '/api/posts', { n: 'askbudgie', title: 'You are all #harmful', type: 'text' });
  ok(harmPost.status === 422 && harmPost.json.rule === 'No bullying' && /automatic check/.test(harmPost.json.error), 'the text model refuses a post it’s sure of', harmPost.json.error);
  const doubtPost = await api(B, 'POST', '/api/posts', { n: 'askbudgie', title: 'A #doubtful title', type: 'text' });
  ok(doubtPost.status === 200, 'a doubtful post is posted');
  const harmComment = await api(B, 'POST', '/api/comments', { postId: P, body: 'you are #harmful' });
  ok(harmComment.status === 422 && harmComment.json.rule === 'No bullying', 'and a comment it’s sure of');
  const doubtComment = await api(B, 'POST', '/api/comments', { postId: P, body: 'hmm #doubtful' });
  ok(doubtComment.status === 200, 'a doubtful comment is posted');
  const harmEdit = await api(B, 'PATCH', `/api/comments/${doubtComment.json.comment.id}`, { body: 'now #harmful' });
  ok(harmEdit.status === 422, 'editing can’t sneak it in');
  const harmBio = await api(B, 'PATCH', '/api/me', { bio: 'I am #harmful' });
  ok(harmBio.status === 422, 'nor can a bio');
  const doubtBio = await api(B, 'PATCH', '/api/me', { bio: 'kinda #doubtful' });
  ok(doubtBio.status === 200, 'a doubtful bio is saved');
  const doubtNest = await api(B, 'POST', '/api/nooks', { id: 'grumpy_place', title: 'Grumpy', tagline: 'A #doubtful place' });
  ok(doubtNest.status === 422, 'a nest’s text has to be clear of doubt (it can’t be reported)', doubtNest.json.error);
  const harmMsg = await api(B, 'POST', '/api/messages', { to: 'alice', body: 'you are #harmful' });
  ok(harmMsg.status === 422, 'messages: what the model is very sure of is refused');
  const doubtMsg = await api(B, 'POST', '/api/messages', { to: 'alice', body: 'just #doubtful banter' });
  ok(doubtMsg.status === 200, 'messages: a doubtful insult is sent (and not shown to anyone)');
  const sexualMsg = await api(B, 'POST', '/api/messages', { to: 'alice', body: 'something #sexual' });
  ok(sexualMsg.status === 200, 'messages: a doubtful sexual one is sent, for a moderator to see');
  const alone = await api(B, 'POST', '/api/messages', { to: 'alice', body: 'are you home alone?' });
  ok(alone.status === 200, 'messages: a grooming warning sign is sent, for a moderator to see');
  const explicitPic = await api(B, 'POST', '/api/posts', { n: 'photography', title: 'A sunset', type: 'image', image: marked('#explicit') });
  ok(explicitPic.status === 422 && explicitPic.json.rule === 'No sexual content', 'the picture check refuses a sexual picture', explicitPic.json.error);
  const borderPic = await api(B, 'POST', '/api/posts', { n: 'photography', title: 'Beach day', type: 'image', image: marked('#borderline') });
  ok(borderPic.status === 200, 'a borderline picture is posted');
  const suggestiveFace = await api(B, 'PATCH', '/api/me', { photo: marked('#suggestive') });
  ok(suggestiveFace.status === 422 && /profile picture/.test(suggestiveFace.json.error), 'profile pictures are stricter: a suggestive one is refused', suggestiveFace.json.error);
  const webp = await api(B, 'PATCH', '/api/me', { photo: 'data:image/webp;base64,' + Buffer.from('RIFF\0\0\0\0WEBPVP8 ').toString('base64') });
  ok(webp.status === 400, 'WebP is refused (it can’t be checked)', webp.json.error);

  // reports + admin
  const rep = await api(B, 'POST', '/api/reports', { kind: 'post', id: P, reason: 'Spam' });
  ok(rep.status === 200, 'bob reports a post');
  const notAdmin = await api(A, 'GET', '/api/admin/reports');
  ok(notAdmin.status === 403, 'only admins see reports');
  cli('admin', 'alice');
  const reports = await api(A, 'GET', '/api/admin/reports');
  const people = reports.json.reports.filter((r) => !r.automatic);
  ok(people.length === 1 && people[0].item.title, 'alice (admin) sees the report', people[0] && people[0].item.title);
  const auto = reports.json.reports.filter((r) => r.automatic);
  const autoKinds = auto.map((r) => r.kind).sort().join(',');
  ok(autoKinds === 'comment,message,message,post,post,user', 'the automatic checks reported the doubtful post, comment, bio, picture and two messages', autoKinds);
  ok(!auto.some((r) => r.kind === 'message' && /banter/.test(r.item && r.item.body)), 'but not the doubtful insult in a private message');
  ok(auto.every((r) => /^Automatic check: /.test(r.reason)), 'each says why', auto.map((r) => r.reason).join(' | '));
  const res = await api(A, 'POST', '/api/admin/resolve', { id: people[0].id, action: 'remove', reason: 'Testing removal' });
  ok(res.status === 200, 'admin removes it');
  const after = await api(B, 'GET', '/api/bootstrap');
  ok(!after.json.posts.some((p) => p.id === P), 'removed post is gone from the feed');
  const statement = await api(A, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(statement.json.notes.some((n) => /removed your post.*Testing removal/.test(n.text)), 'author gets a statement of reasons');

  // a reported profile can be cleared: picture, banner and bio go, and its owner is told why
  await api(B, 'PATCH', '/api/me', { bio: 'look at my banner', photo: png, banner: png, bannerGif: GIF, pronouns: 'he/him', flag: 'bi' });
  await api(A, 'POST', '/api/reports', { kind: 'user', id: 'bob', reason: 'Offensive picture' });
  const userReports = (await api(A, 'GET', '/api/admin/reports')).json.reports;
  const ur = userReports.find((r) => r.kind === 'user');
  ok(ur && /^\/api\/images\//.test(ur.item.photo) && /^\/api\/images\//.test(ur.item.banner), 'the admin sees the reported picture and banner');
  const cleared = await api(A, 'POST', '/api/admin/resolve', { id: ur.id, action: 'remove', reason: 'Testing profiles' });
  const bobNow = (await api(A, 'GET', '/api/bootstrap')).json.users.find((u) => u.name === 'bob');
  ok(cleared.status === 200 && bobNow && !bobNow.photo && !bobNow.banner && !bobNow.bannerGif && !bobNow.bio && !bobNow.pronouns, 'clearing a profile removes its picture, banner, bio and pronouns');
  ok(bobNow && bobNow.flag === 'bi', 'but not a pride flag (it isn’t anything they wrote)');
  const bobNotes = await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(bobNotes.json.notes.some((n) => /cleared your profile.*Testing profiles/.test(n.text)), 'and tells its owner why');
  await api(B, 'PATCH', '/api/me', { bio: 'back again' });
  ok(/Cleared u\/bob/.test(cli('clear-profile', 'bob', 'Testing the command')), 'the cli clears a profile too');

  // badges: every account made before 1.0 is an Early Bird; Developer comes from the cli; a developer gives the Tester badge
  const boot0 = (await api(A, 'GET', '/api/bootstrap')).json;
  ok(boot0.me.badges.join() === 'early' && boot0.users.every((u) => (u.badges || []).includes('early')), 'every account made before 1.0 is an Early Bird', JSON.stringify(boot0.me.badges));
  const aliceNotes = (await api(A, 'GET', '/api/updates?rev=0&note=0&msg=0')).json.notes;
  ok(aliceNotes.some((n) => n.kind === 'badge' && /Early Bird/.test(n.text)), 'and is told so when they join');
  const notDev = await api(B, 'POST', '/api/badges', { name: 'dora', badge: 'tester', on: true });
  ok(notDev.status === 403, 'only developers give badges', notDev.json.error);
  ok(/Developer badge now/.test(cli('dev', 'alice')) && /already has/.test(cli('dev', 'alice')), 'the cli makes alice a developer (once)');
  ok(/u\/alice .*\[dev\]\s+\[early\]/.test(cli('users')), 'and lists her badges');
  const aliceDev = (await api(A, 'GET', '/api/bootstrap')).json;
  ok(aliceDev.me.badges.includes('dev') && aliceDev.users.find((u) => u.name === 'alice').badges.includes('dev'), 'alice has the Developer badge, for everyone to see');
  const give = await api(A, 'POST', '/api/badges', { name: 'bob', badge: 'tester', on: true });
  ok(give.status === 200 && give.json.user.badges.includes('tester'), 'alice gives bob the Tester badge', give.json.error);
  const bobTold = (await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0')).json.notes;
  ok(bobTold.some((n) => /u\/alice gave you the Tester badge/.test(n.text)), 'bob is told who gave it');
  const doraSees = (await api(open.json.token, 'GET', `/api/updates?rev=${boot0.rev}&note=0&msg=0`)).json.users.find((u) => u.name === 'bob');
  ok(doraSees && doraSees.badges.includes('tester'), 'others get it with their next update');
  const noDev = await api(A, 'POST', '/api/badges', { name: 'bob', badge: 'dev', on: true });
  ok(noDev.status === 400, 'a developer can’t hand out the Developer badge', noDev.json.error);
  const nobody = await api(A, 'POST', '/api/badges', { name: 'nobody_here', badge: 'tester', on: true });
  ok(nobody.status === 404, 'or give one to no one', nobody.json.error);
  const takeAway = await api(A, 'POST', '/api/badges', { name: 'bob', badge: 'tester', on: false });
  ok(takeAway.status === 200 && !(takeAway.json.user.badges || []).includes('tester'), 'and takes the Tester badge away again');
  ok(/Tester badge now/.test(cli('tester', 'dora')) && /no longer/.test(cli('untester', 'dora')) && /didn't have/.test(cli('untester', 'dora')), 'the cli gives and takes the Tester badge');
  // u/teofil, the owner's account, becomes a developer by itself, but only once it's an admin (so it's surely the owner's)
  const teofil = await api(null, 'POST', '/api/signup', { name: 'Teofil', password: 'correct horse', age: true, terms: true });
  ok(teofil.status === 200, 'u/Teofil signs up', teofil.json.error);
  ok(!/u\/Teofil .*\[dev\]/.test(cli('users')), 'it isn’t a developer while it’s a member');
  cli('admin', 'Teofil');
  ok(/u\/Teofil .*\[admin\]\s+\[dev\]/.test(cli('users')), 'once it’s an admin, the next start makes it one');
  cli('undev', 'Teofil');
  ok(!/u\/Teofil .*\[dev\]/.test(cli('users')), 'just once: taken away, it stays away');
  // the server notes when it first runs as 1.0: accounts made after that aren't Early Birds
  const late = await api(null, 'POST', '/api/signup', { name: 'erin', password: 'correct horse', age: true, terms: true });
  const v1 = JSON.parse(execFileSync('node', ['-e', `
    const n = require(${JSON.stringify(SERVER + '/server.js')});
    const erin = n.db.get("SELECT * FROM users WHERE name = 'erin'");
    n.db.meta('v1-since', String(erin.created_at));
    const out = { alice: n.badgesOf(n.db.get("SELECT * FROM users WHERE name = 'alice'")), erin: n.badgesOf(erin) };
    n.db.meta('v1-since', '');
    n.db.close();
    console.log(JSON.stringify(out));`], { env, encoding: 'utf8' }));
  ok(late.status === 200 && v1.alice.includes('early') && !v1.erin.includes('early'), 'after 1.0, new accounts aren’t Early Birds; earlier ones keep it', JSON.stringify(v1));

  // group chats: friends only, the owner's powers, new members see the chat from when they joined, checked like DMs
  const D = open.json.token;
  const TF = teofil.json.token;
  const updates = (token) => api(token, 'GET', '/api/updates?rev=0&note=0&msg=0&gmsg=0').then((r) => r.json);
  const notYet = await api(A, 'POST', '/api/groups', { name: 'Bakers', members: ['bob', 'dora'] });
  ok(notYet.status === 403 && /isn’t one yet/.test(notYet.json.error), 'only friends can be put in a group', notYet.json.error);
  await api(A, 'POST', '/api/friends', { name: 'dora' });
  await api(D, 'POST', '/api/friends', { name: 'alice' });
  const noName = await api(A, 'POST', '/api/groups', { name: '  ', members: ['bob'] });
  ok(noName.status === 400 && noName.json.field === 'name', 'a group needs a name');
  const rudeName = await api(A, 'POST', '/api/groups', { name: 'fuck off', members: ['bob'] });
  ok(rudeName.status === 422, 'a group’s name is checked like a username', rudeName.json.error);
  const made = await api(A, 'POST', '/api/groups', { name: 'Bakers', members: ['bob', 'dora'] });
  const GR = made.json.group;
  ok(made.status === 200 && GR.members.length === 3 && GR.role === 'owner' && GR.members.find((m) => m.name === 'alice').role === 'owner', 'alice makes a group with bob and dora', made.json.error);
  const doraUp = await updates(D);
  ok(doraUp.groups.some((g) => g.id === GR.id) && doraUp.groupIds.includes(GR.id) && doraUp.notes.some((n) => /u\/alice added you to the group “Bakers”/.test(n.text)), 'dora gets the group, and is told who added her');
  const said = await api(B, 'POST', `/api/groups/${GR.id}/messages`, { body: 'Rye this Saturday?' });
  ok(said.status === 200 && said.json.message.mine && said.json.message.group === GR.id, 'bob writes in the group');
  const groupThreat = await api(B, 'POST', `/api/groups/${GR.id}/messages`, { body: 'kill yourself' });
  ok(groupThreat.status === 422, 'group messages are checked like private ones', groupThreat.json.error);
  const aliceUp = await updates(A);
  const aliceGroup = aliceUp.groups.find((g) => g.id === GR.id);
  ok(aliceUp.gmessages.some((m) => m.body === 'Rye this Saturday?' && m.from === 'bob') && aliceGroup.unread === 1, 'alice gets it, unread', aliceGroup && aliceGroup.unread);
  await api(A, 'POST', `/api/groups/${GR.id}/read`, {});
  ok((await api(A, 'GET', '/api/bootstrap')).json.groups.find((g) => g.id === GR.id).unread === 0, 'and reads it');
  const bobRenames = await api(B, 'PATCH', `/api/groups/${GR.id}`, { name: 'Bread heads' });
  ok(bobRenames.status === 403, 'only the owner changes the group');
  const renamed = await api(A, 'PATCH', `/api/groups/${GR.id}`, { name: 'Bread heads', color: '#3f8f4f', shape: 'flower' });
  ok(renamed.status === 200 && renamed.json.group.name === 'Bread heads' && renamed.json.group.shape === 'flower' && renamed.json.group.color === '#3f8f4f', 'alice renames it and picks its colour and shape');
  const strangerAdd = await api(B, 'POST', `/api/groups/${GR.id}/members`, { names: ['erin'] });
  ok(strangerAdd.status === 403, 'bob can’t add someone who isn’t his friend');
  await api(A, 'POST', '/api/friends', { name: 'Teofil' });
  await api(TF, 'POST', '/api/friends', { name: 'alice' });
  const added = await api(A, 'POST', `/api/groups/${GR.id}/members`, { names: ['Teofil'] });
  ok(added.status === 200 && added.json.group.members.length === 4, 'alice adds Teofil, a friend of hers');
  const twice = await api(A, 'POST', `/api/groups/${GR.id}/members`, { names: ['Teofil'] });
  ok(twice.status === 409, 'no one is added twice');
  const newcomer = (await api(TF, 'GET', `/api/groups/${GR.id}/messages`)).json.messages;
  ok(newcomer.length === 1 && newcomer[0].kind === 'event' && JSON.parse(newcomer[0].body).type === 'added', 'Teofil sees the chat from being added on, not what was said before', JSON.stringify(newcomer.map((m) => m.kind)));
  const bobRemoves = await api(B, 'DELETE', `/api/groups/${GR.id}/members/dora`);
  ok(bobRemoves.status === 403, 'only the owner removes people');
  const removedDora = await api(A, 'DELETE', `/api/groups/${GR.id}/members/dora`);
  ok(removedDora.status === 200 && !removedDora.json.group.members.some((m) => m.name === 'dora'), 'alice removes dora');
  const doraAfter = await updates(D);
  ok((await api(D, 'GET', `/api/groups/${GR.id}/messages`)).status === 404 && !doraAfter.groupIds.includes(GR.id) && doraAfter.notes.some((n) => /removed from the group/.test(n.text)), 'dora can’t read it any more, and is told');
  const reportedG = await api(TF, 'POST', '/api/reports', { kind: 'gmessage', id: String(said.json.message.id), reason: 'Testing group reports' });
  ok(reportedG.status === 200, 'a group message can be reported');
  const groupReports = (await api(A, 'GET', '/api/admin/reports')).json.reports.filter((r) => r.kind === 'gmessage');
  ok(groupReports.some((r) => r.item && r.item.body === 'Rye this Saturday?' && /Bread heads/.test(r.item.title)), 'moderators see the reported group message, and where it was said');

  // calls: friends or the same group only; a live stream rings; offers pass between the two; a line in the chat after
  const bobLive = listen(B);
  ok(await bobLive.wait('hello'), 'a device opens a live event stream');
  const strangerCall = await api(A, 'POST', '/api/calls', { to: 'erin', media: 'voice' });
  ok(strangerCall.status === 403, 'only friends can be called', strangerCall.json.error);
  const ringing = await api(A, 'POST', '/api/calls', { to: 'bob', media: 'video' });
  const CALL = ringing.json.call;
  ok(ringing.status === 200 && CALL.media === 'video' && CALL.with === 'bob' && ringing.json.ice.iceServers[0].urls[0] === 'stun:stun.cloudflare.com:3478' && !ringing.json.ice.relay, 'alice video-calls bob, with Cloudflare’s STUN server to find a way', ringing.json.error);
  const rang = await bobLive.wait('call-ring', (d) => d.call.id === CALL.id);
  ok(rang && rang.data.call.from === 'alice', 'bob’s device rings straight away');
  ok((await api(B, 'GET', '/api/signals?after=0')).json.signals.some((x) => x.type === 'call-ring'), 'the ring waits for a device that polls instead');
  ok((await updates(B)).ringing.some((c) => c.id === CALL.id), 'and shows in updates too');
  const busy = await api(D, 'POST', '/api/calls', { to: 'alice', media: 'voice' });
  ok(busy.status === 409, 'someone already on a call is busy', busy.json.error);
  const answered = await api(B, 'POST', `/api/calls/${CALL.id}/join`, {});
  ok(answered.status === 200 && answered.json.peers.join() === 'alice', 'bob answers: alice is there to connect to');
  const aliceSignals = async () => (await api(A, 'GET', '/api/signals?after=0')).json.signals;
  ok((await aliceSignals()).some((x) => x.type === 'call-joined' && x.data.user === 'bob'), 'alice is told bob is there');
  const offered = await api(B, 'POST', `/api/calls/${CALL.id}/signal`, { to: 'alice', type: 'offer', data: { sdp: 'v=0 test' } });
  ok(offered.status === 200 && (await aliceSignals()).some((x) => x.type === 'call-signal' && x.data.type === 'offer' && x.data.data.sdp === 'v=0 test' && x.data.from === 'bob'), 'bob’s offer reaches alice');
  const intruder = await api(D, 'POST', `/api/calls/${CALL.id}/signal`, { to: 'alice', type: 'offer', data: {} });
  ok(intruder.status === 404, 'nobody outside the call can signal into it');
  await sleep(1100);
  await api(A, 'POST', `/api/calls/${CALL.id}/leave`, {});
  const hungUp = await bobLive.wait('call-ended', (d) => d.call === CALL.id);
  ok(hungUp && hungUp.data.reason === 'ended', 'alice hangs up: the call ends for bob too');
  const callLine = (await api(B, 'GET', '/api/messages?with=alice')).json.messages.pop();
  const callInfo = JSON.parse(callLine.body);
  ok(callLine.kind === 'call' && callInfo.media === 'video' && callInfo.secs >= 1 && !callInfo.missed, 'the chat gets a line: a video call, and how long it was', callLine.body);
  const declined = await api(A, 'POST', '/api/calls', { to: 'bob', media: 'voice' });
  await api(B, 'POST', `/api/calls/${declined.json.call.id}/decline`, {});
  const bobConvo = (await updates(B)).conversations.find((c) => c.with === 'alice');
  ok(bobConvo.last.kind === 'call' && JSON.parse(bobConvo.last.body).missed && bobConvo.unread >= 1, 'a declined call shows as missed, unread for bob');
  const unanswered = await api(A, 'POST', '/api/calls', { to: 'bob', media: 'voice' });
  await sleep(2000);
  ok((await aliceSignals()).some((x) => x.type === 'call-ended' && x.data.call === unanswered.json.call.id && x.data.reason === 'no-answer'), 'a call nobody answers stops ringing and ends');
  await api(B, 'POST', '/api/settings/calls', { on: false });
  const callsOff = await api(A, 'POST', '/api/calls', { to: 'bob', media: 'voice' });
  ok(callsOff.status === 403 && /isn’t taking calls/.test(callsOff.json.error), 'bob turns calls off: nobody can ring him');
  ok((await api(B, 'GET', '/api/bootstrap')).json.me.calls === 'off', 'and the setting is kept');
  await api(B, 'POST', '/api/settings/calls', { on: true });
  const groupCall = await api(A, 'POST', '/api/calls', { group: GR.id, media: 'voice' });
  const GC = groupCall.json.call;
  ok(groupCall.status === 200 && GC.group.name === 'Bread heads', 'alice starts a call in the group');
  const rangIn = async (token) => (await api(token, 'GET', '/api/signals?after=0')).json.signals.some((x) => x.type === 'call-ring' && x.data.call.id === GC.id);
  ok((await rangIn(B)) && (await rangIn(TF)) && !(await rangIn(D)), 'bob and Teofil ring, dora (no longer in the group) doesn’t');
  const joinGoing = await api(TF, 'POST', '/api/calls', { group: GR.id, media: 'voice' });
  ok(joinGoing.status === 200 && joinGoing.json.call.id === GC.id && joinGoing.json.peers.join() === 'alice', 'Teofil pressing call joins the call already going');
  ok((await api(D, 'POST', `/api/calls/${GC.id}/join`, {})).status === 403, 'dora can’t join the group’s call');
  await api(B, 'POST', `/api/calls/${GC.id}/join`, {});
  await api(A, 'POST', `/api/calls/${GC.id}/leave`, {});
  const bobGroupSignals = (await api(B, 'GET', '/api/signals?after=0')).json.signals;
  ok(bobGroupSignals.some((x) => x.type === 'call-left' && x.data.user === 'alice') && !bobGroupSignals.some((x) => x.type === 'call-ended' && x.data.call === GC.id), 'alice leaves: the group call goes on for the others');
  await api(B, 'POST', `/api/calls/${GC.id}/leave`, {});
  await api(TF, 'POST', `/api/calls/${GC.id}/leave`, {});
  const groupCallLine = (await api(B, 'GET', `/api/groups/${GR.id}/messages`)).json.messages.pop();
  ok(groupCallLine.kind === 'call' && !JSON.parse(groupCallLine.body).missed, 'when the last one leaves, the group chat gets the call’s line');
  await api(A, 'POST', `/api/groups/${GR.id}/leave`, {});
  const handedOver = (await api(B, 'GET', '/api/bootstrap')).json.groups.find((g) => g.id === GR.id);
  ok(handedOver && !handedOver.members.some((m) => m.name === 'alice') && handedOver.members.find((m) => m.role === 'owner'), 'when the owner leaves, whoever has been there longest takes over', JSON.stringify(handedOver && handedOver.members));
  bobLive.close();
  ok(/straight between devices/.test(cli('turn')), 'the cli says how calls connect');
  ok(/through Cloudflare's TURN relay/.test(cli('turn', 'abcdefabcdefabcdefabcdefabcdef12', 'test-token-test-token-1234')) && /straight between devices/.test(cli('turn', 'off')), 'and sets up (and turns off) Cloudflare’s relay');

  // ringing a group again, and a page reloaded mid-call: the others see it away, and it can come back
  const regroup = await api(B, 'POST', `/api/calls`, { group: GR.id, media: 'voice' });
  const RG = regroup.json.call;
  await api(TF, 'POST', `/api/calls/${RG.id}/decline`, {});
  const ringAgainStranger = await api(D, 'POST', `/api/calls/${RG.id}/ring`, {});
  ok(ringAgainStranger.status === 404, 'nobody outside a call can ring people for it');
  const rungAgain = await api(B, 'POST', `/api/calls/${RG.id}/ring`, { names: ['Teofil'] });
  ok(rungAgain.status === 200 && rungAgain.json.rang.join() === 'Teofil', 'bob rings Teofil again after he declined', rungAgain.json.error);
  const tfRings = (await api(TF, 'GET', '/api/signals?after=0')).json.signals.filter((x) => x.type === 'call-ring' && x.data.call.id === RG.id);
  ok(tfRings.length === 2 && tfRings[1].data.again, 'Teofil’s phone rings a second time');
  await api(TF, 'POST', `/api/calls/${RG.id}/join`, {});
  const goneAway = await api(TF, 'POST', `/api/calls/${RG.id}/away`, {});
  ok(goneAway.status === 200 && (await api(B, 'GET', '/api/signals?after=0')).json.signals.some((x) => x.type === 'call-away' && x.data.user === 'Teofil'), 'Teofil’s page reloads: bob sees him away');
  const tfBoot = (await api(TF, 'GET', '/api/bootstrap')).json;
  ok(tfBoot.call && tfBoot.call.id === RG.id && tfBoot.call.away.includes('Teofil'), 'the reloaded page learns it’s still in the call');
  const cameBack = await api(TF, 'POST', `/api/calls/${RG.id}/join`, {});
  await sleep(1500);
  ok(cameBack.status === 200 && cameBack.json.peers.join() === 'bob' && (await api(TF, 'GET', '/api/bootstrap')).json.call, 'it comes back in time and stays in the call');
  await api(TF, 'POST', `/api/calls/${RG.id}/away`, {});
  await sleep(1600);
  ok(!(await api(TF, 'GET', '/api/bootstrap')).json.call, 'a page that doesn’t come back leaves the call by itself');
  await api(B, 'POST', `/api/calls/${RG.id}/leave`, {});
  const dmRing = await api(A, 'POST', '/api/calls', { to: 'bob', media: 'voice' });
  ok((await api(A, 'POST', `/api/calls/${dmRing.json.call.id}/ring`, {})).status === 400, 'only group calls ring again');
  await api(A, 'POST', `/api/calls/${dmRing.json.call.id}/leave`, {});

  // pictures and GIFs in chats: checked as strictly as profile pictures; GIFs from KLIPY are kept as KLIPY's links
  const picMsg = await api(A, 'POST', '/api/messages', { to: 'bob', image: png, width: 1, height: 1 });
  ok(picMsg.status === 200 && picMsg.json.message.media.type === 'image' && /^\/api\/images\//.test(picMsg.json.message.media.url) && picMsg.json.message.body === '', 'alice sends bob a picture, no words needed', picMsg.json.error);
  ok((await fetch(BASE + picMsg.json.message.media.url)).status === 200, 'the picture is there to see');
  const captioned = await api(A, 'POST', '/api/messages', { to: 'bob', body: 'my sourdough!', image: png });
  ok(captioned.status === 200 && captioned.json.message.body === 'my sourdough!' && captioned.json.message.media, 'with words too');
  const racyMsg = await api(A, 'POST', '/api/messages', { to: 'bob', image: marked('#suggestive') });
  ok(racyMsg.status === 422 && /wasn’t sent/.test(racyMsg.json.error), 'a picture that might be sexual isn’t sent', racyMsg.json.error);
  const gifOff = await api(A, 'POST', '/api/messages', { to: 'bob', gif: { url: 'https://static.klipy.com/ii/abc/14/af/x.gif', width: 200, height: 150 } });
  ok(gifOff.status === 400 && /off/.test(gifOff.json.error), 'GIF search is off until the owner sets a key');
  ok(/GIF search is on/.test(cli('gifs', 'klipy_test_key_123')) && (await api(A, 'GET', '/api/bootstrap')).json.gifs === 'klipy_test_key_123', 'nook gifs turns it on, and the app gets the key');
  const klipyGif = await api(A, 'POST', `/api/groups/${GR.id}/messages`, { gif: { url: 'https://static.klipy.com/ii/abc/14/af/x.gif', still: 'https://static1.klipy.com/ii/abc/14/af/x.jpg', width: 200, height: 150, title: 'Happy dance' } });
  ok(klipyGif.status === 404, 'only people in a group can send to it');
  const gifMsg = await api(B, 'POST', `/api/groups/${GR.id}/messages`, { gif: { url: 'https://static.klipy.com/ii/abc/14/af/x.gif', still: 'https://static1.klipy.com/ii/abc/14/af/x.jpg', width: 200, height: 150, title: 'Happy dance' } });
  ok(gifMsg.status === 200 && gifMsg.json.message.media.type === 'klipy' && gifMsg.json.message.media.width === 200 && gifMsg.json.message.media.title === 'Happy dance', 'bob sends the group a GIF from KLIPY', gifMsg.json.error);
  const notKlipy = await api(B, 'POST', `/api/groups/${GR.id}/messages`, { gif: { url: 'https://evil.example/x.gif' } });
  ok(notKlipy.status === 400, 'only KLIPY’s own links are taken as GIFs');
  const groupPic = await api(B, 'POST', `/api/groups/${GR.id}/messages`, { image: png });
  ok(groupPic.status === 200 && groupPic.json.message.media.type === 'image', 'pictures go to groups too');
  await api(B, 'POST', '/api/reports', { kind: 'message', id: String(picMsg.json.message.id), reason: 'Testing picture reports' });
  ok((await api(A, 'GET', '/api/admin/reports')).json.reports.some((r) => r.kind === 'message' && r.item && r.item.picture === picMsg.json.message.media.url), 'moderators see a reported picture');
  await api(A, 'POST', '/api/admin/remove', { kind: 'message', id: String(picMsg.json.message.id), reason: 'Testing' });
  ok((await fetch(BASE + picMsg.json.message.media.url)).status === 404, 'a removed message’s picture is deleted with it');
  ok(/GIF search is off/.test(cli('gifs', 'off')), 'and nook gifs off turns GIF search off');

  // nest teams: the owner gives roles; each role can only do its share; bans only stop posting in that nest
  const dJoin = await api(D, 'POST', '/api/joins', { nook: 'pottery_club', on: true });
  ok(dJoin.status === 200, 'dora joins n/pottery_club');
  const notMember = await api(A, 'PUT', '/api/nooks/pottery_club/team/Teofil', { role: 'moderator' });
  ok(notMember.status === 400 && /join/.test(notMember.json.error), 'only people who joined the nest get a role');
  const bobMod = await api(A, 'PUT', '/api/nooks/pottery_club/team/bob', { role: 'moderator' });
  ok(bobMod.status === 200 && bobMod.json.nook.team.some((t) => t.name === 'bob' && t.role === 'moderator' && t.perms.join() === 'pin,remove,ban'), 'alice (the owner) makes bob a moderator', bobMod.json.error);
  ok((await updates(B)).notes.some((n) => /made you a Moderator in n\/pottery_club/.test(n.text)), 'bob is told');
  const bobGives = await api(B, 'PUT', '/api/nooks/pottery_club/team/dora', { role: 'helper' });
  ok(bobGives.status === 403, 'a moderator can’t give roles (no team access)');
  const customRole = await api(A, 'PUT', '/api/nooks/pottery_club/team/dora', { role: 'custom', title: 'Glaze guru', perms: ['pin'] });
  ok(customRole.status === 200 && customRole.json.nook.team.find((t) => t.name === 'dora').title === 'Glaze guru', 'alice gives dora a role she names herself, that can only pin');
  const noPerms = await api(A, 'PUT', '/api/nooks/pottery_club/team/dora', { role: 'custom', title: 'Nothing', perms: [] });
  ok(noPerms.status === 400, 'a role has to be able to do something');
  const potPost = await api(D, 'POST', '/api/posts', { n: 'pottery_club', title: 'My first wobbly mug', type: 'text' });
  const PP = potPost.json.post.id;
  const doraPins = await api(D, 'POST', `/api/posts/${PP}/pin`, { on: true });
  ok(doraPins.status === 200 && doraPins.json.post.pinned, 'dora pins a post');
  const doraRemoves = await api(D, 'POST', '/api/nooks/pottery_club/remove', { kind: 'post', id: PP, reason: 'test' });
  ok(doraRemoves.status === 403, 'but can’t remove posts');
  for (const t of ['Glaze tips', 'Kiln day', 'Clay sources']) {
    const extra = await api(A, 'POST', '/api/posts', { n: 'pottery_club', title: t, type: 'text' });
    await api(A, 'POST', `/api/posts/${extra.json.post.id}/pin`, { on: true });
  }
  const tooMany = (await api(A, 'GET', '/api/bootstrap')).json.posts.filter((p) => p.n === 'pottery_club' && p.pinned).length;
  ok(tooMany === 3, 'a nest has at most 3 pinned posts', String(tooMany));
  // (alice and Teofil are Budgie admins, who can run every nest; erin is nobody special)
  const erinT = (await api(null, 'POST', '/api/login', { name: 'erin', password: 'correct horse' })).json.token;
  const strangerPin = await api(erinT, 'POST', `/api/posts/${PP}/pin`, { on: false });
  ok(strangerPin.status === 403, 'people off the team can’t pin');
  const rules = await api(A, 'PATCH', '/api/nooks/pottery_club', { rules: ['Show your work', 'Be kind about wobbly mugs', ''], tagline: 'Wobbly mugs and kind words.' });
  ok(rules.status === 200 && rules.json.nook.rules.length === 2 && rules.json.nook.tagline === 'Wobbly mugs and kind words.', 'alice writes the nest’s rules', rules.json.error);
  const rudeRules = await api(A, 'PATCH', '/api/nooks/pottery_club', { rules: ['kill yourself'] });
  ok(rudeRules.status === 422, 'rules are checked like everything else');
  const bobRules = await api(B, 'PATCH', '/api/nooks/pottery_club', { rules: ['Bob rules'] });
  ok(bobRules.status === 403, 'a moderator can’t edit the rules');
  await api(erinT, 'POST', '/api/joins', { nook: 'pottery_club', on: true });
  const erinPost = await api(erinT, 'POST', '/api/posts', { n: 'pottery_club', title: 'Buy cheap clay at my shop', type: 'text' });
  const erinCom = await api(erinT, 'POST', '/api/comments', { postId: PP, body: 'Nice mug, buy my clay' });
  await api(D, 'POST', '/api/reports', { kind: 'post', id: erinPost.json.post.id, reason: 'Spam' });
  const bobManage = await api(B, 'GET', '/api/nooks/pottery_club/manage');
  ok(bobManage.status === 200 && bobManage.json.perms.join() === 'pin,remove,ban' && bobManage.json.reports.some((r) => r.target === erinPost.json.post.id && !r.reporter), 'bob sees the nest’s reports (not who made them)', JSON.stringify(bobManage.json).slice(0, 200));
  ok((await api(erinT, 'GET', '/api/nooks/pottery_club/manage')).status === 403, 'people off the team can’t see them');
  const bobTakes = await api(B, 'POST', '/api/nooks/pottery_club/remove', { kind: 'post', id: erinPost.json.post.id, reason: 'No ads' });
  ok(bobTakes.status === 200 && (await updates(erinT)).notes.some((n) => /A moderator of n\/pottery_club removed your post/.test(n.text)), 'bob removes erin’s ad, and erin is told by whom', bobTakes.json.error);
  ok(!(await api(B, 'GET', '/api/nooks/pottery_club/manage')).json.reports.some((r) => r.target === erinPost.json.post.id), 'and the report about it closes');
  const elsewhere = await api(B, 'POST', '/api/nooks/pottery_club/remove', { kind: 'post', id: P, reason: 'x' });
  ok(elsewhere.status === 404, 'a nest’s team only removes things in that nest');
  const banErin = await api(B, 'POST', '/api/nooks/pottery_club/bans', { name: 'erin', reason: 'Selling clay', days: 7 });
  ok(banErin.status === 200, 'bob bans erin from the nest for a week');
  const nestBanned = await api(erinT, 'POST', '/api/comments', { postId: PP, body: 'one more thing' });
  ok(nestBanned.status === 403 && nestBanned.json.banned && /banned from posting/.test(nestBanned.json.error), 'erin can’t comment there now, and is told why and until when', nestBanned.json.error);
  const elsewherePost = await api(erinT, 'POST', '/api/posts', { n: 'askbudgie', title: 'Any pottery tips?', type: 'text' });
  ok(elsewherePost.status === 200, 'but can still post in other nests');
  ok((await api(erinT, 'GET', '/api/bootstrap')).json.bannedFrom.some((b) => b.nook === 'pottery_club' && b.until), 'the app knows she’s banned there');
  const banOwner = await api(B, 'POST', '/api/nooks/pottery_club/bans', { name: 'alice', reason: 'x' });
  ok(banOwner.status === 403, 'nobody bans the owner');
  const banTeam = await api(B, 'POST', '/api/nooks/pottery_club/bans', { name: 'dora', reason: 'x' });
  ok(banTeam.status === 400, 'or someone on the team');
  ok((await api(B, 'GET', '/api/nooks/pottery_club/manage')).json.bans.some((b) => b.name === 'erin' && b.by === 'bob'), 'the ban is listed for the team');
  const unban = await api(B, 'DELETE', '/api/nooks/pottery_club/bans/erin');
  ok(unban.status === 200 && (await api(erinT, 'POST', '/api/comments', { postId: PP, body: 'Lovely glaze' })).status === 200, 'unbanned, erin can comment again');
  const stepDown = await api(D, 'DELETE', '/api/nooks/pottery_club/team/dora');
  ok(stepDown.status === 200 && !(stepDown.json.nook.team || []).some((t) => t.name === 'dora'), 'dora steps down from the team herself');
  // the starter nests: Budgie's admins run them, and a team or rules there give a starter its own row
  const starterMod = await api(A, 'PUT', '/api/nooks/askbudgie/team/bob', { role: 'helper' });
  ok(starterMod.status === 200 && starterMod.json.nook.starter && starterMod.json.nook.title && starterMod.json.nook.team[0].name === 'bob', 'an admin gives bob a role in a starter nest, which keeps its looks', starterMod.json.error);
  ok((await api(B, 'GET', '/api/bootstrap')).json.nooks.some((n) => n.id === 'askbudgie' && n.starter && n.team), 'the app gets the starter nest with its team');

  // blocking: dora blocks bob
  for (const T of [B, D]) {
    const going = (await api(T, 'GET', '/api/bootstrap')).json.call;
    if (going) await api(T, 'POST', `/api/calls/${going.id}/leave`, {});
  }
  await api(B, 'POST', '/api/friends', { name: 'dora' });
  await api(D, 'POST', '/api/friends', { name: 'bob' });
  const pair = await api(B, 'POST', '/api/groups', { name: 'Two of us', members: ['dora'] });
  const doraPost = await api(D, 'POST', '/api/posts', { n: 'askbudgie', title: 'Dora wonders about crumpets', type: 'text' });
  const selfBlock = await api(D, 'POST', '/api/blocks', { name: 'dora' });
  ok(selfBlock.status === 400, 'nobody blocks themselves');
  const blocks = await api(D, 'POST', '/api/blocks', { name: 'bob' });
  ok(blocks.status === 200 && blocks.json.blocked.join() === 'bob', 'dora blocks bob', blocks.json.error);
  const doraBoot = (await api(D, 'GET', '/api/bootstrap')).json;
  ok(doraBoot.blocked.join() === 'bob' && !doraBoot.friends.some((f) => f.name === 'bob'), 'they aren’t friends any more, and her app knows who she blocked');
  ok(!(await api(B, 'GET', '/api/bootstrap')).json.friends.some((f) => f.name === 'dora') && !(await api(B, 'GET', '/api/bootstrap')).json.blocked.length, 'bob just sees they aren’t friends (he isn’t told)');
  ok((await api(B, 'POST', '/api/messages', { to: 'dora', body: 'hey?' })).status === 403, 'bob can’t message her');
  const bobAsks = await api(B, 'POST', '/api/friends', { name: 'dora' });
  ok(bobAsks.status === 403 && /can’t send/.test(bobAsks.json.error), 'or ask to be friends again', bobAsks.json.error);
  const doraAsks = await api(D, 'POST', '/api/friends', { name: 'bob' });
  ok(doraAsks.status === 403 && /Unblock/.test(doraAsks.json.error), 'dora is told to unblock him first', doraAsks.json.error);
  ok((await api(B, 'POST', '/api/calls', { to: 'dora', media: 'voice' })).status === 403, 'bob can’t call her');
  const pairCall = await api(B, 'POST', '/api/calls', { group: pair.json.group.id, media: 'voice' });
  ok(pairCall.status === 200 && !pairCall.json.call.ringing.includes('dora'), 'a call in a group they share doesn’t ring her', pairCall.json.error || JSON.stringify(pairCall.json.call && pairCall.json.call.ringing));
  if (pairCall.json.call) await api(B, 'POST', `/api/calls/${pairCall.json.call.id}/leave`, {});
  const notesBefore = (await api(D, 'GET', '/api/bootstrap')).json.notes.length;
  await api(B, 'POST', '/api/comments', { postId: doraPost.json.post.id, body: 'Crumpets are great.' });
  ok((await api(D, 'GET', '/api/bootstrap')).json.notes.length === notesBefore, 'his comments on her posts don’t reach her inbox');
  ok((await api(D, 'GET', '/api/account/export')).json.blocked.join() === 'bob', 'her data export lists who she blocked');
  const unblock = await api(D, 'DELETE', '/api/blocks/bob');
  ok(unblock.status === 200 && unblock.json.blocked.length === 0, 'dora unblocks bob');
  ok((await api(B, 'POST', '/api/friends', { name: 'dora' })).json.status === 'outgoing' && (await api(D, 'POST', '/api/friends', { name: 'bob' })).json.status === 'friends', 'and they can be friends again');
  await api(B, 'DELETE', '/api/friends/dora');

  // password, recovery, ban, export, delete
  const pw = await api(B, 'POST', '/api/account/password', { current: 'battery staple', password: 'new password 1' });
  ok(pw.status === 200, 'bob changes his password');
  const rec = await api(null, 'POST', '/api/recover', { name: 'alice', recovery: a.json.recovery.toLowerCase(), password: 'brand new pass' });
  ok(rec.status === 200 && rec.json.recovery && rec.json.recovery !== a.json.recovery, 'alice recovers with her code (any case) and gets a new one');
  const oldToken = await api(A, 'GET', '/api/bootstrap');
  ok(oldToken.status === 401, 'recovery signs out old sessions');
  const A2 = rec.json.token;
  const usedRec = await api(null, 'POST', '/api/recover', { name: 'alice', recovery: a.json.recovery, password: 'another one!' });
  ok(usedRec.status === 401, 'an old recovery code no longer works');
  const banned = await api(A2, 'POST', '/api/admin/ban', { name: 'bob', reason: 'Testing bans' });
  ok(banned.status === 200, 'admin bans bob');
  const bobIn = await api(null, 'POST', '/api/login', { name: 'bob', password: 'new password 1' });
  ok(bobIn.status === 403 && /Testing bans/.test(bobIn.json.error), 'banned bob can’t sign in', bobIn.json.error);
  await api(A2, 'POST', '/api/admin/ban', { name: 'bob', on: false });
  const exp = await api(A2, 'GET', '/api/account/export');
  ok(exp.json.profile.name === 'alice' && exp.json.messages.filter((m) => !m.kind && !m.media).length === 4 && exp.json.messages.some((m) => m.media) && exp.json.messages.some((m) => m.kind === 'call') && exp.json.groups && exp.json.posts.length >= 1, 'export has everything', Object.keys(exp.json).join(',') + ' ' + exp.json.messages.length);
  const del = await api(A2, 'POST', '/api/account/delete', { password: 'brand new pass' });
  ok(del.status === 200, 'alice deletes her account');
  const bobAfter = await api(null, 'POST', '/api/login', { name: 'bob', password: 'new password 1' });
  const B2 = bobAfter.json.token;
  const world = await api(B2, 'GET', '/api/bootstrap');
  ok(!world.json.users.some((u) => u.name === 'alice') && world.json.friends.length === 0 && world.json.conversations.length === 0, 'alice is gone: no user, friendship or messages');
  ok(world.json.comments.every((c) => c.author !== 'alice'), 'her comments are wiped');
  ok(world.json.nooks[0].mods.length === 0, 'her nook stays, without her');

  console.log(cli('stats'));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  proc.kill('SIGTERM');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
