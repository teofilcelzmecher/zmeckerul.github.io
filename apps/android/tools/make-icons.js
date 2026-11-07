// Budgie's Android icons and splash screens, drawn from the design system itself: Budgie's logo, the Material 3
// cookie9 (m3/m3-shapes.js) turned 13° on pale lavender, now as coloured glass (amber, orange, pink, magenta and
// blue, like the app, which wears every nest's colours) with "budgie" on it in Budgie's own type (Google Sans Flex,
// rounded).
//   node apps/android/tools/make-icons.js     (needs Playwright, a development tool: not part of the app)
// Writes the launcher icons (adaptive, with a monochrome layer for themed icons, and the older square and round
// ones), the notification icon (the cookie with a "b" cut out: a word is a smudge at that size), the splash
// screens, and the Play Store's icon and feature graphic (store/).
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const REPO = path.join(APP, '..', '..');
const RES = path.join(APP, 'android', 'app', 'src', 'main', 'res');
const STORE = path.join(APP, 'store');
const SHAPE = 'cookie9';
const TURN = 13; // degrees, as in the logo people know
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const LIGHT = 'radial-gradient(110% 100% at 30% 0%, #FFFFFF 0%, #F6F2F8 45%, #EAE3F1 100%)'; // the logo's #F2EDF3, lit
const DARK = 'radial-gradient(110% 100% at 30% 0%, #2B2733 0%, #16141B 55%, #0C0B10 100%)';
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
.bg { position: absolute; inset: 0; }
.w { position: absolute; font-family: 'Google Sans Flex'; font-weight: 800; font-stretch: 112%; font-variation-settings: 'ROND' 100; letter-spacing: -0.02em; line-height: 1; white-space: nowrap; transform: translate(-50%, -56%); color: #fff; }
.t { position: absolute; font-family: 'Google Sans Flex'; line-height: 1; white-space: nowrap; }
</style><script src="file://${REPO}/m3/m3-shapes.js"></script></head><body>${body}</body></html>`;

let ids = 0;
/** the logo, `size` across, centred at (cx, cy). `solid` draws it in one colour with the word cut out (themed and
 *  notification icons, where Android wants a silhouette); `letter` puts just a "b" in it; `dark` for dark grounds */
function logo(size, cx, cy, { solid = '', letter = false, dark = false } = {}) {
  const u = 'g' + ids++;
  const text = letter ? 'b' : 'budgie';
  const box = `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;transform:rotate(${TURN}deg)`;
  if (solid) {
    // the word as a hole, so whatever's under the icon shows through it
    return `<svg viewBox="0 0 100 100" style="${box};overflow:visible"><defs><mask id="${u}"><rect x="-20" y="-20" width="140" height="140" fill="white"/><text class="cut" x="50" y="50" data-width="${letter ? 34 : 66}" text-anchor="middle" dominant-baseline="central" transform="rotate(${-TURN} 50 50)" style="font-family:'Google Sans Flex';font-weight:800;font-stretch:112%;font-variation-settings:'ROND' 100;letter-spacing:-0.02em" fill="black">${text}</text></mask></defs><path class="p" fill="${solid}" mask="url(#${u})"/></svg>`;
  }
  return (
    // the light it throws: a soft glow of its own colours under it
    `<div style="position:absolute;inset:0;filter:blur(${size * 0.07}px);opacity:${dark ? 0.55 : 0.42};transform:translateY(${size * 0.07}px) scale(.94)"><div class="clip" data-size="${size}" style="${box};background:${MESH}"></div></div>` +
    // the glass: its colours, a sheen from the top
    `<div class="clip" data-size="${size}" style="${box};overflow:hidden">` +
    `<div style="position:absolute;inset:-6%;background:${MESH};filter:blur(${size * 0.025}px)"></div>` +
    `<div style="position:absolute;inset:0;background:linear-gradient(${170 - TURN}deg, rgba(255,255,255,.26) 0%, rgba(255,255,255,.07) 30%, rgba(255,255,255,0) 52%, rgba(255,255,255,0) 78%, rgba(255,255,255,.12) 100%)"></div></div>` +
    // its edge: light along the top, a gentle shade inside the bottom
    `<svg viewBox="0 0 100 100" style="${box};overflow:visible"><defs>` +
    `<linearGradient id="r${u}" gradientTransform="rotate(${-TURN} .5 .5)" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient>` +
    `<clipPath id="c${u}"><path class="p"/></clipPath><filter id="b${u}" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.6"/></filter></defs>` +
    `<g clip-path="url(#c${u})"><path class="p" fill="none" stroke="#3A1460" stroke-opacity=".22" stroke-width="6" transform="rotate(${-TURN} 50 50) translate(0 -1.6) rotate(${TURN} 50 50)" filter="url(#b${u})"/></g>` +
    `<path class="p" fill="none" stroke="url(#r${u})" stroke-width="0.9"/></svg>` +
    `<div class="w" data-width="${size * (letter ? 0.34 : 0.64)}" style="left:${cx}px;top:${cy}px;text-shadow:0 ${size * 0.004}px ${size * 0.004}px rgba(255,255,255,.35),0 ${size * 0.006}px ${size * 0.025}px rgba(60,20,90,.3)">${text}</div>`
  );
}

(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  async function draw(file, w, h, body, { round = false } = {}) {
    const tmp = path.join(APP, '.icon.html');
    fs.writeFileSync(tmp, page(body, w, h));
    await p.setViewportSize({ width: w, height: h });
    await p.goto('file://' + tmp);
    await p.evaluate(async (shape) => {
      await document.fonts.load('800 100px "Google Sans Flex"', 'budgie');
      await document.fonts.ready;
      document.querySelectorAll('.p').forEach((el) => el.setAttribute('d', M3Shapes.path(shape)));
      document.querySelectorAll('.clip').forEach((el) => (el.style.clipPath = `path('${M3Shapes.path(shape, Number(el.dataset.size))}')`));
      // each word as wide as asked
      for (const el of document.querySelectorAll('.w[data-width]')) {
        el.style.fontSize = '100px';
        el.style.fontSize = (100 * Number(el.dataset.width)) / el.getBoundingClientRect().width + 'px';
      }
      for (const el of document.querySelectorAll('.cut')) {
        el.setAttribute('font-size', '40');
        el.setAttribute('font-size', String((40 * Number(el.dataset.width)) / el.getBBox().width));
      }
    }, SHAPE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await p.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    fs.rmSync(tmp);
    if (round) {
      // the round icon: everything outside the circle cleared
      require('node:child_process').execFileSync('python3', ['-c', `from PIL import Image, ImageDraw\nim=Image.open('${file}').convert('RGBA')\nm=Image.new('L',im.size,0)\nImageDraw.Draw(m).ellipse((0,0,im.size[0]-1,im.size[1]-1),fill=255)\nim.putalpha(Image.composite(im.getchannel('A'),m,m))\nim.save('${file}')`]);
    }
  }
  for (const [dpi, k] of Object.entries(DENSITIES)) {
    // the adaptive icon's layers: 108dp, of which the middle 66dp is always seen, so the cookie fits inside that
    const fg = 108 * k;
    await draw(`${RES}/mipmap-${dpi}/ic_launcher_background.png`, fg, fg, `<div class="bg" style="background:${LIGHT}"></div>`);
    await draw(`${RES}/mipmap-${dpi}/ic_launcher_foreground.png`, fg, fg, logo(62 * k, fg / 2, fg / 2));
    await draw(`${RES}/mipmap-${dpi}/ic_launcher_monochrome.png`, fg, fg, logo(62 * k, fg / 2, fg / 2, { solid: '#ffffff' }));
    // older phones: a square with rounded corners, and a circle
    const s = 48 * k;
    await draw(`${RES}/mipmap-${dpi}/ic_launcher.png`, s, s, `<div class="bg" style="inset:${2 * k}px;border-radius:${10 * k}px;background:${LIGHT}"></div>` + logo(38 * k, s / 2, s / 2));
    await draw(`${RES}/mipmap-${dpi}/ic_launcher_round.png`, s, s, `<div class="bg" style="inset:${2 * k}px;border-radius:50%;background:${LIGHT}"></div>` + logo(37 * k, s / 2, s / 2), { round: true });
    // the notification icon: white on nothing, as Android wants (it tints it)
    const n = 24 * k;
    await draw(`${RES}/drawable-${dpi}/ic_stat_budgie.png`, n, n, logo(23 * k, n / 2, n / 2, { solid: '#ffffff', letter: true }));
  }
  // splash screens, for phones before Android 12 (which draws its own from the icon)
  const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] };
  for (const [dpi, [w, h]] of Object.entries(SPLASH)) {
    const k = DENSITIES[dpi];
    for (const [dir, W, H] of [['port', w, h], ['land', h, w]]) await draw(`${RES}/drawable-${dir}-${dpi}/splash.png`, W, H, `<div class="bg" style="background:${LIGHT}"></div>` + logo(150 * k, W / 2, H / 2));
  }
  await draw(`${RES}/drawable/splash.png`, 480, 320, `<div class="bg" style="background:${LIGHT}"></div>` + logo(150, 240, 160));
  // Google Play: the 512px icon (Google rounds its corners) and the 1024×500 feature graphic
  await draw(`${STORE}/icon-512.png`, 512, 512, `<div class="bg" style="background:${LIGHT}"></div>` + logo(430, 256, 256));
  await draw(
    `${STORE}/feature-graphic.png`, 1024, 500,
    `<div class="bg" style="background:${DARK}"></div>` +
      logo(360, 250, 250, { dark: true }) +
      `<div class="t" style="left:490px;top:170px;color:#fff;font-size:60px;font-weight:760;font-stretch:110%;font-variation-settings:'ROND' 100">Find your nest.</div>` +
      `<div class="t" style="left:492px;top:252px;color:#F9A06A;font-size:32px;font-weight:600">Communities, chats and calls</div>` +
      `<div class="t" style="left:492px;top:304px;color:rgba(255,255,255,.7);font-size:26px;font-weight:500">Free · No email needed</div>`
  );
  await browser.close();
  console.log('icons, splash screens and store images written');
})().catch((e) => (console.error(e), process.exit(1)));
