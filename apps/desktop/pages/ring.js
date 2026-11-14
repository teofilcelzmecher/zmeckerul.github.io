// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// The window that rings: who's calling, and Answer or Decline (the website's own buttons are pressed for you).
'use strict';
const $ = (id) => document.getElementById(id);
function paint(r) {
  if (!r) return;
  $('who').textContent = r.who || 'Budgie';
  $('what').textContent = r.what || '';
  $('answer').setAttribute('aria-label', r.answer);
  $('answer').title = r.answer;
  $('decline').setAttribute('aria-label', r.decline);
  $('decline').title = r.decline;
  // their picture, when they have one; Budgie's logo otherwise
  if (r.img) {
    $('img').src = r.img;
    $('img').hidden = false;
    $('logo').hidden = true;
  }
}
budgie.data().then((d) => d && paint(d.ring));
budgie.on(paint);
$('answer').addEventListener('click', () => budgie.done('answer'));
$('decline').addEventListener('click', () => budgie.done('decline'));
addEventListener('keydown', (e) => {
  if (e.key === 'Enter') budgie.done('answer');
  else if (e.key === 'Escape') budgie.done('decline');
});
