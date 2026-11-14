// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Games with a friend, in your chat (Budgie 1.7): Tic-tac-toe, Connect Four and Rock Paper Scissors. Starting one
 * puts it in the chat as a card both of you play on; every move is checked here (whose turn, a free square, a column
 * with room), so nobody can cheat from their browser, and the other player hears it at once over the live connection
 * (their phone too, when they're not in Budgie).
 *
 *   POST   /api/games              { to, kind, again? }     a new game with a friend (again: the game it follows,
 *                                                             so the other player goes first this time)
 *   GET    /api/games?ids=1,2,3                             the games in a chat, as you see them
 *   POST   /api/games/:id/move     { cell | col | pick }    your move
 *   DELETE /api/games/:id                                   you give up (the other player wins)
 *
 * In Rock Paper Scissors both pick at once, so your friend's pick is never sent to you until you've picked too. It's
 * best of three (ties don't count; after nine rounds, whoever's ahead wins).
 *
 * Only between friends, never with someone blocked either way. From you, 20 new games an hour; moves as fast as
 * people play, up to 120 a minute. A game nobody's touched for 30 days is left as it is (it's only a few bytes).
 */
'use strict';

const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const KINDS = {
  ttt: { name: 'Tic-tac-toe' },
  c4: { name: 'Connect Four' },
  rps: { name: 'Rock Paper Scissors' },
};
const PICKS = ['rock', 'paper', 'scissors'];
const BEATS = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
const C4_COLS = 7;
const C4_ROWS = 6;
const RPS_TO_WIN = 2;
const RPS_MOST = 9;

// every line of three on a Tic-tac-toe board
const TTT_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

/** a fresh game's state */
function fresh(kind) {
  if (kind === 'ttt') return { board: Array(9).fill('') };
  if (kind === 'c4') return { board: Array(C4_COLS * C4_ROWS).fill('') }; // row by row, from the top
  return { rounds: [], picks: { a: '', b: '' } };
}

/** four in a row through `at` on a Connect Four board: the cells, or null */
function c4Line(board, at) {
  const who = board[at];
  const r0 = Math.floor(at / C4_COLS);
  const c0 = at % C4_COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const cells = [at];
    for (const sign of [1, -1]) {
      let r = r0 + dr * sign;
      let c = c0 + dc * sign;
      while (r >= 0 && r < C4_ROWS && c >= 0 && c < C4_COLS && board[r * C4_COLS + c] === who) {
        cells.push(r * C4_COLS + c);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (cells.length >= 4) return cells.sort((x, y) => x - y);
  }
  return null;
}

/**
 * a move, played: { state, next (whose turn: 'a', 'b', or '' for both / nobody), winner ('a', 'b', 'draw' or ''),
 * line (the winning cells) }; throws a message when it isn't a move that can be played
 */
function play(kind, state, side, turn, move) {
  const other = side === 'a' ? 'b' : 'a';
  if (kind === 'ttt') {
    if (turn !== side) throw new Error('It’s not your turn.');
    const cell = Number(move.cell);
    if (!Number.isInteger(cell) || cell < 0 || cell > 8 || state.board[cell]) throw new Error('That square’s taken.');
    const board = state.board.slice();
    board[cell] = side;
    const won = TTT_LINES.find((l) => l.every((i) => board[i] === side));
    if (won) return { state: { board, last: cell }, next: '', winner: side, line: won };
    if (board.every(Boolean)) return { state: { board, last: cell }, next: '', winner: 'draw' };
    return { state: { board, last: cell }, next: other, winner: '' };
  }
  if (kind === 'c4') {
    if (turn !== side) throw new Error('It’s not your turn.');
    const col = Number(move.col);
    if (!Number.isInteger(col) || col < 0 || col >= C4_COLS) throw new Error('Pick a column.');
    let row = -1;
    for (let r = C4_ROWS - 1; r >= 0; r--) if (!state.board[r * C4_COLS + col]) {
      row = r;
      break;
    }
    if (row < 0) throw new Error('That column’s full.');
    const board = state.board.slice();
    const at = row * C4_COLS + col;
    board[at] = side;
    const line = c4Line(board, at);
    if (line) return { state: { board, last: at }, next: '', winner: side, line };
    if (board.every(Boolean)) return { state: { board, last: at }, next: '', winner: 'draw' };
    return { state: { board, last: at }, next: other, winner: '' };
  }
  // Rock Paper Scissors: both pick, then the round's decided
  const pick = String(move.pick || '');
  if (!PICKS.includes(pick)) throw new Error('Pick rock, paper or scissors.');
  if (state.picks[side]) throw new Error('You’ve picked already. Waiting for your friend.');
  const picks = Object.assign({}, state.picks, { [side]: pick });
  if (!picks[other]) return { state: { rounds: state.rounds, picks }, next: other, winner: '' };
  const round = { a: picks.a, b: picks.b, won: picks.a === picks.b ? '' : BEATS[picks.a] === picks.b ? 'a' : 'b' };
  const rounds = state.rounds.concat([round]);
  const score = { a: rounds.filter((r) => r.won === 'a').length, b: rounds.filter((r) => r.won === 'b').length };
  let winner = score.a >= RPS_TO_WIN ? 'a' : score.b >= RPS_TO_WIN ? 'b' : '';
  if (!winner && rounds.length >= RPS_MOST) winner = score.a > score.b ? 'a' : score.b > score.a ? 'b' : 'draw';
  return { state: { rounds, picks: { a: '', b: '' } }, next: winner ? '' : 'both', winner };
}

function install(ctx) {
  const { db, route, limit, fail, text, now, MINUTE, HOUR, friendship, hasBlocked, push, modules, lastSeen } = ctx;
  const signal = typeof ctx.signal === 'function' ? ctx.signal : () => {};

  db.raw.exec(`
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL,
  a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first TEXT NOT NULL DEFAULT 'a',
  state TEXT NOT NULL,
  turn TEXT NOT NULL DEFAULT '',
  winner TEXT NOT NULL DEFAULT '',
  line TEXT NOT NULL DEFAULT '',
  resigned INTEGER NOT NULL DEFAULT 0,
  moves INTEGER NOT NULL DEFAULT 0,
  message_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS games_a ON games(a);
CREATE INDEX IF NOT EXISTS games_b ON games(b);`);

  const parse = (s, fallback) => {
    try {
      return JSON.parse(s);
    } catch (_) {
      return fallback;
    }
  };
  const nameOf = (id) => (db.get('SELECT name FROM users WHERE id = ?', id) || {}).name || '';
  const friendsNow = (x, y) => {
    const f = friendship(x, y);
    return !!f && f.status === 'friends' && !hasBlocked(x, y) && !hasBlocked(y, x);
  };

  /** a game as `viewerId` sees it: in Rock Paper Scissors, the other player's pick stays hidden until both have */
  function gameOut(g, viewerId) {
    const you = g.a === viewerId ? 'a' : 'b';
    const s = parse(g.state, fresh(g.kind));
    const out = {
      id: g.id,
      kind: g.kind,
      you,
      players: { a: nameOf(g.a), b: nameOf(g.b) },
      first: g.first,
      turn: g.turn,
      winner: g.winner || undefined,
      line: g.line ? parse(g.line, undefined) : undefined,
      resigned: g.resigned ? (g.winner === 'a' ? 'b' : 'a') : undefined,
      moves: g.moves,
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    };
    if (g.kind === 'rps') {
      const other = you === 'a' ? 'b' : 'a';
      out.rounds = s.rounds;
      out.picked = { [you]: s.picks[you] || '', [other]: !!s.picks[other] };
    } else {
      out.board = s.board;
      out.last = s.last;
    }
    return out;
  }
  const tell = (g) => {
    for (const id of [g.a, g.b]) signal(id, 'game', { game: gameOut(g, id) });
  };
  /** their phone hears it too, unless they're in Budgie right now (then the live connection's enough) */
  const away = (userId) => now() - (lastSeen.get(userId) || 0) > 90 * 1000;

  function gameFor(user, id) {
    const g = db.get('SELECT * FROM games WHERE id = ?', Number(id) || 0);
    if (!g || (g.a !== user.id && g.b !== user.id)) fail(404, 'That game isn’t there.');
    return g;
  }

  route('POST', '/api/games', ({ user, body }) => {
    limit('game-new:' + user.id, 20, HOUR, 'That’s a lot of games for one hour. Finish a few first!');
    const kind = String(body.kind || '');
    if (!KINDS[kind]) fail(400, 'Pick a game.');
    const name = text(body.to, 40).replace(/^u\//i, '');
    const other = NAME_RE.test(name) ? db.get('SELECT * FROM users WHERE name = ?', name) : null;
    if (!other || other.banned_at) fail(404, 'There’s nobody by that name.');
    if (other.id === user.id) fail(400, 'Play with a friend, not yourself.');
    if (!friendsNow(user.id, other.id)) fail(403, 'You can only play with friends.');
    // a rematch: whoever went second last time goes first now
    let first = 'a';
    if (body.again != null) {
      const before = db.get('SELECT * FROM games WHERE id = ?', Number(body.again) || 0);
      if (before && ((before.a === user.id && before.b === other.id) || (before.b === user.id && before.a === other.id))) {
        const startedBefore = before.first === 'a' ? before.a : before.b;
        first = startedBefore === user.id ? 'b' : 'a';
      }
    }
    const t = now();
    const g = db.tx(() => {
      const { lastInsertRowid } = db.run('INSERT INTO games (kind, a, b, first, state, turn, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', kind, user.id, other.id, first, JSON.stringify(fresh(kind)), kind === 'rps' ? 'both' : first, t, t);
      const id = Number(lastInsertRowid);
      const m = db.run("INSERT INTO messages (from_id, to_id, kind, body, created_at) VALUES (?, ?, 'game', ?, ?)", user.id, other.id, JSON.stringify({ game: id, kind }), t);
      db.run('UPDATE games SET message_id = ? WHERE id = ?', Number(m.lastInsertRowid), id);
      return db.get('SELECT * FROM games WHERE id = ?', id);
    });
    tell(g);
    push.send([other.id], {
      kind: 'message',
      title: 'u/' + user.name,
      body: `Wants to play ${KINDS[kind].name} with you`,
      href: '#/messages/' + encodeURIComponent(user.name),
      tag: 'chat-' + user.name,
    });
    if (modules.stats && modules.stats.add) modules.stats.add(user.id, 'chatgames.started');
    return { game: gameOut(g, user.id), message: g.message_id };
  });

  route('GET', '/api/games', ({ user, query }) => {
    const ids = String(query.ids || '')
      .split(',')
      .map(Number)
      .filter((n) => Number.isSafeInteger(n) && n > 0)
      .slice(0, 60);
    if (!ids.length) return { games: [] };
    const rows = db.all(`SELECT * FROM games WHERE id IN (${ids.map(() => '?').join(',')}) AND (a = ? OR b = ?)`, ...ids, user.id, user.id);
    return { games: rows.map((g) => gameOut(g, user.id)) };
  });

  route('POST', '/api/games/:id/move', ({ user, params, body }) => {
    limit('game-move:' + user.id, 120, MINUTE, 'Slow down a little!');
    const g = gameFor(user, params.id);
    if (g.winner) fail(409, 'This game’s over. Start another one!');
    const side = g.a === user.id ? 'a' : 'b';
    const otherId = side === 'a' ? g.b : g.a;
    if (!friendsNow(user.id, otherId)) fail(403, 'You can only play with friends.');
    let r;
    try {
      r = play(g.kind, parse(g.state, fresh(g.kind)), side, g.turn === 'both' ? side : g.turn, body || {});
    } catch (error) {
      fail(409, error.message);
    }
    // whose turn now: the other player's, or (Rock Paper Scissors) whoever hasn't picked, or both for a new round
    const t = now();
    db.run('UPDATE games SET state = ?, turn = ?, winner = ?, line = ?, moves = moves + 1, updated_at = ? WHERE id = ?', JSON.stringify(r.state), r.winner ? '' : r.next, r.winner, r.line ? JSON.stringify(r.line) : '', t, g.id);
    const after = db.get('SELECT * FROM games WHERE id = ?', g.id);
    tell(after);
    const other = { id: otherId, name: nameOf(otherId) };
    if (away(other.id)) {
      const theirTurn = after.turn === (side === 'a' ? 'b' : 'a') || after.turn === 'both';
      const words = after.winner === side ? `Won ${KINDS[g.kind].name}` : after.winner === 'draw' ? `${KINDS[g.kind].name}: it’s a draw` : theirTurn ? `Your turn in ${KINDS[g.kind].name}` : '';
      if (words) push.send([other.id], { kind: 'message', title: 'u/' + user.name, body: words, href: '#/messages/' + encodeURIComponent(user.name), tag: 'game-' + g.id });
    }
    if (after.winner && modules.stats && modules.stats.add) {
      if (after.winner === 'a' || after.winner === 'b') modules.stats.add(after.winner === 'a' ? after.a : after.b, 'chatgames.won');
      modules.stats.add(after.a, 'chatgames.played');
      modules.stats.add(after.b, 'chatgames.played');
    }
    return { game: gameOut(after, user.id) };
  });

  route('DELETE', '/api/games/:id', ({ user, params }) => {
    const g = gameFor(user, params.id);
    if (g.winner) return { game: gameOut(g, user.id) };
    const side = g.a === user.id ? 'a' : 'b';
    db.run("UPDATE games SET winner = ?, turn = '', resigned = 1, updated_at = ? WHERE id = ?", side === 'a' ? 'b' : 'a', now(), g.id);
    const after = db.get('SELECT * FROM games WHERE id = ?', g.id);
    tell(after);
    return { game: gameOut(after, user.id) };
  });

  return {
    /** what a download of someone's data says of their games: who with, which, and how they ended */
    exportFor(userId) {
      const rows = db.all('SELECT * FROM games WHERE a = ? OR b = ? ORDER BY id', userId, userId);
      if (!rows.length) return {};
      return {
        games: rows.map((g) => {
          const you = g.a === userId ? 'a' : 'b';
          return {
            game: KINDS[g.kind] ? KINDS[g.kind].name : g.kind,
            with: nameOf(you === 'a' ? g.b : g.a),
            result: !g.winner ? 'not finished' : g.winner === 'draw' ? 'draw' : g.winner === you ? 'won' : 'lost',
            moves: g.moves,
            started: new Date(g.created_at).toISOString(),
          };
        }),
      };
    },
  };
}

module.exports = { install, play, fresh, c4Line, KINDS };
