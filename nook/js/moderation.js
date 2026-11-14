// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Moderation rules: fixed word lists and patterns, checked on the device before anything is posted,
 * and again on the server. Text is folded first (accents, l33t spelling, s.p.a.c.e.d letters,
 * stretched leeeetters, look-alike and emoji letters) so the lists catch the usual disguises. Every
 * outcome comes with the rule it applies:
 *   block   slurs, threats, sexual requests, adult links, scams, spam and flooding: not posted
 *   warn    things that look like personal information, SHOUTING: confirm first
 *   care    someone may be struggling: posted, with where to find help
 *   strong  swearing: posted, and hidden behind dots for anyone with the filter on
 *   flag    in private messages, the warning signs of grooming: sent, and shown to a moderator
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

  // letters drawn as emoji or in boxes (🇫🇺🇨🇰, 🅵🆄🅲🅺, 🄵🅄🄲🄺) are plain letters too
  const EMOJI_LETTERS = /[\u{1F1E6}-\u{1F1FF}\u{1F130}-\u{1F149}\u{1F150}-\u{1F169}\u{1F170}-\u{1F189}]/gu;
  const emojiLetter = (ch) => {
    const c = ch.codePointAt(0);
    for (const start of [0x1f1e6, 0x1f130, 0x1f150, 0x1f170]) if (c >= start && c < start + 26) return String.fromCharCode(97 + c - start);
    return ch;
  };

  function fold(text) {
    let t = String(text || '')
      .replace(EMOJI_LETTERS, emojiLetter)
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
    // the threats and death wishes that need no bad word: I know where you live, I'll beat you up,
    // nobody would miss you, people like you shouldn't exist (and in Romanian)
    /(?:know|find|found\s+out|find\s+out)\s+where\s+(?:you|u|ya)\s+live(?![a-z])/,
    /(?:^|[^a-z])beat\s+(?:you|u|ya)\s+up(?![a-z])/,
    /(?:nobody|no\s*one|noone)\s+(?:would|will|d)\s+(?:miss|cry\s+for|care\s+if)\s+(?:you|u)(?![a-z])/,
    /(?:world|everyone|everybody)\s+(?:would\s+be|will\s+be|d\s+be|is)\s+better\s+(?:off\s+)?without\s+(?:you|u)(?![a-z])/,
    /people\s+like\s+(?:you|u)\s+(?:shouldn\W?t|should\s+not|don\W?t\s+deserve\s+to)\s+(?:exist|live|be\s+alive)/,
    /(?:you|u)\s+(?:don\W?t|do\s+not)\s+deserve\s+to\s+(?:live|exist|be\s+alive)/,
    /(?:you|u)\s+should\s+(?:just\s+)?(?:die|not\s+exist|stop\s+existing|disappear\s+forever)(?![a-z])/,
    /(?:^|[^a-z])(?:go|just|pls|please)\s+(?:go\s+)?jump\s+off\s+(?:a|the|some)\s+(?:bridge|cliff|building|roof)/,
    /stiu\s+unde\s+(?:locuiesti(?![a-z])|stai\s*(?:$|[.!?,]))/,
    /(?:o\s+sa|am\s+sa)\s*-?\s*(?:iti|ti)\s+fac\s+rau/,
    /nu\s+meriti\s+sa\s+(?:traiesti|existi)/,
    /(?:oamenii|cei)\s+ca\s+tine\s+(?:n\s*-?\s*ar|nu\s+ar)\s+trebui\s+sa\s+(?:existe|traiasca)/,
    /nimeni\s+nu\s+(?:te\s*-?\s*ar|ar)\s+(?:plange|regreta)/,
    /lumea\s+ar\s+fi\s+mai\s+buna\s+fara\s+tine/,
  ];

  // attacking people for where they're from, without a slur: never posted
  const HATE = [
    /go\s+back\s+to\s+(?:your|ur|yo)\s+(?:own\s+)?(?:country|countries)(?![a-z]|\s*['’]\s*s(?![a-z]))/,
    /du\s*-?\s*te\s+(?:inapoi\s+)?in\s+tara\s+ta(?![a-z])/,
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

  // asking for or offering nudes, and sex: never posted. Talking about sex education is still fine
  const N = '(?:n[uo]+d(?:i?e)?[sz]|n[uo]+dies|nude)'; // nudes, nudez, nuds, noods, noodz, nudies, nude
  const rx = (parts, ...values) => new RegExp(String.raw(parts, ...values));
  const SEXUAL = [
    rx`(?:^|[^a-z])(?:send|snd|sned|show|post|dm|give)\s+(?:me\s+|us\s+)?(?:(?:your|ur|yo|some|a|ya|ure|those)\s+)?(?:${N}|naked\s+(?:pics?|photos?|selfies?|vids?|videos?)|(?:dick|cock|tit|tits|boob|boobs|pussy|nude|nsfw)\s*(?:pics?|photos?|vids?))(?![a-z])`,
    rx`(?:^|[^a-z])(?:trade|trading|swap|selling|sell|buy|buying)\s+(?:my\s+|your\s+|ur\s+|some\s+)?(?:${N}|nude\s+(?:pics|photos))(?![a-z])`,
    rx`(?:^|[^a-z])${N}\s+(?:for|in\s+exchange\s+for)\s+(?:sale|robux|money|cash|nitro|followers|vbucks|v\s*bucks)`,
    /(?:^|[^a-z])(?:wanna|want\s+to|let\W?s|let\s+us|u\s+wanna|you\s+wanna|we\s+should)\s+(?:sext|have\s+sex|fuck|hook\s*up)(?![a-z])/,
    /(?:^|[^a-z])sext(?:ing)?\s+(?:me|with\s+me|u|you)(?![a-z])/,
    /(?:^|[^a-z])(?:show|flash)\s+(?:me\s+|us\s+)?(?:your\s+|ur\s+|ure\s+)?(?:boobs|tits|titties|dick|cock|pussy|vagina|penis|nipples)(?![a-z])/,
    rx`(?:^|[^a-z])(?:dm|message|snap|add|text)\s+me\s+(?:for|a)\s+(?:${N}|nsfw|lewds?|sexy\s+(?:pics|photos|stuff))`,
    /(?:send|show)\s+(?:me\s+)?(?:a\s+|some\s+)?(?:pics?|pictures?|photos?|selfies?|vids?|videos?)\s+of\s+(?:your|ur)\s+(?:body|chest|butt|ass|bum)(?![a-z]|\s+of(?![a-z]))/,
    /(?:want|wanna)\s+(?:to\s+)?see\s+(?:you|u)\s+(?:naked|nude|without\s+(?:clothes|anything\s+on))/,
    /(?:send|show)\s+(?:me\s+)?(?:a\s+|some\s+)?(?:pics?|pictures?|photos?|selfies?|vids?|videos?)\s+(?:of\s+(?:you|u|yourself)\s+)?in\s+(?:your|ur|just\s+(?:your|ur))\s+(?:underwear|bra|panties|boxers|lingerie|bikini)(?![a-z])/,
    // Romanian: send me nude photos, show me your…, want to have sex, I sell/swap nudes
    /(?:trimite|da|arata|baga|pune|posteaza)\s*-?\s*(?:mi|ne)?\s*(?:o\s+|niste\s+|un\s+|si\s+)?(?:poza|poze|foto|fotografie|fotografii|video|clip)\s+(?:cu\s+tine\s+)?(?:nud[ae]?|goal[ae]?|dezbracat[ae]?|in\s+pielea\s+goala|in\s+lenjerie|cu\s+(?:tatele|sanii|pula|pizda|fundul|curul))/,
    /(?:vrei|hai|vreau)\s+sa\s+(?:ne\s+futem|facem\s+sex|ne\s+(?:pozam|filmam)\s+goi)/,
    /arata\s*-?\s*mi\s+(?:tatele|sanii|tzatzele|pula|pizda|fundul|curul)(?![a-z])/,
    /(?:^|[^a-z])(?:trimit|vand|schimb|vinzi|schimbi)\s+(?:poze\s+|pozele\s+)?(?:nud[ae]|nuduri|nudes)(?![a-z])/,
  ];

  // links to porn and adult sites: never posted (matched on the text as written, not folded)
  const ADULT_SITES = new RegExp(
    '(?:^|[^a-z0-9-])(?:[a-z0-9-]+\\.)*(?:pornhub|xvideos|xnxx|xhamster|redtube|youporn|tube8|spankbang|eporner|onlyfans|fansly|chaturbate|stripchat|' +
      'bongacams|livejasmin|cam4|myfreecams|camsoda|brazzers|bangbros|realitykings|naughtyamerica|nhentai|e-hentai|exhentai|hentaihaven|' +
      'hanime|rule34|e621|gelbooru|motherless|erome|fapello|thothub|porntrex|tnaflix|youjizz|hclips|txxx|manyvids|clips4sale|literotica)\\.[a-z]{2,}' +
      '|(?:^|[^a-z0-9-])[a-z0-9-]+\\.(?:xxx|porn|sex|adult)(?![a-z])',
    'i'
  );

  // the usual scams: free Robux, V-Bucks or Nitro, doubled crypto, money a day
  const SCAMS = [
    /free\s*(?:robux|v\s*-?\s*bucks|vbux|nitro|discord\s+nitro|gift\s*cards?|steam\s+(?:gift|wallet)|skins)(?![a-z])/,
    /(?:robux|v\s*-?\s*bucks|nitro)\s+(?:giveaway|generator|gen|hack|for\s+free)(?![a-z])/,
    /(?:double|triple)\s+(?:your|ur)\s+(?:bitcoin|btc|crypto|eth|money|investment|robux)/,
    /(?:crypto|bitcoin|btc|eth|usdt)\s+(?:giveaway|investment\s+(?:plan|opportunity))/,
    /(?:dm|message|contact|text|add)\s+(?:me\s+)?(?:on|via)\s+(?:telegram|whatsapp|signal)\s+(?:for|to)\s+(?:invest|earn|profit|trade|make\s+money)/,
    /(?:robux|nitro|v\s*-?\s*bucks)\s+gratis/,
  ];
  const MONEY_A_DAY = /(?:earn|make|castiga|faci)\s+\$?\s?\d[\d,.]*\s*(?:k|\$|usd|dollars|euros?|eur|lei|ron)?\s*(?:a|per|\/|every|pe)\s*(?:day|hour|week|zi|ora|saptamana)(?![a-z])/i;

  // in private messages, the warning signs of grooming: not blocked (friends joke), but a moderator sees it
  const WARNING_SIGNS = [
    /(?:don\s*t|dont|do\s+not|never)\s+tell\s+(?:your|ur|yo)\s+(?:parents|mom\s+(?:and|or)\s+dad|mum\s+(?:and|or)\s+dad|family)/,
    /(?:keep|kept)\s+(?:this|it|us|our\s+(?:chat|chats|talk|messages))\s+(?:a\s+)?(?:secret|between\s+(?:us|you\s+and\s+me))/,
    // these two only as the whole question, so "what are you wearing to the party?" isn't one
    /(?:^|[^a-z])(?:are|r)\s+(?:you|u)\s+(?:home\s+)?alone(?:\s+(?:right\s+now|rn|now|tonight|at\s+home))?\s*$/,
    /what\s+(?:are|r)\s+(?:you|u)\s+wearing(?:\s+(?:right\s+now|rn|now|tonight|in\s+bed))?\s*$/,
    /(?:send|show)\s+(?:me\s+)?(?:a\s+)?(?:pic|picture|photo|selfie|video|vid)s?\s+(?:of\s+)?(?:you|yourself|ur\s+body|your\s+body)\s+(?:in|without|wearing)\s/,
    /how\s+old\s+(?:are|r)\s+(?:you|u)[^]{0,80}(?:snap|snapchat|insta|whatsapp|telegram|address|where\s+(?:do\s+)?(?:you|u)\s+live)/,
    /(?:snap|snapchat|insta|whatsapp|telegram|address|where\s+(?:do\s+)?(?:you|u)\s+live)[^]{0,80}how\s+old\s+(?:are|r)\s+(?:you|u)/,
    /(?:lets|let\s+s|we\s+should|can\s+we|wanna|want\s+to)\s+meet(?:\s+up)?\s+(?:in\s+person|irl|alone|secretly|in\s+secret)/,
    // Romanian: don't tell your parents, are you home alone, what are you wearing, stays between us, let's meet alone
    /nu\s+(?:le\s+)?spune\s+(?:la\s+)?(?:parintilor|parintii|mamei|tatalui|nimanui)/,
    /(?:esti|stai)\s+singur[ae]?\s+acasa/,
    /ce\s+porti\s+(?:pe\s+tine|acum|in\s+seara\s+asta)/,
    /(?:ramane|sa\s+ramana)\s+(?:intre\s+noi|secret)/,
    /hai\s+sa\s+ne\s+(?:vedem|intalnim)\s+(?:singuri|in\s+secret|doar\s+noi)/,
  ];

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
    bully: 'No bullying',
    threat: 'No threats, and never tell anyone to hurt themselves',
    sexual: 'Nothing sexual',
    adult: 'No adult sites',
    scam: 'No scams',
    safety: 'Keep each other safe',
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
   * Returns { block: {rule, why} | null, warn: [{rule, why}], care: bool, strong: bool, flag: {rule, why} | null }.
   */
  function check(texts, { kind = 'post', postId = null, editing = null, history = null } = {}) {
    const first = texts[0] || '';
    texts = texts.filter(Boolean).map(String);
    const all = texts.join('\n');
    const folded = fold(all);
    const result = { block: null, warn: [], care: false, strong: false, flag: null };
    const stop = (rule, why) => {
      if (!result.block) result.block = { rule: RULES[rule], why };
    };

    if (SLURS.test(folded)) stop('hate', 'This contains a slur. Budgie doesn’t allow words that attack people for who they are.');
    if (THREATS.some((re) => re.test(folded))) stop('threat', 'This reads as a threat, or as telling someone to hurt themselves.');
    if (HATE.some((re) => re.test(folded))) stop('hate', 'This attacks people for where they’re from. Budgie doesn’t allow that.');
    // the sexual and scam patterns also try the text with its punctuation turned into spaces ("send. nudes")
    const loose = fold(all.replace(/[!?.,;:]+(?=\s|$)/g, ' ')).replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ');
    const either = (re) => re.test(folded) || re.test(loose);
    if (SEXUAL.some(either)) stop('sexual', 'Budgie doesn’t allow asking for or offering nudes, or sexual messages. Everyone here is 13 or older, and many are teenagers.');
    if (ADULT_SITES.test(all)) stop('adult', 'Links to porn and adult sites aren’t allowed on Budgie.');
    const plain = all.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (SCAMS.some(either) || MONEY_A_DAY.test(plain)) stop('scam', 'This looks like a scam (free Robux, V-Bucks or Nitro, doubled crypto, easy money), so it can’t be posted.');
    const mentions = new Set((all.match(/(?:^|[^\w/])u\/[A-Za-z0-9_]{3,20}/g) || []).map((m) => m.replace(/^.*u\//, '').toLowerCase()));
    if (mentions.size > 8) stop('repeat', 'Mentioning lots of people at once is spam. Keep it to 8 or fewer.');
    if (kind === 'message' && WARNING_SIGNS.some(either)) {
      result.flag = { rule: RULES.safety, why: 'this private message has a warning sign of grooming (such as keeping secrets from parents, being alone, what someone is wearing, or meeting in secret). Please take a look.' };
    }

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
