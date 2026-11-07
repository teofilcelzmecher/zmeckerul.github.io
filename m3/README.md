# Material 3 Expressive (from Swiftify)

Swiftify's Material 3 Expressive design language, ported from Qt Quick to plain HTML, CSS and JS.
Open `index.html` to see everything. No build step and no framework.

| File | What it is |
|---|---|
| `m3.css` | Design tokens (colour roles, rounding, type, motion curves, springs) and component styles |
| `m3.js` | Runtime: colour schemes, springs, shape morphing, and the components |
| `m3-shapes.js` | Material's 35 shapes plus Swiftify's 2, with morphing (rounded-polygon-qmljs, Apache 2.0) |
| `index.html` | Showcase of every component |

## Use it

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Google+Sans+Flex:opsz,wdth,wght,GRAD,ROND@6..144,25..151,1..1000,0..100,0..100&display=swap">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=block">
<link rel="stylesheet" href="m3.css">

<body class="m3-base">
  <button class="m3-btn filled"><span class="m3-icon">play_arrow</span>Play</button>

  <script src="m3-shapes.js"></script>
  <script src="m3.js"></script>
</body>
```

## Colour

The default scheme is Material's TonalSpot from `#6750a4`. It follows the system's light or dark mode,
or you can force one with `<html data-m3-theme="light|dark">`. To theme from any colour:

```js
M3.color.setTheme({ seed: '#1db954', dark: true, variant: 'tonalSpot' }); // also content, expressive, vibrant, neutral, …
M3.color.seedFromImage(imgOrDataUrl).then((seed) => M3.color.setTheme({ seed, variant: 'content' })); // album-art theming
M3.color.setTheme({ seed: '#e8467c', target: someElement }); // scope a scheme to one part of the page
```

Every colour is a CSS variable: the 49 Material roles (`--m3-primary`, `--m3-surface-container-high`, …)
plus end4's derived state colours (`--m3-layer1-hover`, `--m3-primary-active`, `--m3-tooltip`, …).
Runtime theming loads Google's `material-color-utilities` from `vendor/`, beside `m3.js`. If it fails to load, the built-in scheme still works.

## Components

| Markup / API | Notes |
|---|---|
| `.m3-btn` + `filled` `tonal` `outlined` `text` `elevated` | Optional `.icon-only`, `.small`, `.wavy`; `aria-busy="true"` with an `<m3-loading class="m3-btn-spinner">` inside |
| `.m3-icon-btn` (+ `filled` `tonal` `outlined`) | `data-toggle` + `aria-pressed` makes it a toggle |
| `.m3-toolbar-btn` | `data-effect="pop|nudge-left|nudge-right|spin"`, `data-shape="cookie9"`; `data-shape-still` stops the shape turning |
| `data-effect`, `data-hover-shape`, `data-toggled-shape` on `.m3-icon-btn` | Transport-style effects and shape layers |
| `<input type="checkbox" class="m3-switch">` | |
| `<m3-slider value min max step orientation value-tip show-stop>` | `input` and `change` events; `el.format = (value, position) => text` for the tip |
| `.m3-segmented` > `.m3-segment[role=radio]` | `change` event with `{ index, value }`; arrow keys move between segments; `el.m3Select(i)` |
| `.m3-field`, `.m3-search` | Outlined text field; pill search with a clear button |
| `data-tooltip="…"` | On any element |
| `M3.menu(anchor, items)` | Items: `{ label, symbol, destructive, checked, onSelect }` or `{ separator: true }`; the anchor can also be a mouse event or `{ x, y }` |
| `M3.snackbar(text, { action, timeout })`, `M3.toast(text)` | Both return `{ close() }`; a new one replaces the one showing |
| `M3.dialog({ headline, symbol, body, actions })` | Returns a promise of the chosen action's `value` (or its label), `null` on Esc |
| `<m3-shape shape morph-to morph angle>` | Any of the 37 shapes; `el.transitionTo('heart', { spring: true })` |
| `<m3-shape-icon shape hover-shape symbol>` | Symbol on a shape that turns or morphs on hover |
| `<m3-loading [contained]>` | Expressive loading indicator that morphs through shapes |
| `<m3-squiggle progress>`, `<m3-wavy-progress value playing interactive>` | Wavy ring and wavy seek bar |
| `<m3-play-button playing>` | softCookie ↔ cookie9 morph on a spring, with a burst of cookies |
| `<m3-wavy-line>` | The squiggle in section headers and menu separators |
| `.m3-media-card[data-title][data-art]` | Leans toward the pointer; wavy edge on hover |
| `.m3-empty[data-symbol][data-title]` | Empty state with a badge that springs in |
| `M3.burst(el, 'play'|'hearts'|'pin'|'playlist')` or `data-burst="…"` | Burst of shapes |
| `M3.stickers(el, { key, count, shapes })` or `data-m3-stickers="key"` (+ `data-count`, `data-shapes="heart gem"`) | Faint seeded shapes behind a surface; `shapes` limits which ones |
| `M3.rollText(el, text)` | Old text slides out, new text slides in |

### Motion

`M3.motion` has end4's curves (`expressiveFastSpatial`, `emphasized`, …), the presets (`elementMove`
500ms, `elementMoveFast` 200ms, …) and `Spring`, which reproduces Qt's SpringAnimation. Swiftify's
Bounce spring is `spring 7 / damping 0.24`. In CSS, use `var(--m3-motion-element-move)`,
`var(--m3-motion-bounce)` and the other presets in `transition` shorthands.

Anything that loops (drifting shapes, wavy lines, the spin) holds still under `prefers-reduced-motion`
or `<html data-m3-reduce-motion>`. Responses to clicks and hovers still animate.

## License

The design system (`m3.css`, `m3.js`, `m3-shapes.js` and `index.html`) is free software under the
GNU General Public License, version 3 or (at your option) any later version; see `LICENSE`. It's
ported from Swiftify with its authors' permission.

    Copyright (C) 2026 shredos67, thefoxyydev and the Swiftify contributors
    Copyright (C) 2026 teofilcelzmecher

Bundled with it, under their own licenses: the shape code from rounded-polygon-qmljs (Apache 2.0,
`LICENSE-shapes.txt`), the fonts in `fonts/` (SIL OFL 1.1 and Apache 2.0, licenses inside) and
`vendor/material-color-utilities.js` (Apache 2.0, license beside it).

## Credits

- Design and behaviour from [Swiftify](https://github.com/swiftify-org/swiftify) by shredos67,
  thefoxyydev and the Swiftify contributors, used under GPL-3.0-or-later with their permission.
- Swiftify follows end-4's [dots-hyprland](https://github.com/end-4/dots-hyprland) (curves, state colours, tokens).
- Shapes: [rounded-polygon-qmljs](https://github.com/end-4/rounded-polygon-qmljs), a port of androidx
  graphics-shapes (Apache 2.0, see `LICENSE-shapes.txt`).
- Colour: Google's [material-color-utilities](https://github.com/material-foundation/material-color-utilities) (Apache 2.0).
