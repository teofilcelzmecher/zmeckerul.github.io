// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Budgie for Windows and Linux: budgiesocial.com in a window of its own, and what a computer adds around it.
 *
 *   always the newest   Budgie's screens are the website's, as they are, so the app is the newest Budgie the moment
 *                       the website is; the app itself changes rarely, and says when there's a newer one
 *   calls ring          closing the window keeps Budgie running in the tray, and it starts with the computer (unless
 *                       that's turned off), so a call rings even with no window open: a small window of its own pops
 *                       up over everything else, with Answer and Decline, as the ringtone plays
 *   notifications       new messages, group messages, replies and the rest, while Budgie isn't in front
 *   unread              a count on its taskbar button (Windows) or in the dock (Linux), and a dot on its tray icon
 *   screen sharing      a picker for a screen or a window, and on Windows the computer's sound with it
 *   playing             the song this computer is playing and the game it's running, for "Listening to" and
 *                       "Playing" on Budgie (activity.js finds them; the website shows them), unless that's turned off
 *   the rest            links to other sites open in the browser; right-click to copy, paste and fix spelling; no ads
 *
 * The website only sees window.BUDGIE_DESKTOP (preload.js) and a small script that watches its unread counts
 * (desktop.js); nothing else of the computer reaches it (of what's running: a song's name and a game's name, no more).
 */
'use strict';
const { app, BrowserWindow, Tray, Menu, Notification, nativeImage, shell, session, desktopCapturer, ipcMain, nativeTheme, screen, net, clipboard } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const words = require('./strings');
const activity = require('./activity');

const SITE = process.env.BUDGIE_SITE || 'https://budgiesocial.com/';
const SITE_URL = new URL(SITE);
const REPO = 'teofilcelzmecher/zmeckerul.github.io';
const DOWNLOAD = 'https://budgiesocial.com/download.html';
const WIN = process.platform === 'win32';
const LINUX = process.platform === 'linux';
const ICONS = path.join(__dirname, 'icons');
const PAGES = path.join(__dirname, 'pages');
const APP_ICON = path.join(ICONS, 'icon-256.png');
const DESKTOP_JS = fs.readFileSync(path.join(__dirname, 'desktop.js'), 'utf8');
const startHidden = process.argv.includes('--hidden');
// for testing: a profile of its own, apart from the real one
if (process.env.BUDGIE_DATA) app.setPath('userData', process.env.BUDGIE_DATA);

// Budgie runs for days in the tray: something going wrong is written down, never left as a box on the screen that
// stops everything (calls included) until someone clicks it
process.on('uncaughtException', (e) => console.error('Budgie:', e));
process.on('unhandledRejection', (e) => console.error('Budgie:', e));

// one Budgie at a time: opening it again brings the one that's running to the front
if (!app.requestSingleInstanceLock()) app.exit(0);
// Windows: notifications and the taskbar know Budgie by this (the installer's shortcuts carry it too)
if (WIN) app.setAppUserModelId('com.budgiesocial.app');

let win = null;
let tray = null;
let quitting = false;
let unread = 0;
let update = null; // { version, url } when a newer app is out
let ringWin = null;
let ringing = null;
const kept = []; // notifications, kept so a click on one still reaches Budgie

// ---- what Budgie remembers on this computer -------------------------------------------------------------------

const SETTINGS = () => path.join(app.getPath('userData'), 'settings.json');
// shareMusic, shareGames: what's playing and running may be shown on Budgie (both on unless turned off)
const settings = { notifications: true, startup: null, told: false, bounds: null, maximized: false, lang: 'en', updateSeen: '', shareMusic: true, shareGames: true, shareBefore: null, shareTold: false };
function load() {
  try {
    Object.assign(settings, JSON.parse(fs.readFileSync(SETTINGS(), 'utf8')));
  } catch (_) {
    /* the first time */
  }
}
function save() {
  try {
    fs.writeFileSync(SETTINGS(), JSON.stringify(settings, null, 2));
  } catch (_) {
    /* next time */
  }
}
const t = (key, ...args) => words.say(settings.lang, key, args);
const dark = () => nativeTheme.shouldUseDarkColors;
const surface = () => (dark() ? '#141218' : '#FEF7FF');

/** Budgie's own pages: the website, and nothing else */
function sameSite(url) {
  try {
    const u = new URL(url);
    return u.protocol === SITE_URL.protocol && (u.host === SITE_URL.host || u.host === 'www.' + SITE_URL.host);
  } catch (_) {
    return false;
  }
}
/** a link to anywhere else opens in the browser (web pages and e-mail only) */
function openOut(url) {
  try {
    if (['https:', 'http:', 'mailto:'].includes(new URL(url).protocol)) shell.openExternal(url);
  } catch (_) {
    /* not a link */
  }
}
function show() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}
const inFront = () => !!win && win.isVisible() && !win.isMinimized() && win.isFocused();

// ---- the window ------------------------------------------------------------------------------------------------

function onScreen(b) {
  return screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 80 && b.x + b.width > a.x + 80 && b.y >= a.y - 20 && b.y < a.y + a.height - 80);
}
let keepTimer = 0;
function keepBounds() {
  if (!win || win.isDestroyed()) return;
  settings.maximized = win.isMaximized();
  if (!settings.maximized && !win.isMinimized() && !win.isFullScreen()) settings.bounds = win.getBounds();
  save();
}

function createWindow() {
  const b = settings.bounds && onScreen(settings.bounds) ? settings.bounds : { width: 1200, height: 820 };
  win = new BrowserWindow({
    ...b,
    minWidth: 360,
    minHeight: 520,
    show: false,
    title: 'Budgie',
    icon: APP_ICON,
    backgroundColor: surface(),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Windows checks spelling with its own dictionaries; elsewhere they'd be downloaded from Google, so it's off
      spellcheck: WIN,
      // calls and the ringtone go on with the window hidden or behind others
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      partition: 'persist:budgie',
    },
  });
  win.once('ready-to-show', () => {
    if (startHidden) return;
    if (settings.maximized) win.maximize();
    win.show();
  });
  win.on('resize', () => (clearTimeout(keepTimer), (keepTimer = setTimeout(keepBounds, 600))));
  win.on('move', () => (clearTimeout(keepTimer), (keepTimer = setTimeout(keepBounds, 600))));
  // closing the window keeps Budgie running, so calls and messages still reach you
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    keepBounds();
    win.hide();
    if (!settings.told) {
      settings.told = true;
      save();
      notify({ title: t('stillTitle'), body: t('stillBody') });
    }
  });
  win.on('focus', () => {
    win.flashFrame(false);
    closeRing();
  });

  const wc = win.webContents;
  wc.setWindowOpenHandler(({ url }) => {
    openOut(url);
    return { action: 'deny' };
  });
  wc.on('will-navigate', (e, url) => {
    if (sameSite(url)) return;
    e.preventDefault();
    openOut(url);
  });
  // no internet: a page that says so, and tries again by itself
  wc.on('did-fail-load', (e, code, desc, url, main) => {
    if (main && code !== -3 && sameSite(url)) win.loadFile(path.join(PAGES, 'offline.html'), { query: { lang: settings.lang, site: SITE } });
  });
  // the little that watches the website's unread counts (see desktop.js)
  wc.on('dom-ready', () => {
    if (sameSite(wc.getURL())) wc.executeJavaScript(DESKTOP_JS).catch(() => {});
  });
  wc.on('render-process-gone', (e, d) => {
    pageLeft();
    if (d.reason !== 'clean-exit') setTimeout(() => !win.isDestroyed() && win.loadURL(SITE), 1500);
  });
  // a new page (a reload, or the offline page) hasn't asked to hear what's playing yet; a link inside Budgie is the
  // same page, still listening
  wc.on('did-start-navigation', (e, url, inPlace, mainFrame) => {
    const main = e && typeof e.isMainFrame === 'boolean' ? e.isMainFrame : mainFrame;
    const same = e && typeof e.isSameDocument === 'boolean' ? e.isSameDocument : inPlace;
    if (main && !same) pageLeft();
  });
  wc.on('context-menu', contextMenu);
  win.loadURL(SITE);
}

/** right-click: spelling, links, pictures, and cut, copy and paste */
function contextMenu(e, p) {
  const wc = win.webContents;
  const items = [];
  const gap = () => items.length && items[items.length - 1].type !== 'separator' && items.push({ type: 'separator' });
  if (p.misspelledWord) {
    for (const s of p.dictionarySuggestions.slice(0, 5)) items.push({ label: s, click: () => wc.replaceMisspelling(s) });
    if (!p.dictionarySuggestions.length) items.push({ label: t('noSuggestions'), enabled: false });
    items.push({ label: t('addWord'), click: () => wc.session.addWordToSpellCheckerDictionary(p.misspelledWord) });
    gap();
  }
  if (p.linkURL && /^https?:/i.test(p.linkURL)) {
    if (!sameSite(p.linkURL)) items.push({ label: t('openLink'), click: () => openOut(p.linkURL) });
    items.push({ label: t('copyLink'), click: () => clipboard.writeText(p.linkURL) });
    gap();
  }
  if (p.mediaType === 'image' && p.srcURL) {
    items.push({ label: t('copyImage'), click: () => wc.copyImageAt(p.x, p.y) }, { label: t('saveImage'), click: () => wc.downloadURL(p.srcURL) });
    gap();
  }
  if (p.isEditable) {
    items.push(
      { role: 'cut', label: t('cut'), enabled: p.editFlags.canCut },
      { role: 'copy', label: t('copy'), enabled: p.editFlags.canCopy },
      { role: 'paste', label: t('paste'), enabled: p.editFlags.canPaste },
      { role: 'selectAll', label: t('selectAll') }
    );
  } else if (p.selectionText && p.selectionText.trim()) items.push({ role: 'copy', label: t('copy') });
  while (items.length && items[items.length - 1].type === 'separator') items.pop();
  if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
}

// ---- the tray, and starting with the computer --------------------------------------------------------------------

function trayImage() {
  return nativeImage.createFromPath(path.join(ICONS, `${LINUX ? 'tray-linux' : 'tray'}${unread ? '-unread' : ''}.png`));
}
function trayMenu() {
  return Menu.buildFromTemplate([
    { label: t('open'), click: show },
    { type: 'separator' },
    { label: t('notifications'), type: 'checkbox', checked: settings.notifications, click: (i) => ((settings.notifications = i.checked), save()) },
    { label: t('startup'), type: 'checkbox', checked: startupOn(), visible: app.isPackaged, click: (i) => setStartup(i.checked) },
    { label: t('sharePlaying'), type: 'checkbox', checked: sharing(), click: (i) => shareFromTray(i.checked) },
    // what Budgie can see right now, so it's never a secret (only while it's shared)
    ...nowPlaying().map((label) => ({ label, enabled: false })),
    ...(update ? [{ type: 'separator' }, { label: t('update', update.version), click: () => shell.openExternal(update.url) }] : []),
    { type: 'separator' },
    { label: t('quit'), click: quit },
  ]);
}
function refreshTray() {
  if (!tray) return;
  tray.setImage(trayImage());
  tray.setToolTip(unread ? `Budgie · ${t('unread', unread)}` : 'Budgie');
  tray.setContextMenu(trayMenu());
}
function quit() {
  quitting = true;
  app.quit();
}

const autostartFile = () => path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'autostart', 'budgie-social.desktop');
function startupOn() {
  if (!app.isPackaged) return false;
  if (WIN) return app.getLoginItemSettings({ args: ['--hidden'] }).openAtLogin;
  if (LINUX) return fs.existsSync(autostartFile());
  return false;
}
/** Budgie starts (in the tray, without its window) when you sign in to the computer, so calls ring from the start */
function setStartup(on) {
  settings.startup = on;
  save();
  if (!app.isPackaged) return;
  try {
    if (WIN) app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] });
    else if (LINUX) {
      const file = autostartFile();
      if (!on) fs.rmSync(file, { force: true });
      else {
        // an AppImage runs from wherever it was put; the packages from where they installed it
        const exe = (process.env.APPIMAGE || process.execPath).replace(/(["`$\\])/g, '\\$1');
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, ['[Desktop Entry]', 'Type=Application', 'Name=Budgie', 'Comment=Calls and messages from Budgie', `Exec="${exe}" --hidden`, 'Icon=budgie-social', 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''].join('\n'));
      }
    }
  } catch (_) {
    /* it can be turned on again from the tray */
  }
  refreshTray();
}

// ---- notifications, and unread ------------------------------------------------------------------------------------

function notify({ title, body, href }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title: title || 'Budgie', body: body || '', icon: APP_ICON, silent: false });
  n.on('click', () => {
    show();
    if (href) win.webContents.send('go', href);
  });
  n.show();
  kept.push(n);
  if (kept.length > 20) kept.shift();
}

ipcMain.on('notify', (e, n) => {
  if (!win || e.sender !== win.webContents || !settings.notifications || inFront()) return;
  notify({ title: String(n.title || '').slice(0, 120), body: String(n.body || '').slice(0, 400), href: /^#\/[\w\-/%.~]*$/.test(n.href || '') ? n.href : '' });
});
ipcMain.on('badge', (e, count, png) => {
  if (!win || e.sender !== win.webContents) return;
  count = Math.max(0, Math.min(9999, Math.floor(Number(count) || 0)));
  if (count === unread) return;
  unread = count;
  if (WIN) win.setOverlayIcon(count && png ? nativeImage.createFromDataURL(png) : null, count ? t('unread', count) : '');
  if (LINUX) app.setBadgeCount(count);
  refreshTray();
});
ipcMain.on('lang', (e, code) => {
  if (!win || e.sender !== win.webContents || !words.has(code) || code === settings.lang) return;
  settings.lang = code;
  save();
  refreshTray();
  Menu.setApplicationMenu(appMenu());
});

// ---- what's playing and running: "Listening to" and "Playing" on Budgie (Budgie 1.4) ----------------------------

/*
 * activity.js looks (music from the computer's media controls, games from what's running) only while Budgie's page
 * has asked to hear it (BUDGIE_DESKTOP.onActivity, preload.js) and sharing is on, and the page alone decides what to
 * post: nothing, when nobody's signed in. A reload asks again; until it does (or for a page that never will, like the
 * offline page), looking stops after a short while, so a reload doesn't start it all over again.
 */
let listening = false;
let leftTimer = 0;
let shown = { music: null, game: null }; // what the page heard last, for the tray
const watcher = activity.create({
  onChange: (a, beat) => tell(a, beat),
  log: (...what) => console.error('Budgie:', ...what),
});
const shareOptions = () => ({ music: settings.shareMusic !== false, games: settings.shareGames !== false });
const sharing = () => settings.shareMusic !== false || settings.shareGames !== false;

/** the page hears what's playing and running (and the tray shows it, when it changed) */
function tell(a, beat) {
  if (!listening || !win || win.isDestroyed()) return;
  win.webContents.send('activity', a, !!beat);
  const before = JSON.stringify(nowPlaying());
  shown = a;
  if (JSON.stringify(nowPlaying()) !== before) refreshTray();
}
/** the tray's lines for what's shared right now: a song that's playing, a game that's running */
function nowPlaying() {
  if (!listening) return [];
  const out = [];
  const m = shown.music;
  if (m && m.playing && m.title) out.push(t('listeningTo', m.artist ? `${m.title} · ${m.artist}` : m.title));
  if (shown.game && shown.game.name) out.push(t('playingGame', shown.game.name));
  // a tray menu is no place for a whole paragraph
  return out.map((s) => (s.length > 64 ? s.slice(0, 63) + '…' : s));
}
/** looking, or not: while the page listens and something may be shared */
function watchActivity() {
  const o = shareOptions();
  if (listening && (o.music || o.games)) return watcher.start(o);
  const was = watcher.running;
  watcher.stop();
  // turned off while the page listens: it hears that nothing's playing, so it can say so to Budgie at once
  if (was && listening) tell({ music: null, game: null }, false);
  else shown = { music: null, game: null };
}
function pageLeft() {
  if (!listening) return;
  listening = false;
  shown = { music: null, game: null };
  refreshTray();
  clearTimeout(leftTimer);
  leftTimer = setTimeout(() => !listening && watcher.stop(), 15000);
}
/** what may be shared changed (from the page's Settings, or the tray): kept, and the page hears it */
function setShare(o) {
  settings.shareMusic = !!o.music;
  settings.shareGames = !!o.games;
  save();
  watchActivity();
  refreshTray();
  if (win && !win.isDestroyed()) win.webContents.send('activity-options', shareOptions());
}
/** the tray's switch: off turns both off; on brings back what was on before (both, the first time) */
function shareFromTray(on) {
  if (!on) {
    settings.shareBefore = shareOptions();
    return setShare({ music: false, games: false });
  }
  const b = settings.shareBefore;
  setShare(b && (b.music || b.games) ? b : { music: true, games: true });
}

/** a message from Budgie's own page in the main window (not from a page it went to by mistake) */
const fromSite = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents && sameSite(e.sender.getURL());

// the page's BUDGIE_DESKTOP.activityOptions(): asked once per page, synchronously, so it always has an answer
ipcMain.on('activity-options', (e) => {
  e.returnValue = fromSite(e) ? shareOptions() : null;
});
ipcMain.on('activity-set', (e, o) => {
  if (!fromSite(e) || !o || typeof o !== 'object') return;
  const now = shareOptions();
  setShare({ music: typeof o.music === 'boolean' ? o.music : now.music, games: typeof o.games === 'boolean' ? o.games : now.games });
});
// the first time something found is shown on Budgie (desktop.js says so, as it knows whether anyone's signed in):
// a word, once, about where to change it, since sharing is on unless turned off
ipcMain.on('activity-shared', (e) => {
  if (!fromSite(e) || settings.shareTold || !listening) return;
  const what = shown.music && shown.music.playing && shown.music.title ? shown.music.title : shown.game && shown.game.name;
  if (!what) return;
  settings.shareTold = true;
  save();
  notify({ title: t('sharingTitle'), body: t('sharingBody', what.length > 60 ? what.slice(0, 59) + '…' : what), href: '#/settings' });
});
ipcMain.on('activity-listen', (e, on) => {
  if (!fromSite(e)) return;
  if (!on) return pageLeft();
  clearTimeout(leftTimer);
  listening = true;
  watchActivity();
  // already looking (this page asked before, or the last one did a moment ago): it hears what's known at once
  if (watcher.ready()) tell(watcher.current(), false);
});

// ---- a call ringing while Budgie isn't in front: a window of its own, over everything ---------------------------

ipcMain.on('ring', (e, info) => {
  if (!win || e.sender !== win.webContents) return;
  const clip = (s, n) => String(s || '').slice(0, n);
  ringing = { who: clip(info.who, 120), what: clip(info.what, 160), answer: clip(info.answer, 40) || t('answer'), decline: clip(info.decline, 40) || t('decline'), video: !!info.video, img: /^https:\/\//.test(info.img || '') ? clip(info.img, 500) : '' };
  showRing();
});
ipcMain.on('unring', (e) => {
  if (!win || e.sender !== win.webContents) return;
  ringing = null;
  closeRing();
});
function showRing() {
  if (!ringing) return;
  // Budgie in front shows its own ringing screen
  if (inFront()) return;
  if (win.isVisible()) win.flashFrame(true);
  if (ringWin && !ringWin.isDestroyed()) return void ringWin.webContents.send('page-update', ringing);
  const { workArea: a } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const W = 400;
  const H = 128;
  ringWin = new BrowserWindow({
    x: Math.round(a.x + a.width - W - 16),
    y: Math.round(a.y + a.height - H - 16),
    width: W,
    height: H,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'Budgie',
    icon: APP_ICON,
    backgroundColor: dark() ? '#2B2930' : '#F3EDF7',
    webPreferences: { preload: path.join(__dirname, 'pages-preload.js'), contextIsolation: true, sandbox: true, partition: 'persist:budgie' },
  });
  ringWin.setAlwaysOnTop(true, 'screen-saver');
  const w = ringWin;
  // the id now: once the window has closed, its contents are gone
  const id = w.webContents.id;
  pages.set(id, {
    data: () => ({ ring: ringing, dark: dark() }),
    done: (act) => {
      closeRing();
      if (act === 'answer') show();
      if (win && !win.isDestroyed()) win.webContents.send('ring-act', act === 'answer' ? 'answer' : 'decline');
    },
  });
  w.on('closed', () => {
    pages.delete(id);
    if (ringWin === w) ringWin = null;
  });
  w.once('ready-to-show', () => w.showInactive());
  w.loadFile(path.join(PAGES, 'ring.html'));
}
function closeRing() {
  if (ringWin && !ringWin.isDestroyed()) ringWin.close();
  ringWin = null;
}

// ---- Budgie's own small pages (ringing, the screen picker): what they show, and what they answer ---------------

const pages = new Map(); // webContents id -> { data(), done(result) }
ipcMain.handle('page-data', (e) => {
  const p = pages.get(e.sender.id);
  return p ? Object.assign({ words: Object.fromEntries(words.keys.map((k) => [k, t(k, '{0}')])) }, p.data()) : null;
});
ipcMain.on('page-done', (e, result) => {
  const p = pages.get(e.sender.id);
  if (p) p.done(result);
});

// ---- sharing a screen: which one (or which window), and on Windows its sound ------------------------------------

function pick(sources) {
  return new Promise((resolve) => {
    const w = new BrowserWindow({
      parent: win,
      modal: true,
      width: 780,
      height: 580,
      minWidth: 520,
      minHeight: 420,
      show: false,
      title: t('share'),
      icon: APP_ICON,
      autoHideMenuBar: true,
      backgroundColor: surface(),
      webPreferences: { preload: path.join(__dirname, 'pages-preload.js'), contextIsolation: true, sandbox: true },
    });
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      resolve(r);
      if (!w.isDestroyed()) w.close();
    };
    const list = sources.map((s, i) => ({
      id: s.id,
      name: s.id.startsWith('screen:') ? (sources.filter((x) => x.id.startsWith('screen:')).length > 1 ? t('screenN', i + 1) : t('wholeScreen')) : s.name,
      screen: s.id.startsWith('screen:'),
      thumb: s.thumbnail && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '',
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : '',
    }));
    const id = w.webContents.id;
    pages.set(id, { data: () => ({ sources: list, sound: WIN, dark: dark() }), done: finish });
    w.on('closed', () => {
      pages.delete(id);
      finish(null);
    });
    w.once('ready-to-show', () => w.show());
    w.loadFile(path.join(PAGES, 'picker.html'));
  });
}

// ---- getting going -----------------------------------------------------------------------------------------------

function appMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Budgie',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomIn', accelerator: 'CommandOrControl+=', visible: false },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { label: t('quit'), accelerator: 'CommandOrControl+Q', click: quit },
      ],
    },
    { role: 'editMenu' },
  ]);
}

function newer(a, b) {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
/** a newer app out? Said once, in the tray from then on (the website itself is always the newest) */
async function checkUpdate() {
  try {
    const r = await net.fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { 'User-Agent': 'Budgie-desktop', Accept: 'application/vnd.github+json' } });
    if (!r.ok) return;
    const v = String((await r.json()).tag_name || '').replace(/^desktop-v/, '');
    if (!/^\d+\.\d+\.\d+$/.test(v) || !newer(v, app.getVersion())) return;
    update = { version: v, url: DOWNLOAD };
    refreshTray();
    if (settings.updateSeen !== v) {
      settings.updateSeen = v;
      save();
      const n = new Notification({ title: t('updateTitle'), body: t('updateBody', v), icon: APP_ICON });
      n.on('click', () => shell.openExternal(DOWNLOAD));
      n.show();
      kept.push(n);
    }
  } catch (_) {
    /* next time */
  }
}

app.on('second-instance', show);
app.on('before-quit', () => {
  quitting = true;
  watcher.stop();
  keepBounds();
});
// the window closing never quits Budgie (only Quit does)
app.on('window-all-closed', () => {});
// nothing but Budgie's own windows: no webviews, no other windows opened by a page
app.on('web-contents-created', (e, contents) => {
  contents.on('will-attach-webview', (ev) => ev.preventDefault());
});

app.whenReady().then(() => {
  load();
  const ses = session.fromPartition('persist:budgie');
  // what the website may use: the microphone and camera, sharing a screen, notifications, full screen, copying
  const ALLOW = new Set(['media', 'display-capture', 'notifications', 'fullscreen', 'clipboard-sanitized-write', 'speaker-selection']);
  ses.setPermissionRequestHandler((wc, permission, callback, details) => callback(ALLOW.has(permission) && sameSite((details && details.requestingUrl) || wc.getURL())));
  ses.setPermissionCheckHandler((wc, permission, origin) => ALLOW.has(permission) && sameSite(origin));
  // no ads in the app (the website's are for the website)
  ses.webRequest.onBeforeRequest({ urls: ['*://*.googlesyndication.com/*', '*://*.doubleclick.net/*', '*://adservice.google.com/*'] }, (d, cb) => cb({ cancel: true }));
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 400, height: 225 }, fetchWindowIcons: true });
      // Budgie's own windows aren't offered (one would show itself forever)
      const own = new Set(BrowserWindow.getAllWindows().map((w) => w.getMediaSourceId()));
      const list = sources.filter((s) => !own.has(s.id));
      if (!list.length) return callback(null);
      // on Linux with Wayland the system has already asked which: its one answer is the one
      const choice = list.length === 1 && !WIN ? { id: list[0].id, sound: false } : await pick(list);
      const source = choice && list.find((s) => s.id === choice.id);
      if (!source) return callback(null);
      callback(Object.assign({ video: { id: source.id, name: source.name } }, WIN && choice.sound ? { audio: 'loopback' } : {}));
    } catch (_) {
      callback(null);
    }
  });

  Menu.setApplicationMenu(appMenu());
  createWindow();
  tray = new Tray(trayImage());
  tray.on('click', show);
  refreshTray();
  // on the first run Budgie starts with the computer, so calls ring from the start; the tray turns it off
  if (settings.startup === null) setStartup(true);
  else if (settings.startup) setStartup(true); // where the app is may have changed (an AppImage moved)
  setTimeout(checkUpdate, 30000);
  setInterval(checkUpdate, 12 * 60 * 60 * 1000);
  nativeTheme.on('updated', () => win && !win.isDestroyed() && win.setBackgroundColor(surface()));
});
