// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Nook's store: what the server sent at sign-in, kept up to date by asking it
 * what changed every few seconds. Shared things (posts, comments, votes, nooks,
 * people, friends, messages) live on the server; your own things (settings,
 * saved posts, collections, streak, badges) are saved with your account too, so
 * they follow you between devices. Nothing here touches the page: views read
 * from it, and app.js calls its mutations, which show their effect at once and
 * undo it if the server says no.
 */
(function () {
  'use strict';

  const Nook = (window.Nook = window.Nook || {});
  const api = Nook.api;
  const DATA = window.NOOK_DATA;
  const BOOT = window.NOOK_BOOT;
  const ME = '__me__';
  const VERSION = '1.0.0';
  const SYNC_EVERY = 15000;

  const SPARKS = [
    { id: 'love', label: 'Love', symbol: 'favorite', shape: 'heart', burst: 'hearts' },
    { id: 'insight', label: 'Insightful', symbol: 'lightbulb', shape: 'sunny', burst: 'play' },
    { id: 'funny', label: 'Funny', symbol: 'sentiment_very_satisfied', shape: 'cookie9', burst: 'playlist' },
    { id: 'fire', label: 'Fire', symbol: 'local_fire_department', shape: 'softBurst', burst: 'play' },
    { id: 'wow', label: 'Wow', symbol: 'auto_awesome', shape: 'burst', burst: 'pin' },
  ];

  const BADGES = [
    { id: 'hello', name: 'Hello, Budgie', desc: 'Visited Budgie for the first time', shape: 'cookie9', symbol: 'waving_hand' },
    { id: 'streak3', name: 'Regular', desc: 'Kept a 3-day visit streak', shape: 'heart', symbol: 'local_fire_department' },
    { id: 'streak7', name: 'Devoted', desc: 'Kept a 7-day visit streak', shape: 'burst', symbol: 'whatshot' },
    { id: 'firstpost', name: 'First words', desc: 'Made your first post', shape: 'sunny', symbol: 'edit' },
    { id: 'chatty', name: 'Conversationalist', desc: 'Left 5 comments', shape: 'clover4', symbol: 'forum' },
    { id: 'joiner', name: 'Social butterfly', desc: 'Joined 8 nests', shape: 'flower', symbol: 'diversity_3' },
    { id: 'explorer', name: 'Explorer', desc: 'Visited 6 different nests', shape: 'arch', symbol: 'explore' },
    { id: 'pollster', name: 'Voice of the people', desc: 'Voted in a poll', shape: 'pill', symbol: 'how_to_vote' },
    { id: 'sparky', name: 'Sparky', desc: 'Gave 10 Sparks', shape: 'boom', symbol: 'auto_awesome' },
    { id: 'curator', name: 'Curator', desc: 'Made a collection', shape: 'gem', symbol: 'collections_bookmark' },
    { id: 'founder', name: 'Founder', desc: 'Created a nest', shape: 'softBurst', symbol: 'castle' },
    { id: 'friendly', name: 'Friendly', desc: 'Made your first friend', shape: 'heart', symbol: 'diversity_1' },
  ];

  // ---- your own things --------------------------------------------------------------------------------

  const PREF_KEYS = ['settings', 'saved', 'collections', 'hidden', 'streak', 'badges', 'visited', 'recent', 'draft', 'tourDone', 'sparksGiven', 'noticeSeen', 'localNotes', 'read'];

  function freshPrefs() {
    return {
      settings: {
        mode: 'system', seed: '#6750a4', variant: 'tonalSpot', themeNooks: true, tintPosts: true,
        calm: false, compact: false, sort: 'hot', breakMinutes: 0, reduceMotion: false, haptics: true,
      },
      saved: [], collections: [], hidden: [], streak: { count: 0, last: '', best: 0 }, badges: {}, visited: [], recent: [],
      draft: null, tourDone: false, sparksGiven: 0, noticeSeen: false, localNotes: [], read: [],
    };
  }

  // the first time an account signs in here, the settings this browser had before accounts come along
  function earlierPrefs() {
    try {
      const old = JSON.parse(localStorage.getItem('nook-state-v1') || 'null');
      if (!old) return {};
      return { settings: old.settings, streak: old.streak, badges: old.badges, tourDone: old.tourDone, noticeSeen: old.noticeSeen, sparksGiven: old.sparksGiven };
    } catch (_) {
      return {};
    }
  }

  // a profile's pictures, as full addresses on the server
  const pictures = (u) => ({ photo: api.url(u.photo), photoGif: api.url(u.photoGif), banner: api.url(u.banner), bannerGif: api.url(u.bannerGif) });
  const meFrom = (me) => ({
    name: me.name, color: me.color, shape: me.shape, icon: me.icon || '', bio: me.bio || '', font: me.font || '', ...pictures(me),
    pronouns: me.pronouns || '', flag: me.flag || '', flags: me.flags || (me.flag ? [me.flag] : []), interests: me.interests || [], scheme: me.scheme || '', sticker: me.sticker || '',
    joinedAt: me.joinedAt || me.createdAt, role: me.role || 'member', badges: me.badges || [], calls: me.calls || 'on',
  });

  const saved = BOOT.prefs && BOOT.prefs.settings ? BOOT.prefs : Object.assign(earlierPrefs(), BOOT.prefs || {});
  const fresh = freshPrefs();
  const state = Object.assign(fresh, {});
  for (const key of PREF_KEYS) if (saved[key] != null) state[key] = saved[key];
  // only plain keys are copied, so a crafted "__proto__" in saved settings can't reach any object's prototype
  for (const [key, value] of Object.entries(saved.settings || {})) if (!['__proto__', 'constructor', 'prototype'].includes(key)) fresh.settings[key] = value;
  state.settings = fresh.settings;
  Object.assign(state, {
    me: meFrom(BOOT.me),
    joined: BOOT.joined.slice(),
    votes: {},
    cvotes: {},
    reacts: BOOT.mine.sparks || {},
    polls: BOOT.mine.polls || {},
    notes: BOOT.notes || [],
    friends: BOOT.friends || [],
    conversations: BOOT.conversations || [],
    // group chats (from 0.9.0): `seen` is the newest message already counted, so none is counted twice
    groups: (BOOT.groups || []).map((g) => Object.assign(g, { seen: g.last ? g.last.id : 0 })),
    following: [],
    // nests you can't post in for now (from 0.9.5), and the key for KLIPY's GIF search, once the owner sets one
    bannedFrom: BOOT.bannedFrom || [],
    gifs: BOOT.gifs || '',
    // the people you've blocked (a server without blocking sends no list, and the app offers none)
    blocked: BOOT.blocked || [],
    canBlock: Array.isArray(BOOT.blocked),
  });
  for (const [target, value] of Object.entries(BOOT.mine.votes || {})) (target.startsWith('c') ? state.cvotes : state.votes)[target] = value;

  let saveTimer = 0;
  const prefsNow = () => Object.fromEntries(PREF_KEYS.map((key) => [key, state[key]]));
  function saveNow(keepalive = false) {
    clearTimeout(saveTimer);
    saveTimer = 0;
    api.put('/api/prefs', { prefs: prefsNow() }, { keepalive }).catch((error) => emit('error', error));
    return true;
  }
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 1200);
  };
  window.addEventListener('pagehide', () => saveTimer && saveNow(true));

  // ---- the shared model --------------------------------------------------------------------------------

  const communities = new Map();
  const members = Object.assign({}, BOOT.members);
  const users = new Map();
  const posts = new Map();
  const commentsByPost = new Map();
  const commentsById = new Map();
  const removed = new Set();
  const threads = new Map();

  for (const c of DATA.communities) communities.set(c.id, Object.assign({ starter: true }, c));

  function ingestUser(u) {
    users.set(u.name.toLowerCase(), Object.assign({}, u, pictures(u)));
  }
  function ingestNook(c) {
    communities.set(c.id, c);
  }
  function ingestPost(p) {
    if (p.removed) {
      removed.add(p.id);
      posts.delete(p.id);
      return;
    }
    if (p.image) p.image = api.url(p.image);
    const had = posts.get(p.id);
    if (had) Object.assign(had, p);
    else posts.set(p.id, p);
  }
  function ingestComment(c) {
    if (c.removed) removed.add(c.id);
    const had = commentsById.get(c.id);
    if (had) return Object.assign(had, c);
    commentsById.set(c.id, c);
    if (!commentsByPost.has(c.postId)) commentsByPost.set(c.postId, []);
    commentsByPost.get(c.postId).push(c);
    return c;
  }

  for (const u of BOOT.users) ingestUser(u);
  for (const c of BOOT.nooks) ingestNook(c);
  for (const p of BOOT.posts) ingestPost(p);
  for (const c of BOOT.comments) ingestComment(c);

  // ---- reading ---------------------------------------------------------------------------------------

  const uid = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isMe = (name) => name === ME || (!!name && name.toLowerCase() === state.me.name.toLowerCase());
  const userName = (name) => (name === ME ? state.me.name : name);
  const isAdmin = () => state.me.role === 'admin';
  // a developer can give people the Tester badge
  const isDev = () => state.me.badges.includes('dev');

  function user(name) {
    if (isMe(name)) return Object.assign({}, state.me, { me: true });
    const known = name && users.get(String(name).toLowerCase());
    if (known) return Object.assign({}, known);
    return { name: name || '[deleted]', color: '#79747e', shape: 'circle', icon: '', photo: '', photoGif: '', banner: '', bannerGif: '', bio: '', unknown: true };
  }
  const people = () => [...users.values()].filter((u) => !u.banned);

  const community = (id) => communities.get(id) || null;
  const allCommunities = () => [...communities.values()];
  const post = (id) => posts.get(id) || null;
  const isRemoved = (id) => removed.has(id);

  function visiblePosts() {
    return [...posts.values()].filter((p) => !removed.has(p.id) && communities.has(p.n));
  }

  function comments(postId) {
    return (commentsByPost.get(postId) || []).filter((c) => !removed.has(c.id) || hasLiveReplies(c));
  }
  function hasLiveReplies(c) {
    return (commentsByPost.get(c.postId) || []).some((r) => r.parentId === c.id && !removed.has(r.id));
  }
  const commentCount = (postId) => (commentsByPost.get(postId) || []).filter((c) => !removed.has(c.id)).length;

  // scores are the votes people actually gave, as the server counts them
  const score = (p) => p.score || 0;
  const commentScore = (c) => c.score || 0;

  function sparks(p) {
    const mine = state.reacts[p.id] || {};
    const counts = p.sparks || {};
    return SPARKS.map((s) => ({ ...s, count: counts[s.id] || 0, mine: !!mine[s.id] }));
  }
  const sparkTotal = (p) => sparks(p).reduce((sum, s) => sum + s.count, 0);

  function pollResults(p) {
    const chosen = state.polls[p.id];
    const options = p.poll.options.map(([text, votes], index) => ({ text, votes, index }));
    const total = options.reduce((sum, o) => sum + o.votes, 0);
    return { options, total, chosen };
  }

  function hot(p) {
    const s = score(p) + sparkTotal(p) * 0.3 + commentCount(p.id) * 3;
    const order = Math.log10(Math.max(Math.abs(s), 1));
    return Math.sign(s) * order + p.createdAt / 1000 / 45000;
  }

  const SORTS = {
    hot: (a, b) => hot(b) - hot(a),
    new: (a, b) => b.createdAt - a.createdAt,
    top: (a, b) => score(b) - score(a),
    rising: (a, b) => {
      const rate = (p) => (score(p) + commentCount(p.id) * 5) / Math.pow((Date.now() - p.createdAt) / 3600000 + 2, 1.8);
      return rate(b) - rate(a);
    },
  };

  function feed({ nook = null, joinedOnly = false, author = null, sort = 'hot', flair = null } = {}) {
    let list = visiblePosts().filter((p) => !state.hidden.includes(p.id) && !isBlocked(p.author));
    if (nook) list = list.filter((p) => p.n === nook);
    if (joinedOnly) list = list.filter((p) => state.joined.includes(p.n));
    if (author) list = list.filter((p) => p.author.toLowerCase() === author.toLowerCase());
    if (flair) list = list.filter((p) => p.flair === flair);
    list.sort(SORTS[sort] || SORTS.hot);
    if (nook) list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return list;
  }

  function sortComments(list, sort) {
    if (sort === 'new') return list.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'top') return list.sort((a, b) => commentScore(b) - commentScore(a));
    // best: score, with a gentle lift for what is new and for your own
    return list.sort((a, b) => {
      const rank = (c) => commentScore(c) / Math.pow((Date.now() - c.createdAt) / 3600000 + 2, 0.35) + (isMe(c.author) ? 1e6 : 0);
      return rank(b) - rank(a);
    });
  }

  /** a thread's best moments: what everyone upvoted, what the poster said back */
  function highlights(p) {
    const all = comments(p.id).filter((c) => !removed.has(c.id));
    if (all.length < 5) return null;
    const top = [...all].sort((a, b) => commentScore(b) - commentScore(a)).slice(0, 3);
    const op = all.filter((c) => c.author === p.author && !top.includes(c)).sort((a, b) => commentScore(b) - commentScore(a))[0];
    const people = new Set(all.map((c) => c.author)).size;
    return { top, op, people, total: all.length };
  }

  function userStats(name) {
    const lower = String(userName(name)).toLowerCase();
    const own = visiblePosts().filter((p) => p.author.toLowerCase() === lower);
    const said = [...commentsById.values()].filter((c) => !removed.has(c.id) && c.author.toLowerCase() === lower && posts.has(c.postId));
    // feathers: what Budgie calls the votes someone's posts and comments have earned (karma, elsewhere)
    const feathers = own.reduce((sum, p) => sum + score(p), 0) + said.reduce((sum, c) => sum + commentScore(c), 0);
    return { posts: own, comments: said, feathers };
  }

  /** what you've posted lately, for the spam rules */
  function history() {
    const t = Date.now();
    return {
      posts: visiblePosts().filter((p) => isMe(p.author) && t - p.createdAt < 86400000).map((p) => ({ title: p.title, createdAt: p.createdAt })),
      comments: [...commentsById.values()].filter((c) => !removed.has(c.id) && isMe(c.author) && t - c.createdAt < 3600000).map((c) => ({ postId: c.postId, body: c.body, createdAt: c.createdAt })),
    };
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return { posts: [], nooks: [], people: [] };
    const has = (text) => (text || '').toLowerCase().includes(q);
    const found = visiblePosts().filter((p) => !state.hidden.includes(p.id) && !isBlocked(p.author) && (has(p.title) || has(p.body) || has(p.flair)));
    found.sort((a, b) => (has(b.title) ? 1 : 0) - (has(a.title) ? 1 : 0) || SORTS.hot(a, b));
    const nooks = allCommunities().filter((c) => has(c.id) || has(c.title) || has(c.tagline) || has(c.category));
    const found2 = people().filter((u) => has(u.name) || has(u.bio)).map((u) => user(u.name));
    return { posts: found, nooks, people: found2 };
  }

  const membersOf = (c) => members[c.id] || 0;

  /** how busy a nook really is: its posts and comments over the last week */
  function activity(c) {
    const since = Date.now() - 7 * 86400000;
    const list = visiblePosts().filter((p) => p.n === c.id);
    const said = list.flatMap((p) => (commentsByPost.get(p.id) || []).filter((x) => !removed.has(x.id)));
    const week = list.filter((p) => p.createdAt > since).length + said.filter((x) => x.createdAt > since).length;
    const mood = week >= 20 ? 'Buzzing' : week >= 8 ? 'Lively' : week >= 1 ? 'Chill' : 'Quiet';
    return { week, posts: list.length, comments: said.length, level: Math.min(1, week / 20), mood };
  }

  // ---- notifications: the server's, plus badges earned here ------------------------------------------------

  const notifications = () => [...state.notes, ...state.localNotes].sort((a, b) => b.createdAt - a.createdAt);
  const isRead = (n) => n.read || state.read.includes(n.id);
  const unread = () => notifications().filter((n) => !isRead(n)).length;

  function notify(note) {
    const full = Object.assign({ id: uid('note'), createdAt: Date.now(), kind: 'system', symbol: 'notifications', shape: 'cookie9' }, note);
    state.localNotes = [full, ...state.localNotes].slice(0, 30);
    save();
    emit('notify', full);
    return full;
  }

  function markRead(id) {
    const server = [];
    for (const n of notifications()) {
      if (id && n.id !== id) continue;
      if (isRead(n)) continue;
      if (/^n\d+$/.test(n.id)) {
        n.read = true;
        server.push(n.id);
      } else state.read.push(n.id);
    }
    state.read = state.read.slice(-200);
    if (server.length) api.post('/api/notes/read', id ? { ids: server } : { all: true }).catch((error) => emit('error', error));
    save();
  }

  // ---- events (the app listens) -------------------------------------------------------------------------

  const listeners = new Map();
  function on(type, fn) {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type).add(fn);
  }
  function emit(type, detail) {
    for (const fn of listeners.get(type) || []) {
      try {
        fn(detail);
      } catch (error) {
        console.error('budgie:', type, error);
      }
    }
  }

  // ---- badges and streaks --------------------------------------------------------------------------------

  const dayKey = (time) => {
    const d = new Date(time);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function touchStreak() {
    const today = dayKey(Date.now());
    const s = state.streak;
    if (s.last === today) return s;
    const yesterday = dayKey(Date.now() - 86400000);
    s.count = s.last === yesterday ? s.count + 1 : 1;
    s.last = today;
    s.best = Math.max(s.best || 0, s.count);
    save();
    return s;
  }

  function award(id) {
    if (state.badges[id]) return null;
    const badge = BADGES.find((b) => b.id === id);
    if (!badge) return null;
    state.badges[id] = Date.now();
    save();
    notify({ kind: 'badge', symbol: badge.symbol, shape: badge.shape, text: `Badge unlocked: ${badge.name}. ${badge.desc}.`, href: '#/u/' + state.me.name });
    emit('badge', badge);
    return badge;
  }

  function checkBadges() {
    award('hello');
    if (state.streak.count >= 3) award('streak3');
    if (state.streak.count >= 7) award('streak7');
    const mine = userStats(state.me.name);
    if (mine.posts.length) award('firstpost');
    if (mine.comments.length >= 5) award('chatty');
    if (state.joined.length >= 8) award('joiner');
    if (state.visited.length >= 6) award('explorer');
    if (Object.keys(state.polls).length) award('pollster');
    if (state.sparksGiven >= 10) award('sparky');
    if (state.collections.length) award('curator');
    if (allCommunities().some((c) => (c.mods || []).some(isMe))) award('founder');
    if (state.friends.some((f) => f.status === 'friends')) award('friendly');
  }

  // ---- changing things: shown at once, undone if the server says no -------------------------------------------

  /** the server said no: undo, and tell the app why */
  const refused = (undo) => (error) => {
    undo();
    emit('error', error);
    emit('changed');
  };

  function setVote(map, id, value) {
    if (value) map[id] = value;
    else delete map[id];
  }

  function vote(postId, dir) {
    const p = posts.get(postId);
    const was = state.votes[postId] || 0;
    const next = was === dir ? 0 : dir;
    setVote(state.votes, postId, next);
    if (p) p.score = (p.score || 0) + next - was;
    api
      .post('/api/votes', { id: postId, dir: next })
      .then((r) => p && (p.score = r.score))
      .catch(refused(() => {
        setVote(state.votes, postId, was);
        if (p) p.score -= next - was;
      }));
    return next;
  }

  function voteComment(commentId, dir) {
    const c = commentsById.get(commentId);
    const was = state.cvotes[commentId] || 0;
    const next = was === dir ? 0 : dir;
    setVote(state.cvotes, commentId, next);
    if (c) c.score = (c.score || 0) + next - was;
    api
      .post('/api/votes', { id: commentId, dir: next })
      .then((r) => c && (c.score = r.score))
      .catch(refused(() => {
        setVote(state.cvotes, commentId, was);
        if (c) c.score -= next - was;
      }));
    return next;
  }

  function react(postId, kind) {
    const p = posts.get(postId);
    const mine = (state.reacts[postId] = state.reacts[postId] || {});
    const on = !mine[kind];
    const flip = (value) => {
      if (value) mine[kind] = true;
      else delete mine[kind];
      if (p) p.sparks = Object.assign({}, p.sparks, { [kind]: Math.max(0, ((p.sparks || {})[kind] || 0) + (value ? 1 : -1)) });
    };
    flip(on);
    if (on) state.sparksGiven++;
    save();
    checkBadges();
    api.post('/api/sparks', { post: postId, kind, on }).then((r) => p && (p.sparks = r.sparks)).catch(refused(() => flip(!on)));
    return on;
  }

  function votePoll(postId, index) {
    if (state.polls[postId] != null) return false;
    const p = posts.get(postId);
    state.polls[postId] = index;
    if (p && p.poll) p.poll.options[index][1]++;
    checkBadges();
    api
      .post('/api/polls', { post: postId, option: index })
      .then((r) => ingestPost(r.post))
      .catch(refused(() => {
        delete state.polls[postId];
        if (p && p.poll) p.poll.options[index][1]--;
      }));
    return true;
  }

  function toggle(list, id, on) {
    const has = state[list].includes(id);
    const want = on == null ? !has : on;
    if (want && !has) state[list].unshift(id);
    if (!want && has) state[list] = state[list].filter((x) => x !== id);
    save();
    return want;
  }

  function join(id, on) {
    const was = state.joined.includes(id);
    const joined = on == null ? !was : on;
    if (joined === was) return joined;
    state.joined = joined ? [id, ...state.joined] : state.joined.filter((x) => x !== id);
    members[id] = Math.max(0, (members[id] || 0) + (joined ? 1 : -1));
    checkBadges();
    emit('joined', { id, joined });
    api.post('/api/joins', { nook: id, on: joined }).then((r) => (members[id] = r.members)).catch(refused(() => {
      state.joined = was ? [id, ...state.joined.filter((x) => x !== id)] : state.joined.filter((x) => x !== id);
      members[id] = Math.max(0, (members[id] || 0) + (joined ? -1 : 1));
    }));
    return joined;
  }
  const toggleSave = (id, on) => toggle('saved', id, on);
  const hide = (id, on) => toggle('hidden', id, on);

  function visit(nookId) {
    if (!state.visited.includes(nookId)) state.visited.push(nookId);
    state.recent = [nookId, ...state.recent.filter((x) => x !== nookId)].slice(0, 5);
    save();
    checkBadges();
  }

  async function createPost({ n, title, body, type, flair, link, image, poll, spoiler }) {
    const { post: p } = await api.post('/api/posts', { n, title, body, type, flair, link: link ? { url: link.url } : null, image, poll, spoiler });
    ingestPost(p);
    state.votes[p.id] = 1;
    state.draft = null;
    save();
    checkBadges();
    emit('posted', p);
    return p;
  }

  async function addOwnComment(postId, parentId, body) {
    const { comment } = await api.post('/api/comments', { postId, parentId: parentId || null, body });
    const c = ingestComment(comment);
    state.cvotes[c.id] = 1;
    checkBadges();
    emit('commented', c);
    return c;
  }

  async function editComment(id, body) {
    const { comment } = await api.patch('/api/comments/' + encodeURIComponent(id), { body });
    return ingestComment(comment);
  }

  /** deletes your own post or comment */
  async function remove(id) {
    const isPost = posts.has(id);
    await api.del((isPost ? '/api/posts/' : '/api/comments/') + encodeURIComponent(id));
    removed.add(id);
    if (!isPost) {
      const c = commentsById.get(id);
      if (c) Object.assign(c, { removed: true, body: '', author: '[deleted]' });
    }
  }

  async function createCommunity(fields) {
    const { nook } = await api.post('/api/nooks', fields);
    ingestNook(nook);
    if (!state.joined.includes(nook.id)) state.joined.unshift(nook.id);
    members[nook.id] = Math.max(1, members[nook.id] || 0);
    checkBadges();
    return nook;
  }

  function createCollection(name) {
    const palette = ['#e8467c', '#ff8a3d', '#3d7bff', '#00a6a6', '#8b5cf6', '#1db954', '#b98c00'];
    const shapes = ['flower', 'clover4', 'cookie9', 'gem', 'heart', 'sunny', 'puffy'];
    const index = state.collections.length;
    const col = { id: uid('col'), name, color: palette[index % palette.length], shape: shapes[index % shapes.length], posts: [], createdAt: Date.now() };
    state.collections.push(col);
    save();
    checkBadges();
    return col;
  }

  function collect(colId, postId, on) {
    const col = state.collections.find((c) => c.id === colId);
    if (!col) return false;
    const has = col.posts.includes(postId);
    const want = on == null ? !has : on;
    if (want && !has) col.posts.unshift(postId);
    if (!want && has) col.posts = col.posts.filter((x) => x !== postId);
    if (want) toggle('saved', postId, true);
    save();
    return want;
  }

  /** your profile: name, bio, colour, shape, icon, and photo or banner (data: URLs, with photoGif or bannerGif for a GIF, to change them; '' to remove) */
  async function updateProfile(fields) {
    const old = state.me.name;
    const { me } = await api.patch('/api/me', fields);
    state.me = meFrom(me);
    ingestUser(me);
    if (old !== me.name) {
      users.delete(old.toLowerCase());
      for (const p of posts.values()) if (p.author === old) p.author = me.name;
      for (const c of commentsById.values()) if (c.author === old) c.author = me.name;
      for (const n of state.localNotes) if (n.href) n.href = n.href.replace('#/u/' + old, '#/u/' + me.name);
      save();
    }
    emit('me', state.me);
    return state.me;
  }

  // ---- your account -------------------------------------------------------------------------------------------

  async function signOut() {
    if (saveTimer) saveNow(true);
    await api.post('/api/logout').catch(() => {});
    api.setToken(null);
  }
  const changePassword = (current, password) => api.post('/api/account/password', { current, password });
  const newRecoveryCode = (password) => api.post('/api/account/recovery', { password }).then((r) => r.recovery);
  const exportData = () => api.get('/api/account/export');
  async function deleteAccount(password) {
    await api.post('/api/account/delete', { password });
    api.setToken(null);
  }

  // ---- friends and messages -----------------------------------------------------------------------------------

  const friendStatus = (name) => {
    const f = state.friends.find((x) => x.name.toLowerCase() === String(name).toLowerCase());
    return f ? f.status : 'none';
  };
  const friends = (status = 'friends') => state.friends.filter((f) => f.status === status);

  async function befriend(name) {
    const { status } = await api.post('/api/friends', { name });
    state.friends = state.friends.filter((f) => f.name.toLowerCase() !== name.toLowerCase()).concat({ name: user(name).name, status, since: Date.now() });
    checkBadges();
    emit('friends');
    return status;
  }
  async function unfriend(name) {
    await api.del('/api/friends/' + encodeURIComponent(name));
    state.friends = state.friends.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
    emit('friends');
  }

  // ---- blocking: they can't message, call or befriend you, and what they write is kept out of your way --------------

  const isBlocked = (name) => !!name && state.blocked.some((n) => n.toLowerCase() === String(name).toLowerCase());
  async function block(name) {
    const r = await api.post('/api/blocks', { name });
    state.blocked = r.blocked;
    state.friends = state.friends.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
    emit('friends');
    emit('changed');
  }
  async function unblock(name) {
    const r = await api.del('/api/blocks/' + encodeURIComponent(name));
    state.blocked = r.blocked;
    emit('changed');
  }

  // ---- group chats -----------------------------------------------------------------------------------------------

  const groupThreads = new Map();
  const group = (id) => state.groups.find((g) => g.id === id) || null;
  const groupThread = (id) => groupThreads.get(id) || { messages: [], loaded: false, more: false };

  function putGroup(g) {
    const had = group(g.id);
    const seen = Math.max(had ? had.seen || 0 : 0, g.last ? g.last.id : 0);
    if (had) Object.assign(had, g, { seen });
    else state.groups.push(Object.assign(g, { seen }));
    const now = group(g.id);
    // a chat open right now stays read
    if (now.reading) now.unread = 0;
    return now;
  }

  function appendGroupMessage(m) {
    const t = groupThreads.get(m.group);
    if (t && !t.messages.some((x) => x.id === m.id)) t.messages.push(m);
    const g = group(m.group);
    if (!g) return;
    if (!g.last || g.last.id <= m.id) g.last = m;
    if (!m.mine && m.id > (g.seen || 0) && !g.reading) g.unread = (g.unread || 0) + 1;
    g.seen = Math.max(g.seen || 0, m.id);
  }

  async function createGroup(name, members, look = {}) {
    const { group: g } = await api.post('/api/groups', Object.assign({ name, members }, look));
    putGroup(g);
    emit('groups');
    return group(g.id);
  }

  async function loadGroupThread(id, { older = false } = {}) {
    const t = groupThreads.get(id) || { messages: [], loaded: false, more: false };
    const before = older && t.messages.length ? `?before=${t.messages[0].id}` : '';
    const r = await api.get(`/api/groups/${encodeURIComponent(id)}/messages${before}`);
    t.messages = older ? [...r.messages, ...t.messages] : r.messages;
    t.loaded = true;
    t.more = r.more;
    groupThreads.set(id, t);
    return t;
  }

  /** `extra` is a picture ({ image, width, height }) or a GIF ({ gif }) going with the words */
  async function sendGroupMessage(id, body, extra = {}) {
    const { message } = await api.post(`/api/groups/${encodeURIComponent(id)}/messages`, Object.assign({ body }, extra));
    appendGroupMessage(message);
    emit('messages');
    return message;
  }

  function markGroupRead(id) {
    const g = group(id);
    if (!g) return;
    // while a group is open its news never counts as unread here, so the server still needs telling
    const upTo = g.last && !g.last.mine ? g.last.id : 0;
    if (!g.unread && upTo <= (g.readTo || 0)) return;
    g.readTo = Math.max(g.readTo || 0, upTo);
    g.unread = 0;
    emit('messages');
    api.post(`/api/groups/${encodeURIComponent(id)}/read`, {}).catch((error) => emit('error', error));
  }

  /** a change to a group: the group as it is now, and the chat line saying so comes with the next sync */
  async function changedGroup(request) {
    const { group: g } = await request;
    putGroup(g);
    emit('groups');
    sync();
    return group(g.id);
  }
  const renameGroup = (id, fields) => changedGroup(api.patch(`/api/groups/${encodeURIComponent(id)}`, fields));
  const addToGroup = (id, names) => changedGroup(api.post(`/api/groups/${encodeURIComponent(id)}/members`, { names }));
  const removeFromGroup = (id, name) => changedGroup(api.del(`/api/groups/${encodeURIComponent(id)}/members/${encodeURIComponent(name)}`));
  async function leaveGroup(id) {
    await api.post(`/api/groups/${encodeURIComponent(id)}/leave`, {});
    state.groups = state.groups.filter((g) => g.id !== id);
    groupThreads.delete(id);
    emit('groups');
  }

  /** whether friends can call you */
  async function setCalls(on) {
    const r = await api.post('/api/settings/calls', { on });
    state.me.calls = r.calls;
    return r.calls;
  }

  /** a developer gives someone the Tester badge, or takes it away */
  async function giveBadge(name, badge, on) {
    const { user: u } = await api.post('/api/badges', { name, badge, on });
    ingestUser(u);
  }

  const thread = (name) => threads.get(String(name).toLowerCase()) || { messages: [], loaded: false, more: false };
  const conversation = (name) => state.conversations.find((c) => c.with.toLowerCase() === String(name).toLowerCase()) || null;
  const unreadMessages = () => state.conversations.reduce((sum, c) => sum + (c.unread || 0), 0) + state.groups.reduce((sum, g) => sum + (g.unread || 0), 0);

  function appendMessage(m) {
    const other = m.mine ? m.to : m.from;
    const key = other.toLowerCase();
    const t = threads.get(key);
    if (t && !t.messages.some((x) => x.id === m.id)) t.messages.push(m);
    let c = conversation(other);
    if (!c) {
      c = { with: other, last: m, unread: 0 };
      state.conversations.unshift(c);
    }
    if (!c.last || c.last.id <= m.id) c.last = m;
    if (!m.mine && !m.read && m.id > (c.seen || 0)) c.unread = (c.unread || 0) + 1;
    c.seen = Math.max(c.seen || 0, m.id);
    state.conversations.sort((a, b) => (b.last ? b.last.id : 0) - (a.last ? a.last.id : 0));
  }

  async function loadThread(name, { older = false } = {}) {
    const key = String(name).toLowerCase();
    const t = threads.get(key) || { messages: [], loaded: false, more: false };
    const before = older && t.messages.length ? `&before=${t.messages[0].id}` : '';
    const r = await api.get(`/api/messages?with=${encodeURIComponent(name)}${before}`);
    t.messages = older ? [...r.messages, ...t.messages] : r.messages;
    t.loaded = true;
    t.more = r.more;
    threads.set(key, t);
    return t;
  }

  async function sendMessage(name, body, extra = {}) {
    const { message } = await api.post('/api/messages', Object.assign({ to: name, body }, extra));
    appendMessage(message);
    emit('messages');
    return message;
  }

  function markThreadRead(name) {
    const c = conversation(name);
    if (!c || !c.unread) return;
    c.unread = 0;
    emit('messages');
    api.post('/api/messages/read', { with: name }).catch((error) => emit('error', error));
  }

  // ---- reports and moderation -------------------------------------------------------------------------------------

  const report = (kind, id, reason) => api.post('/api/reports', { kind, id, reason });
  const adminReports = () => api.get('/api/admin/reports').then((r) => r.reports);
  // parts: for a profile, just its 'photo' or 'banner' (from 1.0); none is the whole profile
  const resolveReport = (id, action, reason, parts) => api.post('/api/admin/resolve', { id, action, reason, parts });
  async function adminRemove(kind, id, reason, parts) {
    await api.post('/api/admin/remove', { kind, id, reason, parts });
    removed.add(id);
    if (kind === 'post') posts.delete(id);
  }
  const ban = (name, reason, on = true) => api.post('/api/admin/ban', { name, reason, on });

  // ---- running a nest: its team, rules, pins, bans and reports (from 0.9.5) -------------------------------------

  const NEST_PERMS = ['pin', 'remove', 'ban', 'rules', 'team'];
  const NEST_ROLES = { admin: ['pin', 'remove', 'ban', 'rules', 'team'], moderator: ['pin', 'remove', 'ban'], helper: ['pin', 'remove'] };
  const ROLE_LABELS = { owner: 'Owner', admin: 'Admin', moderator: 'Moderator', helper: 'Helper' };
  /** what you may do in a nest: everything as its owner or one of Budgie's admins, your role's share on its team */
  function nestPerms(c) {
    if (!c) return [];
    if (isAdmin() || (c.owner && isMe(c.owner))) return NEST_PERMS;
    const t = (c.team || []).find((m) => isMe(m.name));
    return t ? t.perms : [];
  }
  const nestCan = (c, perm) => nestPerms(c).includes(perm);
  /** someone's role in a nest, for the tag by their name: { label, role } or null */
  function nestRole(c, name) {
    if (!c || !name) return null;
    const lower = String(userName(name)).toLowerCase();
    if (c.owner && c.owner.toLowerCase() === lower) return { label: 'Owner', role: 'owner' };
    const t = (c.team || []).find((m) => m.name.toLowerCase() === lower);
    return t ? { label: t.title || ROLE_LABELS[t.role] || 'Team', role: t.role } : null;
  }
  const bannedFrom = (nook) => state.bannedFrom.find((b) => b.nook === nook && (!b.until || b.until > Date.now())) || null;
  const nestPath = (id) => `/api/nooks/${encodeURIComponent(id)}`;
  const nestChanged = ({ nook }) => {
    ingestNook(nook);
    emit('changed');
    return nook;
  };
  const manageNest = (id) => api.get(nestPath(id) + '/manage');
  const setNestRole = (id, name, fields) => api.put(`${nestPath(id)}/team/${encodeURIComponent(name)}`, fields).then(nestChanged);
  const removeNestRole = (id, name) => api.del(`${nestPath(id)}/team/${encodeURIComponent(name)}`).then(nestChanged);
  const editNest = (id, fields) => api.patch(nestPath(id), fields).then(nestChanged);
  const banFromNest = (id, name, reason, days) => api.post(nestPath(id) + '/bans', { name, reason, days });
  const unbanFromNest = (id, name) => api.del(`${nestPath(id)}/bans/${encodeURIComponent(name)}`);
  const dismissNestReport = (id, reportId) => api.post(`${nestPath(id)}/reports/${reportId}/dismiss`, {});
  async function pinPost(id, on) {
    const { post } = await api.post(`/api/posts/${encodeURIComponent(id)}/pin`, { on });
    ingestPost(post);
    return post;
  }
  async function nestRemove(nook, kind, id, reason) {
    await api.post(nestPath(nook) + '/remove', { kind, id, reason });
    removed.add(id);
    if (kind === 'post') posts.delete(id);
  }

  // ---- keeping up: what changed on the server since we last asked ------------------------------------------------

  let cursor = { rev: BOOT.rev, note: BOOT.note, msg: BOOT.msg, gmsg: BOOT.gmsg || 0 };
  let syncing = null;

  function sync() {
    if (syncing) return syncing;
    syncing = api
      .get(`/api/updates?rev=${cursor.rev}&note=${cursor.note}&msg=${cursor.msg}&gmsg=${cursor.gmsg}`)
      .then((d) => {
        cursor = { rev: d.rev, note: d.note, msg: d.msg, gmsg: d.gmsg || cursor.gmsg };
        const news = { posts: [], comments: [], removed: [], changed: [], touched: [] };
        for (const u of d.users) ingestUser(u);
        for (const c of d.nooks) ingestNook(c);
        Object.assign(members, d.members);
        for (const p of d.posts) {
          const isNew = !posts.has(p.id) && !removed.has(p.id);
          ingestPost(p);
          if (p.removed) news.removed.push(p.id);
          else if (isNew && !isMe(p.author)) news.posts.push(p);
          else if (!isNew) news.changed.push(p.id);
        }
        for (const c of d.comments) {
          const isNew = !commentsById.has(c.id);
          ingestComment(c);
          if (isNew && !c.removed && !isMe(c.author)) news.comments.push(c);
          else if (!isNew) news.touched.push(c.id);
          if (c.removed) news.removed.push(c.id);
        }
        if (d.me) state.me = meFrom(d.me);
        if (d.blocked && JSON.stringify(d.blocked) !== JSON.stringify(state.blocked)) {
          state.blocked = d.blocked;
          news.blocked = true;
        }
        const friendsBefore = JSON.stringify(state.friends);
        state.friends = d.friends;
        if (JSON.stringify(state.friends) !== friendsBefore) {
          checkBadges();
          emit('friends');
        }
        for (const n of d.notes) {
          if (state.notes.some((x) => x.id === n.id)) continue;
          state.notes.unshift(n);
          emit('notify', n);
        }
        state.notes = state.notes.slice(0, 200);
        for (const m of d.messages) appendMessage(m);
        if (d.conversations) {
          // the server's unread counts win, but a thread open right now stays read
          for (const c of d.conversations) {
            const had = conversation(c.with);
            if (had && had.unread === 0 && had.reading) c.unread = 0;
          }
          state.conversations = d.conversations.map((c) => Object.assign(conversation(c.with) || {}, c));
        }
        // how far each friend has read: your messages up to there are "Seen"
        let seen = false;
        for (const [name, upTo] of Object.entries(d.seen || {})) {
          const t = threads.get(name.toLowerCase());
          for (const m of t ? t.messages : []) {
            if (m.mine && !m.read && m.id <= upTo) seen = m.read = true;
          }
        }
        if (d.messages.length || seen) emit('messages', d.messages.filter((m) => !m.mine));
        // group chats: what was said, groups that changed, and any you're no longer in
        if (d.groupIds) {
          const before = state.groups.length;
          for (const g of d.groups || []) putGroup(g);
          for (const m of d.gmessages || []) appendGroupMessage(m);
          state.groups = state.groups.filter((g) => d.groupIds.includes(g.id));
          if ((d.groups || []).length || state.groups.length !== before) emit('groups');
          if ((d.gmessages || []).length) emit('gmessages', d.gmessages.filter((m) => !m.mine));
        }
        // calls ringing for you, for when the live connection can't say so itself
        if ((d.ringing || []).length) emit('ringing', d.ringing);
        emit('synced', news);
        // blocked or unblocked on another device: the page is drawn again without (or with) them
        if (news.blocked) emit('changed');
      })
      .catch((error) => emit('sync-failed', error))
      .finally(() => (syncing = null));
    return syncing;
  }

  setInterval(() => document.visibilityState === 'visible' && sync(), SYNC_EVERY);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && sync());

  Nook.store = {
    ME, VERSION, SPARKS, BADGES, state, save, saveNow, on, emit, uid,
    isMe, isAdmin, isDev, giveBadge, setCalls, userName, user, people,
    group, groupThread, createGroup, loadGroupThread, sendGroupMessage, markGroupRead, renameGroup, addToGroup, removeFromGroup, leaveGroup, community, allCommunities, post, visiblePosts, comments, commentsById,
    commentCount, score, commentScore, sparks, sparkTotal, pollResults, feed, sortComments, highlights,
    userStats, history, search, membersOf, activity, notifications, isRead, unread, notify, touchStreak, checkBadges, award,
    vote, voteComment, react, votePoll, join, toggleSave, hide, visit, createPost,
    addOwnComment, editComment, remove, isRemoved, createCommunity, createCollection, collect, updateProfile,
    markRead, signOut, changePassword, newRecoveryCode, exportData, deleteAccount,
    friendStatus, friends, befriend, unfriend, isBlocked, block, unblock, thread, conversation, unreadMessages, loadThread, sendMessage, markThreadRead,
    NEST_PERMS, NEST_ROLES, ROLE_LABELS, nestPerms, nestCan, nestRole, bannedFrom, manageNest, setNestRole, removeNestRole, editNest, banFromNest, unbanFromNest,
    dismissNestReport, pinPost, nestRemove,
    report, adminReports, resolveReport, adminRemove, ban, sync,
  };
})();
