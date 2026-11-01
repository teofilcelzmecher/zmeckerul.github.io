// Budgie's icons for Windows and Linux, drawn from the design system like the Apple app's (apps/apple/tools/make-icons.js):
// the Material 3 cookie9 turned 13°, in coloured glass, with "budgie" on it in Google Sans Flex. On a computer an icon
// is its own shape (no square around it), and at the smallest sizes (16 to 32 pixels: the tray, a window's corner) the
// word would be a smudge, so those are the cookie alone.
//   node apps/desktop/tools/make-icons.js     (needs Playwright, a development tool: not part of the app)
// Writes:
//   build/icon.ico             Windows: the app, its installer and its shortcuts (16 to 256 pixels in one file)
//   build/icons/NxN.png        Linux: the app in menus and docks, 16 to 1024
//   icons/icon-256.png         the window's icon on Linux, and notifications'
//   icons/logo-128.png         the logo in the app's own small windows (ringing, sharing, offline)
//   icons/tray*.png            the tray: Windows 16 (and @2x), Linux 24 (and @2x), each also with a dot for unread
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const APP = path.join(__dirname, '..');
const REPO = path.join(APP, '..', '..');
const SHAPE = 'cookie9';
const TURN = 13;
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
let ids = 0;
/** the logo: the glass (its glow only when there's room for one), its sheen, its edge, and the word unless it's small */
function logo(size, cx, cy, { word = true, glow = true } = {}) {
  const u = 'g' + ids++;
  const b = box(size, cx, cy);
  return (
    (glow ? `<div style="position:absolute;inset:0;filter:blur(${size * 0.05}px);opacity:.38;transform:translateY(${size * 0.05}px) scale(.94)"><div class="clip" data-size="${size}" style="${b};background:${MESH}"></div></div>` : '') +
    `<div class="clip" data-size="${size}" style="${b};overflow:hidden">` +
    `<div style="position:absolute;inset:-6%;background:${MESH};filter:blur(${size * 0.025}px)"></div>` +
    `<div style="position:absolute;inset:0;background:linear-gradient(${170 - TURN}deg, rgba(255,255,255,.26) 0%, rgba(255,255,255,.07) 30%, rgba(255,255,255,0) 52%, rgba(255,255,255,0) 78%, rgba(255,255,255,.12) 100%)"></div></div>` +
    `<svg viewBox="0 0 100 100" style="${b};overflow:visible"><defs>` +
    `<linearGradient id="r${u}" gradientTransform="rotate(${-TURN} .5 .5)" x1="0.3" y1="0" x2="0.7" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".35" stop-color="#fff" stop-opacity=".35"/><stop offset=".6" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".4"/></linearGradient></defs>` +
    `<path class="p" fill="none" stroke="url(#r${u})" stroke-width="${size < 64 ? 0 : 0.9}"/></svg>` +
    (word ? `<div class="w" data-width="${size * 0.64}" style="left:${cx}px;top:${cy}px;text-shadow:0 ${size * 0.006}px ${size * 0.025}px rgba(60,20,90,.3)">budgie</div>` : '')
  );
}
/** a dot in the corner, for unread */
const dot = (s) => `<div style="position:absolute;right:${Math.max(1, s * 0.06)}px;bottom:${Math.max(1, s * 0.06)}px;width:${s * 0.38}px;height:${s * 0.38}px;border-radius:50%;background:#E5484D;box-shadow:0 0 0 ${Math.max(1, s * 0.06)}px #fff"></div>`;

/** an .ico holding PNGs of each size (Windows reads PNG entries since Vista) */
function ico(pngs) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  const dir = Buffer.alloc(16 * pngs.length);
  let at = 6 + dir.length;
  pngs.forEach(({ size, data }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(data.length, o + 8);
    dir.writeUInt32LE(at, o + 12);
    at += data.length;
  });
  return Buffer.concat([head, dir, ...pngs.map((p) => p.data)]);
}

(async () => {
  const browser = await chromium.launch();
  const p = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
  async function draw(w, h, body) {
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
    const data = await p.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    fs.rmSync(tmp);
    return data;
  }
  // the logo fills most of the square (the cookie's points and its glow need a little room); the small ones are the
  // cookie alone, bigger in their square, with no glow to blur them
  const art = (s, extra = '') => draw(s, s, (s <= 32 ? logo(s * 0.86, s / 2, s / 2, { word: false, glow: false }) : logo(s * 0.8, s / 2, s / 2 - s * 0.01)) + extra);
  const write = (file, data) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, data);
  };

  const sizes = [16, 24, 32, 48, 64, 128, 256, 512, 1024];
  const made = {};
  for (const s of sizes) made[s] = await art(s);
  write(path.join(APP, 'build', 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, data: made[size] }))));
  fs.rmSync(path.join(APP, 'build', 'icons'), { recursive: true, force: true });
  for (const s of [16, 24, 32, 48, 64, 128, 256, 512, 1024]) write(path.join(APP, 'build', 'icons', `${s}x${s}.png`), made[s]);
  write(path.join(APP, 'icons', 'icon-256.png'), made[256]);
  write(path.join(APP, 'icons', 'logo-128.png'), made[128]);
  // the tray
  for (const [name, s] of [['tray', 16], ['tray@2x', 32], ['tray-linux', 24], ['tray-linux@2x', 48]]) {
    const cookie = (x) => draw(s, s, logo(s * 0.88, s / 2, s / 2, { word: false, glow: false }) + x);
    write(path.join(APP, 'icons', `${name}.png`), await cookie(''));
    write(path.join(APP, 'icons', `${name.replace(/(@2x)?$/, '-unread$1')}.png`), await cookie(dot(s)));
  }
  await browser.close();
  console.log('desktop icons written');
})().catch((e) => (console.error(e), process.exit(1)));
