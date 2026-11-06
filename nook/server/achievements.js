// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/* Achievements with tiers, the visit streak and its rewards (Budgie 1.4). To be written; what the others use: */
'use strict';

function install() {
  return {
    /** the tier someone has reached (0 none, 1–5 for I–V) in an achievement (a family id from js/achievements-data.js, or 'custom:<id>') */
    tierOf: () => 0,
    /** their visit streak */
    streakOf: () => ({ count: 0, best: 0, freezes: 0 }),
    /** looks again at what they've reached (after something changes) */
    check: () => {},
  };
}

module.exports = { install };
