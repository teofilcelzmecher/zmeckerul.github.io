// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Moderation by rules, not AI: fixed word lists and patterns, checked on the
 * device before anything is posted. Text is folded first (accents, l33t
 * spelling, s.p.a.c.e.d letters, stretched leeeetters) so the lists catch the
 * usual disguises. Every outcome comes with the rule it applies:
 *   block   slurs, threats, scam links, spam and flooding: not posted
 *   warn    things that look like personal information, SHOUTING: confirm first
 *   care    someone may be struggling: posted, with where to find help
 *   strong  swearing: posted, and hidden behind dots for anyone with the filter on
 */
(function () {
  'use strict';

  // the same rules run in the browser and on the server
  const root = typeof window !== 'undefined' ? window : globalThis;
  const Nook = (root.Nook = root.Nook || {});

  // ---- folding: the disguises people use, undone ---------------------------------------------

  const LEET = { 0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b', '@': 'a', $: 's', '!': 'i', '|': 'i', '€': 'e' };
  // Cyrillic and Greek letters that look Latin, used to slip words past filters
  const LOOKALIKES = {
    'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'к': 'k', 'м': 'm', 'т': 't', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'ԁ': 'd',
    'α': 'a', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'χ': 'x',
  };

  function fold(text) {
    let t = String(text || '')
      .normalize('NFKD') // ă â î ș ț and fancy fonts (𝐟𝐮𝐜𝐤, ｆｕｃｋ) become plain letters plus marks
      .replace(/[\u0300-\u036f]/g, '') // the marks go
      .replace(/[\u00ad\u200b-\u200f\u2060\ufeff]/g, '') // so do invisible characters hidden inside words
      .toLowerCase()
      .replace(/[аеорсухкмтіјѕԁαεικνορτυχ]/g, (ch) => LOOKALIKES[ch])
      .replace(/[01345789@$!|€]/g, (ch) => LEET[ch]);
    // letters split by dots, stars, dashes or underscores join up: f.u.c.k, p-u-l-a
    t = t.replace(/([a-z])[._*~-]+(?=[a-z])/g, '$1');
    // single letters split by spaces join up: f u c k
    t = t.replace(/(?:^|\s)((?:[a-z] ){2,}[a-z])(?=\s|$)/g, (m, run) => m.replace(run, run.replace(/ /g, '')));
    return t;
  }

  // a listed word matches stretched (fuuuck) and with the usual endings, in English and Romanian
  const ENDINGS = '(?:s|es|ed|er|ers|ing|in|y|ies|ty|ting|head|heads|hole|holes|face|i|ii|ei|ul|ule|ului|ilor|ele|a|e|o|uri|ul|ii)?';
  const stretch = (word) => word.split('').map((ch) => (ch === ' ' ? '\\s+' : ch === 'u' ? '[uv]+' : ch + '+')).join('');
  // plain entries need a word edge on both sides and may take an ending; "~" entries match inside
  // longer words too; "=" entries match only exactly as written (so "spic" never catches "spicy")
  function pattern(entries) {
    const word = entries.filter((e) => !/^[~=]/.test(e)).map(stretch);
    const exact = entries.filter((e) => e.startsWith('=')).map((e) => stretch(e.slice(1)));
    const part = entries.filter((e) => e.startsWith('~')).map((e) => stretch(e.slice(1)));
    const sources = [];
    if (word.length) sources.push(`(?:^|[^a-z])(?:${word.join('|')})${ENDINGS}(?![a-z])`);
    if (exact.length) sources.push(`(?:^|[^a-z])(?:${exact.join('|')})(?![a-z])`);
    if (part.length) sources.push(`(?:${part.join('|')})`);
    return new RegExp(sources.join('|'));
  }

  // hate and slurs: never posted (a ~ marks a part-of-word match)
  const SLURS = pattern([
    '~nigger', '~nigga', '~faggot', 'retard', '=spic', '=spics', '=chink', '=chinks', '=kike', '=kikes',
    '=gook', '=gooks', '~wetback', '=coon', '=coons', '=tranny', '=trannies', '=dyke', '=dykes', '=paki', '=pakis',
    '~raghead', '~towelhead', '=beaner', '=beaners',
    // Romanian: homophobic, antisemitic, anti-Hungarian, anti-Roma and ableist slurs
    '~poponar', '~homalau', '~bozgor', '~jidan', '=cioroi', '=ciorii', 'retardat', '=mongoloid', '=mongoloizi',
  ]);

  // threats and telling people to hurt themselves: never posted
  const THREATS = [
    /k+i+l+l*\s*(?:y+o+u+r*|u+r+|y+o+)\s*s+e+l+f+/,
    /(?:^|[^a-z])k+y+s+(?![a-z])/,
    /(?:^|[^a-z])(?:go|pls|please|just)\s+die(?![a-z])/,
    /hope\s+(?:you|u|ya)\s+(?:die|get\s+killed)/,
    /(?:i\s*'?\s*ll|i\s+will|im\s+(?:going\s+to|gonna)|i\s+am\s+going\s+to|gonna)\s+(?:kill|murder|stab|shoot|hurt)\s+(?:you|u|ya|him|her|them)(?![a-z])/,
    /(?:neck|end|hang)\s+yourself/,
    /drink\s+bleach/,
    // Romanian: kill yourself, hang yourself, throw yourself off the block, cut your veins, I'll kill you
    /omoara\s*-?\s*te/,
    /sinucide\s*-?\s*te/,
    /spanzura\s*-?\s*te/,
    /arunca\s*-?\s*te\s+(?:de\s+pe|de\s+la|in\s+fata)/,
    /taie\s*-?\s*ti\s*venele/,
    /(?:^|[^a-z])te\s+(?:omor|ucid|injunghi|impusc|tai|spanzur)(?![a-z])/,
    /(?:^|[^a-z])iti\s+(?:tai|rup)\s+(?:gatul|capul)/,
    /du\s*-?\s*te\s+(?:si\s+)?(?:mori|te\s+sinucide|te\s+omoara)/,
    /(?:^|[^a-z])(?:sper|sa)\s+(?:sa\s+)?(?:mori|crapi)\s+(?:naibii|dracului|in\s+chinuri)/,
  ];

  // someone may be in a bad place: not blocked, met with care
  const CARE = [
    /(?:kill|hurt|cut|harm)\s+myself/,
    /(?:^|[^a-z])i\s+(?:want|wanna)\s+(?:to\s+)?die(?![a-z])/,
    /(?:^|[^a-z])suicid/,
    /end\s+(?:it\s+all|my\s+life)/,
    /self\s*-?\s*harm/,
    /(?:^|[^a-z])ma\s+sinucid/,
    /vreau\s+sa\s+mor(?![a-z])/,
    /sa\s+ma\s+omor(?![a-z])/,
    /nu\s+mai\s+vreau\s+sa\s+(?:traiesc|exist)/,
    /(?:^|[^a-z])(?:ma\s+autovatam|autovatamare)/,
    /(?:^|[^a-z])ma\s+tai\s+pe\s+(?:maini|brate|picioare)/,
  ];

  // swearing: allowed, but softened for anyone with the language filter on
  const STRONG = pattern([
    '~fuck', '~fck', 'shit', 'bullshit', 'horseshit', 'dipshit', 'apeshit', '~bitch', '~asshole', 'ass', 'arse', '~arsehole', '~bastard',
    'dick', '=cock', '=cocks', 'cunt', 'twat', '~wanker', 'prick', 'piss', 'pissed', 'bollocks', '~slut', '~whore',
    // Romanian, with the spellings and short forms people use
    'pula', 'pulamea', 'pule', '=plm', 'pizda', 'pizde', 'pizdos', 'pizdulici', '=pzd', '=pzda', 'muie', 'muist', 'muisti', 'muista',
    'futu', 'fututi', 'futuva', 'futui', 'fut', 'fute', 'futem', 'futeti', 'futut', 'futai', 'futacios', '=fmm', '=mtfm',
    'cacat', 'cacatul', 'cacanar', 'curva', 'curvo', 'curvar', 'tarfa', 'tarfe', 'tarfo', 'zdreanta', 'zdreanto', 'pizdo', 'coaie', 'coi', 'coaiele', '=cur', '=curu', '=curul',
    'labagiu', 'bulangiu', 'lindic', 'matii', 'mortii matii', 'mortii mamii', 'gaozar', 'gaoaza', 'sugaci',
    // crude and sexual words: dotted out in posts, and never allowed in a username or a nest's name.
    // Exact (=) where a looser match would catch an innocent word, in Romanian above all: "cum" (how)
    // and "a porni" (to start) are left alone
    'penis', 'vagin', '=dildo', '=dildos', '=boobs', '=boobies', '=titties', '=titty', 'pussy', '=pussies',
    '=porn', '=porno', '=pornos', '=pornhub', '~pornograph', '~masturb', '~blowjob', '~handjob', 'jerk off',
    '=horny', 'boner', '=nudes', '=hentai', '=milf', '=onlyfans', '=cumshot', 'jizz', '=clit', '~clitoris',
  ]);

  // ---- personal information -------------------------------------------------------------------

  function luhn(digits) {
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let d = +digits[digits.length - 1 - i];
      if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
      sum += d;
    }
    return sum % 10 === 0;
  }

  function personal(text) {
    const found = [];
    if (/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text)) found.push('an email address');
    const runs = text.match(/\+?\d(?:[\s().-]{0,2}\d){8,18}/g) || [];
    for (const run of runs) {
      const digits = run.replace(/\D/g, '');
      if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) found.push('a card number');
      else if (digits.length >= 9 && digits.length <= 15) found.push('a phone or ID number');
    }
    for (const m of text.match(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/g) || []) {
      if ((m.match(/\d/g) || []).length >= 10) found.push('a bank account number (IBAN)');
    }
    if (/\b(?:password|passwd|pwd|parola)\s*[:=]/i.test(text)) found.push('a password');
    return [...new Set(found)];
  }

  // ---- spam ---------------------------------------------------------------------------------------

  const SHORTENERS = /\b(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|cutt\.ly|shorturl\.at|rb\.gy|tiny\.cc|t\.ly|s\.id)\//i;
  const MINUTE = 60000;

  function shouting(text) {
    const letters = text.match(/\p{L}/gu) || [];
    if (letters.length < 12) return false;
    const upper = letters.filter((ch) => ch !== ch.toLowerCase()).length;
    return upper / letters.length >= 0.7;
  }

  const same = (a, b) => fold(a).replace(/\s+/g, ' ').trim() === fold(b).replace(/\s+/g, ' ').trim();

  // ---- the check ------------------------------------------------------------------------------

  const RULES = {
    hate: 'No hate or slurs',
    threat: 'No threats, and never tell anyone to hurt themselves',
    links: 'No spam links',
    repeat: 'No spam',
    flood: 'Slow down',
    duplicate: 'No duplicates',
    personal: 'No personal info',
    caps: 'Easy on the capitals',
  };

  /**
   * What the rules say about some text before it's posted.
   * kind is 'post', 'comment', 'nook' or 'profile'; postId and editing help the spam rules.
   * Returns { block: {rule, why} | null, warn: [{rule, why}], care: bool, strong: bool }.
   */
  function check(texts, { kind = 'post', postId = null, editing = null, history = null } = {}) {
    const first = texts[0] || '';
    texts = texts.filter(Boolean).map(String);
    const all = texts.join('\n');
    const folded = fold(all);
    const result = { block: null, warn: [], care: false, strong: false };
    const stop = (rule, why) => {
      if (!result.block) result.block = { rule: RULES[rule], why };
    };

    if (SLURS.test(folded)) stop('hate', 'This contains a slur. Budgie doesn’t allow words that attack people for who they are.');
    if (THREATS.some((re) => re.test(folded))) stop('threat', 'This reads as a threat, or as telling someone to hurt themselves.');

    const links = (all.match(/(?:https?:\/\/|www\.)/gi) || []).length;
    if (links > 3) stop('links', `That’s ${links} links. Keep it to 3 or fewer.`);
    if (SHORTENERS.test(all)) stop('links', 'Shortened links hide where they lead. Paste the full link instead.');
    if (/(.)\1{12,}/u.test(all.replace(/\s/g, ' ').replace(/ {2,}/g, ' '))) stop('repeat', 'That has a very long run of the same character.');
    if (/\b(\w+)(?:\W+\1\b){7,}/iu.test(all)) stop('repeat', 'That repeats the same word over and over.');

    // the spam rules that need what you've posted before
    // what you've posted lately: { posts: [{title, createdAt}], comments: [{postId, body, createdAt}] }
    const past = history || (Nook.store && Nook.store.history ? Nook.store.history() : null);
    const now = Date.now();
    if (past && !editing) {
      const mine = past.posts;
      const myComments = past.comments;
      if (kind === 'post') {
        const recent = mine.filter((p) => now - p.createdAt < 10 * MINUTE);
        if (recent.length >= 5) {
          const wait = Math.ceil((10 * MINUTE - (now - Math.min(...recent.map((p) => p.createdAt)))) / MINUTE);
          stop('flood', `That’s a lot of posts in a few minutes. Try again in ${wait} min.`);
        }
        if (mine.some((p) => now - p.createdAt < 24 * 60 * MINUTE && same(p.title, first))) stop('duplicate', 'You already posted this today.');
      }
      if (kind === 'comment') {
        if (myComments.filter((c) => now - c.createdAt < 2 * MINUTE).length >= 8) stop('flood', 'That’s a lot of comments very quickly. Take a breath and try again in a minute or two.');
        if (myComments.some((c) => c.postId === postId && now - c.createdAt < 60 * MINUTE && same(c.body, all))) stop('duplicate', 'You already said exactly this here.');
      }
    }

    const info = personal(all);
    if (info.length) result.warn.push({ rule: RULES.personal, why: `This looks like it contains ${info.join(' and ')}. Don’t share private details, yours or anyone else’s.` });
    if (kind !== 'profile' && texts.some(shouting)) result.warn.push({ rule: RULES.caps, why: 'That’s mostly capital letters, which reads as shouting.' });

    result.care = CARE.some((re) => re.test(folded));
    result.strong = STRONG.test(folded);
    return result;
  }

  /** text with strong words dotted out (f•••), for anyone with the language filter on */
  function soften(text) {
    if (!text) return text;
    return String(text).replace(/(?:[\p{L}\p{N}@$€*]|[!|._-](?=\p{L}))+/gu, (token) => {
      if (!/\p{L}/u.test(token) || !STRONG.test(fold(token))) return token;
      const chars = [...token];
      return chars[0] + '•'.repeat(chars.length - 1);
    });
  }

  Nook.mod = { check, soften, fold, RULES };
  if (typeof module !== 'undefined' && module.exports) module.exports = Nook.mod;
})();
