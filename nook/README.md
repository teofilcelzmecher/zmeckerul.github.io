# Nook

A community app in the spirit of forum sites, built on the Material 3 Expressive design system in `../m3/`.
Plain HTML, CSS and JS: no build step, no framework, no server. Open `index.html` through any static
host (GitHub Pages serves it at `/nook/`).

## What's in it

- **Nooks** (communities) to join, browse and create, each with its own colour, shape and symbol.
  Visiting one re-themes the whole app from its colour; in mixed feeds every card is tinted by its nook.
  The brand mark and the favicon morph into the nook's shape.
- **Posts**: text, image, link and poll, with flairs, spoiler blur, markdown-lite and autosaved drafts.
- **Votes and Sparks**: up/down votes plus five shaped reactions (Love, Insightful, Funny, Fire, Wow).
- **Threaded comments** with collapsing, replies, editing, deleting and Best/Top/New sorting.
- **Catch me up**: long threads get a highlights card with the top comments and the poster's replies.
- **Collections**: save posts into named shelves, like playlists for posts.
- **Events and pulse**: nooks host events you can RSVP to, and a wavy line shows how busy each one is.
- **Streaks and badges** for coming back and taking part.
- **Calm mode** hides every score and count; a **break reminder** nudges you after a set time.
- **Inbox** with simulated replies to what you post, so the demo feels lived in.
- **Keyboard shortcuts** (`?` lists them), light/dark/system mode, any seed colour, compact cards.
- Responsive: a drawer on desktop, a navigation rail on tablets, a bottom bar on phones.

Everything you do is saved in the browser's localStorage. Settings → Your data exports or resets it.

## Files

| File | What it is |
|---|---|
| `index.html` | The shell: top bar, drawer, bottom bar, and the scripts |
| `app.css` | Layout and Nook's own components, all on `--m3-*` colour roles |
| `js/data.js` | Seed content: nooks, people, posts, comments, events |
| `js/store.js` | State, persistence, ranking, badges and every mutation |
| `js/ui.js` | Markdown-lite, formatters, avatars, the theme engine, sheets |
| `js/views.js` | One function per page, returning its markup and wiring |
| `js/app.js` | Router, actions, sheets, the composer, shortcuts, simulations |
