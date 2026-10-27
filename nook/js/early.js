// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Runs first, in <head>: hides the app until signing in decides what to show, and refuses to
 * run inside another site's frame, where someone could trick you into tapping things.
 */
document.documentElement.classList.add('gated');
if (window.top !== window.self) document.documentElement.classList.add('framed');
