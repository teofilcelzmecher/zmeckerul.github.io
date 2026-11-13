// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Games with a friend, in your chat (Budgie 1.7): Tic-tac-toe, Connect Four and Rock Paper Scissors. The controller
 * button by the message box (or Play a game in their menu) picks one; it goes in the chat as a card you both play
 * on, and each move reaches the other at once over the live connection. The server keeps the game and checks every
 * move (server/games.js); here it's drawn, played, and cheered. When the card's scrolled away, a chip over the
 * message box says whose turn it is and brings it back.
 */
(function () {
  'use strict';
  const Nook = window.Nook;
  if (!Nook || !Nook.store) return;
  const { store, ui, fx, api } = Nook;
  const { esc, icon } = ui;
  const app = () => Nook.app;
  const serverHas = () => !!(Nook.views && Nook.views.serverAt && Nook.views.serverAt('1.7.0'));
  const still = () => fx.reduced() || document.body.classList.contains('calm');
  const lower = (s) => String(s || '').toLowerCase();
  const tr = (s) => (Nook.i18n ? Nook.i18n.t(s) : s);

  const KINDS = {
    ttt: { name: 'Tic-tac-toe', about: 'Three in a row wins', symbol: 'grid_view', shape: 'cookie4' },
    c4: { name: 'Connect Four', about: 'Drop them in, four in a row wins', symbol: 'view_column', shape: 'pill' },
    rps: { name: 'Rock Paper Scissors', about: 'Best of three, picked at the same time', symbol: 'back_hand', shape: 'flower' },
  };
  const PICKS = [
    ['rock', 'Rock', 'sports_mma'],
    ['paper', 'Paper', 'back_hand'],
    ['scissors', 'Scissors', 'content_cut'],
  ];
  const pickIcon = (p) => (PICKS.find((x) => x[0] === p) || [])[2] || 'help';
  const pickWord = (p) => (PICKS.find((x) => x[0] === p) || [])[1] || '';
  const COLS = 7;
  const ROWS = 6;

  const available = () => serverHas() && api.signedIn();
  const games = new Map(); // id -> the game, as the server last said
  const dataOf = (m) => {
    try {
      return JSON.parse(m.body || '{}') || {};
    } catch (_) {
      return {};
    }
  };
  const them = (g) => g.players[g.you === 'a' ? 'b' : 'a'];
  const mineSide = (g) => g.you;
  const otherSide = (g) => (g.you === 'a' ? 'b' : 'a');

  // ---- what a game says ------------------------------------------------------------------------------------

  function status(g) {
    const other = 'u/' + them(g);
    if (g.winner === 'draw') return { text: 'It’s a draw', mood: 'draw' };
    if (g.winner) {
      if (g.resigned) return g.resigned === g.you ? { text: 'You gave up', mood: 'lost' } : { text: `${other} gave up. You win!`, mood: 'won' };
      return g.winner === g.you ? { text: 'You won!', mood: 'won' } : { text: `${other} won`, mood: 'lost' };
    }
    if (g.kind === 'rps') {
      const mine = g.picked && g.picked[g.you];
      const theirs = g.picked && g.picked[otherSide(g)];
      if (mine) return { text: `Waiting for ${other}…`, mood: 'wait' };
      return { text: theirs ? `Your pick. ${other} has picked` : 'Your pick', mood: 'go' };
    }
    return g.turn === g.you ? { text: 'Your turn', mood: 'go' } : { text: `${other}’s turn`, mood: 'wait' };
  }
  const myTurn = (g) => !g.winner && (g.kind === 'rps' ? !(g.picked && g.picked[g.you]) : g.turn === g.you);

  /** the line for a list of chats, and for the notice when one comes in */
  function lineText(m) {
    const d = dataOf(m);
    const k = KINDS[d.kind];
    const name = k ? k.name : 'a game';
    return m.mine ? `You started a game of ${name}` : `u/${m.from || ''} wants to play ${name}`;
  }

  // ---- drawing -------------------------------------------------------------------------------------------------

  function tttBoard(g, ready) {
    const line = new Set(g.line || []);
    return (
      `<div class="gm-ttt" role="group" aria-label="Board">` +
      g.board
        .map((v, i) => {
          const mark = v ? `<span class="gm-mark gm-${v === 'a' ? 'x' : 'o'}${g.last === i ? ' fresh' : ''}" aria-hidden="true"></span>` : '';
          const label = v ? `Square ${i + 1}: ${v === 'a' ? 'X' : 'O'}` : `Square ${i + 1}`;
          return `<button type="button" class="gm-cell${line.has(i) ? ' win' : ''}" data-game-move="cell" data-v="${i}"${ready && !v ? '' : ' disabled'} aria-label="${label}">${mark}</button>`;
        })
        .join('') +
      '</div>'
    );
  }

  function c4Board(g, ready) {
    const line = new Set(g.line || []);
    let html = `<div class="gm-c4" role="group" aria-label="Board">`;
    for (let c = 0; c < COLS; c++) {
      const full = !!g.board[c];
      let slots = '';
      for (let r = 0; r < ROWS; r++) {
        const at = r * COLS + c;
        const v = g.board[at];
        slots += `<i class="gm-slot${v ? ' ' + v : ''}${line.has(at) ? ' win' : ''}${g.last === at ? ' fresh' : ''}" style="--fall:${r + 1}"></i>`;
      }
      const label = full ? `Column ${c + 1}, full` : `Column ${c + 1}`;
      html += `<button type="button" class="gm-col" data-game-move="col" data-v="${c}"${ready && !full ? '' : ' disabled'} aria-label="${label}">${slots}</button>`;
    }
    return html + '</div>';
  }

  function rpsBoard(g, ready) {
    const rounds = g.rounds || [];
    const score = { a: rounds.filter((r) => r.won === 'a').length, b: rounds.filter((r) => r.won === 'b').length };
    const me = mineSide(g);
    const you = otherSide(g);
    const last = rounds[rounds.length - 1];
    const scoreLabel = `You ${score[me]}, u/${esc(them(g))} ${score[you]}`;
    let html = `<div class="gm-rps">` + `<div class="gm-score" aria-label="${scoreLabel}"><b>${score[me]}</b><span>You</span><span class="gm-dash">–</span><span translate="no">u/${esc(them(g))}</span><b>${score[you]}</b></div>`;
    if (last)
      html +=
        `<div class="gm-reveal${g.updatedAt && Date.now() - g.updatedAt < 4000 ? ' fresh' : ''}" aria-label="${esc(`Last round: you ${tr(pickWord(last[me]))}, u/${them(g)} ${tr(pickWord(last[you]))}`)}">` +
        `<span class="gm-hand ${last.won === me ? 'won' : last.won ? 'lost' : ''}">${icon(pickIcon(last[me]))}</span><small>vs</small><span class="gm-hand ${last.won === you ? 'won' : last.won ? 'lost' : ''}">${icon(pickIcon(last[you]))}</span>` +
        `<em>${last.won === me ? 'You took the round' : last.won ? `u/${esc(them(g))} took the round` : 'A tie'}</em></div>`;
    if (!g.winner) {
      const mine = g.picked && g.picked[me];
      html += `<div class="gm-picks" role="group" aria-label="Your pick">`;
      for (const [id, word, symbol] of PICKS)
        html += `<button type="button" class="gm-pick${mine === id ? ' on' : ''}" data-game-move="pick" data-v="${id}"${ready ? '' : ' disabled'} aria-pressed="${mine === id}">${icon(symbol)}<span>${word}</span></button>`;
      html += '</div>';
    }
    return html + '</div>';
  }

  function inner(g) {
    const k = KINDS[g.kind] || KINDS.ttt;
    const s = status(g);
    const ready = myTurn(g);
    const board = g.kind === 'c4' ? c4Board(g, ready) : g.kind === 'rps' ? rpsBoard(g, ready) : tttBoard(g, ready);
    // who's which: Tic-tac-toe's X and O, or Connect Four's colours
    const sign = (side) => (g.kind === 'ttt' ? `<span class="gm-mark gm-${side === 'a' ? 'x' : 'o'}" aria-hidden="true"></span>` : '<i aria-hidden="true"></i>');
    const players =
      g.kind === 'rps'
        ? ''
        : `<div class="gm-players"><span class="gm-who a${g.you === 'a' ? ' you' : ''}">${sign('a')}<span translate="no">${g.you === 'a' ? 'You' : 'u/' + esc(g.players.a)}</span></span><span class="gm-who b${g.you === 'b' ? ' you' : ''}">${sign('b')}<span translate="no">${g.you === 'b' ? 'You' : 'u/' + esc(g.players.b)}</span></span></div>`;
    const foot = g.winner
      ? `<button type="button" class="m3-btn tonal small" data-game-act="again">${icon('replay')}Rematch</button>`
      : `<button type="button" class="m3-btn text small" data-game-act="resign">${icon('flag')}Give up</button>`;
    return (
      `<div class="gm-head"><m3-shape-icon shape="${k.shape}" symbol="${k.symbol}" size="36" icon-size="18" aria-hidden="true"></m3-shape-icon>` +
      `<span class="gm-title"><b>${esc(k.name)}</b><small class="gm-status ${s.mood}" role="status">${esc(s.text)}</small></span></div>` +
      players +
      board +
      `<div class="gm-foot">${foot}</div>`
    );
  }

  /** a game's card in a chat (its message is the game's start) */
  function cardHTML(m) {
    const d = dataOf(m);
    const id = Number(d.game) || 0;
    const g = games.get(id);
    if (!g) want(id);
    const k = KINDS[d.kind] || KINDS.ttt;
    const mood = g ? status(g).mood : '';
    return (
      `<div class="gm-line ${m.mine ? 'mine' : 'them'}" data-message="${esc(String(m.id))}">` +
      `<div class="gm-card${mood ? ' ' + mood : ''}" data-game="${id}" data-kind="${esc(d.kind || '')}">` +
      (g ? inner(g) : `<div class="gm-head"><m3-shape-icon shape="${k.shape}" symbol="${k.symbol}" size="36" icon-size="18" aria-hidden="true"></m3-shape-icon><span class="gm-title"><b>${esc(k.name)}</b><small class="gm-status">Setting up the board…</small></span></div>`) +
      '</div></div>'
    );
  }

  /** every card of a game on the screen, drawn again from what's known */
  function repaint(id) {
    const g = games.get(id);
    if (!g) return;
    const cards = document.querySelectorAll(`.gm-card[data-game="${id}"]`);
    // a chat read to its end stays at its end, however the card's grown (a board in place of "Setting up…")
    const atEnd = cards.length && innerHeight + scrollY >= document.documentElement.scrollHeight - 80;
    for (const card of cards) {
      card.className = `gm-card ${status(g).mood}`;
      card.innerHTML = inner(g);
    }
    if (atEnd) scrollTo({ top: document.documentElement.scrollHeight });
    paintChip();
  }

  // ---- asking the server ---------------------------------------------------------------------------------------

  const wanted = new Set();
  let wantTimer = 0;
  function want(id) {
    if (!id || wanted.has(id)) return;
    wanted.add(id);
    clearTimeout(wantTimer);
    wantTimer = setTimeout(fetchWanted, 30);
  }
  async function fetchWanted() {
    const ids = [...wanted].filter((id) => !games.has(id)).slice(0, 60);
    if (!ids.length) return;
    try {
      const r = await api.get('/api/games?ids=' + ids.join(','));
      for (const g of r.games || []) {
        games.set(g.id, g);
        repaint(g.id);
      }
    } catch (_) {
      // tried again the next time the chat's drawn
      for (const id of ids) wanted.delete(id);
    }
  }

  async function start(name, kind, again) {
    if (!available()) return;
    try {
      const r = await api.post('/api/games', { to: name, kind, again: again || undefined });
      games.set(r.game.id, r.game);
      fx.haptic([8, 30, 8]);
      await store.sync().catch(() => {});
    } catch (error) {
      app().showError(error);
    }
  }

  /** the sheet to pick a game */
  function open(name) {
    if (!available()) return;
    ui.sheet({
      headline: `Play with u/${name}`,
      symbol: 'sports_esports',
      shape: 'cookie9',
      className: 'gm-sheet',
      html:
        '<div class="gm-choices">' +
        Object.entries(KINDS)
          .map(([id, k]) => `<button type="button" class="gm-choice" data-kind="${id}" data-m3-ripple><m3-shape-icon shape="${k.shape}" symbol="${k.symbol}" size="48" icon-size="24" aria-hidden="true"></m3-shape-icon><span><b>${esc(k.name)}</b><small>${esc(k.about)}</small></span>${icon('chevron_right')}</button>`)
          .join('') +
        '</div>',
      setup(body, close) {
        body.addEventListener('click', (e) => {
          const b = e.target.closest('[data-kind]');
          if (!b) return;
          close();
          start(name, b.dataset.kind);
        });
      },
    });
  }

  // a move: shown at once, then as the server has it (or put back, if it says no)
  const busy = new Set();
  async function move(card, kind, value) {
    const id = Number(card.dataset.game);
    const g = games.get(id);
    if (!g || busy.has(id) || !myTurn(g)) return;
    busy.add(id);
    const before = g;
    const guess = Object.assign({}, g);
    if (g.kind === 'ttt') {
      guess.board = g.board.slice();
      guess.board[Number(value)] = g.you;
      guess.last = Number(value);
      guess.turn = otherSide(g);
    } else if (g.kind === 'c4') {
      guess.board = g.board.slice();
      const c = Number(value);
      for (let r = ROWS - 1; r >= 0; r--)
        if (!guess.board[r * COLS + c]) {
          guess.board[r * COLS + c] = g.you;
          guess.last = r * COLS + c;
          break;
        }
      guess.turn = otherSide(g);
    } else {
      guess.picked = Object.assign({}, g.picked, { [g.you]: value });
    }
    games.set(id, guess);
    repaint(id);
    fx.haptic(g.kind === 'c4' ? [4, 40, 10] : 8);
    try {
      const body = g.kind === 'ttt' ? { cell: Number(value) } : g.kind === 'c4' ? { col: Number(value) } : { pick: value };
      const r = await api.post(`/api/games/${id}/move`, body);
      settle(r.game, before);
    } catch (error) {
      games.set(id, before);
      repaint(id);
      M3.snackbar(error.message);
    } finally {
      busy.delete(id);
    }
  }

  /** a newer word on a game: drawn, and cheered when it's just ended */
  function settle(g, before) {
    const was = before || games.get(g.id);
    if (was && was.updatedAt > g.updatedAt) return;
    games.set(g.id, g);
    repaint(g.id);
    if (g.winner && was && !was.winner) cheer(g);
  }

  function cheer(g) {
    const card = document.querySelector(`.gm-card[data-game="${g.id}"]`);
    if (g.winner === g.you) {
      fx.haptic([10, 50, 10, 50, 20]);
      if (card && !still()) {
        const r = card.getBoundingClientRect();
        fx.confetti({ x: r.left + r.width / 2, y: r.top + 40 }, { shapes: ['sunny', 'burst', 'flower', 'heart'], count: 30, power: 1.1 });
      }
    } else if (g.winner !== 'draw') {
      fx.haptic(30);
      if (card && !still()) card.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 380, easing: 'ease-out' });
    }
  }

  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const card = t.closest('.gm-card[data-game]');
    const moveBtn = card && t.closest('[data-game-move]');
    if (moveBtn && !moveBtn.disabled) return move(card, moveBtn.dataset.gameMove, moveBtn.dataset.v);
    const act = card && t.closest('[data-game-act]');
    if (act) {
      const g = games.get(Number(card.dataset.game));
      if (!g) return;
      if (act.dataset.gameAct === 'again') return start(them(g), g.kind, g.id);
      if (act.dataset.gameAct === 'resign')
        return ui
          .sheet({
            headline: 'Give up this game?',
            symbol: 'flag',
            shape: 'softBoom',
            html: `<p>u/${esc(them(g))} wins this one.</p>`,
            actions: [
              { label: 'Keep playing', value: false },
              { label: 'Give up', variant: 'filled', value: true },
            ],
          })
          .then((yes) => yes && api.del('/api/games/' + g.id).then((r) => settle(r.game), (error) => app().showError(error)));
    }
    const chip = t.closest('[data-game-chip]');
    if (chip) {
      const target = document.querySelector(`.gm-card[data-game="${chip.dataset.gameChip}"]`);
      if (target) target.scrollIntoView({ behavior: still() ? 'auto' : 'smooth', block: 'center' });
    }
  });

  // ---- live: the other player's moves --------------------------------------------------------------------------

  Nook.hook('signal', (type, data) => {
    if (type !== 'game' || !data || !data.game || !data.game.id) return;
    const g = data.game;
    const was = games.get(g.id);
    if (!was) {
      games.set(g.id, g);
      // a new game from a friend: its card comes with the chat's news (and the notice with it)
      if (g.moves === 0) return store.sync().catch(() => {});
    }
    settle(g, was);
    // their move, while you're somewhere else: a word about it
    const theirs = was && g.updatedAt > was.updatedAt && (myTurn(g) || (g.winner && !was.winner));
    const onScreen = !!document.querySelector(`.gm-card[data-game="${g.id}"]`);
    if (theirs && !onScreen && !document.hidden) {
      const k = KINDS[g.kind] || KINDS.ttt;
      const text = g.winner ? `${k.name} with u/${them(g)}: ${status(g).text}` : `u/${them(g)} played. Your turn in ${k.name}`;
      M3.snackbar(text, { timeout: 6000, action: { label: 'Play', onClick: () => app().go('#/messages/' + encodeURIComponent(them(g))) } });
    }
  });

  // ---- the chip over the message box: the game in this chat, when its card's out of sight ------------------------

  let seen = null;
  function chatWith() {
    const m = /^#\/messages\/([^/]+)$/.exec(location.hash);
    return m ? decodeURIComponent(m[1]) : '';
  }
  function paintChip() {
    const box = document.querySelector('.chat-page .chat-head');
    let chip = document.getElementById('gm-chip');
    const friend = lower(chatWith());
    const live = friend
      ? [...document.querySelectorAll('.gm-card[data-game]')].map((c) => games.get(Number(c.dataset.game))).filter((g) => g && !g.winner && lower(them(g)) === friend)
      : [];
    const g = live.sort((x, y) => y.updatedAt - x.updatedAt)[0];
    const card = g && document.querySelector(`.gm-card[data-game="${g.id}"]`);
    const hidden = card && seen && seen.get(card) === false;
    if (!box || !g || !hidden) {
      if (chip) chip.remove();
      return;
    }
    if (!chip) {
      // under the chat's header, over the messages, pointing to where the card is
      box.insertAdjacentHTML('afterend', `<button type="button" class="gm-chip" id="gm-chip"></button>`);
      chip = document.getElementById('gm-chip');
    }
    const k = KINDS[g.kind] || KINDS.ttt;
    const above = card.getBoundingClientRect().bottom < innerHeight / 2;
    chip.dataset.gameChip = String(g.id);
    chip.classList.toggle('go', myTurn(g));
    chip.innerHTML = `${icon(k.symbol)}<span>${esc(myTurn(g) ? `Your turn in ${k.name}` : `${k.name}: ${status(g).text}`)}</span>${icon(above ? 'arrow_upward' : 'arrow_downward')}`;
  }
  // which cards can be seen, as the chat scrolls
  let watching = null;
  function watchCards(root) {
    if (watching) watching.disconnect();
    seen = new WeakMap();
    if (!('IntersectionObserver' in window)) return;
    watching = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target, e.isIntersecting);
        paintChip();
      },
      { threshold: 0.35 }
    );
    for (const card of root.querySelectorAll('.gm-card[data-game]')) watching.observe(card);
  }
  // the chat draws its messages again as news comes in: the new cards are watched too
  new MutationObserver(() => {
    const list = document.getElementById('chat-list');
    if (!list || !chatWith()) return;
    if (!watching || !watching.root) watchCards(list);
    for (const card of list.querySelectorAll('.gm-card[data-game]')) if (seen && !seen.has(card)) watching && watching.observe(card);
  }).observe(document.body, { childList: true, subtree: true });

  // ---- where you start one -------------------------------------------------------------------------------------

  const canPlay = (name) => available() && store.friendStatus(name) === 'friends' && !(store.isBlocked && store.isBlocked(name));
  Nook.hook('personMenu', (name) => (canPlay(name) ? [{ label: 'Play a game', symbol: 'sports_esports', onSelect: () => open(name) }] : []));

  Nook.games = { available, canPlay, open, start, cardHTML, lineText, myTurn: (id) => (games.has(id) ? myTurn(games.get(id)) : false) };
})();
