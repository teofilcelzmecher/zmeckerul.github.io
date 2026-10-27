# Nook

A community app in the spirit of forum sites, built on the Material 3 Expressive design system in `../m3/`.
Plain HTML, CSS and JS: no build step, no framework, no server. Open `index.html` through any static
host (GitHub Pages serves it at `/nook/`).

Nothing in Nook is made up: there are no fake people, posts, comments, replies or numbers. It starts
with a set of empty nooks, and every post, comment and vote is one a person actually made.

## What's in it

- **Nooks** (communities) to join, browse and create, each with its own colour, shape and symbol.
  Visiting one re-themes the whole app from its colour; in mixed feeds every card is tinted by its nook.
  The brand mark and the favicon morph into the nook's shape.
- **Posts**: text, image, link and poll, with flairs, spoiler blur, markdown-lite and autosaved drafts.
- **Votes and Sparks**: up/down votes plus five shaped reactions (Love, Insightful, Funny, Fire, Wow).
- **Threaded comments** with collapsing, replies, editing, deleting and Best/Top/New sorting.
- **Catch me up**: long threads get a highlights card with the top comments and the poster's replies.
- **Collections**: save posts into named shelves, like playlists for posts.
- **Pulse**: a wavy line shows how busy each nook really is, from the posts and comments of the last week.
- **Streaks and badges** for coming back and taking part.
- **Calm mode** hides every score and count; a **break reminder** nudges you after a set time.
- **Inbox** for badges and, once Nook has people beyond one browser, replies.
- **Keyboard shortcuts** (`?` lists them), light/dark/system mode, any seed colour, compact cards.
- Responsive: a drawer on desktop, a navigation rail on tablets, a bottom bar and a full-screen menu on phones.
- **Motion that answers you**: pages slide the way you're going, a tapped post grows into the full
  post and shrinks back, a nook's icon flies into its banner, light/dark spreads out in a circle,
  saved posts fly to Saved, sparks fly to their chip, votes pop, polls count up, threads fold shut,
  cards morph between compact and full, confetti for new posts, nooks and badges. On phones: pull to
  refresh, swipeable bottom sheets, a bottom bar that steps aside as you read, and haptic taps.
  All of it holds still under reduced motion.

Everything you do is saved in the browser's localStorage, so for now nobody else can see it.
Settings → Your data exports or resets it.

## Files

| File | What it is |
|---|---|
| `index.html` | The shell: top bar, drawer, bottom bar, and the scripts |
| `app.css` | Layout and Nook's own components, all on `--m3-*` colour roles |
| `js/data.js` | The starter nooks: names, colours, shapes, rules and flairs |
| `js/store.js` | State, persistence, ranking, badges and every mutation |
| `js/ui.js` | Markdown-lite, formatters, avatars, the theme engine, sheets |
| `js/fx.js` | Motion: view transitions, springs, flights, confetti, haptics |
| `js/views.js` | One function per page, returning its markup and wiring |
| `js/app.js` | Router, actions, sheets, the composer, shortcuts, the break reminder |
