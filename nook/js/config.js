// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * Where Nook's server lives. Set `api` to the server's HTTPS address (for example
 * https://your-laptop.your-tailnet.ts.net) with no trailing slash.
 */
window.NOOK_CONFIG = {
  api: 'https://nook.tailfb59a9.ts.net',

  // Google AdSense, shown only between posts in feeds. Leave client empty and there are no ads and
  // no Google code at all. From AdSense: your publisher id, and an "In-feed" ad unit's slot and layout key.
  ads: {
    client: '', // like 'ca-pub-1234567890123456'
    slot: '', // like '1234567890'
    layoutKey: '', // like '-fb+5w+4e-db+86'
    personalized: false, // non-personalised ads for everyone, which suits an app teenagers can join
    first: 4, // the first ad comes after this many posts
    every: 8, // then one after every 8 more
  },
};
