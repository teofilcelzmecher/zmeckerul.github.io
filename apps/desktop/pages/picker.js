// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// Sharing a screen: a screen or a window, each with a look at what's on it, and on Windows the computer's sound too.
'use strict';
const $ = (id) => document.getElementById(id);
let sources = [];
let picked = null;
let tab = 'screens';

function draw() {
  const grid = $('grid');
  grid.textContent = '';
  for (const s of sources.filter((x) => x.screen === (tab === 'screens'))) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card';
    card.setAttribute('role', 'option');
    card.setAttribute('aria-pressed', String(s.id === picked));
    const shot = document.createElement('div');
    shot.className = 'shot';
    if (s.thumb) {
      const img = document.createElement('img');
      img.src = s.thumb;
      img.alt = '';
      shot.appendChild(img);
    }
    const name = document.createElement('div');
    name.className = 'name';
    if (s.icon) {
      const icon = document.createElement('img');
      icon.src = s.icon;
      icon.alt = '';
      name.appendChild(icon);
    }
    const label = document.createElement('span');
    label.textContent = s.name;
    name.appendChild(label);
    card.append(shot, name);
    card.addEventListener('click', () => {
      picked = s.id;
      $('go').disabled = false;
      draw();
    });
    card.addEventListener('dblclick', () => share(s.id));
    grid.appendChild(card);
  }
}
function setTab(which) {
  tab = which;
  $('tab-screens').setAttribute('aria-selected', String(which === 'screens'));
  $('tab-windows').setAttribute('aria-selected', String(which === 'windows'));
  draw();
}
function share(id = picked) {
  if (id) budgie.done({ id, sound: $('sound').checked });
}

budgie.data().then((d) => {
  if (!d) return;
  const w = d.words;
  document.title = w.share;
  $('title').textContent = w.share;
  $('tab-screens').textContent = w.screens;
  $('tab-windows').textContent = w.windows;
  $('cancel').textContent = w.cancel;
  $('go').textContent = w.go;
  $('sound-label').textContent = w.sound;
  $('sound-note').textContent = w.soundNote;
  $('sound-row').hidden = !d.sound;
  sources = d.sources || [];
  // one screen: it's picked already
  const screens = sources.filter((s) => s.screen);
  if (screens.length === 1) {
    picked = screens[0].id;
    $('go').disabled = false;
  }
  if (!screens.length) setTab('windows');
  else draw();
  $('tab-windows').hidden = !sources.some((s) => !s.screen);
});
$('tab-screens').addEventListener('click', () => setTab('screens'));
$('tab-windows').addEventListener('click', () => setTab('windows'));
$('cancel').addEventListener('click', () => budgie.done(null));
$('go').addEventListener('click', () => share());
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') budgie.done(null);
  else if (e.key === 'Enter' && picked && !e.target.closest('.card, .tab')) share();
});
