// Pulls every piece of interface text out of Budgie's code: plain strings become exact entries, strings with values
// in them (template literals) become patterns with numbered slots {0}, {1}. Writes strings.tsv (N, kind, text).
const acorn = require('acorn');
const walk = require('acorn-walk');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '../..');
const APP_FILES = ['js/account.js', 'js/app.js', 'js/calls.js', 'js/pickers.js', 'js/ui.js', 'js/views.js', 'js/store.js', 'js/moderation.js', 'js/ads.js', 'js/api.js'];
const M3_FILES = ['../m3/m3.js'];
const SERVER = 'server/server.js';

const found = new Map(); // text -> { kind, where }
const add = (text, kind, where) => {
  text = text.replace(/\s+/g, ' ').trim();
  if (!looksLikeUI(text)) return;
  if (!found.has(text)) found.set(text, { kind, where });
};

// what counts as words people read
const KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'End', 'Tab', 'Enter', 'Escape', 'Backspace', 'Delete', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'DOMContentLoaded', 'NotAllowedError', 'AbortError', 'NotFoundError', 'NotReadableError', 'OverconstrainedError', 'TypeError', 'Shift', 'Control', 'Meta', 'Alt', 'Space', 'Spacebar']);
function looksLikeUI(t) {
  if (!t || t.length < 2) return false;
  if (KEYS.has(t)) return false;
  if (/="/.test(t) || /^use strict$/.test(t) || /^\(/.test(t) || /^m3: /.test(t)) return false;
  if (/^[\s{}0-9]*$/.test(t.replace(/\{\d+\}/g, ''))) return false;
  // one word: a capitalised word (a label like "Done"), not a compound name like "SchemeTonalSpot"
  if (!/\s/.test(t.replace(/\{\d+\}/g, ''))) {
    const w = t.replace(/\{\d+\}/g, '');
    if (/^[A-Z][a-z]+(?:[A-Z][a-z0-9]+)+$/.test(w)) return false;
    if (/[:;(){}\[\]=<>|\\]/.test(w) && !/\{\d+\}/.test(t)) return false;
    if (/^[a-z]/.test(w) && !/^(ok|you|now|today|yesterday|seen|sent|edited|deleted|removed|pinned|banned|blocked|friends|free)[.!?…]?$/.test(w)) return false;
  }
  // css and selectors
  if (/[\w-]+\s*:\s*[^\s;]+;/.test(t)) return false;
  if (/(^|,\s*)(button|a|input|select|textarea|label|\.[\w-]+|\[[\w-]+)(\[|,|\s|$)/.test(t) && /[\[\].]/.test(t) && !/\s\p{Ll}{3,}\s\p{Ll}{3,}/u.test(t)) return false;
  if (/^(m3|nook|call|chat)[\w-]*( [\w-]+)*$/.test(t)) return false;
  if (!/\p{L}/u.test(t)) return false;
  const bare = t.replace(/\{\d+\}/g, '').trim();
  if (!bare || !/\p{L}{2}/u.test(bare)) return false;
  if (/^[a-z0-9_]+$/.test(bare) && !/^(ok|or|and|in|on|off|of|to|by|at|with|then|by|you)$/.test(bare)) return false; // identifiers, icon names
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(bare)) return false; // camelCase
  if (/^[\w-]+$/.test(bare) && /[-_]/.test(bare)) return false; // kebab or snake
  if (/^(https?:|\/|\.\/|#\/|data:|blob:|mailto:)/.test(bare)) return false;
  if (/[{};]\s*$/.test(bare) && /:/.test(bare)) return false; // css
  if (/^[.#\[:]/.test(bare) && !/\s\p{L}{3,}\s/u.test(bare)) return false; // selectors
  if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|PRAGMA|BEGIN|COMMIT|ALTER)\b/.test(bare)) return false;
  if (/^[\w.-]+\.(js|css|png|svg|woff2|json|html|mp4|jpg|gif)$/.test(bare)) return false;
  if (/^(application|image|video|text|audio)\/[\w+.-]+$/.test(bare)) return false;
  if (/^(var|calc|rgb|rgba|hsl|translate|scale|rotate|linear-gradient|url|cubic-bezier)\(/.test(bare)) return false;
  if (/^[\d\s.,:%px-]+$/.test(bare)) return false;
  if (/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(bare)) return false;
  if (/^(true|false|null|undefined|none|auto|block|flex|grid|inline|hidden|visible)$/.test(bare)) return false;
  if (/^[a-z]+(\s[a-z]+)*$/.test(bare) && bare.split(' ').length <= 3 && !/^(off|on|or|and|then|you|today|now|yesterday|seen|sent|edited|deleted|removed|pinned|banned|blocked|friends|private|public|free)$/.test(bare)) {
    // lower-case runs are mostly class lists ("m3-btn filled small"), keyframe names and such; real words are kept
    if (/\b(m3|btn|icon|card|row|tag|small|filled|tonal|text|outlined|chip|sheet|wide|big|spacer|muted|count|field|label|toolbar|list|page|col|rail|post|feed|hero|grid|item|menu|bar|box|top|head|foot|end|start|center|left|right|bottom|wrap|nowrap|ease|linear|forwards|both|smooth|instant|polite|assertive|dialog|status|button|link|img|presentation|application|region|navigation|group|radio|radiogroup|switch|tab|tablist|tabpanel|true|false)\b/.test(bare)) return false;
  }
  return true;
}

// the words in a piece of HTML: the text between tags, and what people read in attributes
const ATTRS = ['aria-label', 'placeholder', 'title', 'data-tooltip', 'alt', 'data-title', 'data-description', 'label', 'data-label', 'data-tagline', 'data-example'];
function fromHTML(html, kind, where) {
  // attributes
  for (const a of ATTRS) {
    const re = new RegExp(`${a}="([^"]*)"`, 'g');
    let m;
    while ((m = re.exec(html))) add(m[1], kind, where);
  }
  // text between tags (and around them)
  const text = html.replace(/<[^>]*>/g, '\u0000');
  for (const piece of text.split('\u0000')) add(piece.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"), kind, where);
}

// a template literal as text with numbered slots; an expression that's itself plain text (a ternary of two strings,
// say) is followed into, so its words are found too
const MARKUP = /\b(icon|avatar|avatarFace|nookIcon|groupIcon|prideFlag|specialBadges|devTag|roleTag|flagSVG|shape|empty|segmented|friendButtons|voteBox|sparkChip|sparksRow|pollBlock|postCard|commentHTML|commentTree|replyBox|joinButton|art|thumb|face|chatTools|chatHTML|mediaHTML|bannerImage|swatchesHTML|groupShapesHTML|flagRow|flagTile|section|header|sw|sw2|field|passwordField|head|row|personRowHTML|permIcons|bannedNote|aboutCard|rulesCard|modsCard|streakCard|trendingCard|footCard|feedShell|compactToggle|sortControl|callButtons|testerButton|reportPictures|mdHTML|md|kbd)\s*\(|\b(ui|views|Nook\.views|Nook\.ui)\.(?!ago\b|plain\b)\w+\s*\(/;
let currentSrc = '';
function templateText(node) {
  let out = '';
  let slot = 0;
  node.quasis.forEach((q, i) => {
    out += q.value.cooked;
    if (i < node.expressions.length) {
      const e = node.expressions[i];
      const code = currentSrc.slice(e.start, e.end);
      // markup (an icon, a face) is a tag between words; anything else is a value: a numbered slot
      if (MARKUP.test(code) || /['"`]\s*<|<\/?[a-z]/.test(code)) out += '<x>';
      else out += `{${slot++}}`;
    }
  });
  return out;
}

function scan(file, { server = false } = {}) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  currentSrc = src;
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script', allowHashBang: true, locations: true });
  const where = (node) => `${file}:${node.loc.start.line}`;
  // on the server, only what people are told: fail(), notify({ text }), and the like
  const serverHit = (anc) =>
    anc.some((n) => n.type === 'CallExpression' && n.callee && ((n.callee.name && /^(fail|notify|autoReport|limit|refuse|reject)$/.test(n.callee.name)) || (n.callee.type === 'MemberExpression' && n.callee.property.name === 'error' && false))) ||
    anc.some((n) => n.type === 'Property' && n.key && /^(text|error|why|EARLY_NOTE)$/.test(n.key.name || n.key.value)) ||
    anc.some((n) => n.type === 'VariableDeclarator' && n.id && /^(PICTURE_REFUSED|TEXT_REFUSED|PROFILE_PARTS|NOTICE|EARLY_NOTE|BADGE_NOTES|DESCRIBE|KIND_LABEL)$/.test(n.id.name));
  walk.ancestor(ast, {
    Literal(node, anc) {
      if (typeof node.value !== 'string') return;
      // console logging isn't for people
      if (anc.some((n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object && n.callee.object.name === 'console')) return;
      if (server && !serverHit(anc)) return;
      if (/[<>]/.test(node.value)) fromHTML(node.value, 'text', where(node));
      else add(node.value, 'text', where(node));
    },
    TemplateLiteral(node, anc) {
      if (anc.some((n) => n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.object && n.callee.object.name === 'console')) return;
      if (server && !serverHit(anc)) return;
      const t = templateText(node);
      if (/[<>]/.test(t)) fromHTML(t, 'pattern', where(node));
      else add(t, node.expressions.length ? 'pattern' : 'text', where(node));
    },
  });
}

for (const f of APP_FILES) scan(f);
for (const f of M3_FILES) scan(f);
scan(SERVER, { server: true });
scan('server/textmodel.js', { server: true });
// the page itself
fromHTML(fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, ''), 'text', 'index.html');

const rows = [...found.entries()].map(([text, v]) => ({ text, kind: /\{\d+\}/.test(text) ? 'pattern' : 'text', where: v.where }));
rows.sort((a, b) => a.where.localeCompare(b.where, 'en', { numeric: true }));
const crypto = require('crypto');
const ids = new Set();
for (const r of rows) {
  r.id = crypto.createHash('sha1').update(r.text).digest('hex').slice(0, 7);
  if (ids.has(r.id)) throw new Error('two strings share an id: ' + r.text);
  ids.add(r.id);
}
fs.writeFileSync(__dirname + '/strings.tsv', rows.map((r) => `${r.id}\t${r.kind}\t${r.where}\t${r.text}`).join('\n') + '\n');
console.log(rows.length, 'strings;', rows.filter((r) => r.kind === 'pattern').length, 'patterns');
const by = {};
for (const r of rows) by[r.where.split(':')[0]] = (by[r.where.split(':')[0]] || 0) + 1;
console.log(by);
