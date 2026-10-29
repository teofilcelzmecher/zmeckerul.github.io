// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
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
  const { esc, md, plain, ago, num, plural, icon, avatar, nookIcon, highlight, nameFont, prideFlag, specialBadges, devTag } = ui;
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
    `<button class="m3-icon-btn tonal not-phone" data-act="compact" aria-pressed="${settings().compact}" aria-label="Compact cards" data-tooltip="Compact cards"><span translate="no" class="m3-icon">view_agenda</span></button>`;

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
      `<button class="m3-icon-btn up" data-act="${act}" data-dir="1" data-effect="bounce" aria-pressed="${dir === 1}" aria-label="Upvote"><span translate="no" class="m3-icon">shift</span></button>` +
      `<span class="score">${num(score)}</span>` +
      `<button class="m3-icon-btn down" data-act="${act}" data-dir="-1" data-effect="bounce" aria-pressed="${dir === -1}" aria-label="Downvote"><span translate="no" class="m3-icon">shift</span></button>` +
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
    // a video (1.0): its still until it's played; nothing loads before then
    if (p.video) {
      const v = p.video;
      return `<div class="post-art video" style="--ratio:${v.width || 16}/${v.height || 9}"><video src="${esc(v.url)}" poster="${esc(v.poster)}" controls playsinline preload="none" aria-label="Video: ${esc(p.title)}"></video></div>`;
    }
    if (p.image) return `<div class="post-art photo"><img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy"></div>`;
    if (!p.art) return '';
    const a = p.art;
    return (
      `<div class="post-art" style="--a1:${a.from};--a2:${a.to};--ang:${a.angle || 150}deg" data-m3-stickers="${esc(p.id)}" data-count="6" data-min="40" data-max="150" data-strength="1.2" data-clip-radius="17" role="img" aria-label="Illustration for ${esc(p.title)}">` +
      `<m3-shape-icon shape="${a.shape}" symbol="${a.symbol}" size="${size}" icon-size="${Math.round(size * 0.46)}" aria-hidden="true"></m3-shape-icon></div>`
    );
  }

  function thumb(p) {
    if (p.video) return `<div class="post-thumb video"><img src="${esc(p.video.poster)}" alt="" loading="lazy">${icon('play_circle')}</div>`;
    if (p.image) return `<div class="post-thumb"><img src="${esc(p.image)}" alt="" loading="lazy"></div>`;
    if (p.art) return `<div class="post-thumb" style="--a1:${p.art.from};--a2:${p.art.to};--ang:${p.art.angle || 150}deg">${icon(p.art.symbol)}</div>`;
    const symbol = p.type === 'link' ? 'link' : p.type === 'poll' ? 'ballot' : 'notes';
    return `<div class="post-thumb plain">${icon(symbol)}</div>`;
  }

  // ---- the post card --------------------------------------------------------------

  /** a tag by someone's name for their role in a nest: Owner, Moderator, or whatever their role is called there */
  function roleTag(nook, name) {
    const c = nook && store.community(nook);
    const r = c && store.nestRole(c, name);
    return r ? `<span class="tag role ${esc(r.role)}" title="${esc(r.label)} in n/${esc(c.id)}">${icon(r.role === 'owner' ? 'castle' : 'shield_person')}${esc(r.label)}</span>` : '';
  }

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
        ? `${avatar(u, 24)}<a class="author${nameFont(u)}" href="#/u/${esc(name)}">u/${esc(name)}</a>${prideFlag(u)}${devTag(u)}${roleTag(p.n, name)}`
        : `<a class="nook-link" href="#/n/${c.id}">${nookIcon(c, 26, 15)}n/${esc(c.id)}</a><span class="dot"></span><a class="author${nameFont(u)}" href="#/u/${esc(name)}">u/${esc(name)}</a>${prideFlag(u)}${devTag(u)}${roleTag(p.n, name)}`) +
      `<span class="dot"></span><time datetime="${when.toISOString()}" title="${esc(when.toLocaleString())}">${ago(p.createdAt)}</time>` +
      (p.pinned && (inNook || open) ? `<span class="tag pin">${icon('push_pin')}Pinned</span>` : '') +
      (p.spoiler ? `<span class="tag">${icon('visibility_off')}Spoiler</span>` : '') +
      `<button class="m3-icon-btn small post-more" data-act="post-menu" aria-label="More options"><span translate="no" class="m3-icon">more_horiz</span></button>` +
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
      `<button class="m3-icon-btn" data-act="save" data-burst="pin" aria-pressed="${saved}" aria-label="Save" data-tooltip="${saved ? 'Saved' : 'Save'}"><span translate="no" class="m3-icon">bookmark</span></button>` +
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
    const ads = ctx.ads && Nook.ads && Nook.ads.on;
    const add = (arrive) => {
      const next = list.slice(shown, shown + PAGE);
      const before = box.children.length;
      // an ad can come between two posts, never before the first or after the last
      const cards = next.map((p, i) => postCard(p, ctx) + (ads && Nook.ads.after(shown + i + 1, list.length) ? Nook.ads.slotHTML() : ''));
      box.insertAdjacentHTML('beforeend', cards.join(''));
      const fresh = [...box.children].slice(before);
      shown += next.length;
      ui.theme.tintAll(box);
      if (ads) Nook.ads.fill(box);
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
      `<div class="toolbar" style="margin-top:14px">${joinButton(c, false)}${store.bannedFrom(c.id) ? '' : `<a class="m3-btn outlined" href="#/submit?n=${c.id}">${icon('edit')}Post</a>`}</div>` +
      '</section>'
    );
  }

  function rulesCard(c) {
    const edit = store.nestCan(c, 'rules') && serverAt('0.9.5') ? `<a class="m3-btn text small" href="#/n/${esc(c.id)}/manage?tab=rules">${icon('edit')}Edit</a>` : '';
    if ((!c.rules || !c.rules.length) && !edit) return '';
    return (
      `<section class="card"><h3 class="card-title">${icon('gavel')}<span>Nest rules</span>${edit}</h3>` +
      (c.rules && c.rules.length ? `<ol class="rules">${c.rules.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>` : '<p class="muted">No rules yet.</p>') +
      '</section>'
    );
  }

  /** who runs a nest: its owner and its team, each with their role */
  function modsCard(c) {
    const people = [];
    if (c.owner) people.push({ name: c.owner, label: 'Owner', symbol: 'castle' });
    for (const t of c.team || []) people.push({ name: t.name, label: t.title || store.ROLE_LABELS[t.role] || 'Team', symbol: 'shield_person' });
    const manage = store.nestPerms(c).length && serverAt('0.9.5') ? `<a class="m3-btn tonal small" href="#/n/${esc(c.id)}/manage">${icon('tune')}Manage</a>` : '';
    if (!people.length && !manage && !c.starter) return '';
    return (
      `<section class="card"><h3 class="card-title">${icon('shield_person')}<span>Team</span>${manage}</h3><div class="list">` +
      people
        .map(({ name, label, symbol }) => {
          const u = store.user(name);
          return `<a class="row-link" href="#/u/${esc(u.name)}" data-m3-ripple data-m3-hover-root>${avatar(u, 32)}<span class="row-text"><b>u/${esc(u.name)}</b><small class="team-role">${icon(symbol)}${esc(label)}</small></span></a>`;
        })
        .join('') +
      '</div>' +
      (c.starter && !c.owner ? '<p class="muted team-note">Budgie’s own moderators look after this nest.</p>' : '') +
      '</section>'
    );
  }

  /** a note at the top of a nest you can't post in for now */
  function bannedNote(c) {
    const b = store.bannedFrom(c.id);
    if (!b) return '';
    return `<div class="card banned-note" role="status">${icon('block')}<div><b>You can’t post or comment in n/${esc(c.id)}${b.until ? ' until ' + esc(new Date(b.until).toLocaleDateString([], { day: 'numeric', month: 'long' })) : ''}.</b><small>Reason: ${esc(b.reason)}. You can still read it.</small></div></div>`;
  }

  function streakCard() {
    // calm mode (1.0): no streak to keep up
    if (store.state.settings.calm) return '';
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
      `<section class="card"><h3 class="card-title">${icon('trending_up')}<span>Nests you might like</span></h3><div class="list">` +
      list
        .map(
          (c) =>
            `<div class="row-link" data-href="#/n/${c.id}" tabindex="0" role="link" aria-label="n/${esc(c.id)}" data-m3-ripple data-m3-hover-root>${nookIcon(c, 36, 19)}<span class="row-text"><b>n/${esc(c.id)}</b><small>${esc(c.category)}</small></span>${joinButton(c)}</div>`
        )
        .join('') +
      `</div><a class="m3-btn text small" href="#/explore" style="margin-top:6px">${icon('explore')}See all nests</a></section>`
    );
  }

  const footCard = () =>
    '<div class="foot-links">' +
    '<a href="#/settings">Settings</a><button type="button" data-act="shortcuts">Keyboard shortcuts</button>' +
    '<button type="button" data-act="about-nook">What’s Budgie?</button><button type="button" data-act="credits">Credits</button><a href="terms.html">Terms</a><a href="privacy.html">Privacy</a><a href="licenses.html">Licenses</a><a href="../m3/">Design system</a>' +
    `<span>Built with Material 3 Expressive. ${Nook.ads && Nook.ads.on ? 'Ads only between posts.' : 'No ads, no trackers.'}</span></div>`;

  // ---- comments -------------------------------------------------------------------------------

  function commentHTML(c, kids, op) {
    if (!store.isRemoved(c.id) && store.isBlocked(c.author)) {
      return (
        `<div class="comment" id="c-${c.id}" data-comment="${c.id}"><div class="c-side">${avatar({ name: '?', color: '#938f99', shape: 'ghostish' }, 30)}<button class="c-thread" data-act="collapse" aria-label="Collapse this thread"></button></div>` +
        `<div class="c-main"><div class="c-head"><span>[blocked]</span><span>· ${ago(c.createdAt)}</span><span class="c-hidden"></span></div><div class="c-body md removed"><p>A comment from someone you blocked.</p></div></div>` +
        (kids ? `<div class="c-children">${kids}</div>` : '') +
        '</div>'
      );
    }
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
      (removed ? '<span>[deleted]</span>' : `<a class="author${nameFont(u)}" href="#/u/${esc(name)}">${esc(name)}</a>${prideFlag(u)}${devTag(u)}${roleTag((store.post(c.postId) || {}).n, name)}`) +
      (!removed && op ? '<span class="tag op">OP</span>' : '') +
      (!removed && mine ? '<span class="tag">You</span>' : '') +
      `<span>· ${ago(c.createdAt)}</span>${c.edited && !removed ? '<span>· edited</span>' : ''}<span class="c-hidden"></span></div>` +
      `<div class="c-body md${removed ? ' removed' : ''}">${removed ? '<p>This comment was deleted.</p>' : md(clean(c.body))}</div>` +
      (removed
        ? ''
        : '<div class="c-actions">' +
          voteBox('comment', c.id, store.commentScore(c), dir, true) +
          `<button class="m3-btn text" data-act="reply">${icon('reply')}Reply</button>` +
          `<button class="m3-btn text" data-act="comment-share" aria-label="Share">${icon('ios_share')}<span class="not-phone">Share</span></button>` +
          `<button class="m3-icon-btn small" data-act="comment-menu" aria-label="More options for this comment"><span translate="no" class="m3-icon">more_horiz</span></button>` +
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
      `<div class="row"><button type="button" class="m3-icon-btn small only-hover" data-act="emoji" aria-label="Emoji" data-tooltip="Emoji">${icon('mood')}</button><span class="hint">**bold** *italic* \`code\` ||spoiler|| > quote</span>` +
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
      `<button class="m3-icon-btn small" data-act="hide-highlights" aria-label="Hide highlights"><span translate="no" class="m3-icon">close</span></button></div>` +
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
    // a short hello until it's put away (1.0: one line and two small buttons, so the feed starts near the top)
    const hello = !s.tourDone
      ? `<section class="hello" data-m3-stickers="hello-${name}" data-count="4" data-strength="1.1" data-clip-radius="28">` +
        `<button class="m3-icon-btn close" data-act="dismiss-hello" aria-label="Dismiss welcome"><span translate="no" class="m3-icon">close</span></button>` +
        `<h1 class="m3-title">Welcome, ${esc(name)}!</h1>` +
        '<p>Join a few nests and Spark what you love.</p>' +
        `<div class="row"><a class="m3-btn filled small" href="#/explore">${icon('explore')}Find your nests</a><button class="m3-btn tonal small" data-act="about-nook">${icon('tour')}What’s Budgie?</button></div></section>`
      : '';
    return {
      title: 'Home',
      brand: 'cookie9',
      html:
        '<div class="page"><div class="col">' +
        hello +
        `<div class="composer">${avatar(store.user(store.ME), 40)}<a class="fake-input" href="#/submit" role="button"><span class="not-phone">What’s on your mind, ${esc(name)}?</span><span class="only-phone">Share something…</span></a>` +
        `<a class="m3-icon-btn" href="#/submit?type=image" aria-label="Post an image" data-tooltip="Image"><span translate="no" class="m3-icon">image</span></a>` +
        `<a class="m3-icon-btn" href="#/submit?type=poll" aria-label="Start a poll" data-tooltip="Poll"><span translate="no" class="m3-icon">ballot</span></a></div>` +
        `<div class="toolbar">${sortControl(s.settings.sort)}<span class="spacer"></span>${compactToggle()}</div>` +
        feedShell() +
        // the side: a few nests to try, and the small print (the streak lives on your profile)
        '</div><aside class="rail" aria-label="Sidebar">' +
        trendingCard(3) +
        footCard() +
        '</aside></div>',
      mount(root) {
        const render = () =>
          mountFeed(
            root,
            store.feed({ joinedOnly: true, sort: settings().sort }),
            { ads: true },
            s.joined.length
              ? empty('edit_note', 'It’s quiet in here', 'Nobody has posted in your nests yet. Start the first conversation.', `<a class="m3-btn filled" href="#/submit">${icon('edit')}Create a post</a><a class="m3-btn tonal" href="#/explore">${icon('explore')}Explore nests</a>`)
              : empty('diversity_3', 'Your home is empty', 'Join some nests and their posts will show up here.', `<a class="m3-btn filled" href="#/explore">${icon('explore')}Explore nests</a>`)
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
        `<div class="page-head"><m3-shape-icon shape="softBurst" symbol="local_fire_department" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Popular</h1><span class="muted">The best of every nest, joined or not</span></div></div>` +
        `<div class="toolbar">${sortControl(sort)}<span class="spacer"></span>${compactToggle()}</div>` +
        feedShell() +
        `</div><aside class="rail">${trendingCard(6)}${footCard()}</aside></div>`,
      mount(root) {
        let current = sort;
        const render = () =>
          mountFeed(
            root,
            store.feed({ sort: current }),
            { ads: true },
            empty('local_fire_department', 'Nothing’s popular yet', 'Budgie only shows what people really post. Start something and it could be the first thing here.', `<a class="m3-btn filled" href="#/submit">${icon('edit')}Create a post</a>`, 'softBurst')
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
    if (!c) return notFound(`There’s no nest called n/${params.nook}. Yet.`);
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
        (store.nestPerms(c).length && serverAt('0.9.5') ? `<a class="m3-icon-btn tonal" href="#/n/${esc(c.id)}/manage" aria-label="Manage n/${esc(c.id)}" data-tooltip="Manage">${icon('tune')}</a>` : '') +
        `<button class="m3-icon-btn tonal" data-act="nook-menu" data-nook="${c.id}" aria-label="More" data-tooltip="More"><span translate="no" class="m3-icon">more_horiz</span></button></div></div>` +
        `<p class="nook-tagline">${esc(c.tagline)}</p>` +
        pulse(c) +
        '</section>' +
        bannedNote(c) +
        `<div class="toolbar">${sortControl('hot')}<span class="spacer"></span>` +
        `<button class="m3-btn tonal small only-tablet" data-act="nook-about" data-nook="${c.id}">${icon('info')}About</button>` +
        // nobody banned from the nest is offered a Post button the server will refuse
        `${store.bannedFrom(c.id) ? '' : `<a class="m3-btn filled small" href="#/submit?n=${c.id}">${icon('edit')}Post</a>`}${compactToggle()}</div>` +
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
            { nook: c.id, ads: true },
            empty('edit_note', flair ? `No “${flair}” posts yet` : 'No posts yet', 'Be the first to start something here.', store.bannedFrom(c.id) ? '' : `<a class="m3-btn filled" href="#/submit?n=${c.id}">${icon('edit')}Write the first post</a>`)
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
        `<div class="back-row"><button class="m3-toolbar-btn" data-act="back" data-effect="nudge-left" data-shape="cookie7" data-shape-still aria-label="Back" data-tooltip="Back"><span translate="no" class="m3-icon">arrow_back</span></button>` +
        `<a class="nook-link" href="#/n/${c.id}" style="display:flex;align-items:center;gap:8px;font-weight:700">${nookIcon(c, 28, 16)}n/${esc(c.id)}</a></div>` +
        postCard(p, { open: true, nook: p.n }) +
        highlightsCard(p) +
        '<section class="card" id="comments">' +
        `<div class="toolbar" style="margin-bottom:12px"><h2 class="card-title" style="margin:0">${icon('forum')}<span>Comments <span class="count muted" id="comment-count">${num(count)}</span></span></h2><span class="spacer"></span>` +
        segmented('comment-sort', [['best', 'Best', 'star'], ['top', 'Top', 'trending_up'], ['new', 'New', 'new_releases']], 'best', 'Sort comments') +
        '</div>' +
        `<div id="top-reply">${store.bannedFrom(c.id) ? bannedNote(c) : replyBox('Add to the conversation…', 'Comment')}</div>` +
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
        const box = root.querySelector('#top-reply .reply-box');
        if (box) app().wireReplyBox(box, p, null);
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
        `<div class="page-head"><m3-shape-icon shape="flower" symbol="explore" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Explore</h1><span class="muted">Find your nest. Each one has its own colour, shape and pace.</span></div><span class="spacer"></span>` +
        `<button class="m3-btn filled" data-act="new-nook">${icon('add')}Create a nest</button></div>` +
        (fresh.length
          ? `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="sunny" symbol="photo_library" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Fresh from the nests</h2><m3-wavy-line></m3-wavy-line></header>` +
            `<div class="shelf">${fresh
              .map((p) => {
                const art = p.image ? `url(${p.image})` : `linear-gradient(${p.art.angle || 150}deg, ${p.art.from}, ${p.art.to})`;
                return `<button class="m3-media-card" data-href="#/n/${p.n}/p/${p.id}" data-title="${esc(p.title)}" data-subtitle="n/${esc(p.n)}" data-art="${esc(art)}"></button>`;
              })
              .join('')}</div></section>`
          : '') +
        `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="clover4" symbol="category" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">All nests</h2><m3-wavy-line></m3-wavy-line></header>` +
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
        `<div class="back-row"><a class="m3-toolbar-btn" href="#/saved" data-effect="nudge-left" data-shape="cookie7" data-shape-still aria-label="Back to saved"><span translate="no" class="m3-icon">arrow_back</span></a></div>` +
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

  /** what you can do with someone, by where your friendship stands */
  // a developer gives the Tester badge, or takes it away, from someone's profile
  function testerButton(u) {
    const has = ui.hasBadge(u, 'tester');
    return `<button class="m3-btn tonal" data-act="tester" data-user="${esc(u.name)}" aria-pressed="${has}">${icon(has ? 'check' : 'science')}${has ? 'Tester' : 'Make tester'}</button>`;
  }

  function friendButtons(name, small = false) {
    const who = esc(name);
    const size = small ? ' small' : '';
    switch (store.friendStatus(name)) {
      case 'friends':
        return `<a class="m3-btn filled${size}" href="#/messages/${encodeURIComponent(name)}">${icon('chat')}Message</a><button class="m3-btn tonal${size}" data-act="unfriend" data-user="${who}">${icon('how_to_reg')}Friends</button>`;
      case 'outgoing':
        return `<button class="m3-btn tonal${size}" data-act="unfriend" data-user="${who}">${icon('schedule')}Request sent</button>`;
      case 'incoming':
        return `<button class="m3-btn filled${size}" data-act="befriend" data-user="${who}">${icon('how_to_reg')}Accept</button><button class="m3-btn text${size}" data-act="unfriend" data-user="${who}">Decline</button>`;
      default:
        return `<button class="m3-btn filled${size}" data-act="befriend" data-user="${who}">${icon('person_add')}Add friend</button>`;
    }
  }

  function profile(params) {
    const name = params.user;
    const u = store.user(name);
    const me = store.isMe(name);
    if (!me && u.unknown) return notFound(`We couldn’t find u/${name}.`);
    const st = store.userStats(u.name);
    const s = store.state;
    const where = [...new Set(st.posts.map((p) => p.n).concat(st.comments.map((c) => (store.post(c.postId) || {}).n)).filter(Boolean))]
      .map((id) => store.community(id))
      .filter(Boolean)
      .slice(0, 6);
    const joinedDays = Math.max(1, Math.round((Date.now() - (me ? s.me.joinedAt : u.createdAt || Date.now())) / 86400000));
    const badges = me
      ? `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="burst" symbol="military_tech" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Badges</h2><m3-wavy-line></m3-wavy-line><span class="muted">${Object.keys(s.badges).length}/${store.BADGES.length}</span></header>` +
        `<div class="badges">${store.BADGES.map((b) => {
          const got = !!s.badges[b.id];
          return `<div class="badge-tile${got ? '' : ' locked'}" data-tooltip="${esc(b.desc)}"><m3-shape-icon shape="${b.shape}" symbol="${got ? b.symbol : 'lock'}" size="52" icon-size="24"></m3-shape-icon><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`;
        }).join('')}</div></section>`
      : '';
    const banner = ui.bannerImage(u);
    const who = me ? Object.assign({}, u, s.me) : u;
    // the shapes floating behind it: a mix, the owner's favourite, or none
    const stickers = who.sticker === 'none' ? '' : ` data-m3-stickers="u-${esc(u.name)}" data-count="${who.sticker ? 5 : 4}" data-clip-radius="30"${who.sticker ? ` data-shapes="${esc(who.sticker)}"` : ''}`;
    const interests = ui.INTERESTS.filter(([id]) => (who.interests || []).includes(id));
    return {
      title: `u/${u.name}`,
      brand: u.shape,
      // the page wears its owner's colour, in the style they picked
      wear: { color: who.color, style: who.scheme || '' },
      html:
        '<div class="page"><div class="col">' +
        (banner
          ? `<section class="profile-hero has-banner"><div class="profile-banner">${banner}</div>`
          : `<section class="profile-hero"${stickers}>`) +
        `<div class="profile-main">${avatar(u, 96, { moving: true })}<div class="who"><h1 class="m3-title${who.flag ? ' has-flag' : ''}" style="--name-len: ${u.name.length}"><span class="${nameFont(who).trim()}">${esc(u.name)}</span>${prideFlag(who)}</h1>` +
        `<span class="muted">u/${esc(u.name)}${who.pronouns ? ` · <span class="pronouns">${esc(who.pronouns)}</span>` : ''} · joined ${joinedDays <= 1 ? 'today' : plural(joinedDays, 'day') + ' ago'}${u.admin ? ' · <span class="tag">Admin</span>' : ''}${u.banned ? ' · <span class="tag">Banned</span>' : ''}</span>` +
        specialBadges(who) +
        (u.bio ? `<div class="md bio">${md(clean(u.bio))}</div>` : me ? '<p class="muted bio">No bio yet. Tell people what you’re into!</p>' : '') +
        (interests.length ? `<div class="interests" aria-label="Into">${interests.map(([, label, symbol]) => `<span class="chip static">${icon(symbol)}${label}</span>`).join('')}</div>` : '') +
        '</div>' +
        (me
          ? `<button class="m3-btn tonal" data-act="edit-profile">${icon('edit')}Edit profile</button>`
          : u.banned
          ? ''
          : store.isBlocked(u.name)
          ? `<div class="toolbar profile-actions"><button class="m3-btn tonal" data-act="unblock" data-user="${esc(u.name)}">${icon('lock_open')}Unblock</button></div><p class="muted blocked-note">${icon('block')}You blocked u/${esc(u.name)}. They can’t message you, call you or add you, and their posts and comments are hidden from you.</p>`
          : `<div class="toolbar profile-actions">${friendButtons(u.name)}${store.isDev() ? testerButton(u) : ''}` +
            // Report and Block, under one button so the row fits a phone
            (store.state.canBlock
              ? `<button class="m3-icon-btn tonal" data-act="person-menu" data-user="${esc(u.name)}" aria-label="More for u/${esc(u.name)}: report or block" data-tooltip="Report or block">${icon('more_vert')}</button>`
              : `<button class="m3-icon-btn tonal" data-act="report-user" data-user="${esc(u.name)}" aria-label="Report u/${esc(u.name)}" data-tooltip="Report">${icon('flag')}</button>`) +
            '</div>') +
        '</div><div class="stats">' +
        `<div class="stat" title="Every upvote on their posts and comments is a feather"><b class="count">${num(st.feathers)}</b><span>Feathers</span></div>` +
        `<div class="stat"><b class="count">${num(st.posts.length)}</b><span>Posts</span></div>` +
        `<div class="stat"><b class="count">${num(st.comments.length)}</b><span>Comments</span></div>` +
        (me && !s.settings.calm ? `<div class="stat"><b>${plural(s.streak.count, 'day')}</b><span>Streak</span></div>` : '') +
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
          if (!me && store.isBlocked(u.name)) {
            box.innerHTML = empty('block', tab === 'posts' ? 'Their posts are hidden' : 'Their comments are hidden', `You blocked u/${u.name}. Unblock them to see what they write.`);
            return;
          }
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
                  `<button class="note${store.isRead(n) ? '' : ' unread'}" data-m3-ripple data-act="open-note" data-note="${n.id}" data-href="${esc(n.href || '')}">` +
                  `<m3-shape-icon shape="${n.shape}" symbol="${n.symbol}" size="44" icon-size="22"></m3-shape-icon>` +
                  `<span class="note-text"><span>${esc(n.text)}</span><small>${ago(n.createdAt)}</small></span></button>`
              )
              .join('')}</div>`
          : empty('notifications_off', 'All quiet', 'Replies, friend requests and the badges you earn show up here.')) +
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
      `<a class="row-link" href="#/u/${esc(u.name)}" data-m3-ripple>${avatar(u, 44)}<span class="row-text"><b>u/${highlight(u.name, q)}</b><small>${highlight(plain(u.bio || '', 90), q)}</small></span></a>`;
    return {
      title: q ? `“${q}”` : 'Search',
      brand: 'ghostish',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="ghostish" symbol="search" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">${q ? `Results for “${esc(q)}”` : 'Search'}</h1>` +
        `<span class="muted">${q ? `${plural(r.posts.length, 'post')}, ${plural(r.nooks.length, 'nest')}, ${plural(r.people.length, 'person', 'people')}` : 'Type in the search bar above'}</span></div></div>` +
        `<div class="toolbar">${segmented('search-tab', [['posts', `Posts`, 'article'], ['nooks', `Nests`, 'diversity_3'], ['people', `People`, 'group']], tab, 'Result type')}</div>` +
        '<div id="search-results"></div></div></div>',
      mount(root) {
        const box = root.querySelector('#search-results');
        const show = (t) => {
          if (!q) {
            box.innerHTML = empty('search', 'Search Budgie', 'Find posts, nests and people.');
          } else if (t === 'posts') {
            box.innerHTML = feedShell();
            mountFeed(box, r.posts, { query: q }, empty('search_off', 'No posts match', 'Try fewer or different words.'));
          } else if (t === 'nooks') {
            box.innerHTML = r.nooks.length ? `<div class="card"><div class="list">${r.nooks.map(nookRow).join('')}</div></div>` : empty('search_off', 'No nests match', 'Maybe it’s time to create one?', `<button class="m3-btn filled" data-act="new-nook">${icon('add')}Create a nest</button>`);
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
        `<div class="page-head"><m3-shape-icon shape="gem" symbol="settings" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Settings</h1><span class="muted">Make Budgie yours. Changes save as you go.</span></div></div>` +
        `<section>${header('flower', 'palette', 'Appearance')}<div class="card setting-card">` +
        // the app's language (1.0), each named in its own language
        (Nook.i18n
          ? `<div class="setting-row"><label class="label" for="set-lang">Language</label><select class="m3-field lang-select" id="set-lang" data-no-i18n translate="no">${Object.entries(Nook.i18n.LANGS)
              .map(([code, name]) => `<option value="${code}"${code === Nook.i18n.lang ? ' selected' : ''}>${name}</option>`)
              .join('')}</select></div>`
          : '') +
        `<div class="setting-row"><span class="label">Mode</span>${segmented('set-mode', [['system', 'System', 'brightness_auto'], ['light', 'Light', 'light_mode'], ['dark', 'Dark', 'dark_mode']], s.mode, 'Mode')}</div>` +
        `<div class="setting-row"><span class="label">Your colour (used outside nests)</span><div class="swatches" id="set-seeds">${ui.SEEDS.map(
          (seed, i) => `<button class="swatch" data-seed="${seed}" aria-pressed="${seed === s.seed}" aria-label="Colour ${seed}" data-tooltip="${seed}"><m3-shape shape="${ui.SEED_SHAPES[i]}" style="color:${seed}"></m3-shape></button>`
        ).join('')}<input type="color" class="color-input" id="set-color" value="${s.seed}" aria-label="Pick any colour" data-tooltip="Pick any colour"></div></div>` +
        `<div class="setting-row"><span class="label">Scheme style</span>${segmented('set-variant', [['tonalSpot', 'Tonal spot'], ['expressive', 'Expressive'], ['vibrant', 'Vibrant'], ['fidelity', 'Fidelity'], ['neutral', 'Neutral']], s.variant, 'Scheme style')}</div>` +
        sw('set-themeNooks', 'Wear nests’ and profiles’ colours', 'The whole app re-themes itself when you visit a nest, or someone’s profile in the colours they picked.', s.themeNooks) +
        sw('set-tintPosts', 'Tint posts by their nest', 'In mixed feeds, each card takes its nest’s colours.', s.tintPosts) +
        sw('set-reduceMotion', 'Reduce motion', 'Stop things that move on their own and keep pages still as they change.', s.reduceMotion) +
        sw('set-haptics', 'Haptic taps', 'A tiny buzz when you vote, spark, save or join, on phones that can.', s.haptics !== false) +
        sw('set-nameFonts', 'Name fonts', 'Show names in the fonts people picked for them. Off, every name is in Budgie’s own font.', s.nameFonts !== false) +
        (ui.theme.offline ? '<p class="muted">Couldn’t load the colour library (offline?), so only the built-in scheme is available right now.</p>' : '') +
        '</div></section>' +
        `<section>${header('cookie9', 'dynamic_feed', 'Feed')}<div class="card setting-card">` +
        `<div class="setting-row"><span class="label">Default sort on Home</span>${segmented('set-sort', ['hot', 'new', 'top', 'rising'].map((k) => [k, SORT_LABELS[k][0], SORT_LABELS[k][1]]), s.sort, 'Default sort')}</div>` +
        sw('set-compact', 'Compact cards', 'Smaller posts with thumbnails, so you see more at once.', s.compact) +
        sw('set-calm', 'Calm mode', 'Hide every score, count, tally and streak, show new things as a dot instead of a number, and skip the confetti. Votes still count, you just don’t see them.', s.calm) +
        sw('set-filterLanguage', 'Hide strong language', 'Swear words show as dots, like f•••. Slurs and threats are never allowed at all.', s.filterLanguage !== false) +
        '</div></section>' +
        `<section>${header('heart', 'self_improvement', 'Wellbeing')}<div class="card setting-card">` +
        `<div class="setting-row"><span class="label">Remind me to take a break after</span><div class="slider-row"><m3-slider id="set-break" min="0" max="120" step="15" value="${s.breakMinutes}" value-tip show-stop label="Break reminder"></m3-slider><output id="set-break-out">${s.breakMinutes ? s.breakMinutes + ' min' : 'Off'}</output></div></div>` +
        '</div></section>' +
        (chatsPlus()
          ? `<section>${header('clover8', 'call', 'Calls')}<div class="card setting-card">` +
            sw('set-calls', 'Let friends call me', 'Voice and video calls from your friends and the groups you’re in. Off, nobody can ring you, but you can still call them.', store.state.me.calls !== 'off') +
            (serverAt('0.9.5') && Nook.calls
              ? `<div class="setting-row"><span class="label">Ringtone</span>${segmented('set-ringtone', Nook.calls.RINGTONES.map((id) => [id, id[0].toUpperCase() + id.slice(1)]), s.ringtone || 'budgie', 'Ringtone')}</div>` +
                `<div class="toolbar"><button class="m3-btn tonal" data-act="call-look">${icon('palette')}Call look</button><button class="m3-btn text" data-act="ring-preview">${icon('volume_up')}Hear the ringtone</button></div>`
              : '') +
            '<p class="muted">Calls go straight between devices, encrypted, and are never recorded. As with any direct call, the people in a call can see your device’s internet (IP) address, unless it goes through Budgie’s relay. Only call people you trust.</p>' +
            '</div></section>'
          : '') +
        (store.state.canBlock
          ? `<section>${header('softBoom', 'block', 'Blocked people')}<div class="card setting-card">` +
            (store.state.blocked.length
              ? `<div class="team-list">${store.state.blocked
                  .map((n) => `<div class="team-row">${avatar(store.user(n), 40)}<span class="row-text"><b>u/${esc(n)}</b><small>Can’t message you, call you or add you</small></span><button type="button" class="m3-btn text small" data-act="unblock" data-user="${esc(n)}">${icon('lock_open')}Unblock</button></div>`)
                  .join('')}</div>`
              : '<p class="muted">Nobody. You can block someone from their profile, or from the More menu in a chat with them. They aren’t told.</p>') +
            '</div></section>'
          : '') +
        `<section>${header('pixelCircle', 'manage_accounts', 'Account')}<div class="card setting-card">` +
        `<div class="about-app">${avatar(store.user(store.ME), 48)}<div><b class="m3-title">u/${esc(store.state.me.name)}</b><span class="muted">Signed in${store.isAdmin() ? ' · Admin' : ''}</span></div></div>` +
        `<div class="toolbar"><button class="m3-btn tonal" data-act="change-password">${icon('password')}Change password</button><button class="m3-btn tonal" data-act="new-recovery">${icon('key')}New recovery code</button><button class="m3-btn tonal" data-act="export">${icon('download')}Export my data</button></div>` +
        `<div class="toolbar"><button class="m3-btn outlined" data-act="sign-out">${icon('logout')}Sign out</button><button class="m3-btn text danger" data-act="delete-account">${icon('person_remove')}Delete account</button></div>` +
        '</div></section>' +
        `<section>${header('clover4', 'policy', 'Privacy and legal')}<div class="card setting-card">` +
        (Nook.ads && Nook.ads.on
          ? '<p class="muted">Budgie itself uses no cookies and no trackers. The ads between posts come from Google: they aren’t personalised, and Google uses cookies for them only as far as you allow. Your account, posts and messages are kept on Budgie’s own server; this browser keeps only what signs you in.</p>'
          : '<p class="muted">Budgie uses no cookies and no trackers, and loads nothing from other companies. Your account, posts and messages are kept on Budgie’s own server; this browser keeps only what signs you in.</p>') +
        `<div class="toolbar"><a class="m3-btn tonal" href="terms.html">${icon('gavel')}Terms of Use</a><a class="m3-btn tonal" href="privacy.html">${icon('shield_lock')}Privacy Policy</a><a class="m3-btn tonal" href="licenses.html">${icon('license')}Open-source licenses</a><button class="m3-btn outlined" data-act="storage-notice">${icon('cookie')}Storage and cookies</button>` +
        (Nook.ads && Nook.ads.on ? `<button class="m3-btn outlined" data-act="ad-choices">${icon('ad_units')}Ad cookie choices</button>` : '') +
        '</div>' +
        '</div></section>' +
        `<section>${header('sunny', 'info', 'About')}<div class="card setting-card">` +
        `<div class="about-app"><m3-shape-icon shape="cookie9" symbol="diversity_3" size="56" icon-size="28"></m3-shape-icon><div><b class="m3-title">Budgie</b><span class="muted">Version ${esc(store.VERSION)}</span></div></div>` +
        `<div class="toolbar"><button class="m3-btn filled" data-act="credits">${icon('stars')}Credits</button><button class="m3-btn tonal" data-act="about-nook">${icon('help')}What’s Budgie?</button></div>` +
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
        for (const key of ['themeNooks', 'tintPosts', 'reduceMotion', 'compact', 'calm', 'haptics', 'filterLanguage', 'nameFonts']) {
          $('#set-' + key).addEventListener('change', (e) => {
            s[key] = e.target.checked;
            apply();
          });
        }
        // a new language: kept with your settings (so your other devices follow) and the page starts again in it
        const langPick = $('#set-lang');
        if (langPick) {
          langPick.addEventListener('change', () => {
            s.lang = langPick.value;
            store.save();
            setTimeout(() => Nook.i18n.choose(langPick.value), 300);
          });
        }
        const tone = $('#set-ringtone');
        if (tone) {
          tone.addEventListener('change', (e) => {
            s.ringtone = e.detail.value;
            store.save();
            Nook.calls.preview(s.ringtone);
          });
        }
        const calls = $('#set-calls');
        if (calls) {
          calls.addEventListener('change', () =>
            store.setCalls(calls.checked).then(
              (now) => M3.snackbar(now === 'off' ? 'Nobody can ring you now.' : 'Your friends can call you.'),
              (error) => {
                calls.checked = !calls.checked;
                app().showError(error);
              }
            )
          );
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
    const start = params.n || draft.n || s.recent.find((id) => store.community(id)) || s.joined[0] || 'askbudgie';
    const nook = store.community(start) || store.community('askbudgie');
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
        // a picture or GIF, or (when the server takes them, from 1.0) a video
        `<div>${segmented('post-type', [['text', 'Text', 'notes'], ['image', s.videos ? 'Media' : 'Image', s.videos ? 'perm_media' : 'image'], ['link', 'Link', 'link'], ['poll', 'Poll', 'ballot']], type === 'video' ? 'image' : type, 'Post type')}</div>` +
        `<div class="field"><label for="f-title">Title</label><input class="m3-field" id="f-title" maxlength="300" required placeholder="An interesting title" value="${esc(draft.title || '')}"><span class="counter" id="f-title-count">0/300</span><span class="error" id="f-title-err"></span></div>` +
        `<div class="field"><span class="field-label">Flair</span><div class="chips" id="f-flairs" role="group" aria-label="Flair"></div></div>` +
        // image
        `<div class="field" data-for="image"><span class="field-label">${s.videos ? 'A picture, GIF or video' : 'Image'}</span><label class="drop" id="f-drop"><input type="file" id="f-file" accept="${s.videos ? 'image/*,video/*' : 'image/*'}" hidden><span id="f-drop-inner"><m3-shape-icon shape="clover8" symbol="${s.videos ? 'perm_media' : 'add_photo_alternate'}" size="56" icon-size="28"></m3-shape-icon><br>${
          s.videos ? 'Drop a picture, GIF or video here, or click to choose one<br><small class="muted">Videos up to a minute. Everything is checked automatically.</small>' : 'Drop an image here, or click to choose one'
        }</span></label><span class="error" id="f-image-err"></span></div>` +
        // link
        `<div class="field" data-for="link"><label for="f-url">Link</label><input class="m3-field" id="f-url" type="url" placeholder="https://" value="${esc(draft.url || '')}"><span class="error" id="f-url-err"></span></div>` +
        // poll
        `<div class="field" data-for="poll"><span class="field-label">Poll options</span><div class="poll-edit" id="f-poll"></div><button type="button" class="m3-btn text small" id="f-poll-add" style="justify-self:start">${icon('add')}Add option</button><span class="error" id="f-poll-err"></span></div>` +
        // body
        `<div class="field"><div class="toolbar" style="justify-content:space-between"><label for="f-body" class="field-label">Body <span class="muted" id="f-body-optional">(optional)</span></label>${segmented('body-mode', [['write', 'Write'], ['preview', 'Preview']], 'write', 'Body mode')}</div>` +
        '<div id="f-write"><div class="format-bar" role="toolbar" aria-label="Formatting">' +
        [['bold', 'format_bold', '**', '**'], ['italic', 'format_italic', '*', '*'], ['code', 'code', '`', '`'], ['link', 'link', '[', '](https://)'], ['quote', 'format_quote', '> ', ''], ['list', 'format_list_bulleted', '- ', ''], ['spoiler', 'visibility_off', '||', '||']]
          .map(([name, sym, a, b]) => `<button type="button" class="m3-icon-btn small" data-wrap-a="${esc(a)}" data-wrap-b="${esc(b)}" aria-label="${name}" data-tooltip="${name[0].toUpperCase() + name.slice(1)}"><span translate="no" class="m3-icon">${sym}</span></button>`)
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

  // ---- friends and messages ------------------------------------------------------------------------------

  const personRowHTML = (u, actions) =>
    `<div class="row-link person-row" data-href="#/u/${encodeURIComponent(u.name)}" tabindex="0" role="link" aria-label="u/${esc(u.name)}" data-m3-ripple data-m3-hover-root>${avatar(u, 44)}` +
    `<span class="row-text"><b class="${nameFont(u).trim()}">u/${esc(u.name)}${prideFlag(u)}</b><small>${u.pronouns ? esc(u.pronouns) + ' · ' : ''}${esc(clean(u.bio || '')) || 'Joined ' + ago(u.createdAt || Date.now())}</small></span><span class="row-actions">${actions}</span></div>`;

  function friendsPage() {
    const incoming = store.friends('incoming');
    const outgoing = store.friends('outgoing');
    const mine = store.friends('friends');
    const others = store.people().filter((u) => !store.isMe(u.name) && store.friendStatus(u.name) === 'none').slice(0, 8);
    const section = (shape, symbol, title, rows) =>
      `<section class="section"><header class="m3-section-header" data-m3-hover-root><m3-shape-icon shape="${shape}" symbol="${symbol}" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">${title}</h2><m3-wavy-line></m3-wavy-line></header><div class="card"><div class="list">${rows}</div></div></section>`;
    return {
      title: 'Friends',
      brand: 'heart',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="heart" symbol="group" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Friends</h1><span class="muted">Friends can message each other.</span></div></div>` +
        `<form class="card add-friend" id="add-friend"><label for="af-name" class="field-label">Add a friend by username</label><div class="toolbar"><input class="m3-field" id="af-name" placeholder="their_username" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="20"><button class="m3-btn filled" type="submit">${icon('person_add')}Send request</button></div><span class="error" id="af-err"></span></form>` +
        (incoming.length ? section('softBurst', 'person_add', `Requests <span class="count muted">${incoming.length}</span>`, incoming.map((f) => personRowHTML(store.user(f.name), friendButtons(f.name, true))).join('')) : '') +
        (mine.length
          ? section('heart', 'diversity_1', 'Your friends', mine.map((f) => personRowHTML(store.user(f.name), friendButtons(f.name, true))).join(''))
          : empty('diversity_1', 'No friends yet', 'Send someone a request: when they accept, you can message each other.', '', 'heart')) +
        (outgoing.length ? section('clover4', 'schedule', 'Sent requests', outgoing.map((f) => personRowHTML(store.user(f.name), friendButtons(f.name, true))).join('')) : '') +
        (others.length ? section('flower', 'waving_hand', 'People on Budgie', others.map((u) => personRowHTML(u, friendButtons(u.name, true))).join('')) : '') +
        '</div></div>',
      mount(root) {
        root.querySelector('#add-friend').addEventListener('submit', async (e) => {
          e.preventDefault();
          const input = root.querySelector('#af-name');
          const err = root.querySelector('#af-err');
          const name = input.value.trim().replace(/^u\//, '');
          err.textContent = '';
          if (!name) return input.focus();
          try {
            const status = await store.befriend(name);
            M3.toast(status === 'friends' ? `You and u/${name} are friends now` : `Friend request sent to u/${name}`, { symbol: 'person_add', shape: 'heart' });
            app().rerender();
          } catch (error) {
            err.textContent = error.message;
          }
        });
        root._onFriends = () => app().rerender();
      },
    };
  }

  function messagesPage() {
    const convos = store.state.conversations;
    const groups = store.state.groups || [];
    const talking = new Set(convos.map((c) => c.with.toLowerCase()));
    const quiet = store.friends('friends').filter((f) => !talking.has(f.name.toLowerCase()));
    const meta = (last, unread) =>
      `<span class="convo-meta"><small>${last ? ago(last.createdAt) : ''}</small>${unread ? `<span class="badge-dot">${unread > 9 ? '9+' : unread}</span>` : ''}</span>`;
    const row = (c) => {
      const u = store.user(c.with);
      return (
        `<a class="row-link convo${c.unread ? ' unread' : ''}" href="#/messages/${encodeURIComponent(u.name)}" data-m3-ripple data-m3-hover-root>${avatar(u, 48)}` +
        `<span class="row-text"><b>${esc(u.name)}</b><small>${esc(preview(c.last))}</small></span>${meta(c.last, c.unread)}</a>`
      );
    };
    const groupRow = (g) =>
      `<a class="row-link convo group-convo${g.unread ? ' unread' : ''}" href="#/messages/g/${encodeURIComponent(g.id)}" data-m3-ripple data-m3-hover-root>${groupIcon(g, 48)}` +
      `<span class="row-text"><b>${esc(g.name)}</b><small>${esc(preview(g.last, true) || plural(g.members.length, 'member'))}</small></span>${meta(g.last, g.unread)}</a>`;
    // chats with one friend and group chats, newest news first
    const chats = [
      ...convos.map((c) => ({ at: c.last ? c.last.createdAt : 0, html: () => row(c) })),
      ...groups.map((g) => ({ at: g.last ? g.last.createdAt : g.createdAt || 0, html: () => groupRow(g) })),
    ].sort((a, b) => b.at - a.at);
    const newGroup = chatsPlus() && store.friends('friends').length ? `<button class="m3-btn tonal small" type="button" data-act="new-group">${icon('group_add')}New group</button>` : '';
    return {
      title: 'Messages',
      brand: 'clover4',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="clover4" symbol="chat" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Messages</h1><span class="muted">${chatsPlus() ? 'Private chats and calls with your friends.' : 'Private chats with your friends.'}</span></div><span class="spacer"></span>${newGroup}<a class="m3-btn tonal small" href="#/friends">${icon('group')}Friends</a></div>` +
        (chats.length ? `<div class="card"><div class="list">${chats.map((c) => c.html()).join('')}</div></div>` : '') +
        (quiet.length
          ? `<section class="section"><header class="m3-section-header"><m3-shape-icon shape="heart" symbol="waving_hand" size="34" icon-size="18"></m3-shape-icon><h2 class="m3-title">Say hi</h2><m3-wavy-line></m3-wavy-line></header><div class="card"><div class="list">${quiet
              .map((f) => personRowHTML(store.user(f.name), `<a class="m3-btn tonal small" href="#/messages/${encodeURIComponent(f.name)}">${icon('chat')}Message</a>`))
              .join('')}</div></div></section>`
          : '') +
        (!chats.length && !quiet.length ? empty('forum', 'No messages yet', 'Add friends, and once they accept you can chat here.', `<a class="m3-btn filled" href="#/friends">${icon('person_add')}Find friends</a>`, 'clover4') : '') +
        '</div></div>',
      mount(root) {
        root._onMessages = () => app().rerender();
        root._onFriends = () => app().rerender();
        root._onGroups = () => app().rerender();
      },
    };
  }

  // ---- chat --------------------------------------------------------------------------------------------

  const GROUP_GAP = 5 * 60000; // messages closer together than this, from the same person, share one run
  // only one to three emoji: shown big, without a bubble
  const JUMBO = /^(?:\p{Extended_Pictographic}[\p{Emoji_Modifier}\p{Variation_Selector}\p{Join_Control}\p{Extended_Pictographic}]*\s*){1,3}$/u;
  const clock = (t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  /** whether the server is at least `version` (features come with the server they need) */
  function serverAt(version) {
    const have = String(Nook.serverVersion || '0.0.0').split('.').map(Number);
    const want = version.split('.').map(Number);
    for (let i = 0; i < 3; i++) if ((have[i] || 0) !== (want[i] || 0)) return (have[i] || 0) > (want[i] || 0);
    return true;
  }
  // group chats and calls came with the server's 0.9.0; pictures in chats with 0.9.5
  const chatsPlus = () => serverAt('0.9.0');
  const groupIcon = (g, size = 40, iconSize = Math.round(size * 0.5)) => nookIcon({ shape: g.shape, symbol: 'groups', color: g.color }, size, iconSize);

  function dayLabel(t) {
    const d = new Date(t);
    const now = new Date();
    const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
    return d.toLocaleDateString([], { day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
  }

  const lineData = (m) => {
    try {
      return JSON.parse(m.body) || {};
    } catch (_) {
      return {};
    }
  };
  const duration = (secs) => (secs < 60 ? `${Math.max(1, secs)} s` : secs < 3600 ? `${Math.round(secs / 60)} min` : `${Math.floor(secs / 3600)} h ${Math.round((secs % 3600) / 60)} min`);

  /** a call's line in a chat, or a group's news (who joined, left or renamed it), in words */
  function lineText(m, inGroup = false) {
    const d = lineData(m);
    const who = m.mine ? 'You' : m.from ? 'u/' + m.from : 'Someone';
    if (m.kind === 'theme') return d.color ? `${who} changed the chat’s colour` : `${who} set the chat back to its usual colours`;
    if (m.kind === 'call') {
      const kind = d.media === 'video' ? 'video call' : 'voice call';
      if (inGroup) return `${who} started a ${kind} · ${d.missed ? 'nobody joined' : duration(d.secs)}`;
      if (d.missed) return m.mine ? `${kind[0].toUpperCase() + kind.slice(1)} · no answer` : `Missed ${kind}`;
      return `${kind[0].toUpperCase() + kind.slice(1)} · ${duration(d.secs)}`;
    }
    const names = (d.names || []).map((n) => 'u/' + n).join(', ');
    switch (d.type) {
      case 'created':
        return `${who} made the group${names ? ' with ' + names : ''}`;
      case 'added':
        return `${who} added ${names}`;
      case 'removed':
        return `${who} removed ${names}`;
      case 'left':
        return `${who} left the group`;
      case 'renamed':
        return d.moderator ? `A moderator renamed the group “${d.name}”` : `${who} renamed the group “${d.name}”`;
      case 'owner':
        return `${who} ${m.mine ? 'are' : 'is'} now the group’s owner`;
      default:
        return m.body;
    }
  }
  function lineIcon(m) {
    const d = lineData(m);
    if (m.kind === 'theme') return 'palette';
    if (m.kind === 'call') return d.missed && !m.mine ? (d.media === 'video' ? 'missed_video_call' : 'call_missed') : d.media === 'video' ? 'videocam' : 'call';
    return { created: 'groups', added: 'person_add', removed: 'person_remove', left: 'logout', renamed: 'edit', owner: 'shield_person' }[d.type] || 'info';
  }
  const mediaWord = (x) => (x.type === 'klipy' || x.gif ? 'GIF' : 'Photo');
  /** the last message, for a list of chats */
  const preview = (m, inGroup) =>
    !m ? '' : m.kind ? lineText(m, inGroup) : (m.mine ? 'You: ' : inGroup && m.from ? m.from + ': ' : '') + (m.body ? plain(clean(m.body), 80) : m.media ? (mediaWord(m.media) === 'GIF' ? 'GIF' : '📷 Photo') : '');

  /** a picture or GIF in a bubble; it opens full size when pressed */
  function mediaHTML(x) {
    const moving = !ui.motionOff();
    const src = x.local || (x.type === 'klipy' && !moving && x.still ? x.still : Nook.api.url(x.url));
    const label = x.type === 'klipy' ? x.title || 'GIF' : mediaWord(x);
    const shape = x.width && x.height ? ` style="aspect-ratio:${x.width}/${x.height}"` : '';
    return (
      `<button type="button" class="msg-media" data-act="view-media" data-src="${esc(x.local || Nook.api.url(x.url))}" data-label="${esc(label)}" aria-label="Open ${esc(label)}">` +
      `<img src="${esc(src)}" alt="${esc(label)}" loading="lazy" referrerpolicy="no-referrer"${shape}>${mediaWord(x) === 'GIF' ? '<span class="gif-tag">GIF</span>' : ''}</button>`
    );
  }

  /** a conversation as days, in each day runs of bubbles from one person, with calls and group news as lines between */
  function chatHTML(messages, them, inGroup = false) {
    let html = '';
    let day = '';
    let run = null;
    const lastMine = [...messages].reverse().find((m) => m.mine && !m.kind && !m.pending && !m.failed);
    let hidden = 0;
    const close = () => {
      if (run) html += runHTML(run, them, lastMine, inGroup);
      run = null;
      if (hidden) html += `<div class="chat-line blocked">${icon('block')}<span>${hidden === 1 ? 'A message' : hidden + ' messages'} from someone you blocked</span></div>`;
      hidden = 0;
    };
    for (const m of messages) {
      const d = new Date(m.createdAt).toDateString();
      if (d !== day) {
        close();
        day = d;
        html += `<div class="chat-day" role="separator"><span>${esc(dayLabel(m.createdAt))}</span></div>`;
      }
      if (m.kind) {
        close();
        html += chatLine(m, them, inGroup);
        continue;
      }
      if (inGroup && !m.mine && store.isBlocked(m.from)) {
        if (run) close();
        hidden++;
        continue;
      }
      if (hidden) close();
      const who = m.mine ? '' : m.from;
      const prev = run && run.items[run.items.length - 1];
      if (run && (run.who !== who || m.createdAt - prev.createdAt > GROUP_GAP)) close();
      if (!run) run = { mine: !!m.mine, who, items: [] };
      run.items.push(m);
    }
    close();
    return html;
  }

  function chatLine(m, them, inGroup) {
    const d = lineData(m);
    const missed = m.kind === 'call' && d.missed && !m.mine;
    // a missed call from a friend can be returned from right there
    const back = missed && !inGroup && them ? `<button type="button" class="m3-btn text small" data-act="call" data-user="${esc(them.name)}" data-media="${d.media === 'video' ? 'video' : 'voice'}">Call back</button>` : '';
    return `<div class="chat-line${missed ? ' missed' : ''}" data-message="${esc(String(m.id))}">${icon(lineIcon(m))}<span>${esc(lineText(m, inGroup))}</span><small>${esc(clock(m.createdAt))}</small>${back}</div>`;
  }

  function runHTML(g, them, lastMine, inGroup) {
    const n = g.items.length;
    const bubbles = g.items
      .map((m, i) => {
        const where = n === 1 ? 'solo' : i === 0 ? 'first' : i === n - 1 ? 'last' : 'mid';
        const words = (m.body || '').trim();
        const big = !m.media && JUMBO.test(words) ? ' jumbo' : '';
        const state = m.failed ? ' failed' : m.pending ? ' pending' : '';
        const media = m.media ? ' has-media' + (words ? '' : ' only-media') : '';
        return (
          `<div class="bubble ${where}${big}${state}${media}" data-message="${esc(String(m.id))}" title="${esc(new Date(m.createdAt).toLocaleString())}">` +
          (m.media ? mediaHTML(m.media) : '') +
          (words ? `<div class="md">${md(clean(m.body))}</div>` : '') +
          '</div>'
        );
      })
      .join('');
    const last = g.items[n - 1];
    let meta = esc(clock(last.createdAt));
    if (g.items.some((m) => m.failed)) meta = `<button type="button" class="chat-retry">${icon('error')}Not sent. Tap to try again</button>`;
    else if (g.items.some((m) => m.pending)) meta = 'Sending…';
    else if (!inGroup && last === lastMine) meta += last.read ? ` · <span class="seen">${icon('done_all')}Seen</span>` : ` · ${icon('check')}Sent`;
    // in a group, each run says who it's from
    const sender = g.mine ? null : inGroup ? store.user(g.who) : them;
    const face = sender ? `<a class="msg-avatar" href="#/u/${encodeURIComponent(sender.name)}" aria-label="u/${esc(sender.name)}">${avatar(sender, 28)}</a>` : '';
    const name = inGroup && sender ? `<a class="msg-name${nameFont(sender)}" href="#/u/${encodeURIComponent(sender.name)}">${esc(sender.name)}</a>` : '';
    return `<div class="msg-group ${g.mine ? 'mine' : 'them'}">${face}<div class="msg-stack">${name}${bubbles}<small class="msg-meta">${meta}</small></div></div>`;
  }

  /** a chat page around a conversation: its header, the messages, and the box to write in (or why you can't) */
  function chatPage(head, { placeholder, locked = '' } = {}) {
    return (
      '<div class="page single chat-page"><div class="col">' +
      head +
      '<div class="chat" id="chat"><div class="chat-more" id="chat-more"></div><div class="chat-list" id="chat-list" aria-live="polite"><m3-loading aria-label="Loading messages"></m3-loading></div></div>' +
      (locked ||
        `<button type="button" class="chat-jump" id="chat-jump" hidden>${icon('arrow_downward')}<span>New messages</span></button>` +
          '<div class="chat-attach" id="chat-attach" hidden></div>' +
          `<form class="chat-box" id="chat-box">${chatTools()}<textarea class="m3-field" id="chat-input" rows="1" maxlength="2000" placeholder="${esc(placeholder)}" aria-label="Message" enterkeyhint="send"></textarea>` +
          `<button class="m3-icon-btn filled chat-send" type="submit" aria-label="Send" disabled>${icon('send')}</button></form>`) +
      '</div></div>'
    );
  }

  /** what can go in a message besides words, once the server takes pictures (0.9.5) */
  function chatTools() {
    if (!serverAt('0.9.5')) return '';
    return (
      '<div class="chat-tools">' +
      // a real file box under your finger, as the profile's photo pickers have: phones open it reliably
      `<label class="m3-icon-btn chat-tool photo-pick" data-tooltip="Photo or GIF">${icon('add_photo_alternate')}<input type="file" class="chat-file" accept="image/*" aria-label="Send a photo or GIF"></label>` +
      (Nook.pickers && Nook.pickers.gifsOn() ? `<button type="button" class="m3-icon-btn chat-tool" data-chat="gif" aria-label="Find a GIF" data-tooltip="GIFs">${icon('gif_box')}</button>` : '') +
      `<button type="button" class="m3-icon-btn chat-tool only-hover" data-chat="emoji" aria-label="Emoji" data-tooltip="Emoji">${icon('mood')}</button>` +
      '</div>'
    );
  }

  /** voice and video call buttons for a chat's header */
  const callButtons = (attr, who) =>
    chatsPlus()
      ? `<button class="m3-icon-btn chat-call" data-act="call" ${attr} data-media="voice" aria-label="Voice call ${esc(who)}" data-tooltip="Voice call">${icon('call')}</button>` +
        `<button class="m3-icon-btn chat-call" data-act="call" ${attr} data-media="video" aria-label="Video call ${esc(who)}" data-tooltip="Video call">${icon('videocam')}</button>`
      : '';

  /**
   * a conversation's life on screen: loading it, painting it as news comes in, older messages on request, and
   * sending (a message is on screen at once, and can be tried again if it fails). `c` is the conversation:
   * thread(), load({ older }), send(body), read(), render(messages) and empty().
   */
  function mountChat(root, c) {
    const list = root.querySelector('#chat-list');
    const more = root.querySelector('#chat-more');
    const jump = root.querySelector('#chat-jump');
    const pending = []; // sent from here, not yet confirmed by the server
    let sending = 0; // while one is on its way, its own reply repaints, not the store's news
    const shown = new Set(); // ids already on screen: anything else is new and springs in
    let first = true;

    const end = () => document.documentElement.scrollHeight - innerHeight;
    const nearEnd = () => scrollY >= end() - 140;
    const toEnd = (smooth) => scrollTo({ top: end(), behavior: smooth && !Nook.fx.reduced() ? 'smooth' : 'auto' });

    function arrive(el) {
      const mine = !!el.closest('.mine');
      el.style.transformOrigin = mine ? '100% 100%' : '0 100%';
      Nook.fx.play(el, [{ opacity: 0, scale: 0.5, translate: `${mine ? 12 : -12}px 16px` }, { opacity: 1, scale: 1, translate: '0 0' }], {
        duration: Nook.fx.lively.duration,
        easing: Nook.fx.lively.easing,
      });
    }

    function paint({ follow = false } = {}) {
      const t = c.thread();
      const all = t.messages.concat(pending);
      const wasNear = nearEnd();
      list.innerHTML = all.length ? c.render(all) : c.empty();
      more.innerHTML = t.more ? `<button class="m3-btn text small" type="button">${icon('history')}Older messages</button>` : '';
      const fresh = [];
      for (const el of list.querySelectorAll('[data-message]')) {
        if (!first && !shown.has(el.dataset.message)) fresh.push(el);
        shown.add(el.dataset.message);
      }
      fresh.forEach(arrive);
      const theirs = fresh.some((el) => el.closest('.them'));
      if (first || follow || wasNear) {
        const smooth = !first;
        requestAnimationFrame(() => toEnd(smooth));
        if (jump) jump.hidden = true;
      } else if (theirs && jump) {
        jump.hidden = false;
        Nook.fx.pop(jump, 0.6);
      }
      first = false;
    }

    more.addEventListener('click', async (e) => {
      if (!e.target.closest('button')) return;
      const from = document.documentElement.scrollHeight - scrollY;
      await c.load({ older: true });
      paint();
      scrollTo({ top: document.documentElement.scrollHeight - from });
    });

    if (c.thread().loaded) paint();
    c.load()
      .then(() => {
        paint();
        c.read();
      })
      .catch((error) => (list.innerHTML = `<p class="muted chat-empty">${esc(error.message)}</p>`));
    root._onMessages = () => {
      if (sending || !c.thread().loaded) return;
      paint();
      c.read();
    };

    // while a chat is open it listens a little harder
    const quick = setInterval(() => document.visibilityState === 'visible' && store.sync(), 4000);
    const onScroll = () => jump && !jump.hidden && nearEnd() && (jump.hidden = true);
    addEventListener('scroll', onScroll, { passive: true });
    app().onLeave(() => {
      clearInterval(quick);
      removeEventListener('scroll', onScroll);
    });

    const form = root.querySelector('#chat-box');
    if (!form) return;
    const input = form.querySelector('#chat-input');
    const send = form.querySelector('.chat-send');
    jump.addEventListener('click', () => {
      toEnd(true);
      jump.hidden = true;
    });
    const grow = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 160) + 'px';
    };
    // a picture waiting to go with the next message
    let attached = null;
    const attachBox = root.querySelector('#chat-attach');
    const ready = () => {
      const on = !!input.value.trim() || !!attached;
      if (send.disabled === !on) return;
      send.disabled = !on;
      if (on) Nook.fx.pop(send, 0.7);
    };
    function attach(picture) {
      attached = picture;
      attachBox.hidden = !picture;
      attachBox.innerHTML = picture
        ? `<img src="${esc(picture.image)}" alt=""><span>${picture.gif ? 'GIF' : 'Photo'} ready to send${input.value.trim() ? '' : '. Add a message, or just send it'}</span>` +
          `<button type="button" class="m3-icon-btn small" data-chat="unattach" aria-label="Don’t send this ${picture.gif ? 'GIF' : 'photo'}" data-tooltip="Remove">${icon('close')}</button>`
        : '';
      if (picture) Nook.fx.pop(attachBox, 0.9);
      ready();
    }
    attachBox.addEventListener('click', (e) => e.target.closest('[data-chat="unattach"]') && (attach(null), input.focus({ preventScroll: true })));
    const queue = (m) => {
      pending.push(m);
      deliver(m);
      Nook.fx.haptic(8);
    };
    form.addEventListener('click', async (e) => {
      const tool = e.target.closest('[data-chat]');
      if (!tool || !Nook.pickers) return;
      const kind = tool.dataset.chat;
      if (kind === 'emoji') return Nook.pickers.emoji(tool, (emoji) => Nook.pickers.insertAt(input, emoji));
      if (kind === 'gif') {
        // a GIF goes as soon as it's picked, as its own message
        const g = await Nook.pickers.gif();
        if (g) queue({ id: store.uid('local'), body: '', createdAt: Date.now(), mine: true, media: { type: 'klipy', local: g.url, width: g.width, height: g.height, title: g.title }, extra: { gif: g } });
      }
    });
    // a picture from the device
    const fileBox = form.querySelector('.chat-file');
    if (fileBox)
      fileBox.addEventListener('change', () => {
        const file = fileBox.files && fileBox.files[0];
        fileBox.value = ''; // so the same photo can be picked again
        if (file && Nook.pickers) Nook.pickers.readPicture(file).then(attach, (error) => M3.snackbar(error.message));
      });
    // a picture pasted in (from a screenshot, say) is attached
    input.addEventListener('paste', (e) => {
      const file = [...((e.clipboardData && e.clipboardData.files) || [])].find((f) => /^image\//.test(f.type));
      if (!file || !serverAt('0.9.5') || !Nook.pickers) return;
      e.preventDefault();
      Nook.pickers.readPicture(file).then(attach, (error) => M3.snackbar(error.message));
    });
    input.addEventListener('input', () => {
      grow();
      ready();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && matchMedia('(hover: hover)').matches) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
    // the keyboard opening shouldn't leave the newest messages hidden underneath it
    input.addEventListener('focus', () => setTimeout(() => nearEnd() || toEnd(true), 350));

    async function deliver(m) {
      m.pending = true;
      m.failed = false;
      paint({ follow: true });
      sending++;
      try {
        const real = await c.send(m.body, m.extra || {});
        pending.splice(pending.indexOf(m), 1);
        // the confirmed message takes the place of the one already on screen, without springing in again
        shown.add(String(real.id));
      } catch (error) {
        m.pending = false;
        m.failed = true;
        app().showError(error);
      } finally {
        sending--;
      }
      paint({ follow: !m.failed });
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text && !attached) return;
      const verdict = text ? Nook.mod.check([text], { kind: 'message' }) : {};
      if (verdict.block) return app().showError({ rule: verdict.block.rule, message: verdict.block.why });
      // it's on screen at once, and you can keep typing while it goes
      const picture = attached;
      input.value = '';
      grow();
      attach(null);
      const m = { id: store.uid('local'), body: text, createdAt: Date.now(), mine: true };
      if (picture) {
        m.media = { type: 'image', local: picture.image, width: picture.width, height: picture.height, gif: picture.gif };
        m.extra = { image: picture.image, width: picture.width, height: picture.height };
      }
      queue(m);
      input.focus({ preventScroll: true });
    });
    list.addEventListener('click', (e) => {
      if (!e.target.closest('.chat-retry')) return;
      pending.filter((m) => m.failed).forEach(deliver);
    });
    wireMessageMenu(list, c);
    // on a computer the box is ready to type in; on a phone the keyboard waits for a tap
    if (matchMedia('(hover: hover)').matches) input.focus({ preventScroll: true });
  }

  /** a long press (or a right click) on a message: copy it, or report someone else's to the moderators */
  function wireMessageMenu(list, c) {
    let timer = 0;
    let openedAt = 0;
    const open = (bubble) => {
      // a phone that sends both a long press and a context menu only gets one
      if (performance.now() - openedAt < 800) return;
      openedAt = performance.now();
      const m = c.thread().messages.find((x) => String(x.id) === bubble.dataset.message);
      if (!m) return;
      Nook.fx.haptic(10);
      ui.sheet({
        html:
          (m.body ? `<div class="msg-menu-quote">${esc(plain(clean(m.body), 160))}</div>` : '') +
          '<div class="list">' +
          (m.body ? `<button type="button" class="row-link" data-do="copy" data-m3-ripple>${icon('content_copy')}<span class="row-text"><b>Copy text</b></span></button>` : '') +
          (m.media ? `<button type="button" class="row-link" data-do="open" data-m3-ripple>${icon('open_in_full')}<span class="row-text"><b>Open ${m.media.type === 'klipy' || m.media.gif ? 'GIF' : 'photo'}</b></span></button>` : '') +
          (m.mine ? '' : `<button type="button" class="row-link" data-do="report" data-m3-ripple>${icon('flag')}<span class="row-text"><b>Report message</b><small>Moderators will see it, and who sent it</small></span></button>`) +
          '</div>',
        setup(body, close) {
          body.addEventListener('click', (e) => {
            const act = e.target.closest('[data-do]');
            if (!act) return;
            close(null);
            if (act.dataset.do === 'copy') navigator.clipboard.writeText(m.body).then(() => M3.snackbar('Copied'), () => M3.snackbar('Couldn’t copy that.'));
            else if (act.dataset.do === 'open') Nook.pickers.view(Nook.api.url(m.media.url), 'Picture');
            else app().report(c.reportKind, { id: m.id });
          });
        },
      });
    };
    list.addEventListener('contextmenu', (e) => {
      const bubble = e.target.closest('.bubble:not(.pending):not(.failed)');
      if (!bubble) return;
      e.preventDefault();
      open(bubble);
    });
    // phones without a context menu on a long press (iPhones) get one this way
    let start = null;
    list.addEventListener('pointerdown', (e) => {
      const bubble = e.pointerType !== 'mouse' && e.target.closest('.bubble:not(.pending):not(.failed)');
      if (!bubble) return;
      start = [e.clientX, e.clientY];
      clearTimeout(timer);
      timer = setTimeout(() => open(bubble), 550);
    });
    list.addEventListener('pointermove', (e) => start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 10 && clearTimeout(timer));
    for (const type of ['pointerup', 'pointercancel']) list.addEventListener(type, () => clearTimeout(timer));
  }

  function thread(params) {
    const u = store.user(params.user);
    if (u.unknown || store.isMe(params.user)) return notFound(`We couldn’t find u/${params.user}.`);
    const friends = store.friendStatus(u.name) === 'friends';
    const head =
      `<div class="chat-head"><a class="m3-toolbar-btn" href="#/messages" data-effect="nudge-left" data-shape="cookie7" aria-label="All messages">${icon('arrow_back')}</a>` +
      `<a class="chat-who" href="#/u/${encodeURIComponent(u.name)}">${avatar(u, 40, { moving: true })}<span><b class="${nameFont(u).trim()}">${esc(u.name)}</b>${prideFlag(u)}<small>${friends ? 'Friends' : 'u/' + esc(u.name)}${u.pronouns ? ' · ' + esc(u.pronouns) : ''}</small></span></a>` +
      (friends ? callButtons(`data-user="${esc(u.name)}"`, 'u/' + u.name) : '') +
      (store.state.canBlock
        ? `<button class="m3-icon-btn chat-report" data-act="person-menu" data-user="${esc(u.name)}" aria-label="More for u/${esc(u.name)}" data-tooltip="More">${icon('more_vert')}</button></div>`
        : `<button class="m3-icon-btn chat-report" data-act="report-user" data-user="${esc(u.name)}" aria-label="Report u/${esc(u.name)}" data-tooltip="Report">${icon('flag')}</button></div>`);
    const theme = store.chatTheme(u.name);
    return {
      title: `Chat with u/${u.name}`,
      brand: u.shape,
      // the chat's own colour (1.0), whatever the setting for nests' colours says: the two of them picked it
      wear: theme ? { color: theme, always: true } : undefined,
      html: chatPage(head, {
        placeholder: `Message u/${u.name}`,
        locked: store.isBlocked(u.name)
          ? `<div class="card chat-locked"><p>You blocked u/${esc(u.name)}. Unblock them to be friends and message again.</p><div class="toolbar"><button class="m3-btn tonal" data-act="unblock" data-user="${esc(u.name)}">${icon('lock_open')}Unblock</button></div></div>`
          : friends
          ? ''
          : `<div class="card chat-locked"><p>You can message u/${esc(u.name)} once you’re friends.</p><div class="toolbar">${friendButtons(u.name)}</div></div>`,
      }),
      mount(root) {
        mountChat(root, {
          thread: () => store.thread(u.name),
          load: (options) => store.loadThread(u.name, options),
          send: (body, extra) => store.sendMessage(u.name, body, extra),
          read: () => store.markThreadRead(u.name),
          reportKind: 'message',
          render: (all) => chatHTML(all, u),
          empty: () => `<div class="chat-empty">${avatar(u, 72, { moving: true })}<b>u/${esc(u.name)}</b><span class="muted">No messages yet. Say hi!</span></div>`,
        });
        root._onFriends = () => app().rerender();
      },
    };
  }

  function groupThread(params) {
    const g = store.group(params.id);
    if (!g) return notFound('That group isn’t there any more, or you’re not in it.');
    const id = g.id;
    const sub = () => plural(store.group(id).members.length, 'member');
    const head =
      `<div class="chat-head"><a class="m3-toolbar-btn" href="#/messages" data-effect="nudge-left" data-shape="cookie7" aria-label="All messages">${icon('arrow_back')}</a>` +
      `<button type="button" class="chat-who" data-act="group-info" data-group="${esc(id)}" aria-label="About ${esc(g.name)}"><span class="group-icon">${groupIcon(g, 40)}</span><span><b class="group-name">${esc(g.name)}</b><small class="group-sub">${sub()}</small></span></button>` +
      callButtons(`data-group="${esc(id)}"`, g.name) +
      `<button class="m3-icon-btn" data-act="group-info" data-group="${esc(id)}" aria-label="Group info" data-tooltip="Group info">${icon('info')}</button></div>`;
    return {
      title: g.name,
      brand: g.shape,
      // a group chat wears its group's colour (1.0)
      wear: serverAt('1.0.0') ? { color: g.color, always: true } : undefined,
      html: chatPage(head, { placeholder: `Message ${g.name}` }),
      mount(root) {
        g.reading = true;
        mountChat(root, {
          thread: () => store.groupThread(id),
          load: (options) => store.loadGroupThread(id, options),
          send: (body, extra) => store.sendGroupMessage(id, body, extra),
          read: () => store.markGroupRead(id),
          reportKind: 'gmessage',
          render: (all) => chatHTML(all, null, true),
          empty: () => `<div class="chat-empty">${groupIcon(g, 72)}<b>${esc(g.name)}</b><span class="muted">No messages yet. Say hi!</span></div>`,
        });
        // the header keeps up with renames and new members; a group you've left sends you back to your chats
        root._onGroups = () => {
          const now = store.group(id);
          if (!now) {
            M3.snackbar('You’re no longer in that group.');
            return app().go('#/messages', { replace: true });
          }
          root.querySelector('.group-name').textContent = now.name;
          root.querySelector('.group-sub').textContent = sub();
          root.querySelector('.group-icon').innerHTML = groupIcon(now, 40);
        };
        // a call going on in the group: a banner to join it
        const banner = () => {
          const c = Nook.calls && Nook.calls.groupCall(id);
          let el = root.querySelector('.call-banner');
          if (!c || Nook.calls.inCall()) return el && el.remove();
          if (!el) {
            el = document.createElement('div');
            el.className = 'call-banner';
            root.querySelector('.chat-head').after(el);
            Nook.fx.pop(el, 0.8);
          }
          el.innerHTML = `${icon(c.media === 'video' ? 'videocam' : 'call')}<span>${c.media === 'video' ? 'A video call' : 'A voice call'} is going on</span><button type="button" class="m3-btn filled small" data-act="call" data-group="${esc(id)}" data-media="${c.media}">Join</button>`;
        };
        banner();
        document.addEventListener('nook-calls', banner);
        app().onLeave(() => {
          document.removeEventListener('nook-calls', banner);
          const now = store.group(id);
          if (now) now.reading = false;
        });
      },
    };
  }

  // ---- running a nest: its team, rules, bans and reports (from 0.9.5) ---------------------------------------------

  const PERM_INFO = {
    pin: ['push_pin', 'Pin posts', 'Pin up to 3 posts to the top of the nest'],
    remove: ['delete', 'Remove posts and comments', 'Take down what breaks the rules, and handle reports'],
    ban: ['block', 'Ban people', 'Stop someone posting and commenting in this nest'],
    rules: ['gavel', 'Edit the rules', 'Change the rules, the tagline and the description'],
    team: ['group', 'Manage the team', 'Give people roles and take them away'],
  };
  const ROLE_INFO = {
    admin: ['Admin', 'Everything, including the team'],
    moderator: ['Moderator', 'Pins, removes posts and comments, and bans people'],
    helper: ['Helper', 'Pins, and removes posts and comments'],
    custom: ['Your own', 'Name it and choose what it can do'],
  };
  const permIcons = (perms) => `<span class="perm-icons">${perms.map((p) => `<span title="${esc(PERM_INFO[p][1])}">${icon(PERM_INFO[p][0])}</span>`).join('')}</span>`;

  function nestManage(params) {
    const c = store.community(params.nook);
    if (!c) return notFound(`There’s no nest called n/${params.nook}.`);
    const perms = store.nestPerms(c);
    if (!perms.length || !serverAt('0.9.5')) return notFound(`Only the people who run n/${c.id} can see this page.`);
    const tabs = [['team', 'Team', 'group'], ['rules', 'Rules', 'gavel'], ['bans', 'Bans', 'block'], ['reports', 'Reports', 'flag']].filter(([id]) =>
      id === 'team' ? true : id === 'rules' ? perms.includes('rules') : id === 'bans' ? perms.includes('ban') : perms.includes('remove')
    );
    const start = tabs.some(([id]) => id === params.tab) ? params.tab : 'team';
    const mine = store.nestRole(c, store.state.me.name);
    return {
      title: `Manage n/${c.id}`,
      nook: c,
      brand: c.shape,
      html:
        '<div class="page single"><div class="col manage">' +
        `<div class="page-head">${nookIcon(c, 48, 24)}<div><h1 class="m3-title">Manage n/${esc(c.id)}</h1><span class="muted">${
          mine ? `You’re ${mine.role === 'owner' ? 'its owner' : `on its team, as ${esc(mine.label)}`}` : 'You’re one of Budgie’s moderators'
        }</span></div><span class="spacer"></span><a class="m3-btn tonal small" href="#/n/${esc(c.id)}">${icon('arrow_back')}Back to the nest</a></div>` +
        (tabs.length > 1 ? segmented('manage-tabs', tabs, start, 'Sections') : '') +
        '<div id="manage-body"><m3-loading aria-label="Loading"></m3-loading></div>' +
        '</div></div>',
      mount(root) {
        const body = root.querySelector('#manage-body');
        let tab = start;
        let data = null;
        const boss = () => !!(data && data.boss);
        async function load() {
          try {
            data = await store.manageNest(c.id);
          } catch (error) {
            body.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
            return;
          }
          draw();
        }
        const fresh = () => store.community(c.id);
        function draw() {
          body.innerHTML = { team: teamHTML, rules: rulesHTML, bans: bansHTML, reports: reportsHTML }[tab]();
          Nook.fx.stagger(body.querySelectorAll('.card'), { y: 10, step: 30 });
          if (tab === 'rules') wireRules();
        }
        const tabsEl = root.querySelector('#manage-tabs');
        if (tabsEl) {
          tabsEl.addEventListener('change', (e) => {
            tab = e.detail.value;
            // the address remembers the section, without drawing the page again
            history.replaceState(history.state, '', `#/n/${c.id}/manage?tab=${tab}`);
            draw();
          });
        }

        // the team: who has which role, and what each role can do
        function teamHTML() {
          const n = fresh();
          const canTeam = data.perms.includes('team');
          const rows = [];
          if (n.owner) rows.push(`<div class="team-row">${avatar(store.user(n.owner), 40)}<span class="row-text"><b>u/${esc(n.owner)}</b><small class="team-role">${icon('castle')}Owner · can do everything</small></span></div>`);
          for (const t of n.team || []) {
            const u = store.user(t.name);
            const me = store.isMe(t.name);
            const editable = canTeam && !me && (!t.perms.includes('team') || boss());
            rows.push(
              `<div class="team-row">${avatar(u, 40)}<span class="row-text"><b>u/${esc(u.name)}${me ? ' <span class="muted">(you)</span>' : ''}</b><small class="team-role">${icon('shield_person')}${esc(t.title || store.ROLE_LABELS[t.role])}${permIcons(t.perms)}</small></span>` +
                (editable ? `<button type="button" class="m3-btn text small" data-team="edit" data-name="${esc(u.name)}">${icon('edit')}Change</button><button type="button" class="m3-icon-btn small" data-team="remove" data-name="${esc(u.name)}" aria-label="Take u/${esc(u.name)}’s role away" data-tooltip="Take role away">${icon('person_remove')}</button>` : '') +
                (me ? `<button type="button" class="m3-btn text small" data-team="leave" data-name="${esc(u.name)}">${icon('logout')}Step down</button>` : '') +
                '</div>'
            );
          }
          return (
            `<section class="card"><h3 class="card-title">${icon('group')}<span>Team</span>${canTeam ? `<button type="button" class="m3-btn filled small" data-team="add">${icon('person_add')}Add someone</button>` : ''}</h3>` +
            (rows.length ? `<div class="team-list">${rows.join('')}</div>` : '<p class="muted">Nobody yet. Budgie’s own moderators look after this nest.</p>') +
            '</section>' +
            `<section class="card"><h3 class="card-title">${icon('info')}<span>What each role can do</span></h3><div class="role-guide">` +
            ['admin', 'moderator', 'helper'].map((r) => `<div><b>${ROLE_INFO[r][0]}</b>${permIcons(store.NEST_ROLES[r])}<small>${ROLE_INFO[r][1]}</small></div>`).join('') +
            '<div><b>Your own</b><small>A role with a name you choose, that can do only what you pick. People can only give the kinds of access they have themselves, and only the owner can let someone manage the team.</small></div></div></section>'
          );
        }

        // the rules, the tagline and the description
        function rulesHTML() {
          const n = fresh();
          return (
            `<form class="card form" id="rules-form" novalidate><h3 class="card-title">${icon('gavel')}<span>Rules</span></h3>` +
            '<p class="muted">Everyone sees these on the nest’s page. Keep them short: up to 10, each up to 120 characters.</p>' +
            `<ol class="rules-edit" id="rules-list">${(n.rules || []).map(ruleRow).join('')}</ol>` +
            `<button type="button" class="m3-btn text small" id="rule-add">${icon('add')}Add a rule</button>` +
            `<h3 class="card-title">${icon('info')}<span>About the nest</span></h3>` +
            `<div class="field"><label for="nest-tagline">Tagline</label><input class="m3-field" id="nest-tagline" maxlength="200" value="${esc(n.tagline || '')}"></div>` +
            `<div class="field"><label for="nest-desc">Description</label><textarea class="m3-field" id="nest-desc" rows="3" maxlength="500">${esc(n.description || '')}</textarea></div>` +
            `<div class="form-actions"><span class="status" id="rules-status"></span><button type="submit" class="m3-btn filled">${icon('check')}Save</button></div></form>`
          );
        }
        const ruleRow = (text = '') =>
          `<li class="rule-row"><input class="m3-field" maxlength="120" value="${esc(text)}" placeholder="Be kind" aria-label="Rule">` +
          `<button type="button" class="m3-icon-btn small" data-rule="up" aria-label="Move up" data-tooltip="Move up">${icon('arrow_upward')}</button>` +
          `<button type="button" class="m3-icon-btn small" data-rule="drop" aria-label="Remove this rule" data-tooltip="Remove">${icon('close')}</button></li>`;
        function wireRules() {
          const form = body.querySelector('#rules-form');
          const list = form.querySelector('#rules-list');
          const status = form.querySelector('#rules-status');
          const addBtn = form.querySelector('#rule-add');
          const count = () => (addBtn.hidden = list.children.length >= 10);
          count();
          addBtn.addEventListener('click', () => {
            list.insertAdjacentHTML('beforeend', ruleRow());
            list.lastElementChild.querySelector('input').focus();
            count();
          });
          list.addEventListener('click', (e) => {
            const b = e.target.closest('[data-rule]');
            if (!b) return;
            const row = b.closest('li');
            if (b.dataset.rule === 'drop') row.remove();
            else if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
            count();
          });
          form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rules = [...list.querySelectorAll('input')].map((i) => i.value.trim()).filter(Boolean);
            const tagline = form.querySelector('#nest-tagline').value.trim();
            const description = form.querySelector('#nest-desc').value.trim();
            const verdict = Nook.mod.check([...rules, tagline, description], { kind: 'nook' });
            if (verdict.block) return (status.textContent = verdict.block.why);
            status.textContent = 'Saving…';
            try {
              await store.editNest(c.id, { rules, tagline, description });
            } catch (error) {
              status.textContent = error.message;
              return;
            }
            status.textContent = '';
            M3.toast('Saved', { symbol: 'gavel', shape: c.shape });
            draw();
          });
        }

        // who's banned from posting here
        function bansHTML() {
          const until = (b) => (b.until ? 'until ' + new Date(b.until).toLocaleDateString([], { day: 'numeric', month: 'long' }) : 'for good');
          return (
            `<section class="card"><h3 class="card-title">${icon('block')}<span>Banned from n/${esc(c.id)}</span><button type="button" class="m3-btn filled small" data-ban="add">${icon('block')}Ban someone</button></h3>` +
            '<p class="muted">A ban only stops someone posting and commenting here. They can still read the nest, and use the rest of Budgie.</p>' +
            (data.bans.length
              ? `<div class="team-list">${data.bans
                  .map((b) => {
                    const u = store.user(b.name);
                    return `<div class="team-row">${avatar(u, 40)}<span class="row-text"><b>u/${esc(u.name)}</b><small>${esc(until(b))} · ${esc(b.reason)}${b.by ? ` · by u/${esc(b.by)}` : ''}</small></span><button type="button" class="m3-btn text small" data-ban="lift" data-name="${esc(u.name)}">${icon('lock_open')}Unban</button></div>`;
                  })
                  .join('')}</div>`
              : '<p class="muted">Nobody is banned.</p>') +
            '</section>'
          );
        }

        // reports about what's in this nest
        function reportsHTML() {
          return (
            `<section class="card"><h3 class="card-title">${icon('flag')}<span>Reports</span></h3>` +
            (data.reports.length
              ? `<div class="report-list">${data.reports
                  .map((r) => {
                    const item = r.item || {};
                    return (
                      `<div class="report" data-report="${r.id}"><div class="report-head"><span class="tag">${r.kind === 'post' ? 'Post' : 'Comment'}</span>${r.automatic ? `<span class="tag">${icon('smart_toy')}Automatic check</span>` : ''}<span class="muted">${esc(r.reason)} · ${ago(r.createdAt)}</span></div>` +
                      `<div class="report-item">${item.title ? `<b>${esc(item.title)}</b>` : ''}${reportPictures(item)}${item.body ? `<p>${esc(plain(item.body, 300))}</p>` : ''}<small>by u/${esc(item.author || '[deleted]')}</small></div>` +
                      '<div class="toolbar">' +
                      `<button type="button" class="m3-btn tonal small" data-report-do="remove" data-kind="${r.kind}" data-target="${esc(r.target)}">${icon('delete')}Remove</button>` +
                      `<button type="button" class="m3-btn text small" data-report-do="dismiss" data-id="${r.id}">${icon('check')}Nothing wrong</button>` +
                      (item.href ? `<a class="m3-btn text small" href="${esc(item.href)}">${icon('open_in_new')}Open</a>` : '') +
                      '</div></div>'
                    );
                  })
                  .join('')}</div>`
              : '<p class="muted">No open reports. All quiet.</p>') +
            '</section>'
          );
        }

        body.addEventListener('click', async (e) => {
          const t = e.target.closest('[data-team]');
          const b = e.target.closest('[data-ban]');
          const r = e.target.closest('[data-report-do]');
          try {
            if (t && t.dataset.team === 'add') await roleSheet(null);
            else if (t && t.dataset.team === 'edit') await roleSheet(t.dataset.name);
            else if (t && (t.dataset.team === 'remove' || t.dataset.team === 'leave')) {
              const self = t.dataset.team === 'leave';
              const ok = await M3.dialog({
                headline: self ? `Step down from n/${c.id}’s team?` : `Take u/${t.dataset.name}’s role away?`,
                symbol: 'person_remove',
                iconShape: 'softBoom',
                body: self ? 'You won’t be able to do anything here a member can’t. Someone on the team can give you a role again.' : 'They’ll be an ordinary member of the nest again, and they’re told.',
                actions: [{ label: 'Cancel', value: false }, { label: self ? 'Step down' : 'Take it away', value: true, variant: 'filled' }],
              });
              if (!ok) return;
              await store.removeNestRole(c.id, t.dataset.name);
              if (self) return app().go('#/n/' + c.id, { replace: true });
            } else if (b && b.dataset.ban === 'add') {
              const done = await banSheet(c);
              if (!done) return;
            } else if (b && b.dataset.ban === 'lift') {
              await store.unbanFromNest(c.id, b.dataset.name);
              M3.toast(`u/${b.dataset.name} can post here again`, { symbol: 'lock_open', shape: c.shape });
            } else if (r && r.dataset.reportDo === 'remove') {
              const reason = await app().pickReason(`Remove this ${r.dataset.kind}?`, 'delete', `Its author is told a moderator of n/${esc(c.id)} removed it, and why.`, 'Remove');
              if (!reason) return;
              await store.nestRemove(c.id, r.dataset.kind, r.dataset.target, reason);
              M3.toast(`Removed: ${reason}`, { symbol: 'delete', shape: c.shape });
            } else if (r && r.dataset.reportDo === 'dismiss') {
              await store.dismissNestReport(c.id, r.dataset.id);
            } else return;
          } catch (error) {
            return app().showError(error);
          }
          load();
        });

        /** gives someone a role, or changes theirs */
        function roleSheet(name) {
          const n = fresh();
          const had = name ? (n.team || []).find((t) => t.name.toLowerCase() === name.toLowerCase()) : null;
          const model = { role: had ? had.role : 'moderator', title: had ? had.title || '' : '', perms: had ? [...had.perms] : ['pin', 'remove'] };
          const allowed = (perm) => data.perms.includes(perm) && (perm !== 'team' || boss());
          const roleOk = (role) => role === 'custom' || store.NEST_ROLES[role].every(allowed);
          const people = store.people().filter((u) => !store.isMe(u.name)).map((u) => `<option value="${esc(u.name)}">`).join('');
          return ui.sheet({
            headline: name ? `u/${name}’s role` : 'Add someone to the team',
            symbol: 'shield_person',
            shape: c.shape,
            className: 'wide',
            html:
              (name ? '' : `<div class="field"><label for="role-who">Who (they have to have joined n/${esc(c.id)})</label><input class="m3-field" id="role-who" list="role-people" autocomplete="off" placeholder="Username"><datalist id="role-people">${people}</datalist></div>`) +
              `<div class="field"><span class="field-label">Role</span><div class="role-picks">${Object.entries(ROLE_INFO)
                .map(([role, [label, text]]) => `<button type="button" class="role-pick" data-role="${role}" aria-pressed="${role === model.role}"${roleOk(role) ? '' : ' disabled'}><b>${label}</b><small>${text}</small></button>`)
                .join('')}</div></div>` +
              `<div class="custom-role"${model.role === 'custom' ? '' : ' hidden'}><div class="field"><label for="role-title">Its name</label><input class="m3-field" id="role-title" maxlength="24" placeholder="Glaze guru" value="${esc(model.title)}"></div>` +
              Object.entries(PERM_INFO)
                .map(([perm, [symbol, label, text]]) => `<label class="switch-row">${icon(symbol)}<span class="switch-text"><span>${label}</span><small>${text}</small></span><input type="checkbox" class="m3-switch" role="switch" data-perm="${perm}"${model.perms.includes(perm) ? ' checked' : ''}${allowed(perm) ? '' : ' disabled'}></label>`)
                .join('') +
              '</div><span class="error" id="role-err"></span>',
            setup(sheetBody) {
              const custom = sheetBody.querySelector('.custom-role');
              sheetBody.querySelectorAll('.role-pick').forEach((pick) =>
                pick.addEventListener('click', () => {
                  model.role = pick.dataset.role;
                  sheetBody.querySelectorAll('.role-pick').forEach((other) => other.setAttribute('aria-pressed', String(other === pick)));
                  custom.hidden = model.role !== 'custom';
                })
              );
            },
            actions: [
              { label: 'Cancel', value: null },
              {
                label: 'Save',
                variant: 'filled',
                symbol: 'check',
                run(close, sheetBody) {
                  const err = sheetBody.querySelector('#role-err');
                  const who = name || sheetBody.querySelector('#role-who').value.trim().replace(/^u\//i, '');
                  if (!who) return (err.textContent = 'Who should it be?'), false;
                  const fields = { role: model.role };
                  if (model.role === 'custom') {
                    fields.title = sheetBody.querySelector('#role-title').value.trim();
                    fields.perms = [...sheetBody.querySelectorAll('[data-perm]')].filter((i) => i.checked).map((i) => i.dataset.perm);
                    if (!fields.title) return (err.textContent = 'Give the role a name.'), false;
                    if (!fields.perms.length) return (err.textContent = 'Pick at least one thing it can do.'), false;
                  }
                  store
                    .setNestRole(c.id, who, fields)
                    .then(() => {
                      close(true);
                      M3.toast(`u/${who} is on the team`, { symbol: 'shield_person', shape: c.shape });
                      load();
                    })
                    .catch((error) => (err.textContent = error.message));
                  return false;
                },
              },
            ],
          });
        }

        load();
      },
    };
  }

  /** bans someone from posting in a nest: who, why, and for how long; resolves true once done */
  function banSheet(c, name = '') {
    let days = 7;
    let reason = '';
    const reasons = ['Spam', 'Harassment or bullying', 'Breaks nest rules', 'Off topic', 'Something else'];
    return ui.sheet({
      headline: name ? `Ban u/${name} from n/${c.id}?` : `Ban someone from n/${c.id}`,
      symbol: 'block',
      shape: 'softBoom',
      className: 'wide',
      html:
        (name ? '' : '<div class="field"><label for="ban-who">Who</label><input class="m3-field" id="ban-who" autocomplete="off" placeholder="Username"></div>') +
        `<div class="field"><span class="field-label">Why</span><div class="chips" style="flex-wrap:wrap">${reasons.map((r) => `<button type="button" class="chip" data-why="${r}" aria-pressed="false">${r}</button>`).join('')}</div>` +
        '<input class="m3-field" id="ban-why" maxlength="200" placeholder="Or say why in your own words"></div>' +
        `<div class="field"><span class="field-label">For how long</span>${segmented('ban-days', [['1', 'A day'], ['7', 'A week'], ['30', 'A month'], ['0', 'For good']], '7', 'For how long')}</div>` +
        '<p class="muted">They’re told, with the reason. They can still read the nest, and use the rest of Budgie.</p><span class="error" id="ban-err"></span>',
      setup(sheetBody) {
        sheetBody.querySelectorAll('[data-why]').forEach((chip) =>
          chip.addEventListener('click', () => {
            reason = chip.dataset.why;
            sheetBody.querySelectorAll('[data-why]').forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
          })
        );
        sheetBody.querySelector('#ban-days').addEventListener('change', (e) => (days = Number(e.detail.value)));
      },
      actions: [
        { label: 'Cancel', value: null },
        {
          label: 'Ban',
          variant: 'filled',
          symbol: 'block',
          run(close, sheetBody) {
            const err = sheetBody.querySelector('#ban-err');
            const who = name || sheetBody.querySelector('#ban-who').value.trim().replace(/^u\//i, '');
            const why = sheetBody.querySelector('#ban-why').value.trim() || reason;
            if (!who) return (err.textContent = 'Who should be banned?'), false;
            if (!why) return (err.textContent = 'Say why: they’ll be told.'), false;
            store
              .banFromNest(c.id, who, why, days)
              .then(() => {
                close(true);
                M3.toast(`u/${who} can’t post in n/${c.id} ${days ? `for ${days === 1 ? 'a day' : days + ' days'}` : 'any more'}`, { symbol: 'block', shape: c.shape });
              })
              .catch((error) => (err.textContent = error.message));
            return false;
          },
        },
      ],
    });
  }

  // ---- moderation, for admins -------------------------------------------------------------------------------

  // a reported profile's picture and banner, small, so an admin can see what was reported
  function reportPictures(item) {
    const pic = (url, cls, label) => (url ? `<img class="${cls}" src="${esc(Nook.api.url(url))}" alt="${label}">` : '');
    if (item.picture) return `<div class="report-pics">${pic(item.picture, 'rp-picture', 'The picture')}</div>`;
    return item.photo || item.banner ? `<div class="report-pics">${pic(item.banner, 'rp-banner', 'Banner')}${pic(item.photo, 'rp-photo', 'Profile picture')}</div>` : '';
  }

  function adminPage() {
    if (!store.isAdmin()) return notFound('Only Budgie’s moderators can see this page.');
    return {
      title: 'Moderation',
      brand: 'pixelCircle',
      html:
        '<div class="page single"><div class="col">' +
        `<div class="page-head"><m3-shape-icon shape="pixelCircle" symbol="shield_person" size="48" icon-size="24"></m3-shape-icon><div><h1 class="m3-title">Moderation</h1><span class="muted">Open reports, newest first. Whoever you act on is told what and why.</span></div></div>` +
        '<div id="reports"><m3-loading aria-label="Loading reports"></m3-loading></div>' +
        `<form class="card add-friend" id="ban-form"><span class="field-label">Ban an account</span><div class="toolbar"><input class="m3-field" id="ban-name" placeholder="username" autocapitalize="none" spellcheck="false" maxlength="20"><input class="m3-field" id="ban-reason" placeholder="Reason they’ll see" maxlength="200"><button class="m3-btn tonal" type="submit">${icon('block')}Ban</button></div><span class="error" id="ban-err"></span></form>` +
        '</div></div>',
      mount(root) {
        const box = root.querySelector('#reports');
        const paint = async () => {
          let reports;
          try {
            reports = await store.adminReports();
          } catch (error) {
            box.innerHTML = `<p class="muted">${esc(error.message)}</p>`;
            return;
          }
          box.innerHTML = reports.length
            ? reports
                .map((r) => {
                  const item = r.item;
                  const what = !item
                    ? '<p class="muted">Already gone.</p>'
                    : `<div class="report-item">${item.title ? `<b>${esc(item.title)}</b>` : ''}${reportPictures(item)}${item.body ? `<p>${esc(plain(item.body, 300))}</p>` : ''}<small>by u/${esc(item.author || '[deleted]')}${item.removed ? ' · already removed' : ''}${item.banned ? ' · banned' : ''}</small></div>`;
                  return (
                    `<article class="card report" data-report="${r.id}"><div class="report-head">${icon('flag')}<b>${esc(r.reason)}</b><span class="muted">a ${esc(r.kind)} · ${r.automatic ? 'flagged by the automatic check' : `reported by u/${esc(r.reporter)}`} · ${ago(r.createdAt)}</span></div>${what}` +
                    '<div class="toolbar">' +
                    (item && item.href ? `<a class="m3-btn text small" href="${esc(item.href)}">${icon('open_in_new')}Open</a>` : '') +
                    (r.kind === 'user'
                      ? // just the picture or the banner (from 1.0), the whole profile, or the account
                        (serverAt('1.0.0') && item && item.photo ? `<button class="m3-btn tonal small" data-resolve="remove" data-parts="photo">${icon('hide_image')}Remove picture</button>` : '') +
                        (serverAt('1.0.0') && item && item.banner ? `<button class="m3-btn tonal small" data-resolve="remove" data-parts="banner">${icon('hide_image')}Remove banner</button>` : '') +
                        `<button class="m3-btn tonal small" data-resolve="remove">${icon('person_off')}Clear profile</button><button class="m3-btn filled small" data-resolve="ban">${icon('block')}Ban</button>`
                      : `<button class="m3-btn filled small" data-resolve="remove">${icon('gavel')}Remove</button>`) +
                    `<button class="m3-btn tonal small" data-resolve="dismiss">${icon('done')}Dismiss</button></div></article>`
                  );
                })
                .join('')
            : empty('verified_user', 'Nothing to review', 'No open reports. Nice and calm.', '', 'pixelCircle');
          box.querySelectorAll('[data-resolve]').forEach((btn) =>
            btn.addEventListener('click', async () => {
              const card = btn.closest('[data-report]');
              const r = reports.find((x) => String(x.id) === card.dataset.report);
              btn.disabled = true;
              try {
                const parts = btn.dataset.parts ? [btn.dataset.parts] : undefined;
                await store.resolveReport(r.id, btn.dataset.resolve, r.reason, parts);
                const done = {
                  dismiss: 'Report dismissed',
                  ban: 'Account banned',
                  remove: r.kind !== 'user' ? 'Removed, and its author told why' : parts ? `${parts[0] === 'photo' ? 'Picture' : 'Banner'} removed, and its owner told why` : 'Profile cleared, and its owner told why',
                };
                M3.toast(done[btn.dataset.resolve], { symbol: 'gavel', shape: 'pixelCircle' });
                paint();
              } catch (error) {
                btn.disabled = false;
                app().showError(error);
              }
            })
          );
        };
        paint();
        root.querySelector('#ban-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const err = root.querySelector('#ban-err');
          err.textContent = '';
          try {
            await store.ban(root.querySelector('#ban-name').value.trim(), root.querySelector('#ban-reason').value.trim());
            M3.toast('Banned and signed out', { symbol: 'block', shape: 'pixelCircle' });
            e.target.reset();
          } catch (error) {
            err.textContent = error.message;
          }
        });
      },
    };
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
    friendsPage, messagesPage, thread, groupThread, adminPage, friendButtons, lineText, groupIcon, chatsPlus, serverAt, nestManage, banSheet, roleTag,
    postCard, pollBlock, sparksRow, sparkChip, commentHTML, commentTree, replyBox, joinButton, aboutCard, rulesCard, modsCard,
    submitRail, empty, mountFeed,
  };
})();
