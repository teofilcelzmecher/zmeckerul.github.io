/*
 * Nook's store: the seed content merged with everything you have done, kept in
 * this browser's localStorage. Nothing here touches the page; views read from
 * it and app.js calls its mutations.
 */
(function () {
  'use strict';

  const Nook = (window.Nook = window.Nook || {});
  const DATA = window.NOOK_DATA;
  const KEY = 'nook-state-v1';
  const ME = '__me__';
  const BOOT = Date.now();

  const SPARKS = [
    { id: 'love', label: 'Love', symbol: 'favorite', shape: 'heart', burst: 'hearts' },
    { id: 'insight', label: 'Insightful', symbol: 'lightbulb', shape: 'sunny', burst: 'play' },
    { id: 'funny', label: 'Funny', symbol: 'sentiment_very_satisfied', shape: 'cookie9', burst: 'playlist' },
    { id: 'fire', label: 'Fire', symbol: 'local_fire_department', shape: 'softBurst', burst: 'play' },
    { id: 'wow', label: 'Wow', symbol: 'auto_awesome', shape: 'burst', burst: 'pin' },
  ];

  const BADGES = [
    { id: 'hello', name: 'Hello, Nook', desc: 'Visited Nook for the first time', shape: 'cookie9', symbol: 'waving_hand' },
    { id: 'streak3', name: 'Regular', desc: 'Kept a 3-day visit streak', shape: 'heart', symbol: 'local_fire_department' },
    { id: 'streak7', name: 'Devoted', desc: 'Kept a 7-day visit streak', shape: 'burst', symbol: 'whatshot' },
    { id: 'firstpost', name: 'First words', desc: 'Made your first post', shape: 'sunny', symbol: 'edit' },
    { id: 'chatty', name: 'Conversationalist', desc: 'Left 5 comments', shape: 'clover4', symbol: 'forum' },
    { id: 'joiner', name: 'Social butterfly', desc: 'Joined 8 nooks', shape: 'flower', symbol: 'diversity_3' },
    { id: 'explorer', name: 'Explorer', desc: 'Visited 6 different nooks', shape: 'arch', symbol: 'explore' },
    { id: 'pollster', name: 'Voice of the people', desc: 'Voted in a poll', shape: 'pill', symbol: 'how_to_vote' },
    { id: 'sparky', name: 'Sparky', desc: 'Gave 10 Sparks', shape: 'boom', symbol: 'auto_awesome' },
    { id: 'curator', name: 'Curator', desc: 'Made a collection', shape: 'gem', symbol: 'collections_bookmark' },
    { id: 'founder', name: 'Founder', desc: 'Created a nook', shape: 'softBurst', symbol: 'castle' },
  ];

  const ADJECTIVES = ['curious', 'sleepy', 'brave', 'gentle', 'sunny', 'quiet', 'clever', 'cosy', 'lucky', 'mellow'];
  const ANIMALS = ['otter', 'fox', 'heron', 'panda', 'lynx', 'robin', 'koala', 'badger', 'moth', 'newt'];
  const pick = (list) => list[Math.floor(Math.random() * list.length)];

  function freshState() {
    return {
      v: 2,
      me: {
        name: `${pick(ADJECTIVES)}_${pick(ANIMALS)}${Math.floor(10 + Math.random() * 89)}`,
        color: pick(['#6750a4', '#e8467c', '#ff8a3d', '#1db954', '#3d7bff', '#00a6a6']),
        shape: pick(['cookie9', 'flower', 'heart', 'clover4', 'puffy', 'sunny']),
        bio: '',
        joinedAt: BOOT,
      },
      settings: {
        mode: 'system', seed: '#6750a4', variant: 'tonalSpot', themeNooks: true, tintPosts: true,
        calm: false, compact: false, sort: 'hot', breakMinutes: 0, reduceMotion: false, haptics: true,
      },
      joined: ['nookhq', 'houseplants', 'homecooking', 'webdev', 'cozygames', 'nightsky', 'asknook'],
      votes: {},
      cvotes: {},
      reacts: {},
      polls: {},
      saved: [],
      collections: [],
      hidden: [],
      posts: [],
      comments: [],
      removed: [],
      communities: [],
      notes: [],
      read: [],
      streak: { count: 0, last: '', best: 0 },
      badges: {},
      visited: [],
      recent: [],
      draft: null,
      tourDone: false,
      sparksGiven: 0,
    };
  }

  function load() {
    const fresh = freshState();
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (saved && (saved.v === 1 || saved.v === 2)) {
        if (saved.v === 1) forgetMadeUp(saved);
        // anything added since this browser last saved takes its default
        return Object.assign(fresh, saved, {
          me: Object.assign(fresh.me, saved.me),
          settings: Object.assign(fresh.settings, saved.settings),
        });
      }
    } catch (_) {
      /* a broken save starts over */
    }
    return fresh;
  }

  /** an early save held replies the app made up; only what you wrote stays */
  function forgetMadeUp(saved) {
    const mine = new Set((saved.posts || []).map((p) => p.id));
    saved.comments = (saved.comments || []).filter((c) => c.author === ME && mine.has(c.postId));
    const kept = new Set(saved.comments.map((c) => c.id));
    for (const c of saved.comments) if (c.parentId && !kept.has(c.parentId)) c.parentId = null;
    // your comments count your own vote, as your posts do
    saved.cvotes = saved.cvotes || {};
    for (const c of saved.comments) if (!saved.cvotes[c.id]) saved.cvotes[c.id] = 1;
    for (const c of saved.comments) delete c.score;
    saved.notes = (saved.notes || []).filter((n) => n.kind !== 'reply' && n.kind !== 'event');
    delete saved.bells;
    delete saved.rsvps;
    for (const c of saved.communities || []) for (const key of ['members', 'online', 'activity', 'founded']) delete c[key];
    saved.v = 2;
  }

  const state = load();
  let saveTimer = 0;
  let quotaWarned = false;
  let wiped = false;

  function saveNow() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (wiped) return true;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (_) {
      if (!quotaWarned && window.M3) {
        quotaWarned = true;
        M3.snackbar('This browser’s storage is full, so your latest changes may not be kept. Try removing an image post.');
      }
      return false;
    }
  }
  const save = () => {
    if (!saveTimer && !wiped) saveTimer = setTimeout(saveNow, 120);
  };
  window.addEventListener('pagehide', () => saveTimer && saveNow());

  // ---- the model: the starter nooks + everything people write ----------------

  const communities = new Map();
  const posts = new Map();
  const commentsByPost = new Map();
  const commentsById = new Map();

  for (const c of DATA.communities) communities.set(c.id, Object.assign({ starter: true }, c));
  for (const c of state.communities) communities.set(c.id, c);

  function addComment(comment) {
    commentsById.set(comment.id, comment);
    if (!commentsByPost.has(comment.postId)) commentsByPost.set(comment.postId, []);
    commentsByPost.get(comment.postId).push(comment);
  }

  for (const p of state.posts) posts.set(p.id, p);
  for (const c of state.comments) addComment(c);

  // ---- reading ---------------------------------------------------------------

  const uid = (prefix) => prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isMe = (name) => name === ME || name === state.me.name;
  const userName = (name) => (name === ME ? state.me.name : name);

  function user(name) {
    if (isMe(name)) return { name: state.me.name, color: state.me.color, shape: state.me.shape, bio: state.me.bio, me: true };
    return { name, color: '#79747e', shape: 'circle', bio: '' };
  }

  const community = (id) => communities.get(id) || null;
  const allCommunities = () => [...communities.values()];
  const post = (id) => posts.get(id) || null;
  const isRemoved = (id) => state.removed.includes(id);

  function visiblePosts() {
    return [...posts.values()].filter((p) => !isRemoved(p.id) && communities.has(p.n));
  }

  function comments(postId) {
    return (commentsByPost.get(postId) || []).filter((c) => !isRemoved(c.id) || hasLiveReplies(c));
  }

  function hasLiveReplies(c) {
    return (commentsByPost.get(c.postId) || []).some((r) => r.parentId === c.id && !isRemoved(r.id));
  }

  const commentCount = (postId) => (commentsByPost.get(postId) || []).filter((c) => !isRemoved(c.id)).length;

  // scores are the votes people actually gave, nothing more
  const score = (p) => state.votes[p.id] || 0;
  const commentScore = (c) => state.cvotes[c.id] || 0;

  function sparks(p) {
    const mine = state.reacts[p.id] || {};
    return SPARKS.map((s) => ({ ...s, count: mine[s.id] ? 1 : 0, mine: !!mine[s.id] }));
  }
  const sparkTotal = (p) => sparks(p).reduce((sum, s) => sum + s.count, 0);

  function pollResults(p) {
    const chosen = state.polls[p.id];
    const options = p.poll.options.map(([text, votes], index) => ({ text, votes: votes + (chosen === index ? 1 : 0), index }));
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
    let list = visiblePosts().filter((p) => !state.hidden.includes(p.id));
    if (nook) list = list.filter((p) => p.n === nook);
    if (joinedOnly) list = list.filter((p) => state.joined.includes(p.n));
    if (author) list = list.filter((p) => userName(p.author) === author);
    if (flair) list = list.filter((p) => p.flair === flair);
    list.sort(SORTS[sort] || SORTS.hot);
    // a nook's pinned posts lead its own page
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
    const all = comments(p.id).filter((c) => !isRemoved(c.id));
    if (all.length < 5) return null;
    const top = [...all].sort((a, b) => commentScore(b) - commentScore(a)).slice(0, 3);
    const op = all.filter((c) => userName(c.author) === userName(p.author) && !top.includes(c)).sort((a, b) => commentScore(b) - commentScore(a))[0];
    const people = new Set(all.map((c) => userName(c.author))).size;
    return { top, op, people, total: all.length };
  }

  function userStats(name) {
    const own = visiblePosts().filter((p) => userName(p.author) === name);
    const said = [...commentsById.values()].filter((c) => userName(c.author) === name && !isRemoved(c.id));
    const karma = own.reduce((sum, p) => sum + score(p), 0) + said.reduce((sum, c) => sum + commentScore(c), 0);
    return { posts: own, comments: said, karma };
  }

  function search(query) {
    const q = query.trim().toLowerCase();
    if (!q) return { posts: [], nooks: [], people: [] };
    const has = (text) => (text || '').toLowerCase().includes(q);
    const found = visiblePosts().filter((p) => !state.hidden.includes(p.id) && (has(p.title) || has(p.body) || has(p.flair)));
    found.sort((a, b) => (has(b.title) ? 1 : 0) - (has(a.title) ? 1 : 0) || SORTS.hot(a, b));
    const nooks = allCommunities().filter((c) => has(c.id) || has(c.title) || has(c.tagline) || has(c.category));
    const people = [state.me.name].filter((name) => has(name) || has(user(name).bio)).map(user);
    return { posts: found, nooks, people };
  }

  // the people who joined: in this browser, that's you or nobody
  const membersOf = (c) => (state.joined.includes(c.id) ? 1 : 0);

  /** how busy a nook really is: its posts and comments over the last week */
  function activity(c) {
    const since = Date.now() - 7 * 86400000;
    const list = visiblePosts().filter((p) => p.n === c.id);
    const said = list.flatMap((p) => (commentsByPost.get(p.id) || []).filter((x) => !isRemoved(x.id)));
    const week = list.filter((p) => p.createdAt > since).length + said.filter((x) => x.createdAt > since).length;
    const mood = week >= 20 ? 'Buzzing' : week >= 8 ? 'Lively' : week >= 1 ? 'Chill' : 'Quiet';
    return { week, posts: list.length, comments: said.length, level: Math.min(1, week / 20), mood };
  }

  // ---- notifications ----------------------------------------------------------

  const notifications = () => [...state.notes].sort((a, b) => b.createdAt - a.createdAt);
  const unread = () => notifications().filter((n) => !state.read.includes(n.id)).length;

  function notify(note) {
    const full = Object.assign({ id: uid('note'), createdAt: Date.now(), kind: 'system', symbol: 'notifications', shape: 'cookie9' }, note);
    state.notes.unshift(full);
    state.notes = state.notes.slice(0, 60);
    save();
    emit('notify', full);
    return full;
  }

  // ---- events (the app listens) -------------------------------------------------

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
        console.error('nook:', type, error);
      }
    }
  }

  // ---- badges and streaks --------------------------------------------------------

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
    if (state.posts.some((p) => p.author === ME)) award('firstpost');
    if (state.comments.filter((c) => c.author === ME && !isRemoved(c.id)).length >= 5) award('chatty');
    if (state.joined.length >= 8) award('joiner');
    if (state.visited.length >= 6) award('explorer');
    if (Object.keys(state.polls).length) award('pollster');
    if (state.sparksGiven >= 10) award('sparky');
    if (state.collections.length) award('curator');
    if (state.communities.length) award('founder');
  }

  // ---- mutations ---------------------------------------------------------------

  function vote(postId, dir) {
    const was = state.votes[postId] || 0;
    const next = was === dir ? 0 : dir;
    if (next) state.votes[postId] = next;
    else delete state.votes[postId];
    save();
    return next;
  }

  function voteComment(commentId, dir) {
    const was = state.cvotes[commentId] || 0;
    const next = was === dir ? 0 : dir;
    if (next) state.cvotes[commentId] = next;
    else delete state.cvotes[commentId];
    save();
    return next;
  }

  function react(postId, kind) {
    const mine = (state.reacts[postId] = state.reacts[postId] || {});
    mine[kind] = !mine[kind];
    if (!mine[kind]) delete mine[kind];
    else state.sparksGiven++;
    if (!Object.keys(mine).length) delete state.reacts[postId];
    save();
    checkBadges();
    return !!(state.reacts[postId] && state.reacts[postId][kind]);
  }

  function votePoll(postId, index) {
    if (state.polls[postId] != null) return false;
    state.polls[postId] = index;
    save();
    checkBadges();
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

  const join = (id, on) => {
    const joined = toggle('joined', id, on);
    checkBadges();
    emit('joined', { id, joined });
    return joined;
  };
  const toggleSave = (id, on) => toggle('saved', id, on);
  const hide = (id, on) => toggle('hidden', id, on);

  function visit(nookId) {
    if (!state.visited.includes(nookId)) state.visited.push(nookId);
    state.recent = [nookId, ...state.recent.filter((x) => x !== nookId)].slice(0, 5);
    save();
    checkBadges();
  }

  function createPost({ n, title, body, type, flair, link, image, poll, spoiler }) {
    const p = {
      id: uid('p'), n, author: ME, createdAt: Date.now(), title, body: body || '', type: type || 'text',
      flair: flair || null, spoiler: !!spoiler,
    };
    if (type === 'link') p.link = link;
    if (type === 'image') p.image = image;
    if (type === 'poll') p.poll = { options: poll.map((text) => [text, 0]) };
    state.posts.unshift(p);
    posts.set(p.id, p);
    state.votes[p.id] = 1; // you upvote your own, as tradition demands
    state.draft = null;
    save();
    checkBadges();
    emit('posted', p);
    return p;
  }

  function addOwnComment(postId, parentId, body) {
    const c = { id: uid('c'), postId, parentId: parentId || null, author: ME, createdAt: Date.now(), body };
    state.comments.push(c);
    addComment(c);
    state.cvotes[c.id] = 1; // your own comment starts with your vote, as your posts do
    save();
    checkBadges();
    emit('commented', c);
    return c;
  }

  function editComment(id, body) {
    const c = commentsById.get(id);
    if (!c || !isMe(c.author)) return;
    c.body = body;
    c.edited = Date.now();
    save();
  }

  function remove(id) {
    if (!state.removed.includes(id)) state.removed.push(id);
    save();
  }

  function createCommunity(c) {
    const full = Object.assign(
      { rules: ['Be kind', 'Stay on topic'], flairs: ['Discussion', 'Question', 'Show off'], mods: [ME], createdAt: Date.now() },
      c
    );
    state.communities.push(full);
    communities.set(full.id, full);
    state.joined.unshift(full.id);
    save();
    checkBadges();
    return full;
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

  function renameMe(name) {
    const old = state.me.name;
    state.me.name = name;
    // your posts are written by "you", so they follow the new name; only links
    // to your old profile need pointing at the new one
    for (const note of state.notes) if (note.href) note.href = note.href.replace('#/u/' + old, '#/u/' + name);
    save();
  }

  function markRead(id) {
    if (id && !state.read.includes(id)) state.read.push(id);
    if (!id) for (const n of notifications()) if (!state.read.includes(n.id)) state.read.push(n.id);
    save();
  }

  function reset() {
    wiped = true;
    clearTimeout(saveTimer);
    try {
      localStorage.removeItem(KEY);
    } catch (_) {
      /* nothing to remove */
    }
  }

  Nook.store = {
    ME, BOOT, SPARKS, BADGES, state, save, saveNow, on, emit, uid,
    isMe, userName, user, community, allCommunities, post, visiblePosts, comments, commentsById,
    commentCount, score, commentScore, sparks, sparkTotal, pollResults, feed, sortComments, highlights,
    userStats, search, membersOf, activity, notifications, unread, notify, touchStreak, checkBadges, award,
    vote, voteComment, react, votePoll, join, toggleSave, hide, visit, createPost,
    addOwnComment, editComment, remove, isRemoved, createCommunity, createCollection, collect, renameMe,
    markRead, reset,
  };
})();
