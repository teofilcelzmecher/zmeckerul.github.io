// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie in other languages (from 1.0): Romanian, Spanish, French, German and Italian, as well as English.
 *
 * The app is written in English. The page's loader (index.html) picks the language (the one chosen before, or the
 * browser's own) and loads its file, js/lang/<code>.js, just before this one. That file holds every sentence and
 * label in the app with its translation, and the sentences with something in them ("Report u/{0}") as patterns.
 * This file translates whatever the app puts on the page as it goes on: HTML set with innerHTML and
 * insertAdjacentHTML, text set with textContent, and the attributes people read (labels, placeholders,
 * tooltips), so nothing has to be written twice. What people write (posts, comments, messages, names) is left
 * as it is, and so are icons (their names aren't words).
 *
 *   Nook.i18n.lang        'en', 'ro', 'es', 'fr', 'de' or 'it'
 *   Nook.i18n.t(text)     a sentence in the language (or as it was, when there's no translation)
 *   Nook.i18n.choose(code) remembers a language and reloads in it
 *   Nook.i18n.LANGS       the languages, by code, in their own names
 */
(function () {
  'use strict';

  const Nook = (window.Nook = window.Nook || {});
  const LANGS = { en: 'English', ro: 'Română', es: 'Español', fr: 'Français', de: 'Deutsch', it: 'Italiano' };
  const pack = window.NOOK_LANG && LANGS[window.NOOK_LANG.code] ? window.NOOK_LANG : null;
  const lang = pack ? pack.code : 'en';
  document.documentElement.lang = lang;

  function choose(code) {
    if (!LANGS[code]) return;
    try {
      localStorage.setItem('nook-lang', code);
    } catch (_) {
      /* this visit only */
    }
    location.reload();
  }

  // English: nothing to translate, and nothing is patched
  if (!pack) {
    Nook.i18n = { lang, t: (s) => s, choose, LANGS, short: {} };
    return;
  }

  const strings = new Map(Object.entries(pack.strings || {}));
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "Report u/{0}" → /^Report u\/(.+?)$/, and which slot each group fills
  const patterns = Object.entries(pack.patterns || {}).map(([en, out]) => {
    const order = [];
    const source = en
      .split(/(\{\d+\})/)
      .map((part) => {
        const m = /^\{(\d+)\}$/.exec(part);
        if (!m) return escapeRe(part);
        order.push(Number(m[1]));
        return '(.+?)';
      })
      .join('');
    return { re: new RegExp('^' + source + '$', 's'), order, out, fixed: en.replace(/\{\d+\}/g, '').length };
  });
  // the longest fixed text first, so "Report u/{0} for {1}" wins over "Report {0}"
  patterns.sort((a, b) => b.fixed - a.fixed);

  // a count and a word ("3 members"): the language's own way of counting
  const NOUNS = pack.nouns || {};
  const forms = Object.create(null);
  for (const [singular, list] of Object.entries(NOUNS)) {
    forms[singular] = list;
    forms[pack.plurals && pack.plurals[singular] ? pack.plurals[singular] : singular + 's'] = list;
  }
  const countRe = /^(-?[\d.,]+k?) ([a-z][a-z ]*?)$/;

  const cache = new Map();
  /** a sentence in the language: exactly, by a pattern (its slots translated too), or as it was */
  function t(input) {
    if (input == null) return input;
    const text = String(input);
    const key = text.replace(/\s+/g, ' ').trim();
    if (!key || !/\p{L}/u.test(key)) return text;
    let out = cache.get(key);
    if (out === undefined) {
      out = strings.get(key);
      if (out === undefined) {
        const counted = countRe.exec(key);
        if (counted && forms[counted[2]]) out = pack.count(counted[1], forms[counted[2]]);
      }
      if (out === undefined) {
        for (const p of patterns) {
          const m = p.re.exec(key);
          if (!m) continue;
          const slots = [];
          p.order.forEach((slot, i) => (slots[slot] = m[i + 1]));
          out = p.out.replace(/\{(\d+)\}/g, (_, n) => (slots[n] == null ? '' : t(slots[n])));
          break;
        }
      }
      if (out === undefined) out = null;
      if (cache.size > 5000) cache.clear();
      cache.set(key, out);
    }
    if (out == null) return text;
    // the spaces around it stay as they were
    const lead = /^\s*/.exec(text)[0];
    const trail = /\s*$/.exec(text)[0];
    return lead + out + trail;
  }

  // what's left as it was: icons, and what people wrote
  const KEEP = '[translate="no"], [data-no-i18n], .md, .post-title, .c-body, .bio, .author, .msg-name, .chat-who b, .tile-name span, .call-title b, .group-name, .peek-post h3, .who-name, .name, script, style, textarea, code, pre, kbd';
  const ATTRS = ['aria-label', 'placeholder', 'title', 'data-tooltip', 'alt', 'data-title', 'data-description', 'data-tagline', 'data-example', 'aria-description'];
  const kept = (el) => !!(el && el.closest && el.closest(KEEP));

  function translateAttrs(el) {
    for (const name of ATTRS) {
      const v = el.getAttribute(name);
      if (v) {
        const out = t(v);
        if (out !== v) setAttr.call(el, name, out);
      }
    }
  }
  /** translates the words in an element (or a text node) and everything in it */
  function translate(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      const parent = node.parentElement;
      if (parent && !kept(parent)) {
        const out = t(node.nodeValue);
        if (out !== node.nodeValue) setData.call(node, out);
      }
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) return;
    if (node.nodeType === 1) {
      if (kept(node)) return;
      translateAttrs(node);
    }
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(KEEP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let n = walker.nextNode();
    while (n) {
      if (n.nodeType === 3) {
        const v = n.nodeValue;
        if (v && /\p{L}/u.test(v)) {
          const out = t(v);
          if (out !== v) setData.call(n, out);
        }
      } else translateAttrs(n);
      n = walker.nextNode();
    }
  }

  // ---- the ways the app puts words on the page ----------------------------------------------------------------

  const inner = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');
  Object.defineProperty(Element.prototype, 'innerHTML', {
    configurable: true,
    enumerable: inner.enumerable,
    get: inner.get,
    set(value) {
      inner.set.call(this, value);
      translate(this);
    },
  });
  const adjacent = Element.prototype.insertAdjacentHTML;
  Element.prototype.insertAdjacentHTML = function (where, html) {
    adjacent.call(this, where, html);
    translate(/^(beforebegin|afterend)$/i.test(where) ? this.parentElement : this);
  };
  const textContent = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent');
  Object.defineProperty(Node.prototype, 'textContent', {
    configurable: true,
    enumerable: textContent.enumerable,
    get: textContent.get,
    set(value) {
      if (this.nodeType === 1 && !kept(this) && typeof value === 'string') value = t(value);
      textContent.set.call(this, value);
    },
  });
  const setAttr = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (ATTRS.includes(name) && typeof value === 'string' && !kept(this)) value = t(value);
    return setAttr.call(this, name, value);
  };
  const setData = Object.getOwnPropertyDescriptor(CharacterData.prototype, 'data').set;
  // words that roll into place letter by letter are translated before they're cut up
  if (window.M3 && M3.rollText) {
    const roll = M3.rollText;
    M3.rollText = (el, text, options) => roll(el, kept(el) ? text : t(text), options);
  }
  // dates and times in the language too, wherever the app asks for the browser's own way of writing them
  for (const name of ['toLocaleDateString', 'toLocaleTimeString', 'toLocaleString']) {
    const original = Date.prototype[name];
    Date.prototype[name] = function (locales, options) {
      return original.call(this, locales == null || (Array.isArray(locales) && !locales.length) ? pack.locale || lang : locales, options);
    };
  }
  // anything that reaches the page another way
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translate(r.target);
      else for (const node of r.addedNodes) translate(node);
    }
  }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });

  // the page as it came (the welcome page, the bars)
  translate(document.body);
  document.title = t(document.title);

  Nook.i18n = { lang, t, choose, LANGS, translate, short: pack.short || {} };
})();
