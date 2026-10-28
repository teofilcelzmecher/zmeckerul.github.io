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
const env = { ...process.env, NOOK_DATA: DATA, NOOK_PORT: '8799', NOOK_ORIGINS: 'http://localhost:*', NOOK_PICTURE_CHECK: 'test', NOOK_TEXT_CHECK: 'test', NOOK_CAPTCHA: 'test' };
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

  // the "I'm not a robot" check: off until the owner sets it up, then needed for every new account
  ok(!health.json.captcha && /is off/.test(cli('captcha')), 'the robot check is off at first');
  ok(/on: new accounts need/.test(cli('captcha', '6LeTestSiteKey_000000000000000000000000', '6LeTestSecretKey_00000000000000000000000')), 'the cli turns it on');
  ok((await api(null, 'GET', '/api/health')).json.captcha === '6LeTestSiteKey_000000000000000000000000', 'health hands the app the site key (and nothing secret)');
  const robot = await api(null, 'POST', '/api/signup', { name: 'robotron', password: 'correct horse', age: true, terms: true });
  ok(robot.status === 400 && robot.json.field === 'captcha' && robot.json.captcha === '6LeTestSiteKey_000000000000000000000000', 'without the check, no account (and the form is told the site key)', robot.json.error);
  const failed = await api(null, 'POST', '/api/signup', { name: 'robotron', password: 'correct horse', age: true, terms: true, captcha: 'nope' });
  ok(failed.status === 400 && failed.json.field === 'captcha', 'a failed check, no account', failed.json.error);
  const takenFirst = await api(null, 'POST', '/api/signup', { name: 'alice', password: 'correct horse', age: true, terms: true, captcha: 'nope' });
  ok(takenFirst.status === 409, 'a taken name is said first, before the check is used up', takenFirst.json.error);
  const human = await api(null, 'POST', '/api/signup', { name: 'human_one', password: 'correct horse', age: true, terms: true, captcha: 'pass' });
  ok(human.status === 200 && human.json.token, 'a passed check makes the account');
  ok(/is off/.test(cli('captcha', 'off')) && !(await api(null, 'GET', '/api/health')).json.captcha, 'the cli turns it off again');
  ok(/Usage/.test((() => { try { return cli('captcha', 'short', 'x'); } catch (e) { return String(e.stderr); } })()), 'the cli refuses keys that can’t be keys');

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
  await api(B, 'PATCH', '/api/me', { bio: 'look at my banner', photo: png, banner: png, bannerGif: GIF });
  await api(A, 'POST', '/api/reports', { kind: 'user', id: 'bob', reason: 'Offensive picture' });
  const userReports = (await api(A, 'GET', '/api/admin/reports')).json.reports;
  const ur = userReports.find((r) => r.kind === 'user');
  ok(ur && /^\/api\/images\//.test(ur.item.photo) && /^\/api\/images\//.test(ur.item.banner), 'the admin sees the reported picture and banner');
  const cleared = await api(A, 'POST', '/api/admin/resolve', { id: ur.id, action: 'remove', reason: 'Testing profiles' });
  const bobNow = (await api(A, 'GET', '/api/bootstrap')).json.users.find((u) => u.name === 'bob');
  ok(cleared.status === 200 && bobNow && !bobNow.photo && !bobNow.banner && !bobNow.bannerGif && !bobNow.bio, 'clearing a profile removes its picture, banner and bio');
  const bobNotes = await api(B, 'GET', '/api/updates?rev=0&note=0&msg=0');
  ok(bobNotes.json.notes.some((n) => /cleared your profile.*Testing profiles/.test(n.text)), 'and tells its owner why');
  await api(B, 'PATCH', '/api/me', { bio: 'back again' });
  ok(/Cleared u\/bob/.test(cli('clear-profile', 'bob', 'Testing the command')), 'the cli clears a profile too');

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
  ok(exp.json.profile.name === 'alice' && exp.json.messages.length === 4 && exp.json.posts.length >= 1, 'export has everything', Object.keys(exp.json).join(',') + ' ' + exp.json.messages.length);
  const del = await api(A2, 'POST', '/api/account/delete', { password: 'brand new pass' });
  ok(del.status === 200, 'alice deletes her account');
  const bobAfter = await api(null, 'POST', '/api/login', { name: 'bob', password: 'new password 1' });
  const B2 = bobAfter.json.token;
  const world = await api(B2, 'GET', '/api/bootstrap');
  ok(world.json.users.length === 3 && world.json.friends.length === 0 && world.json.conversations.length === 0, 'alice is gone: no user, friendship or messages');
  ok(world.json.comments.every((c) => c.author !== 'alice'), 'her comments are wiped');
  ok(world.json.nooks[0].mods.length === 0, 'her nook stays, without her');

  console.log(cli('stats'));
  console.log(failures ? `${failures} FAILED` : 'ALL PASSED');
  proc.kill('SIGTERM');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
