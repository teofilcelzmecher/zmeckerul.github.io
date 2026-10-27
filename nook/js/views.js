/*
 * Nook's views. Each page is a function of its route params that returns
 * { title, html, mount(root), nook, brand }: markup first, then whatever
 * wiring that page needs once it is on screen. Shared pieces (post cards,
 * comment threads, rail cards) are here too; the actions they trigger live in
 * app.js and are found through data-act attributes.
 */
(function () {
  'use strict';

  const Nook = window.Nook;
  const store = Nook.store;
  const ui = Nook.ui;
  const { esc, md, plain, ago, num, plural, icon, avatar, nookIcon, highlight } = ui;
  const settings = () => store.state.settings;
  const app = () => Nook.app;

  const SORT_LABELS = { hot: ['Hot', 'local_fire_department'], new: ['New', 'new_releases'], top: ['Top', 'trending_up'], rising: ['Rising', 'rocket'] };

  // ---- small shared pieces ------------------------------------------------------

  function segmented(id, options, value, label) {
    return (
      `<div class="m3-segmented" id="${id}" role="radiogroup" aria-label="${esc(label)}">` +
      options
        .map(([val, text, symbol]) => `<button class="m3-segment" role="radio" aria-checked="${val === value}" value="${val}"${symbol ? ` data-symbol="${symbol}"` : ''}>${symbol ? icon(symbol) : ''}${esc(text)}</button>`)
        .join('') +
      '</div>'
    );
  }

  function sortControl(value, sorts = ['hot', 'new', 'top', 'rising']) {
    return segmented('sort', sorts.map((s) => [s, SORT_LABELS[s][0], SORT_LABELS[s][1]]), value, 'Sort posts');
  }

  const compactToggle = () =>
    `<button class="m3-icon-btn tonal" data-act="compact" aria-pressed="${settings().compact}" aria-label="Compact cards" data-tooltip="Compact cards"><span class="m3-icon">view_agenda</span></button>`;

  function empty(symbol, title, description, actions = '', shape = '') {
    return (
      `<div class="card"><div class="m3-empty" data-symbol="${symbol}" data-title="${esc(title)}" data-description="${esc(description)}"${shape ? ` data-shape="${shape}"` : ''}>` +
      (actions ? `<div class="toolbar" style="justify-content:center;margin-top:8px">${actions}</div>` : '') +
      '</div></div>'
    );
  }

  function joinButton(c, small = true) {
    const joined = store.state.joined.includes(c.id);
    return (
      `<button class="m3-btn ${joined ? 'tonal' : 'filled'}${small ? ' small' : ''}" data-act="join" data-nook="${c.id}" aria-pressed="${joined}">` +
      `${icon(joined ? 'check' : 'add')}<span>${joined ? 'Joined' : 'Join'}</span></button>`
    );
  }

  function voteBox(kind, id, score, dir, small) {
    const act = kind === 'post' ? 'vote' : 'cvote';
    return (
      `<div class="vote${small ? ' small' : ''}" data-dir="${dir || ''}" data-${kind}-id="${id}">` +
      `<button class="m3-icon-btn up" data-act="${act}" data-dir="1" data-effect="bounce" aria-pressed="${dir === 1}" aria-label="Upvote"><span class="m3-icon">shift</span></button>` +
      `<span class="score">${num(score)}</span>` +
      `<button class="m3-icon-btn down" data-act="${act}" data-dir="-1" data-effect="bounce" aria-pressed="${dir === -1}" aria-label="Downvote"><span class="m3-icon">shift</span></button>` +
      '</div>'
    );
  }

  function sparkChip(s) {
    return (
      `<button class="spark" data-act="react" data-kind="${s.id}" aria-pressed="${s.mine}" data-tooltip="${s.label}" aria-label="${s.label}: ${s.count}">` +
      `<m3-shape-icon shape="${s.shape}" symbol="${s.symbol}" size="24" icon-size="14"></m3-shape-icon><span class="n">${num(s.count)}</span></button>`
    );
  }

  function sparksRow(p) {
    const list = store.sparks(p).filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
    return `<div class="sparks">${list.map(sparkChip).join('')}</div>`;
  }

  function pollBlock(p, animateFrom) {
    const r = store.pollResults(p);
    const voted = r.chosen != null && !animateFrom;
    return (
      `<div class="poll${voted ? ' voted' : ''}">` +
      r.options
        .map((o) => {
          const pct = r.total ? Math.round((o.votes / r.total) * 100) : 0;
          const mine = r.chosen === o.index;
          return (
            `<button class="poll-opt${mine ? ' mine' : ''}" data-m3-ripple data-act="poll" data-i="${o.index}" style="--p:${pct}%"${r.chosen != null ? ' aria-disabled="true"' : ''}>` +
            `<span class="poll-bar"></span>${mine ? icon('check_circle', 'filled') : ''}<span class="poll-text">${esc(clean(o.text))}</span><span class="poll-pct">${pct}%</span></button>`
          );
        })
        .join('') +
      `<div class="poll-meta"><span class="count">${plural(r.total, 'vote')} · </span>${r.chosen != null ? 'You voted' : 'Pick one to see the results'}</div></div>`
    );
  }

  function art(p, size) {
    if (p.image) return `<div class="post-art photo"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></div>`;
    if (!p.art) return '';
    const a = p.art;
    return (
      `<div class="post-art" style="--a1:${a.from};--a2:${a.to};--ang:${a.angle || 150}deg" data-m3-stickers="${esc(p.id)}" data-count="6" data-min="40" data-max="150" data-strength="1.2" data-clip-radius="17" role="img" aria-label="Illustration for ${esc(p.title)}">` +
      `<m3-shape-icon shape="${a.shape}" symbol="${a.symbol}" size="${size}" icon-size="${Math.round(size * 0.46)}" aria-hidden="true"></m3-shape-icon></div>`
    );
  }

  function thumb(p) {
    if (p.image) return `<div class="post-thumb"><img src="${esc(p.image)}" alt="" loading="lazy"></div>`;
    if (p.art) return `<div class="post-thumb" style="--a1:${p.art.from};--a2:${p.art.to};--ang:${p.art.angle || 150}deg">${icon(p.art.symbol)}</div>`;
    const symbol = p.type === 'link' ? 'link' : p.type === 'poll' ? 'ballot' : 'notes';
    return `<div class="post-thumb plain">${icon(symbol)}</div>`;
  }

  // ---- the post card --------------------------------------------------------------

  function postCard(p, ctx = {}) {
    const c = store.community(p.n);
    const name = store.userName(p.author);
    const u = store.user(p.author);
    const open = !!ctx.open;
    const inNook = ctx.nook === p.n;
    const href = `#/n/${p.n}/p/${p.id}`;
    const dir = store.state.votes[p.id] || 0;
    const saved = store.state.saved.includes(p.id);
    const comments = store.commentCount(p.id);
    const when = new Date(p.createdAt);

    const head =
      '<header class="post-head">' +
      (inNook
        ? `${avatar(u, 24)}<a class="author" href="#/u/${esc(name)}">u/${esc(name)}</a>`
        : `<a class="nook-link" href="#/n/${c.id}">${nookIcon(c, 26, 15)}n/${esc(c.id)}</a><span class="dot"></span><a class="author" href="#/u/${esc(name)}">u/${esc(name)}</a>`) +
      `<span class="dot"></span><time datetime="${when.toISOString()}" title="${esc(when.toLocaleString())}">${ago(p.createdAt)}</time>` +
      (p.pinned && (inNook || open) ? `<span class="tag pin">${icon('push_pin')}Pinned</span>` : '') +
      (p.spoiler ? `<span class="tag">${icon('visibility_off')}Spoiler</span>` : '') +
      `<button class="m3-icon-btn small post-more" data-act="post-menu" aria-label="More options"><span class="m3-icon">more_horiz</span></button>` +
      '</header>';

    const title =
      `<h2 class="post-title" id="t-${p.id}">${p.flair ? `<span class="flair">${esc(p.flair)}</span> ` : ''}` +
      (open ? esc(clean(p.title)) : `<a href="${href}">${esc(clean(p.title))}</a>`) +
      '</h2>';

    const longBody = (p.body || '').length > 260 || (p.body || '').split('\n').length > 4;
    let media = '';
    if (p.type === 'link' && p.link) {
      media =
        `<a class="link-card" href="${esc(p.link.url)}" target="_blank" rel="noopener noreferrer">` +
        `<m3-shape-icon shape="cookie12" symbol="link" size="40" icon-size="20"></m3-shape-icon>` +
        `<span class="link-text"><b>${esc(p.link.title || p.link.url)}</b><small>${esc(p.link.domain)}</small></span>${icon('open_in_new')}</a>`;
    }
    const body = p.body ? `<div class="post-body md${open ? '' : ' preview'}${!open && longBody ? ' long' : ''}">${md(clean(p.body))}</div>` : '';
    const poll = p.type === 'poll' && p.poll ? pollBlock(p) : '';
    let content = art(p, open ? 150 : 116) + body + media + poll;
    if (p.spoiler) {
      content = `<div class="post-veil is-veiled">${content}<button class="m3-btn tonal veil-btn" data-act="unveil">${icon('visibility')}Show spoiler</button></div>`;
    }

    const actions =
      '<footer class="post-actions">' +
      voteBox('post', p.id, store.score(p), dir) +
      `<a class="m3-btn tonal act" href="${href}?focus=comments" aria-label="${plural(comments, 'comment')}">${icon('chat_bubble')}<span class="count">${num(comments)}</span></a>` +
      `<button class="m3-btn tonal act" data-act="spark-picker" aria-label="Add a Spark" data-tooltip="Spark it">${icon('add_reaction')}<span class="label-wide">Spark</span></button>` +
      `<button class="m3-btn tonal act" data-act="share" aria-label="Share">${icon('ios_share')}<span class="label-wide">Share</span></button>` +
      '<span class="spacer"></span>' +
      `<button class="m3-icon-btn" data-act="save" data-burst="pin" aria-pressed="${saved}" aria-label="Save" data-tooltip="${saved ? 'Saved' : 'Save'}"><span class="m3-icon">bookmark</span></button>` +
      '</footer>';

    const tint = !inNook ? ` data-tint="${c.color}"` : '';
    return (
      `<article class="post${open ? ' is-open' : ''}" data-post="${p.id}"${tint}${open ? '' : ` data-href="${href}" data-m3-ripple data-m3-bounce data-m3-hover-root`} aria-labelledby="t-${p.id}">` +
      head + title + thumb(p) + content + sparksRow(p) + actions +
      '</article>'
    );
  }

  // ---- feeds ---------------------------------------------------------------------------

  const PAGE = 8;

  /** the first page of a feed now, more as you scroll to its end */
  function mountFeed(root, list, ctx, emptyHTML) {
    const box = root.querySelector('[data-feed]');
    const more = root.querySelector('[data-more]');
    if (root._feedStop) root._feedStop();
    box.innerHTML = '';
    more.innerHTML = '';
    let shown = 0;
    let busy = false;
    if (!list.length) {
      box.innerHTML = emptyHTML || empty('search_off', 'Nothing here yet', 'Try another sort, or come back later.');
      return;
    }
    const add = (arrive) => {
      const next = list.slice(shown, shown + PAGE);
      box.insertAdjacentHTML('beforeend', next.map((p) => postCard(p, ctx)).join(''));
      const fresh = [...box.children].slice(shown);
      shown += next.length;
      ui.theme.tintAll(box);
      if (arrive) Nook.fx.stagger(fresh);
      if (shown >= list.length) {
        stop();
        more.innerHTML = `<div class="feed-end"><m3-wavy-line aria-hidden="true"></m3-wavy-line>You’re all caught up</div>`;
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[entries.length - 1].isIntersecting || busy || shown >= list.length) return;
        busy = true;
        // a beat for the loading shape to be seen morphing
        setTimeout(() => {
          busy = false;
          if (box.isConnected) add(true);
        }, 420);
      },
      { rootMargin: '300px' }
    );
    const stop = () => observer.disconnect();
    root._feedStop = stop;
    app().onLeave(stop);
    app().trackFeed(() => shown);
    // coming back to a feed, it shows as much as it did before
    const want = app().restoreCount();
    add(!want && !app().inTransition());
    while (shown < want && shown < list.length) add(false);
    if (shown < list.length) {
      more.innerHTML = '<m3-loading aria-label="Loading more posts"></m3-loading>';
      observer.observe(more);
    }
  }

  // strong language shows dotted out (f•••) unless the filter is switched off
  const clean = (text) => (settings().filterLanguage === false || !Nook.mod ? text : Nook.mod.soften(text));
  const feedShell = () => '<div class="feed" data-feed></div><div class="feed-more" data-more></div>';

  // ---- rail cards -------------------------------------------------------------------------

  function pulse(c) {
    const a = store.activity(c);
    return (
      `<div class="pulse"><m3-wavy-progress value="${a.level}"${a.week ? ' playing' : ''} aria-label="Activity: ${a.mood}"></m3-wavy-progress>` +
      `<span><b>${a.mood}</b> <span class="count">· ${a.week ? `${num(a.week)} new this week` : 'nothing new this week'}</span></span></div>`
    );
  }

  function aboutCard(c) {
    const a = store.activity(c);
    return (
      '<section class="card">' +
      `<h3 class="card-title">${nookIcon(c, 32, 18)}<span>About n/${esc(c.id)}</span></h3>` +
      `<p class="muted">${esc(c.description || c.tagline)}</p>` +
      `<div class="about-stats"><div><b class="count">${num(a.posts)}</b><span>Posts</span></div>` +
      `<div><b class="count">${num(a.comments)}</b><span>Comments</span></div></div>` +
      pulse(c) +
      `<div class="toolbar" style="margin-top:14px">${joinButton(c, false)}<a class="m3-btn outlined" href="#/submit?n=${c.id}">${icon('edit')}Post</a></div>` +
      '</section>'
    );
  }

  function rulesCard(c) {
    if (!c.rules || !c.rules.length) return '';
    return `<section class="card"><h3 class="card-title">${icon('gavel')}<span>Nook rules</span></h3><ol class="rules">${c.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol></section>`;
  }

  function modsCard(c) {
    const mods = (c.mods || []).map((name) => store.user(name));
    if (!mods.length) return '';
    return (
      `<section class="card"><h3 class="card-title">${icon('shield_person')}<span>Moderators</span></h3><div class="list">` +
      mods.map((u) => `<a class="row-link" href="#/u/${esc(u.name)}" data-m3-ripple data-m3-hover-root>${avatar(u, 32)}<span class="row-text"><b>u/${esc(u.name)}</b><small>${esc(u.bio || '')}</small></span></a>`).join('') +
      '</div></section>'
    );
  }

  function streakCard() {
    const s = store.state.streak;
    const milestones = [3, 7, 14, 30, 100, 365];
    const next = milestones.find((m) => m > s.count) || s.count + 1;
    const left = next - s.count;
    return (
      '<section class="card">' +
      `<div class="streak"><div class="streak-ring"><m3-squiggle progress="${(s.count / next).toFixed(3)}" thickness="5" aria-hidden="true"></m3-squiggle>${icon('local_fire_department')}</div>` +
      `<div class="streak-text"><b class="m3-title">${plural(s.count, 'day')} streak</b>` +
      `<span class="muted">${left} more day${left === 1 ? '' : 's'} to a ${next}-day streak. Best so far: ${s.best || s.count}.</span></div></div>` +
      '</section>'
    );
  }

  function trendingCard(limit = 5) {
    const list = store
      .allCommunities()
      .filter((c) => !store.state.joined.includes(c.id))
      .sort((a, b) => store.activity(b).week - store.activity(a).week)
      .slice(0, limit);
    if (!list.length) return '';
    return (
      `<section class="card"><h3 class="card-title">${icon('trending_up')}<span>Nooks you might like</span></h3><div class="list">` +
      list
        .map(
          (c) =>
            `<div class="row-link" data-href="#/n/${c.id}" tabindex="0" role="link" aria-label="n/${esc(c.id)}" data-m3-ripple data-m3-hover-root>${nookIcon(c, 36, 19)}<span class="row-text"><b>n/${esc(c.id)}</b><small>${esc(c.category)}</small></span>${joinButton(c)}</div>`
        )
        .join('') +
      `</div><a class="m3-btn text small" href="#/explore" style="margin-top:6px">${icon('explore')}See all nooks</a></section>`
    );
  }

  const footCard = () =>
    '<div class="foot-links">' +
    '<a href="#/settings">Settings</a><button type="button" data-act="shortcuts">Keyboard shortcuts</button>' +
    '<button type="button" data-act="about-nook">What’s Nook?</button><button type="button" data-act="credits">Credits</button><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="licenses.html">Licenses</a><a href="../m3/">Design system</a>' +
    '<span>Built with Material 3 Expressive. Everything you do is saved in this browser only.</span></div>';

  // ---- comments -------------------------------------------------------------------------------

  function commentHTML(c, kids, op) {
    const removed = store.isRemoved(c.id);
    const name = store.userName(c.author);
    const u = store.user(c.author);
    const mine = store.isMe(c.author);
    const dir = store.state.cvotes[c.id] || 0;
    const ghost = { name: '?', color: '#938f99', shape: 'ghostish' };
    return (
      `<div class="comment" id="c-${c.id}" data-comment="${c.id}">` +
      `<div class="c-side">${avatar(removed ? ghost : u, 30)}<button class="c-thread" data-act="collapse" aria-label="Collapse this thread"></button></div>` +
      '<div class="c-main">' +
      '<div class="c-head">' +
      (removed ? '<span>[deleted]</span>' : `<a class="author" href="#/u/${esc(name)}">${esc(name)}</a>`) +
      (!removed && op ? '<span class="tag op">OP</span>' : '') +
      (!removed && mine ? '<span class="tag">You</span>' : '') +
      `<span>· ${ago(c.createdAt)}</span>${c.edited && !removed ? '<span>· edited</span>' : ''}<span class="c-hidden"></span></div>` +
      `<div class="c-body md${removed ? ' removed' : ''}">${removed ? '<p>This comment was deleted.</p>' : md(clean(c.body))}</div>` +
      (removed
        ? ''
        : '<div class="c-actions">' +
          voteBox('comment', c.id, store.commentScore(c), dir, true) +
          `<button class="m3-btn text" data-act="reply">${icon('reply')}Reply</button>` +
          `<button class="m3-btn text" data-act="comment-share">${icon('ios_share')}Share</button>` +
          `<button class="m3-icon-btn small" data-act="comment-menu" aria-label="More options for this comment"><span class="m3-icon">more_horiz</span></button>` +
          '</div>') +
      '<div class="c-reply"></div></div>' +
      (kids ? `<div class="c-children">${kids}</div>` : '') +
      '</div>'
    );
  }

  function commentTree(p, sort) {
    const all = store.comments(p.id);
    const byParent = new Map();
    for (const c of all) {
      const key = c.parentId || '';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(c);
    }
    const op = store.userName(p.author);
    const render = (parentId) =>
      store
        .sortComments(byParent.get(parentId || '') || [], sort)
        .map((c) => commentHTML(c, render(c.id), store.userName(c.author) === op))
        .join('');
    return render(null);
  }

  function replyBox(placeholder, submitLabel, value = '') {
    return (
      '<form class="reply-box">' +
      `<textarea class="m3-field" rows="3" placeholder="${esc(placeholder)}" required>${esc(value)}</textarea>` +
      `<div class="row"><span class="hint">**bold** *italic* \`code\` ||spoiler|| > quote</span>` +
      `<button type="button" class="m3-btn text" data-act="reply-cancel">Cancel</button>` +
      `<button type="submit" class="m3-btn filled">${icon('send')}${esc(submitLabel)}</button></div></form>`
    );
  }

  function highlightsCard(p) {
    const h = store.highlights(p);
    if (!h) return '';
    const item = (c, why) => {
      const u = store.user(c.author);
      return `<li data-jump="${c.id}" tabindex="0">${avatar(u, 28)}<span class="hl-text"><small>${why} · u/${esc(u.name)}</small><span>${esc(plain(c.body, 140))}</span></span></li>`;
    };
    return (
      `<section class="highlights" id="highlights" data-m3-stickers="hl-${p.id}" data-count="3" data-min="50" data-max="110" data-clip-radius="23">` +
      `<div class="hl-head"><m3-shape-icon shape="softBurst" symbol="auto_awesome" size="40" icon-size="20" style="--m3-shape-icon-color:var(--m3-secondary);--m3-shape-icon-on-color:var(--m3-on-secondary)"></m3-shape-icon>` +
      `<div><b class="m3-title" style="font-size:var(--m3-fs-large)">Catch me up</b><small>${plural(h.total, 'comment')} from ${plural(h.people, 'person', 'people')}, boiled down</small></div>` +
      `<button class="m3-icon-btn small" data-act="hide-highlights" aria-label="Hide highlights"><span class="m3-icon">close</span></button></div>` +
      '<ol>' +
      h.top.map((c, i) => item(c, i === 0 ? 'Top comment' : 'Also loved')).join('') +
      (h.op ? item(h.op, 'The poster said') : '') +
      '</ol></section>'
    );
  }

  // ---- pages -------------------------------------------------------------------------------------

  function home() {
    const s = store.state;
    const name = s.me.name;
    const hello = !s.tourDone
      ? `<section class="hello" data-m3-stickers="hello-${name}" data-count="5" data-strength="1.3" data-clip-radius="30">` +
        `<button class="m3-icon-btn close" data-act="dismiss-hello" aria-label="Dismiss welcome"><span class="m3-icon">close</span></button>` +
        `<h1 class="m3-title">Welcome to Nook, ${esc(name)}!</h1>` +
        '<p>Every nook has its own colour and shape, and the app wears them as you move around. Join a few and Spark what you love.<span class="not-phone"> Press <kbd>?</kbd> for shortcuts.</span></p>' +
        `<div class="row"><button class="m3-btn filled" data-act="about-nook">${icon('tour')}What’s Nook?</button><a class="m3-btn tonal" href="#/explore">${icon('explore')}Find your nooks</a></div></section>`
      : '';
    return {
      title: 'Home',
      brand: 'cookie9',
      html:
        '<div class="page"><div class="col">' +
        hello +
        `<div class="composer">${avatar(store.user(store.ME), 40)}<a class="fake-input" href="#/submit" role="button">What’s on your mind, ${esc(name)}?</a>` +
        `<a class="m3-icon-btn" href="#/submit?type=image" aria-label="Post an image" data-tooltip="Image"><span class="m3-icon">image</span></a>` +
        `<a class="m3-icon-btn" href="#/submit?type=poll" aria-label="Start a poll" data-tooltip="Poll"><span class="m3-icon">ballot</span></a></div>` +
        `<div class="toolbar">${sortControl(s.settings.sort)}<span class="spacer"></span>${compactToggle()}</div>` +
        feedShell() +
        '</div><aside class="rail" aria-label="Sidebar">' +
        streakCard() +
        trendingCard() +
        footCard() +
        '</aside></div>',
      mount(root) {
        const render = () =>
          mountFeed(
            root,
            store.feed({ joinedOnly: true, sort: settings().sort }),
            {},
            s.joined.length
              ? empty('edit_note', 'It’s quiet in here', 'Nobody has posted in your nooks yet. Start the first conversation.', `<a class="m3-btn filled" href="#/submit">${icon('edit')}Create a post</a><a class="m3-btn tonal" href="#/explore">${icon('explore')}Explore nooks</a>`)
              : empty('diversity_3', 'Your home is empty', 'Join some nooks and their posts will show up here.', `<a class="m3-btn filled" href="#/explore">${icon('explore')}Explore nooks</a>`)
          );
        render();
        app().onSort(root, (sort) => {
          settings().sort = sort;
          store.save();
          render();
        });
      },
    };
  }

  function popular(params) {
    const sort = params.sort || 'hot';
    return {
      title: 'Popular',
      brand: 'softBurst',
      html:
        '<div class="page"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="softBurst" symbol="local_fire_department" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Popular</h1><span class="muted">The best of every nook, joined or not</span></div></div>` +
        `<div class="toolbar">${sortControl(sort)}<span class="spacer"></span>${compactToggle()}</div>` +
        feedShell() +
        `</div><aside class="rail">${trendingCard(6)}${footCard()}</aside></div>`,
      mount(root) {
        let current = sort;
        const render = () =>
          mountFeed(
            root,
            store.feed({ sort: current }),
            {},
            empty('local_fire_department', 'Nothing’s popular yet', 'Nook only shows what people really post. Start something and it could be the first thing here.', `<a class="m3-btn filled" href="#/submit">${icon('edit')}Create a post</a>`, 'softBurst')
          );
        render();
        app().onSort(root, (value) => {
          current = value;
          render();
        });
      },
    };
  }

  function community(params) {
    const c = store.community(params.nook);
    if (!c) return notFound(`There’s no nook called n/${params.nook}. Yet.`);
    const flairs = c.flairs || [];
    return {
      title: `${c.title} (n/${c.id})`,
      nook: c,
      brand: c.shape,
      html:
        '<div class="page"><div class="col">' +
        `<section class="nook-hero" data-m3-stickers="${c.id}" data-count="6" data-min="50" data-max="170" data-strength="1.3" data-clip-radius="30">` +
        '<div class="nook-hero-main">' +
        `<m3-shape-icon class="nook-avatar" shape="${c.shape}" hover-shape="${c.shape === 'heart' ? 'flower' : 'heart'}" symbol="${c.symbol}" size="104" icon-size="48"></m3-shape-icon>` +
        `<div class="nook-id"><h1 class="m3-title">${esc(c.title)}</h1><span class="muted">n/${esc(c.id)}<span class="count"> · ${plural(store.activity(c).posts, 'post')}</span></span></div>` +
        `<div class="nook-hero-actions">${joinButton(c, false)}` +
        `<button class="m3-icon-btn tonal" data-act="nook-menu" data-nook="${c.id}" aria-label="More" data-tooltip="More"><span class="m3-icon">more_horiz</span></button></div></div>` +
        `<p class="nook-tagline">${esc(c.tagline)}</p>` +
        pulse(c) +
        '</section>' +
        `<div class="toolbar">${sortControl('hot')}<span class="spacer"></span>` +
        `<button class="m3-btn tonal small only-tablet" data-act="nook-about" data-nook="${c.id}">${icon('info')}About</button>` +
        `<a class="m3-btn filled small" href="#/submit?n=${c.id}">${icon('edit')}Post</a>${compactToggle()}</div>` +
        (flairs.length
          ? `<div class="chips" role="group" aria-label="Filter by flair"><button class="chip" data-m3-ripple data-flair="" aria-pressed="true">All</button>${flairs.map((f) => `<button class="chip" data-m3-ripple data-flair="${esc(f)}" aria-pressed="false">${esc(f)}</button>`).join('')}</div>`
          : '') +
        feedShell() +
        `</div><aside class="rail">${aboutCard(c)}${rulesCard(c)}${modsCard(c)}${footCard()}</aside></div>`,
      mount(root) {
        let sort = 'hot';
        let flair = null;
        const render = () =>
          mountFeed(
            root,
            store.feed({ nook: c.id, sort, flair }),
            { nook: c.id },
            empty('edit_note', flair ? `No “${flair}” posts yet` : 'No posts yet', 'Be the first to start something here.', `<a class="m3-btn filled" href="#/submit?n=${c.id}">${icon('edit')}Write the first post</a>`)
          );
        render();
        store.visit(c.id);
        app().onSort(root, (value) => {
          sort = value;
          render();
        });
        root.querySelectorAll('.chip[data-flair]').forEach((chip) =>
          chip.addEventListener('click', () => {
            flair = chip.dataset.flair || null;
            root.querySelectorAll('.chip[data-flair]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
            render();
          })
        );
      },
    };
  }

  function postPage(params) {
    const p = store.post(params.post);
    if (!p || store.isRemoved(p.id) || !store.community(p.n)) return notFound('This post has drifted away, or it never was.');
    const c = store.community(p.n);
    const count = store.commentCount(p.id);
    return {
      title: p.title,
      nook: c,
      brand: c.shape,
      html:
        '<div class="page"><div class="col">' +
        `<div class="back-row"><button class="m3-toolbar-btn" data-act="back" data-effect="nudge-left" data-shape="cookie7" data-shape-still aria-label="Back" data-tooltip="Back"><span class="m3-icon">arrow_back</span></button>` +
        `<a class="nook-link" href="#/n/${c.id}" style="display:flex;align-items:center;gap:8px;font-weight:700">${nookIcon(c, 28, 16)}n/${esc(c.id)}</a></div>` +
        postCard(p, { open: true, nook: p.n }) +
        highlightsCard(p) +
        '<section class="card" id="comments">' +
        `<div class="toolbar" style="margin-bottom:12px"><h2 class="card-title" style="margin:0">${icon('forum')}<span>Comments <span class="count muted" id="comment-count">${num(count)}</span></span></h2><span class="spacer"></span>` +
        segmented('comment-sort', [['best', 'Best', 'star'], ['top', 'Top', 'trending_up'], ['new', 'New', 'new_releases']], 'best', 'Sort comments') +
        '</div>' +
        `<div id="top-reply">${replyBox('Add to the conversation…', 'Comment')}</div>` +
        `<div class="comments" id="comment-list">${commentTree(p, 'best')}</div>` +
        (count ? '' : `<div id="no-comments" class="muted" style="text-align:center;padding:20px">No comments yet. Say something nice!</div>`) +
        '</section>' +
        `</div><aside class="rail">${aboutCard(c)}${rulesCard(c)}</aside></div>`,
      mount(root) {
        store.visit(c.id);
        const list = root.querySelector('#comment-list');
        let sort = 'best';
        const sortEl = root.querySelector('#comment-sort');
        sortEl.addEventListener('change', (e) => {
          sort = e.detail.value;
          list.innerHTML = commentTree(p, sort);
        });
        root._rerenderComments = () => {
          list.innerHTML = commentTree(p, sort);
        };
        app().wireReplyBox(root.querySelector('#top-reply .reply-box'), p, null);
        if (params.focus === 'comments') requestAnimationFrame(() => root.querySelector('#comments').scrollIntoView({ block: 'start' }));
        if (params.c) app().jumpToComment(params.c);
      },
    };
  }

  function explore(params) {
    const cats = ['All', ...new Set(store.allCommunities().map((c) => c.category))];
    const cat = params.cat || 'All';
    const fresh = store
      .visiblePosts()
      .filter((p) => p.art || p.image)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10);
    const grid = (category) =>
      store
        .allCommunities()
        .filter((c) => category === 'All' || c.category === category)
        .map((c) => [c, store.activity(c)])
        .sort((x, y) => y[1].posts - x[1].posts)
        .map(
          ([c, a]) =>
            `<article class="nook-card" data-tint="${c.color}" data-tint-always data-href="#/n/${c.id}" data-m3-ripple data-m3-bounce data-m3-hover-root tabindex="0" aria-label="${esc(c.title)}, n/${esc(c.id)}" data-m3-stickers="card-${c.id}" data-count="3" data-min="60" data-max="130" data-clip-radius="23">` +
            `<div class="nc-top"><m3-shape-icon shape="${c.shape}" symbol="${c.symbol}" size="56" icon-size="28"></m3-shape-icon>${joinButton(c)}</div>` +
            `<h3 class="m3-title">${esc(c.title)}</h3><div class="meta">n/${esc(c.id)}<span class="count"> · ${a.posts ? plural(a.posts, 'post') : 'no posts yet'}</span></div>` +
            `<p>${esc(c.tagline)}</p><m3-wavy-progress value="${a.level}"${a.week ? ' playing' : ''} aria-label="Activity: ${a.mood}"></m3-wavy-progress></article>`
        )
        .join('');
    return {
      title: 'Explore',
      brand: 'flower',
      html:
        '<div class="page wide"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="flower" symbol="explore" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Explore</h1><span class="muted">Find your nook. Each one has its own colour, shape and pace.</span></div><span class="spacer"></span>` +
        `<button class="m3-btn filled" data-act="new-nook">${icon('add')}Create a nook</button></div>` +
        (fresh.length
          ? `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="sunny" symbol="photo_library" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Fresh from the nooks</h2><m3-wavy-line></m3-wavy-line></header>` +
            `<div class="shelf">${fresh
              .map((p) => {
                const art = p.image ? `url(${p.image})` : `linear-gradient(${p.art.angle || 150}deg, ${p.art.from}, ${p.art.to})`;
                return `<button class="m3-media-card" data-href="#/n/${p.n}/p/${p.id}" data-title="${esc(p.title)}" data-subtitle="n/${esc(p.n)}" data-art="${esc(art)}"></button>`;
              })
              .join('')}</div></section>`
          : '') +
        `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="clover4" symbol="category" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">All nooks</h2><m3-wavy-line></m3-wavy-line></header>` +
        `<div class="chips" role="group" aria-label="Category">${cats.map((x) => `<button class="chip" data-m3-ripple data-cat="${esc(x)}" aria-pressed="${x === cat}">${esc(x)}</button>`).join('')}</div>` +
        `<div class="nook-grid" id="nook-grid">${grid(cat)}</div></section>` +
        '</div></div>',
      mount(root) {
        const gridEl = root.querySelector('#nook-grid');
        root.querySelectorAll('.chip[data-cat]').forEach((chip) =>
          chip.addEventListener('click', () => {
            root.querySelectorAll('.chip[data-cat]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
            gridEl.innerHTML = grid(chip.dataset.cat);
            ui.theme.tintAll(gridEl);
          })
        );
      },
    };
  }

  function collectionArt(col) {
    return `linear-gradient(135deg, ${col.color}, color-mix(in srgb, ${col.color} 45%, #1d1b20))`;
  }

  function saved() {
    const s = store.state;
    const list = s.saved.map((id) => store.post(id)).filter((p) => p && !store.isRemoved(p.id));
    return {
      title: 'Saved',
      brand: 'clover4',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="clover4" symbol="bookmarks" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Saved</h1><span class="muted">${plural(list.length, 'post')} saved, ${plural(s.collections.length, 'collection')}</span></div></div>` +
        `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="gem" symbol="collections_bookmark" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Collections</h2><m3-wavy-line></m3-wavy-line>` +
        `<button class="m3-btn tonal small" data-act="new-collection">${icon('add')}New</button></header>` +
        '<div class="shelf">' +
        s.collections
          .map((col) => `<button class="m3-media-card" data-href="#/saved/${col.id}" data-title="${esc(col.name)}" data-subtitle="${plural(col.posts.length, 'post')}" data-art="${esc(collectionArt(col))}"></button>`)
          .join('') +
        `<button class="m3-media-card" data-act="new-collection" data-title="New collection" data-subtitle="Like a playlist, for posts" data-symbol="add"></button>` +
        '</div></section>' +
        `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="heart" symbol="bookmark" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">All saved</h2><m3-wavy-line></m3-wavy-line></header>` +
        feedShell() +
        '</section></div></div>',
      mount(root) {
        mountFeed(root, list, {}, empty('push_pin', 'Nothing saved yet', 'Tap the bookmark on any post to keep it here.'));
      },
    };
  }

  function collection(params) {
    const col = store.state.collections.find((c) => c.id === params.col);
    if (!col) return notFound('That collection doesn’t exist any more.');
    const list = col.posts.map((id) => store.post(id)).filter((p) => p && !store.isRemoved(p.id));
    return {
      title: col.name,
      brand: col.shape,
      html:
        '<div class="page single"><div class="col">' +
        `<div class="back-row"><a class="m3-toolbar-btn" href="#/saved" data-effect="nudge-left" data-shape="cookie7" data-shape-still aria-label="Back to saved"><span class="m3-icon">arrow_back</span></a></div>` +
        `<div class="page-head"><m3-shape-icon shape="${col.shape}" symbol="collections_bookmark" size="56" icon-size="28" style="--m3-shape-icon-color:${col.color};--m3-shape-icon-on-color:${ui.ink(col.color)}"></m3-shape-icon>` +
        `<div><h1 class="m3-title">${esc(col.name)}</h1><span class="muted">${plural(list.length, 'post')}</span></div><span class="spacer"></span>` +
        `<button class="m3-btn tonal small" data-act="rename-collection" data-col="${col.id}">${icon('edit')}Rename</button>` +
        `<button class="m3-btn text small" data-act="delete-collection" data-col="${col.id}">${icon('delete')}Delete</button></div>` +
        feedShell() +
        '</div></div>',
      mount(root) {
        mountFeed(root, list, {}, empty('queue_music', 'This collection is empty', 'Open the ⋯ menu on any post and choose “Add to collection”.'));
      },
    };
  }

  function profile(params) {
    const name = params.user;
    const u = store.user(name);
    const me = store.isMe(name);
    // everyone else arrives once Nook has people beyond this browser
    if (!me) return notFound(`We couldn’t find u/${name}.`);
    const st = store.userStats(u.name);
    const s = store.state;
    const where = [...new Set(st.posts.map((p) => p.n).concat(st.comments.map((c) => (store.post(c.postId) || {}).n)).filter(Boolean))]
      .map((id) => store.community(id))
      .filter(Boolean)
      .slice(0, 6);
    const joinedDays = Math.max(1, Math.round((Date.now() - s.me.joinedAt) / 86400000));
    const badges = me
      ? `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="burst" symbol="military_tech" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Badges</h2><m3-wavy-line></m3-wavy-line><span class="muted">${Object.keys(s.badges).length}/${store.BADGES.length}</span></header>` +
        `<div class="badges">${store.BADGES.map((b) => {
          const got = !!s.badges[b.id];
          return `<div class="badge-tile${got ? '' : ' locked'}" data-tooltip="${esc(b.desc)}"><m3-shape-icon shape="${b.shape}" symbol="${got ? b.symbol : 'lock'}" size="52" icon-size="24"></m3-shape-icon><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`;
        }).join('')}</div></section>`
      : '';
    return {
      title: `u/${u.name}`,
      brand: u.shape,
      html:
        '<div class="page"><div class="col">' +
        `<section class="profile-hero" data-m3-stickers="u-${esc(u.name)}" data-count="4" data-clip-radius="30">` +
        `<div class="profile-main">${avatar(u, 96)}<div class="who"><h1 class="m3-title">${esc(u.name)}</h1><span class="muted">u/${esc(u.name)} · joined ${me && joinedDays <= 1 ? 'today' : plural(joinedDays, 'day') + ' ago'}</span>` +
        (u.bio ? `<p style="margin-top:6px">${esc(clean(u.bio))}</p>` : me ? '<p class="muted" style="margin-top:6px">No bio yet. Tell people what you’re into!</p>' : '') +
        '</div>' +
        (me ? `<button class="m3-btn tonal" data-act="edit-profile">${icon('edit')}Edit profile</button>` : `<button class="m3-btn filled" data-act="follow" data-user="${esc(u.name)}">${icon('person_add')}Follow</button>`) +
        '</div><div class="stats">' +
        `<div class="stat"><b class="count">${num(st.karma)}</b><span>Karma</span></div>` +
        `<div class="stat"><b class="count">${num(st.posts.length)}</b><span>Posts</span></div>` +
        `<div class="stat"><b class="count">${num(st.comments.length)}</b><span>Comments</span></div>` +
        (me ? `<div class="stat"><b>${plural(s.streak.count, 'day')}</b><span>Streak</span></div>` : '') +
        '</div></section>' +
        badges +
        `<div class="toolbar">${segmented('profile-tab', [['posts', 'Posts', 'article'], ['comments', 'Comments', 'forum']], 'posts', 'Show')}</div>` +
        '<div id="profile-list">' +
        feedShell() +
        '</div>' +
        '</div><aside class="rail">' +
        (me ? streakCard() : '') +
        (where.length
          ? `<section class="card"><h3 class="card-title">${icon('location_on')}<span>${me ? 'Where you hang out' : 'Hangs out in'}</span></h3><div class="list">${where
              .map((c) => `<a class="row-link" href="#/n/${c.id}" data-m3-ripple>${nookIcon(c, 32, 17)}<span class="row-text"><b>n/${esc(c.id)}</b><small>${esc(c.title)}</small></span></a>`)
              .join('')}</div></section>`
          : '') +
        footCard() +
        '</aside></div>',
      mount(root) {
        const box = root.querySelector('#profile-list');
        const show = (tab) => {
          if (tab === 'posts') {
            box.innerHTML = feedShell();
            const sorted = [...st.posts].sort((a, b) => b.createdAt - a.createdAt);
            mountFeed(box, sorted, {}, empty('edit_note', me ? 'You haven’t posted yet' : 'No posts yet', me ? 'Your first post earns you a badge.' : 'They’re more of a commenter.', me ? `<a class="m3-btn filled" href="#/submit">${icon('edit')}Create a post</a>` : ''));
          } else {
            const list = [...st.comments].sort((a, b) => b.createdAt - a.createdAt);
            box.innerHTML = list.length
              ? `<div class="feed">${list
                  .map((c) => {
                    const p = store.post(c.postId);
                    if (!p) return '';
                    return `<article class="comment-card" data-href="#/n/${p.n}/p/${p.id}?c=${c.id}" data-m3-ripple data-m3-bounce tabindex="0"><div class="cc-head"><b>u/${esc(store.userName(c.author))}</b> in <b>n/${esc(p.n)}</b> · ${ago(c.createdAt)} · on “${esc(plain(clean(p.title), 70))}”</div><div class="md">${md(clean(c.body))}</div><div class="cc-head"><span class="count">${plural(store.commentScore(c), 'point')}</span></div></article>`;
                  })
                  .join('')}</div>`
              : empty('forum', 'No comments yet', me ? 'Jump into a thread and say hi.' : 'Quiet type.');
          }
        };
        show('posts');
        root.querySelector('#profile-tab').addEventListener('change', (e) => show(e.detail.value));
      },
    };
  }

  function inbox() {
    const notes = store.notifications();
    const read = new Set(store.state.read);
    return {
      title: 'Inbox',
      brand: 'clover4',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="clover4" symbol="notifications" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Inbox</h1><span class="muted">${plural(store.unread(), 'unread notification')}</span></div><span class="spacer"></span>` +
        `<button class="m3-btn tonal small" data-act="read-all">${icon('done_all')}Mark all read</button></div>` +
        (notes.length
          ? `<div class="notes">${notes
              .map(
                (n) =>
                  `<button class="note${read.has(n.id) ? '' : ' unread'}" data-m3-ripple data-act="open-note" data-note="${n.id}" data-href="${esc(n.href || '')}">` +
                  `<m3-shape-icon shape="${n.shape}" symbol="${n.symbol}" size="44" icon-size="22"></m3-shape-icon>` +
                  `<span class="note-text"><span>${esc(n.text)}</span><small>${ago(n.createdAt)}</small></span></button>`
              )
              .join('')}</div>`
          : empty('notifications_off', 'All quiet', 'Replies to your posts and the badges you earn show up here.')) +
        '</div></div>',
    };
  }

  function searchPage(params) {
    const q = params.q || '';
    const r = store.search(q);
    const tab = params.t || (r.posts.length ? 'posts' : r.nooks.length ? 'nooks' : r.people.length ? 'people' : 'posts');
    const nookRow = (c) =>
      `<div class="row-link" data-href="#/n/${c.id}" tabindex="0" role="link" aria-label="n/${esc(c.id)}" data-m3-ripple data-m3-hover-root>${nookIcon(c, 44, 22)}<span class="row-text"><b>${highlight(c.title, q)} · n/${highlight(c.id, q)}</b><small>${highlight(c.tagline, q)}</small></span>${joinButton(c)}</div>`;
    const personRow = (u) =>
      `<a class="row-link" href="#/u/${esc(u.name)}" data-m3-ripple>${avatar(u, 44)}<span class="row-text"><b>u/${highlight(u.name, q)}</b><small>${highlight(u.bio || '', q)}</small></span></a>`;
    return {
      title: q ? `“${q}”` : 'Search',
      brand: 'ghostish',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="ghostish" symbol="search" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">${q ? `Results for “${esc(q)}”` : 'Search'}</h1>` +
        `<span class="muted">${q ? `${plural(r.posts.length, 'post')}, ${plural(r.nooks.length, 'nook')}, ${plural(r.people.length, 'person', 'people')}` : 'Type in the search bar above'}</span></div></div>` +
        `<div class="toolbar">${segmented('search-tab', [['posts', `Posts`, 'article'], ['nooks', `Nooks`, 'diversity_3'], ['people', `People`, 'group']], tab, 'Result type')}</div>` +
        '<div id="search-results"></div></div></div>',
      mount(root) {
        const box = root.querySelector('#search-results');
        const show = (t) => {
          if (!q) {
            box.innerHTML = empty('search', 'Search Nook', 'Find posts, nooks and people.');
          } else if (t === 'posts') {
            box.innerHTML = feedShell();
            mountFeed(box, r.posts, { query: q }, empty('search_off', 'No posts match', 'Try fewer or different words.'));
          } else if (t === 'nooks') {
            box.innerHTML = r.nooks.length ? `<div class="card"><div class="list">${r.nooks.map(nookRow).join('')}</div></div>` : empty('search_off', 'No nooks match', 'Maybe it’s time to create one?', `<button class="m3-btn filled" data-act="new-nook">${icon('add')}Create a nook</button>`);
          } else {
            box.innerHTML = r.people.length ? `<div class="card"><div class="list">${r.people.map(personRow).join('')}</div></div>` : empty('search_off', 'Nobody by that name', 'Check the spelling and try again.');
          }
        };
        show(tab);
        root.querySelector('#search-tab').addEventListener('change', (e) => show(e.detail.value));
        const input = document.getElementById('search-input');
        if (input && input.value !== q) input.value = q;
      },
    };
  }

  // ---- settings ------------------------------------------------------------------------------------

  function settingsPage() {
    const s = settings();
    const sw = (id, title, sub, on) =>
      `<label class="switch-row"><span class="switch-text"><span>${title}</span><small>${sub}</small></span><input type="checkbox" class="m3-switch" role="switch" id="${id}"${on ? ' checked' : ''}></label>`;
    const header = (shape, symbol, title) =>
      `<header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="${shape}" symbol="${symbol}" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">${title}</h2><m3-wavy-line></m3-wavy-line></header>`;
    return {
      title: 'Settings',
      brand: 'gem',
      html:
        '<div class="page single"><div class="col settings">' +
        `<div class="page-head"><m3-shape-icon shape="gem" symbol="settings" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Settings</h1><span class="muted">Make Nook yours. Changes save as you go.</span></div></div>` +
        `<section>${header('flower', 'palette', 'Appearance')}<div class="card setting-card">` +
        `<div class="setting-row"><span class="label">Mode</span>${segmented('set-mode', [['system', 'System', 'brightness_auto'], ['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode']], s.mode, 'Mode')}</div>` +
        `<div class="setting-row"><span class="label">Your colour (used outside nooks)</span><div class="swatches" id="set-seeds">${ui.SEEDS.map(
          (seed, i) => `<button class="swatch" data-seed="${seed}" aria-pressed="${seed === s.seed}" aria-label="Colour ${seed}" data-tooltip="${seed}"><m3-shape shape="${ui.SEED_SHAPES[i]}" style="color:${seed}"></m3-shape></button>`
        ).join('')}<input type="color" class="color-input" id="set-color" value="${s.seed}" aria-label="Pick any colour" data-tooltip="Pick any colour"></div></div>` +
        `<div class="setting-row"><span class="label">Scheme style</span>${segmented('set-variant', [['tonalSpot', 'Tonal spot'], ['expressive', 'Expressive'], ['vibrant', 'Vibrant'], ['fidelity', 'Fidelity'], ['neutral', 'Neutral']], s.variant, 'Scheme style')}</div>` +
        sw('set-themeNooks', 'Wear each nook’s colours', 'The whole app re-themes itself when you visit a nook.', s.themeNooks) +
        sw('set-tintPosts', 'Tint posts by their nook', 'In mixed feeds, each card takes its nook’s colours.', s.tintPosts) +
        sw('set-reduceMotion', 'Reduce motion', 'Stop things that move on their own and keep pages still as they change.', s.reduceMotion) +
        sw('set-haptics', 'Haptic taps', 'A tiny buzz when you vote, spark, save or join, on phones that can.', s.haptics !== false) +
        (ui.theme.offline ? '<p class="muted">Couldn’t load the colour library (offline?), so only the built-in scheme is available right now.</p>' : '') +
        '</div></section>' +
        `<section>${header('cookie9', 'dynamic_feed', 'Feed')}<div class="card setting-card">` +
        `<div class="setting-row"><span class="label">Default sort on Home</span>${segmented('set-sort', ['hot', 'new', 'top', 'rising'].map((k) => [k, SORT_LABELS[k][0], SORT_LABELS[k][1]]), s.sort, 'Default sort')}</div>` +
        sw('set-compact', 'Compact cards', 'Smaller posts with thumbnails, so you see more at once.', s.compact) +
        sw('set-calm', 'Calm mode', 'Hide every score, count and tally. Votes still count, you just don’t see them.', s.calm) +
        sw('set-filterLanguage', 'Hide strong language', 'Swear words show as dots, like f•••. Slurs and threats are never allowed at all.', s.filterLanguage !== false) +
        '</div></section>' +
        `<section>${header('heart', 'self_improvement', 'Wellbeing')}<div class="card setting-card">` +
        `<div class="setting-row"><span class="label">Remind me to take a break after</span><div class="slider-row"><m3-slider id="set-break" min="0" max="120" step="15" value="${s.breakMinutes}" value-tip show-stop label="Break reminder"></m3-slider><output id="set-break-out">${s.breakMinutes ? s.breakMinutes + ' min' : 'Off'}</output></div></div>` +
        '</div></section>' +
        `<section>${header('pixelCircle', 'database', 'Your data')}<div class="card setting-card">` +
        '<p class="muted">Nook keeps everything (your profile, posts, votes, nooks and settings) in this browser’s storage. Nothing is sent anywhere.</p>' +
        `<div class="toolbar"><button class="m3-btn tonal" data-act="export">${icon('download')}Export my data</button><button class="m3-btn outlined" data-act="reset">${icon('restart_alt')}Delete everything</button></div>` +
        '</div></section>' +
        `<section>${header('clover4', 'policy', 'Privacy and legal')}<div class="card setting-card">` +
        '<p class="muted">Nook uses no cookies and no trackers. It keeps what you do in this browser’s storage so it’s here next time, and loads nothing from other companies.</p>' +
        `<div class="toolbar"><a class="m3-btn tonal" href="terms.html">${icon('gavel')}Terms of Use</a><a class="m3-btn tonal" href="privacy.html">${icon('shield_lock')}Privacy Policy</a><a class="m3-btn tonal" href="licenses.html">${icon('license')}Open-source licenses</a><button class="m3-btn outlined" data-act="storage-notice">${icon('cookie')}Storage and cookies</button></div>` +
        '</div></section>' +
        `<section>${header('sunny', 'info', 'About')}<div class="card setting-card">` +
        `<div class="about-app"><m3-shape-icon shape="cookie9" symbol="diversity_3" size="56" icon-size="28"></m3-shape-icon><div><b class="m3-title">Nook</b><span class="muted">Version ${esc(store.VERSION)} · Early access</span></div></div>` +
        `<div class="toolbar"><button class="m3-btn filled" data-act="credits">${icon('stars')}Credits</button><button class="m3-btn tonal" data-act="about-nook">${icon('help')}What’s Nook?</button></div>` +
        `<p class="muted">Built on a Material 3 Expressive design system ported from Swiftify. Shapes and morphing from rounded-polygon-qmljs (Apache 2.0); colour from Google’s material-color-utilities (Apache 2.0); type in Google Sans Flex and Material Symbols. <a class="md" style="color:var(--m3-primary)" href="../m3/">See the design system</a>.</p>` +
        '</div></section>' +
        '</div></div>',
      mount(root) {
        const $ = (sel) => root.querySelector(sel);
        const apply = () => {
          store.save();
          return app().applySettings();
        };
        // a new look spreads out from what you tapped
        const spread = (el) => {
          const r = el.getBoundingClientRect();
          Nook.fx.reveal(r.left + r.width / 2, r.top + r.height / 2, apply);
        };
        $('#set-mode').addEventListener('change', (e) => {
          s.mode = e.detail.value;
          spread(e.currentTarget.querySelector('[aria-checked="true"]') || e.currentTarget);
        });
        $('#set-variant').addEventListener('change', (e) => {
          s.variant = e.detail.value;
          spread(e.currentTarget.querySelector('[aria-checked="true"]') || e.currentTarget);
        });
        $('#set-sort').addEventListener('change', (e) => {
          s.sort = e.detail.value;
          store.save();
        });
        const pickSeed = (seed, from) => {
          s.seed = seed;
          root.querySelectorAll('.swatch').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.seed === seed)));
          $('#set-color').value = seed;
          spread(from);
        };
        root.querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => pickSeed(b.dataset.seed, b)));
        $('#set-color').addEventListener('change', (e) => pickSeed(e.target.value, e.target));
        for (const key of ['themeNooks', 'tintPosts', 'reduceMotion', 'compact', 'calm', 'haptics', 'filterLanguage']) {
          $('#set-' + key).addEventListener('change', (e) => {
            s[key] = e.target.checked;
            apply();
          });
        }
        const slider = $('#set-break');
        slider.format = (value) => (value ? Math.round(value) + ' min' : 'Off');
        slider.addEventListener('input', () => ($('#set-break-out').textContent = slider.format(slider.value)));
        slider.addEventListener('change', () => {
          s.breakMinutes = Math.round(slider.value);
          $('#set-break-out').textContent = slider.format(s.breakMinutes);
          apply();
        });
      },
    };
  }

  // ---- submit -----------------------------------------------------------------------------------------

  function submit(params) {
    const s = store.state;
    const draft = s.draft || {};
    const start = params.n || draft.n || s.recent.find((id) => store.community(id)) || s.joined[0] || 'asknook';
    const nook = store.community(start) || store.community('asknook');
    const type = params.type || draft.type || 'text';
    return {
      title: 'Create a post',
      nook,
      brand: 'sunny',
      html:
        '<div class="page"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="sunny" symbol="edit" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Create a post</h1><span class="muted">Drafts save themselves as you type</span></div></div>` +
        '<form class="card form" id="submit-form" novalidate>' +
        `<div class="field"><span class="field-label">Posting in</span><button type="button" class="picker-btn" id="nook-picker" aria-haspopup="menu">${nookIcon(nook, 32, 18)}<span id="nook-picker-name">n/${esc(nook.id)}</span>${icon('expand_more')}</button></div>` +
        `<div>${segmented('post-type', [['text', 'Text', 'notes'], ['image', 'Image', 'image'], ['link', 'Link', 'link'], ['poll', 'Poll', 'ballot']], type, 'Post type')}</div>` +
        `<div class="field"><label for="f-title">Title</label><input class="m3-field" id="f-title" maxlength="300" required placeholder="An interesting title" value="${esc(draft.title || '')}"><span class="counter" id="f-title-count">0/300</span><span class="error" id="f-title-err"></span></div>` +
        `<div class="field"><span class="field-label">Flair</span><div class="chips" id="f-flairs" role="group" aria-label="Flair"></div></div>` +
        // image
        `<div class="field" data-for="image"><span class="field-label">Image</span><label class="drop" id="f-drop"><input type="file" id="f-file" accept="image/*" hidden><span id="f-drop-inner"><m3-shape-icon shape="clover8" symbol="add_photo_alternate" size="56" icon-size="28"></m3-shape-icon><br>Drop an image here, or click to choose one</span></label><span class="error" id="f-image-err"></span></div>` +
        // link
        `<div class="field" data-for="link"><label for="f-url">Link</label><input class="m3-field" id="f-url" type="url" placeholder="https://" value="${esc(draft.url || '')}"><span class="error" id="f-url-err"></span></div>` +
        // poll
        `<div class="field" data-for="poll"><span class="field-label">Poll options</span><div class="poll-edit" id="f-poll"></div><button type="button" class="m3-btn text small" id="f-poll-add" style="justify-self:start">${icon('add')}Add option</button><span class="error" id="f-poll-err"></span></div>` +
        // body
        `<div class="field"><div class="toolbar" style="justify-content:space-between"><label for="f-body" class="field-label">Body <span class="muted" id="f-body-optional">(optional)</span></label>${segmented('body-mode', [['write', 'Write'], ['preview', 'Preview']], 'write', 'Body mode')}</div>` +
        '<div id="f-write"><div class="format-bar" role="toolbar" aria-label="Formatting">' +
        [['bold', 'format_bold', '**', '**'], ['italic', 'format_italic', '*', '*'], ['code', 'code', '`', '`'], ['link', 'link', '[', '](https://)'], ['quote', 'format_quote', '> ', ''], ['list', 'format_list_bulleted', '- ', ''], ['spoiler', 'visibility_off', '||', '||']]
          .map(([name, sym, a, b]) => `<button type="button" class="m3-icon-btn small" data-wrap-a="${esc(a)}" data-wrap-b="${esc(b)}" aria-label="${name}" data-tooltip="${name[0].toUpperCase() + name.slice(1)}"><span class="m3-icon">${sym}</span></button>`)
          .join('') +
        `</div><textarea class="m3-field" id="f-body" rows="7" placeholder="Say more (optional). Markdown-lite works: **bold**, *italic*, lists, > quotes.">${esc(draft.body || '')}</textarea></div>` +
        '<div id="f-preview" class="preview-box md" hidden></div></div>' +
        sw2('f-spoiler', 'Mark as spoiler', 'The post stays blurred until someone chooses to see it.', !!draft.spoiler) +
        `<div class="form-actions"><span class="status" id="f-status"></span><a class="m3-btn text" href="#/" data-act="back">Cancel</a><button type="submit" class="m3-btn filled" id="f-submit">${icon('send')}Post</button></div>` +
        '</form></div>' +
        `<aside class="rail" id="submit-rail">${submitRail(nook)}</aside></div>`,
      mount(root) {
        app().mountSubmit(root, nook, type, draft);
      },
    };
  }

  function sw2(id, title, sub, on) {
    return `<label class="switch-row"><span class="switch-text"><span>${title}</span><small>${sub}</small></span><input type="checkbox" class="m3-switch" role="switch" id="${id}"${on ? ' checked' : ''}></label>`;
  }

  function submitRail(c) {
    return (
      `<section class="card"><h3 class="card-title">${icon('tips_and_updates')}<span>Posting tips</span></h3><ol class="rules">` +
      '<li>A clear title gets better answers.</li><li>Pick a flair so people can find your post.</li><li>Use a spoiler tag for anything surprising.</li><li>Be kind. There’s a person on the other side.</li>' +
      '</ol></section>' +
      rulesCard(c)
    );
  }

  function notFound(text) {
    return {
      title: 'Not found',
      brand: 'ghostish',
      html: `<div class="page single"><div class="col">${empty('search_off', 'Nothing to see here', text || 'This page doesn’t exist.', `<a class="m3-btn filled" href="#/">${icon('home')}Back home</a>`, 'ghostish')}</div></div>`,
    };
  }

  Nook.views = {
    home, popular, community, postPage, explore, saved, collection, profile, inbox, searchPage, settingsPage, submit, notFound,
    postCard, pollBlock, sparksRow, sparkChip, commentHTML, commentTree, replyBox, joinButton, aboutCard, rulesCard, modsCard,
    submitRail, empty, mountFeed,
  };
})();
