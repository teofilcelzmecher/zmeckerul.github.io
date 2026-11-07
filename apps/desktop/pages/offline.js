// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// No internet: Budgie says so, and goes back to the website as soon as it can reach it (or when asked to).
'use strict';
const q = new URLSearchParams(location.search);
const lang = q.get('lang') || 'en';
const site = /^https:\/\//.test(q.get('site') || '') ? q.get('site') : 'https://budgiesocial.com/';
const word = (key) => (window.BUDGIE_WORDS && BUDGIE_WORDS(lang, key)) || key;
document.getElementById('title').textContent = word('offline');
document.getElementById('body').textContent = word('offlineBody');
document.getElementById('retry').textContent = word('retry');
const back = () => (location.href = site);
document.getElementById('retry').addEventListener('click', back);
addEventListener('online', back);
// and every so often anyway (a computer can be online again without saying so)
setInterval(() => navigator.onLine && back(), 15000);
