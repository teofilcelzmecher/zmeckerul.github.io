// Builds Budgie's language files (nook/js/lang/<code>.js) from strings.tsv and the translations in tr/*.tsv.
// A translation row is: id (or + and the English text, for a sentence the app puts together), then ro es fr de it.
// "=" keeps the English.
const fs = require('fs');
const path = require('path');

const OUT = process.argv[2] || path.join(__dirname, '../../js/lang');
const LANGS = ['ro', 'es', 'fr', 'de', 'it'];
const LOCALE = { ro: 'ro-RO', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT' };

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const english = new Map();
for (const line of fs.readFileSync(path.join(__dirname, 'strings.tsv'), 'utf8').split('\n')) {
  if (!line) continue;
  const [id, , , text] = line.split('\t');
  english.set(id, text);
}

const packs = Object.fromEntries(LANGS.map((l) => [l, { strings: {}, patterns: {} }]));
const seen = new Map();
let problems = 0;
for (const file of fs.readdirSync(path.join(__dirname, 'tr')).filter((f) => f.endsWith('.tsv')).sort()) {
  fs.readFileSync(path.join(__dirname, 'tr', file), 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (!line.trim()) return;
      const cols = line.split('\t');
      const where = `${file}:${i + 1}`;
      if (cols.length !== 6) return console.error(where, 'needs 6 columns, has', cols.length), problems++;
      const en = cols[0].startsWith('+') ? norm(cols[0].slice(1)) : english.get(cols[0]);
      if (en == null) return console.error(where, 'unknown id', cols[0]), problems++;
      if (seen.has(en)) return console.error(where, 'already translated at', seen.get(en), '-', en), problems++;
      seen.set(en, where);
      const slots = (s) => (s.match(/\{\d+\}/g) || []).sort().join();
      LANGS.forEach((lang, n) => {
        const out = norm(cols[n + 1]);
        if (out === '=' || out === en) return;
        if (slots(out) !== slots(en)) console.error(where, lang, 'slots differ:', en, '→', out), problems++;
        packs[lang][/\{\d+\}/.test(en) ? 'patterns' : 'strings'][en] = out;
      });
    });
}

// counted words: "3 members"
const NOUNS = {
  collection: { ro: ['colecție', 'colecții'], es: ['colección', 'colecciones'], fr: ['collection', 'collections'], de: ['Sammlung', 'Sammlungen'], it: ['raccolta', 'raccolte'] },
  comment: { ro: ['comentariu', 'comentarii'], es: ['comentario', 'comentarios'], fr: ['commentaire', 'commentaires'], de: ['Kommentar', 'Kommentare'], it: ['commento', 'commenti'] },
  day: { ro: ['zi', 'zile'], es: ['día', 'días'], fr: ['jour', 'jours'], de: ['Tag', 'Tage'], it: ['giorno', 'giorni'] },
  friend: { ro: ['prieten', 'prieteni'], es: ['amigo', 'amigos'], fr: ['ami', 'amis'], de: ['Freund', 'Freunde'], it: ['amico', 'amici'] },
  member: { ro: ['membru', 'membri'], es: ['miembro', 'miembros'], fr: ['membre', 'membres'], de: ['Mitglied', 'Mitglieder'], it: ['membro', 'membri'] },
  message: { ro: ['mesaj', 'mesaje'], es: ['mensaje', 'mensajes'], fr: ['message', 'messages'], de: ['Nachricht', 'Nachrichten'], it: ['messaggio', 'messaggi'] },
  nest: { ro: ['cuib', 'cuiburi'], es: ['nido', 'nidos'], fr: ['nid', 'nids'], de: ['Nest', 'Nester'], it: ['nido', 'nidi'] },
  'new post': { ro: ['postare nouă', 'postări noi'], es: ['publicación nueva', 'publicaciones nuevas'], fr: ['nouvelle publication', 'nouvelles publications'], de: ['neuer Beitrag', 'neue Beiträge'], it: ['nuovo post', 'nuovi post'] },
  person: { ro: ['persoană', 'persoane'], es: ['persona', 'personas'], fr: ['personne', 'personnes'], de: ['Person', 'Personen'], it: ['persona', 'persone'] },
  point: { ro: ['punct', 'puncte'], es: ['punto', 'puntos'], fr: ['point', 'points'], de: ['Punkt', 'Punkte'], it: ['punto', 'punti'] },
  post: { ro: ['postare', 'postări'], es: ['publicación', 'publicaciones'], fr: ['publication', 'publications'], de: ['Beitrag', 'Beiträge'], it: ['post', 'post'] },
  reply: { ro: ['răspuns', 'răspunsuri'], es: ['respuesta', 'respuestas'], fr: ['réponse', 'réponses'], de: ['Antwort', 'Antworten'], it: ['risposta', 'risposte'] },
  'unread notification': { ro: ['notificare necitită', 'notificări necitite'], es: ['aviso sin leer', 'avisos sin leer'], fr: ['notification non lue', 'notifications non lues'], de: ['ungelesene Mitteilung', 'ungelesene Mitteilungen'], it: ['notifica non letta', 'notifiche non lette'] },
  vote: { ro: ['vot', 'voturi'], es: ['voto', 'votos'], fr: ['vote', 'votes'], de: ['Stimme', 'Stimmen'], it: ['voto', 'voti'] },
  minute: { ro: ['minut', 'minute'], es: ['minuto', 'minutos'], fr: ['minute', 'minutes'], de: ['Minute', 'Minuten'], it: ['minuto', 'minuti'] },
};
const PLURALS = { person: 'people', reply: 'replies' };

// how each language says a count with its word; n is the number as the app wrote it ("3", "1.2k")
const COUNT = {
  // Romanian: 1 zi, 2–19 zile, 20 de zile (and 101 zile, 120 de zile)
  ro: `function (n, f) { var v = parseFloat(String(n).replace(/,/g, '')); var big = /k$/i.test(n); var d = String(n).replace('.', ','); if (v === 1 && !big) return d + ' ' + f[0]; var r = Math.abs(v) % 100; return d + (!big && Number.isInteger(v) && (r === 0 && v === 0 || r > 0 && r < 20) ? ' ' : ' de ') + f[1]; }`,
  fr: `function (n, f) { var v = parseFloat(String(n).replace(/,/g, '')); var d = String(n).replace('.', ','); return d + ' ' + (Math.abs(v) < 2 && !/k$/i.test(n) ? f[0] : f[1]); }`,
  es: `function (n, f) { var v = parseFloat(String(n).replace(/,/g, '')); return n + ' ' + (v === 1 && !/k$/i.test(n) ? f[0] : f[1]); }`,
  de: `function (n, f) { var v = parseFloat(String(n).replace(/,/g, '')); var d = String(n).replace('.', ','); return d + ' ' + (v === 1 && !/k$/i.test(n) ? f[0] : f[1]); }`,
  it: `function (n, f) { var v = parseFloat(String(n).replace(/,/g, '')); return n + ' ' + (v === 1 && !/k$/i.test(n) ? f[0] : f[1]); }`,
};
// "5m", "3h", "2d", "1w" in the app's lists
const SHORT = {
  ro: { now: 'acum', m: '{0} min', h: '{0} h', d: '{0} z', w: '{0} săpt.' },
  es: { now: 'ahora', m: '{0} min', h: '{0} h', d: '{0} d', w: '{0} sem.' },
  fr: { now: 'à l’instant', m: '{0} min', h: '{0} h', d: '{0} j', w: '{0} sem.' },
  de: { now: 'jetzt', m: '{0} Min.', h: '{0} Std.', d: '{0} T.', w: '{0} Wo.' },
  it: { now: 'ora', m: '{0} min', h: '{0} h', d: '{0} g', w: '{0} sett.' },
};

// a translation that's itself an English sentence with another translation: js/i18n.js never translates its
// own words twice, but it's worth knowing about ("Explore" → "Explorer", the French for "Explore", is also a badge)
for (const lang of LANGS) {
  const { strings } = packs[lang];
  for (const [en, out] of Object.entries(strings)) {
    if (strings[out] !== undefined && strings[out] !== out) console.log(`note: ${lang} ${en} → ${out}, which is also English for ${strings[out]}`);
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const lang of LANGS) {
  const nouns = Object.fromEntries(Object.entries(NOUNS).map(([word, by]) => [word, by[lang]]));
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
  const body =
    `// Budgie in ${({ ro: 'Romanian', es: 'Spanish', fr: 'French', de: 'German', it: 'Italian' })[lang]}. Made from the app's own words by a script; js/i18n.js puts it to use.\n` +
    `window.NOOK_LANG = {\n` +
    `  code: ${JSON.stringify(lang)},\n` +
    `  locale: ${JSON.stringify(LOCALE[lang])},\n` +
    `  short: ${JSON.stringify(SHORT[lang])},\n` +
    `  nouns: ${JSON.stringify(nouns)},\n` +
    `  plurals: ${JSON.stringify(PLURALS)},\n` +
    `  count: ${COUNT[lang]},\n` +
    `  strings: ${JSON.stringify(sorted(packs[lang].strings), null, 0)},\n` +
    `  patterns: ${JSON.stringify(sorted(packs[lang].patterns), null, 0)},\n` +
    `};\n`;
  fs.writeFileSync(path.join(OUT, lang + '.js'), body);
  console.log(lang, Object.keys(packs[lang].strings).length, 'strings,', Object.keys(packs[lang].patterns).length, 'patterns,', (body.length / 1024).toFixed(0), 'KB');
}
if (problems) {
  console.error(problems, 'problems');
  process.exitCode = 1;
}
