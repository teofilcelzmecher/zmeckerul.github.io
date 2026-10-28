# Budgie (formerly Nook): where things stand

Read this first when picking Budgie up again (a new chat, or after a long break).

## Where everything lives

| What | Where |
|---|---|
| Source of truth | `teofilcelzmecher/zmeckerul.github.io`, branch `claude/community-social-media-app-m1k3uc`, folders `nook/` (the app, server, tools) and `m3/` (design system). PR #1 is open; don't merge it. |
| The owner's personal site | The root `index.html` of that same repository's `main` branch. **Never touch it.** |
| The live site | `teofilcelzmecher/nook-early-access-website` (`main`, GitHub Pages from the root) → https://budgiesocial.com (the domain is registered at Cloudflare; DNS points at GitHub Pages, and the `CNAME` file in that repository comes from its Pages setting, so the build leaves it alone). The old https://teofilcelzmecher.github.io/nook-early-access-website/ redirects there. |
| The server | The owner's laptop (Arch Linux, 4 GB, terminal only, a normal user with sudo): code cloned to `/opt/nook`, data in `/var/lib/nook`, service `nook.service` on 127.0.0.1:8787, made public with Tailscale Funnel at an `https://….ts.net` address. |

## Versions

- **Name:** the app is **Budgie** and its communities are **nests** (still `n/…`). It was called Nook until 0.2.1. Only what people see was renamed: the code, CSS classes, storage keys, the folder `nook/`, the server's `nook` command, service, user and paths, and the live repository's name all still say nook. The starter nests `nookhq` and `asknook` became `budgiehq` and `askbudgie` (the server moves their posts once; old links redirect).
- **Live:** 0.3.0 with the server at https://nook.tailfb59a9.ts.net (the laptop, through Tailscale Funnel), set in `nook/js/config.js`.
  It has accounts, friends, messages, live updates, reports and a Moderation page. Sign-up is open (no code); `nook signups invite` brings codes back.
- **Ads:** Google AdSense in-feed ads between posts (home, popular, nest feeds only), in `js/ads.js`, off until `ads.client`, `ads.slot` and `ads.layoutKey` are filled in `js/config.js`. The build then writes `ads.txt`. Non-personalised by default; consent comes from Google's own message (AdSense → Privacy & messaging). Auto ads must stay off in AdSense, so there are no banners.
- **Earlier:** 0.1.2 was local-only, behind a client-side code gate. It's gone, and its eight codes don't work on the server.

## Updating the live site

1. Change the code in `nook/` and `m3/` on the source branch. Test it: `node nook/tools/api-test.js` and `node nook/tools/moderation-test.js`.
2. Build into a clone of the live repository: `python3 nook/tools/build-site.py <source repo root> <nook-early-access-website clone>`. Commit and push both.
3. Server changes reach the laptop when the owner runs `sudo nook update`.

## How the code is organised

- `nook/index.html` runs two small scripts written into the page (their sha256 fingerprints are in its Content-Security-Policy, with `'strict-dynamic'`, so only they and what they load can run; `python3 nook/tools/csp.py nook/index.html` refreshes them, and the build does it too). The second loads (m3) → `config.js`, `api.js`, `account.js`. Someone not signed in sees the welcome page (`#landing`, plain HTML in `index.html`, so search engines and AdSense can read it; `account.js` wires its buttons and the nest colour demo), and `og.png` is the picture link previews show. `account.js` signs in, fetches `/api/bootstrap` into `window.NOOK_BOOT`, then loads `data, store, ui, moderation, fx, views, app`.
- `store.js` holds the server snapshot and polls `/api/updates?rev&note&msg` every 15 s. Writes are optimistic and undone if the server refuses.
- `server/server.js` is plain Node ≥ 22.5 with `node:sqlite` and no npm packages. `db.js` holds the schema, with revision stamps for deltas. `cli.js` has the admin commands; `install.sh` sets up the systemd service, backups and lid handling.
- `js/moderation.js` holds rule-based moderation (no AI). The browser and the server both load the same file.
- `promo/ad.html` is a 19-second vertical video ad cut to a 120 BPM beat, in the app's real dark look (open it in a browser to watch it, silently). `node nook/promo/render.js` renders it to `nook/promo/budgie-ad.mp4` (1080×1920, 60 fps), with music it makes itself from sine waves and noise, so there's no music licence. `--stills 1,5,9` saves single frames for quick checks, and `--audio x.wav` saves just the music. Nothing in `promo/` goes to the live site.

## Rules to keep

- **Commits:** author `teofilcelzmecher <217388809+teofilcelzmecher@users.noreply.github.com>`, no AI attribution lines. Use the GitHub handle, not a real name, in code and copyright lines.
- **Design system (`m3/`):** GPL-3.0-or-later, ported from Swiftify with its authors' permission. Each `m3` file keeps "Copyright (C) 2026 shredos67, thefoxyydev and the Swiftify contributors" at the top, plus the credit and the link to https://github.com/swiftify-org/swiftify. Keep it separate from Budgie's own code, which is all rights reserved (`nook/LICENSE`).
- **Nothing from other companies:** fonts and the colour library are self-hosted (OFL and Apache license texts ship with them). Keep the Content Security Policy in the HTML pages.
- **No fake content:** no made-up people, posts or numbers.
- **Credits:** Teofil Ionescu-Mihai, creator and main developer. Alex Vochin, Petcu David Andrei and Crisu Radu, testers and supporters.

## Testing

`node nook/tools/api-test.js` runs about 70 checks against a temporary server; `node nook/tools/moderation-test.js` checks the moderation rules on 112 English and Romanian sentences. Browser tests were written with Playwright during development: sign-up, posting, comments, friends, chat, moderation, every button on every page, CSP violations and phone layouts. Re-create them as needed.
