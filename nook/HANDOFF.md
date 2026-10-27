# Nook: where things stand

Read this first when picking Nook up again (a new chat, or after a long break).

## Where everything lives

| What | Where |
|---|---|
| Source of truth | `teofilcelzmecher/zmeckerul.github.io`, branch `claude/community-social-media-app-m1k3uc`, folders `nook/` (the app, server, tools) and `m3/` (design system). PR #1 is open; don't merge it. |
| The owner's personal site | The root `index.html` of that same repository's `main` branch. **Never touch it.** |
| The live early-access site | `teofilcelzmecher/nook-early-access-website` (`main`, GitHub Pages from the root) → https://teofilcelzmecher.github.io/nook-early-access-website/ |
| The server | The owner's laptop (Arch Linux, 4 GB, terminal only, logged in as root): code cloned to `/opt/nook`, data in `/var/lib/nook`, service `nook.service` on 127.0.0.1:8787, made public with Tailscale Funnel at an `https://….ts.net` address. |

## Versions

- **Live now:** 0.1.2, local-only (everything in each browser), behind the old client-side invite gate (`js/gate.js`, only on the live site).
- **Ready, not live yet:** 0.2.0 with the server: accounts, friends, messages, live updates, reports and a Moderation page. The live repository already holds `server/`, so the laptop can install it.

## Switching the live site to 0.2.0 (once the owner sends the `.ts.net` address)

1. Set `api: 'https://….ts.net'` in `nook/js/config.js`. No trailing slash.
2. Check `https://….ts.net/api/health` answers `{"ok":true,...}`.
3. Build into a clone of the live repository: `python3 nook/tools/build-site.py <source repo root> <nook-early-access-website clone>`.
   This replaces the app files; `js/gate.js` stays behind unused, so delete it.
4. Commit and push both repositories. Then the owner runs `nook invite 1 "for me"`, signs up, runs `nook admin NAME`, and makes friends new codes with `nook invite 8 "friends"`.
   The eight first-test codes don't work on the server: their hashes were public.

## How the code is organised

- `nook/index.html` loads `early.js` → (m3) → `config.js`, `api.js`, `account.js`. `account.js` signs in, fetches `/api/bootstrap` into `window.NOOK_BOOT`, then loads `data, store, ui, moderation, fx, views, app`.
- `store.js` holds the server snapshot and polls `/api/updates?rev&note&msg` every 15 s. Writes are optimistic and undone if the server refuses.
- `server/server.js` is plain Node ≥ 22.5 with `node:sqlite` and no npm packages. `db.js` holds the schema, with revision stamps for deltas. `cli.js` has the admin commands; `install.sh` sets up the systemd service, backups and lid handling.
- `js/moderation.js` holds rule-based moderation (no AI). The browser and the server both load the same file.

## Rules to keep

- **Commits:** author `teofilcelzmecher <217388809+teofilcelzmecher@users.noreply.github.com>`, no AI attribution lines. Use the GitHub handle, not a real name, in code and copyright lines.
- **Design system (`m3/`):** GPL-3.0-or-later, ported from Swiftify with its authors' permission. Each `m3` file keeps "Copyright (C) 2026 shredos67, thefoxyydev and the Swiftify contributors" at the top, plus the credit and the link to https://github.com/swiftify-org/swiftify. Keep it separate from Nook's own code, which is all rights reserved (`nook/LICENSE`).
- **Nothing from other companies:** fonts and the colour library are self-hosted (OFL and Apache license texts ship with them). Keep the Content Security Policy in the HTML pages.
- **No fake content:** no made-up people, posts or numbers.
- **Credits:** Teofil Ionescu-Mihai, creator and main developer. Alex Vochin, Petcu David Andrei, Mercuci Camelia and Crisu Radu, testers and supporters.

## Testing

`node nook/tools/api-test.js` runs about 70 checks against a temporary server. Browser tests were written with Playwright during development: sign-up, posting, comments, friends, chat, moderation, every button on every page, CSP violations and phone layouts. Re-create them as needed.
