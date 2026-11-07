# Budgie

A community app in the spirit of forum sites, built on the Material 3 Expressive design system in `../m3/`.
That design system is ported from Swiftify with its authors' permission and is GPL-3.0-or-later
(`../m3/LICENSE`). Budgie's own code here is kept separate from it.
Plain HTML, CSS and JS with no build step and no framework, served from any static host, plus a small
Node server (`server/`, no npm packages) that keeps accounts, posts and messages in SQLite. See
`server/README.md` to run it. Point the app at it in `js/config.js`.

Nothing in Budgie is made up: there are no fake people, posts, comments, replies or numbers. It starts
with a set of empty nests, and every post, comment and vote is one a person actually made.

## What's in it

- **Nests** (communities) to join, browse and create, each with its own colour, shape and symbol.
  Visiting one re-themes the whole app from its colour; in mixed feeds every card is tinted by its nest.
  The brand mark and the favicon morph into the nest's shape.
- **Posts**: text, picture, GIF, short video (up to a minute), link and poll, with flairs, spoiler blur,
  markdown-lite and autosaved drafts.
- **Votes and Sparks**: up/down votes plus five shaped reactions (Love, Insightful, Funny, Fire, Wow).
- **Threaded comments** with collapsing, replies, editing, deleting and Best/Top/New sorting.
- **Catch me up**: long threads get a highlights card with the top comments and the poster's replies.
- **Collections**: save posts into named shelves, like playlists for posts.
- **Pulse**: a wavy line shows how busy each nest really is, from the posts and comments of the last week.
- **Streaks and badges** for coming back and taking part.
- **Calm mode** hides every score, count and streak, shows new things as a dot, and skips the confetti;
  a **break reminder** nudges you after a set time.
- **Automatic moderation on Budgie's own server**: word lists and patterns (that see through l33t,
  s.p.a.c.i.n.g and stretched letters) block slurs, threats, scam links and spam, warn about personal
  information, and meet signs of distress with where to find help; a small text model reads posts,
  comments, usernames, bios and messages, and a small picture model checks pictures, GIFs and frames
  from videos. Nothing is sent to another company. Swearing is allowed but dotted out (f•••) for anyone
  with the filter on. Every decision says which rule it applied, and doubtful things go to a person.
- **Profiles**: a letter, an icon, a photo or a GIF (you choose the part to keep), a banner, a bio,
  pronouns, up to four pride flags, interests, a name font, colours and shapes.
- **Accounts**: sign up with a username and a password (or, if the owner switches it on, a single-use
  6-digit invite code too); a recovery code (shown once) resets a forgotten password. Export your data
  or delete your account in Settings.
- **Friends, messages and groups**: friend requests, private chats (with pictures, GIFs, emoji and a
  colour you pick for each chat) and group chats of up to 32 people, all moderated by the same rules.
  Blocking ends a friendship and hides someone everywhere.
- **Calls**: voice and video calls with friends and groups (up to six people), screen sharing on
  computers, a self-view you can drag on phones, and an optional Cloudflare relay that pauses for the
  rest of the month before its free allowance runs out.
- **Six languages**: English, Romanian, Spanish, French, German and Italian, picked from the browser
  or in Settings. What people write is never translated.
- **Live**: the app asks the server what changed every 15 seconds; new comments, votes, messages and
  notifications arrive without a reload.
- **Moderators**: reports go to a Moderation page for admins, who can remove content (its author is told
  why), remove just a profile picture, banner, bio or pronouns, or ban accounts. Each nest can have its
  own team, rules, bans and pinned posts.
- **Ads, only between posts**: Google AdSense in-feed ads in the home, popular and nest feeds, never
  banners and never in chats. Off until the ids are filled in `js/config.js`; non-personalised by default,
  with Google's own consent message where the law asks for one.
- **Privacy first**: no cookies or trackers of Budgie's own, and nothing else loaded from other companies
  (fonts and the colour library are served from `../m3/`). Terms of Use and a Privacy Policy cover the EU (GDPR,
  ePrivacy, DSA) and the US (COPPA, CCPA).
- **Inbox** for replies, friend requests, moderation notices and badges.
- **Keyboard shortcuts** (`?` lists them), light/dark/system mode, any seed colour, compact cards.
- Responsive: a drawer on desktop, a navigation rail on tablets, a bottom bar and a full-screen menu on phones.
- **Motion that answers you**: pages slide the way you're going, a tapped post grows into the full
  post and shrinks back, a nest's icon flies into its banner, light/dark spreads out in a circle,
  saved posts fly to Saved, sparks fly to their chip, votes pop, polls count up, threads fold shut,
  cards morph between compact and full, confetti for new posts, nests and badges. On phones: pull to
  refresh, swipeable bottom sheets, a bottom bar that steps aside as you read, and haptic taps.
  All of it holds still under reduced motion.

Your account and everything you post live on Budgie's server; the browser keeps only the sign-in key and
a few choices (language, recent emoji, camera, where your picture sits in a call).
Settings → Account exports your data or deletes your account.

## Files

| File | What it is |
|---|---|
| `index.html` | The shell: top bar, drawer, bottom bar, and the scripts |
| `app.css` | Layout and Budgie's own components, all on `--m3-*` colour roles |
| `js/data.js` | The starter nests: names, colours, shapes, rules and flairs |
| `js/config.js` | Where the server is |
| `js/api.js` | Requests to the server and the sign-in key |
| `js/account.js` | Sign in, create an account, recovery; loads the rest once signed in |
| `server/` | The server (`server.js`), its database (`db.js`), admin commands (`cli.js`) and installer |
| `js/moderation.js` | The moderation rules: folding, word lists, patterns, spam and flood checks |
| `terms.html`, `privacy.html`, `legal.css` | Terms of Use and Privacy Policy, readable without a code |
| `js/store.js` | State, persistence, ranking, badges and every mutation |
| `js/ui.js` | Markdown-lite, formatters, avatars, the theme engine, sheets |
| `js/fx.js` | Motion: view transitions, springs, flights, confetti, haptics |
| `js/views.js` | One function per page, returning its markup and wiring |
| `js/app.js` | Router, actions, sheets, the composer, shortcuts, the break reminder |
| `js/calls.js` | Voice and video calls (WebRTC between the devices) |
| `js/pickers.js` | The emoji and GIF pickers and the picture viewer |
| `js/i18n.js`, `js/lang/` | Budgie in other languages: the translator, and one file per language |
| `tools/i18n/` | Where the language files come from: `extract.js` finds the app's words, `tr/` holds the translations, `build-lang.js` writes `js/lang/` |
