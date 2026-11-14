// Budgie's icon for iPhone, iPad and Mac, and its launch screen logo, drawn from the design system itself: Budgie's
// logo, the Material 3 cookie9 (m3/m3-shapes.js) turned 13° on pale lavender, in coloured glass (amber, orange,
// pink, magenta and blue, like the app, which wears every nest's colours), with "budgie" on it in Budgie's own type
// (Google Sans Flex, rounded).
//   node apps/apple/tools/make-icons.js     (needs Playwright, a development tool: not part of the app)
// Writes:
//   Budgie/AppIcon.icon          an Icon Composer icon in layers (the glass cookie, and the word in front of it), so
//                                iOS and macOS give it real Liquid Glass, in light, dark and tinted; Xcode makes the
//                                older systems' icons from it
//   Budgie/Assets.xcassets/LaunchLogo.imageset   the whole logo, for the launch screen
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const REPO = path.join(APP, '..', '..');
const ICON = path.join(APP, 'Budgie', 'AppIcon.icon');
const ASSETS = path.join(APP, 'Budgie', 'Assets.xcassets');
const SHAPE = 'cookie9';
const TURN = 13; // degrees, as in the logo people know
// the glass's colours: a soft blend of light, warm at the top and cool at the bottom
const MESH = [
  'radial-gradient(52% 48% at 10% 8%, #FDAA05 0%, rgba(253,170,5,0) 100%)',
  'radial-gradient(50% 45% at 48% 4%, #F97138 0%, rgba(249,113,56,0) 100%)',
  'radial-gradient(55% 52% at 94% 10%, #FB1559 0%, rgba(251,21,89,0) 100%)',
  'radial-gradient(48% 45% at 92% 55%, #EE5483 0%, rgba(238,84,131,0) 100%)',
  'radial-gradient(46% 42% at 48% 50%, #D4619D 0%, rgba(212,97,157,0) 100%)',
  'radial-gradient(48% 45% at 6% 94%, #C4DEF4 0%, rgba(196,222,244,0) 100%)',
  'radial-gradient(52% 48% at 50% 98%, #239AFA 0%, rgba(35,154,250,0) 100%)',
  'radial-gradient(50% 48% at 96% 96%, #A359F8 0%, rgba(163,89,248,0) 100%)',
  'linear-gradient(165deg, #F98A2A 0%, #E5577F 45%, #7786DC 100%)',
].join(',');

const page = (body, w, h) => `<!doctype html><html><head><style>
@font-face { font-family: 'Google Sans Flex'; src: url('file://${REPO}/m3/fonts/google-sans-flex-latin.woff2') format('woff2'); font-weight: 1 1000; font-stretch: 25% 151%; }
html, body { margin: 0; width: ${w}px; height: ${h}px; overflow: hidden; background: transparent; }
.w { position: absolute; font-family: 'Google Sans Flex'; font-weight: 800; font-stretch: 112%; font-variation-settings: 'ROND' 100; letter-spacing: -0.02em; line-height: 1; white-space: nowrap; transform: translate(-50%, -56%); color: #fff; }
</style><script src="file://${REPO}/m3/m3-shapes.js"></script></head><body>${body}</body></html>`;

const box = (size, cx, cy) => `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;transform:rotate(${TURN}deg)`;
/** just the cookie's colours: the icon's glass layer (the system makes it glass) */
const cookie = (size, cx, cy) => `<div class="clip" data-size="${size}" style="${box(size, cx, cy)};background:${MESH}"></div>`;
/** just the word: the icon's front layer */
const word = (size, cx, cy, shadow = '') => `<div class="w" data-width="${size * 0.64}" style="left:${cx}px;top:${cy}px;${shadow}">budgie</div>`;
let ids = 0;
/** the whole logo as it's drawn everywhere else: glass, its glow, its sheen and its edge, and the word */
function logo(size, cx, cy) {
  const u = 'g' + ids++;
  const b = box(size, cx, cy);
  return (
    `<div style="position:absolute;inset:0;filter:blur(${size * 0.07}px);opacity:.42;transform:translateY(${size * 0.07}px) scale(.94)"><div class="clip" data-size="${size}" style="${b};background:${MESH}"></div></div>` +
    `<div class="clip" data-size="${size}" style="${b};overflow:hidden">` +
    `<div style="position:absolute;inset:-6%;background:${MESH};filter:blur(${size * 0.025}px)"></div>` +
    `<div style="position:absolute;inset:0;background:linear-gradient(${170 - TURN}deg, rgba(255,255,255,.26) 0%, rgba(255,255,255,.07) 30%, rgba(255,255,255,0) 52%, rgba(255,255,255,0) 78%, rgba(255,255,255,.12) 100%)"></div></div>` +
    `<svg viewBox="0 0 100 100" style="${b};overflow:visible"><defs>` +
    `<linearGradient id="r${u}" gradientTransform="rotate(${-TURN} .5 .5)" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient>` +
    `<clipPath id="c${u}"><path class="p"/></clipPath><filter id="b${u}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>` +
    `<g clip-path="url(#c${u})"><path class="p" fill="none" stroke="#3A1460" stroke-opacity=".22" stroke-width="6" transform="rotate(${-TURN} 50 50) translate(0 -1.6) rotate(${TURN} 50 50)" filter="url(#b${u})"/></g>` +
    `<path class="p" fill="none" stroke="url(#r${u})" stroke-width="0.9"/></svg>` +
    word(size, cx, cy, `text-shadow:0 ${size * 0.004}px ${size * 0.004}px rgba(255,255,255,.35),0 ${size * 0.006}px ${size * 0.025}px rgba(60,20,90,.3)`)
  );
}

// the icon: the system draws the background (pale lavender, or near-black in dark mode) and the glass
const srgb = (hex) => 'srgb:' + hex.match(/[\da-f]{2}/gi).map((x) => (parseInt(x, 16) / 255).toFixed(5)).join(',') + ',1.00000';
const ICON_JSON = {
  fill: { solid: srgb('F2EDF3') },
  'fill-specializations': [{ appearance: 'dark', value: { solid: srgb('141218') } }],
  // front first: the word, then the glass behind it
  groups: [
    { layers: [{ 'image-name': 'word.png', name: 'word' }], shadow: { kind: 'neutral', opacity: 0.35 }, translucency: { enabled: false, value: 0 } },
    { layers: [{ 'image-name': 'glass.png', name: 'glass' }], shadow: { kind: 'layer-color', opacity: 0.5 }, translucency: { enabled: true, value: 0.15 }, specular: true },
  ],
  'supported-platforms': { squares: 'shared' },
};

(async () => {
  const browser = await browser_();
  const p = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  async function draw(file, w, h, body) {
    const tmp = path.join(APP, '.icon.html');
    fs.writeFileSync(tmp, page(body, w, h));
    await p.setViewportSize({ width: w, height: h });
    await p.goto('file://' + tmp);
    await p.evaluate(async (shape) => {
      await document.fonts.load('800 100px "Google Sans Flex"', 'budgie');
      await document.fonts.ready;
      document.querySelectorAll('.p').forEach((el) => el.setAttribute('d', M3Shapes.path(shape)));
      document.querySelectorAll('.clip').forEach((el) => (el.style.clipPath = `path('${M3Shapes.path(shape, Number(el.dataset.size))}')`));
      for (const el of document.querySelectorAll('.w[data-width]')) {
        el.style.fontSize = '100px';
        el.style.fontSize = (100 * Number(el.dataset.width)) / el.getBoundingClientRect().width + 'px';
      }
    }, SHAPE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    fs.rmSync(tmp);
  }
  // the icon's layers, on Icon Composer's 1024-point canvas
  fs.rmSync(ICON, { recursive: true, force: true });
  await draw(path.join(ICON, 'Assets', 'glass.png'), 1024, 1024, cookie(800, 512, 512));
  await draw(path.join(ICON, 'Assets', 'word.png'), 1024, 1024, word(800, 512, 512));
  fs.writeFileSync(path.join(ICON, 'icon.json'), JSON.stringify(ICON_JSON, null, 2) + '\n');
  // the launch screen's logo, 160 points across
  const launch = path.join(ASSETS, 'LaunchLogo.imageset');
  for (const k of [1, 2, 3]) await draw(path.join(launch, `logo@${k}x.png`), 220 * k, 220 * k, logo(160 * k, 110 * k, 110 * k));
  fs.writeFileSync(
    path.join(launch, 'Contents.json'),
    JSON.stringify({ images: [1, 2, 3].map((k) => ({ idiom: 'universal', filename: `logo@${k}x.png`, scale: `${k}x` })), info: { author: 'xcode', version: 1 } }, null, 2) + '\n'
  );
  // a look at the icon as it'll roughly be (the system adds the glass), for checking by eye
  await draw(
    path.join(APP, 'store', 'icon-preview.png'),
    1024,
    1024,
    `<div style="position:absolute;inset:0;border-radius:225px;background:radial-gradient(110% 100% at 30% 0%, #FFFFFF 0%, #F6F2F8 45%, #EAE3F1 100%)"></div>` + logo(800, 512, 512)
  );
  await browser.close();
  console.log('icon and launch logo written');
})().catch((e) => (console.error(e), process.exit(1)));

function browser_() {
  return chromium.launch();
}
