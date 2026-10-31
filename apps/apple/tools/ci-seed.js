// For the build machine's checks: a few people, nests, posts and a chat on a Budgie server running on the same
// machine (port 8799), so the app has something to show. Prints the sign-in token of the account the app opens with.
//   node apps/apple/tools/ci-seed.js
const API = 'http://127.0.0.1:8799';
const call = (method, path, body, token) =>
  fetch(API + path, {
    method,
    headers: Object.assign({ 'Content-Type': 'application/json', Origin: 'budgie://app' }, token ? { Authorization: 'Bearer ' + token } : {}),
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  for (let i = 0; ; i++) {
    try {
      if ((await call('GET', '/api/health')).ok) break;
    } catch (_) {}
    if (i > 100) throw new Error('the server never started');
    await sleep(300);
  }
  const tk = {};
  for (const [name, color] of [['wren', '#e8467c'], ['robin', '#00a6a6'], ['mika', '#ff8a3d'], ['juno', '#4b5bd6']]) {
    tk[name] = (await call('POST', '/api/signup', { name, password: 'correct horse battery', age: true, terms: true })).token;
    await call('PATCH', '/api/me', { color }, tk[name]);
  }
  for (const name of Object.keys(tk)) for (const n of ['photography', 'houseplants', 'nightsky', 'cozygames', 'askbudgie']) await call('POST', '/api/joins', { nook: n, on: true }, tk[name]);
  await call('PATCH', '/api/me', { pronouns: 'she/they', bio: 'Film photos, slow mornings and too many houseplants 🌿' }, tk.wren);
  await call('POST', '/api/posts', { n: 'askbudgie', title: 'What’s a small thing that made your week better?', body: 'Mine: the bakery remembered my order.', type: 'text' }, tk.mika);
  await call('POST', '/api/posts', { n: 'cozygames', title: 'What are we playing this weekend?', type: 'poll', poll: ['Stardew Valley', 'A Short Hike', 'Unpacking'] }, tk.juno);
  const p = await call('POST', '/api/posts', { n: 'houseplants', title: 'The petunias finally decided to bloom 💜', body: 'Three months of patience.', type: 'text' }, tk.robin);
  if (p.post) await call('POST', '/api/comments', { postId: p.post.id, body: 'Worth the wait!' }, tk.wren);
  for (const name of ['robin', 'mika']) {
    await call('POST', '/api/friends', { name }, tk.wren);
    await call('POST', '/api/friends', { name: 'wren' }, tk[name]);
  }
  await call('POST', '/api/messages', { to: 'wren', body: 'golden hour at the old harbour tomorrow?' }, tk.robin);
  await call('POST', '/api/messages', { to: 'robin', body: 'perfect, I’ll bring the film camera 📷' }, tk.wren);
  process.stdout.write(tk.wren);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
