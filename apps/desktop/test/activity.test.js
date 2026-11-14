// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
// What activity.js makes of what Windows and Linux say. Run with: npm test (or node --test "test/*.test.js")
// The D-Bus answers in fixtures/ were recorded from gdbus and dbus-send asking pretend MPRIS players; the PowerShell
// lines are what Windows PowerShell 5.1's ConvertTo-Json -Compress writes (with everything past ASCII as \uXXXX).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const A = require('../activity');

const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const MPRIS = 'org.mpris.MediaPlayer2.';

// ---- D-Bus ---------------------------------------------------------------------------------------------------------

test('gdbus and dbus-send answers read the same', () => {
  for (const player of ['spotify', 'firefox']) {
    assert.deepEqual(A.parseGVariant(fixture(`gdbus-${player}.txt`)), A.parseDbusSend(fixture(`dbussend-${player}.txt`)));
  }
  // the bus's names (the order is the bus's own; only which names matters)
  const g = A.parseGVariant(fixture('gdbus-names.txt'))[0].filter((n) => n.startsWith(MPRIS)).sort();
  const d = A.parseDbusSend(fixture('dbussend-names.txt'))[0].filter((n) => n.startsWith(MPRIS)).sort();
  assert.deepEqual(g, d);
  assert.deepEqual(g, [MPRIS + 'firefox.instance_1_23', MPRIS + 'spotify', MPRIS + 'vlc']);
  assert.equal(A.parseGVariant(fixture('gdbus-id-spotify.txt'))[0], 'Spotify');
  assert.equal(A.parseDbusSend(fixture('dbussend-id-vlc.txt'))[0], 'VLC media player');
});

test('titles keep their quotes, backslashes, accents and emoji', () => {
  const want = { title: 'It\'s "quoted" — ünïcödé ✓ 🎵', artist: ['Ärtist \\ back'] };
  for (const v of [A.parseGVariant(fixture('gdbus-vlc.txt'))[0], A.parseDbusSend(fixture('dbussend-vlc.txt'))[0]]) {
    assert.equal(v.PlaybackStatus, 'Paused');
    assert.equal(v.Metadata['xesam:title'], want.title);
    assert.deepEqual(v.Metadata['xesam:artist'], want.artist);
    assert.equal(v.Metadata['mpris:length'], 215000000);
  }
});

test('GLib text: typed values, empty typed lists, escapes, nothing', () => {
  assert.deepEqual(A.parseGVariant("({'a': <@as []>, 'b': <uint64 3>, 'c': <objectpath '/x'>, 'd': <just 'y'>, 'e': <nothing>, 'f': <-1.5e2>, 'g': <byte 0x1f>},)"), [
    { a: [], b: 3, c: '/x', d: 'y', e: null, f: -150, g: 31 },
  ]);
  assert.deepEqual(A.parseGVariant("('tab\\there', 'caf\\u00e9', \"it's\", b'raw')"), ['tab\there', 'café', "it's", 'raw']);
  assert.deepEqual(A.parseGVariant('(@a{sv} {},)'), [{}]);
  assert.throws(() => A.parseGVariant("({'a': <'unfinished"));
});

test('dbus-send text: an empty dictionary, booleans, numbers, bytes', () => {
  const text = `method return time=1 sender=:1.1 -> destination=:1.2 serial=3 reply_serial=2
   array [
   ]
   boolean false
   uint32 7
   array of bytes "hello"
`;
  assert.deepEqual(A.parseDbusSend(text), [[], false, 7, 'hello']);
});

test('MPRIS players: Spotify before a video in Firefox, which is tidied', () => {
  const read = (p, id) => A.mprisPlayer(MPRIS + p, A.parseGVariant(fixture(`gdbus-${p}.txt`))[0], id);
  const spotify = read('spotify', 'Spotify');
  const firefox = A.mprisPlayer(MPRIS + 'firefox.instance_1_23', A.parseGVariant(fixture('gdbus-firefox.txt'))[0], A.parseGVariant(fixture('gdbus-id-firefox.txt'))[0]);
  const vlc = read('vlc', 'VLC media player');
  assert.deepEqual(A.pickSong([firefox, vlc, spotify]), { title: 'Get Lucky', artist: 'Daft Punk, Pharrell Williams', album: 'Random Access Memories', app: 'Spotify', playing: true });
  // the YouTube video on its own: "Rick Astley - Never Gonna Give You Up (Official Music Video)" by Rick Astley
  assert.deepEqual(A.pickSong([firefox]), { title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: '', app: 'Firefox', playing: true });
  // VLC's tagged song is music, but paused
  assert.equal(A.pickSong([vlc]).playing, false);
  assert.equal(A.pickSong([vlc]).app, 'VLC');
});

test("songs: what isn't music is left out", () => {
  const p = (ids, extra) => Object.assign({ ids, title: 'Something', artist: 'Someone', playing: true }, extra);
  // calls, chats, Budgie itself, streaming services
  for (const id of ['Discord', 'Budgie', 'com.budgiesocial.app', 'Netflix', 'Microsoft Teams']) assert.equal(A.songOf(p([id])), null, id);
  // a film in a video player (no artist, a video file)
  assert.equal(A.songOf(p(['vlc'], { artist: '', url: 'file:///home/a/film.mkv' })), null);
  // but a song in one
  assert.ok(A.songOf(p(['vlc'], { artist: '', url: 'file:///home/a/song.flac' })));
  // a browser on Twitch (Linux players may say where), and a video in a browser that isn't a music video
  assert.equal(A.songOf(p(['Mozilla Firefox'], { url: 'https://www.twitch.tv/somebody' })), null);
  assert.equal(A.songOf(p(['MSEdge'], { title: 'How to fix a bike', artist: 'Bike Channel', type: 'Video' })), null);
  // a video in a browser that says nothing about itself (Linux), or calls itself music (Chrome on Windows)
  assert.equal(A.songOf(p(['Mozilla Firefox'], { title: 'How to fix a bike chain', artist: 'Bike Channel', url: 'https://www.youtube.com/watch?v=abc' })), null);
  assert.equal(A.songOf(p(['Chrome'], { title: 'How to fix a bike chain', artist: 'Bike Channel', type: 'Music' })), null);
  // but a song from an album in one (YouTube Music, Spotify's web player) is music
  assert.deepEqual(A.songOf(p(['Chrome'], { title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', type: 'Music' })), { title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', app: 'Chrome', playing: true, rank: 113 });
  // a music site in a browser says so
  assert.equal(A.songOf(p(['Mozilla Firefox'], { url: 'https://music.youtube.com/watch?v=x' })).app, 'YouTube Music');
  // Spotify's adverts, and something with no title
  assert.equal(A.songOf(p(['Spotify.exe'], { title: 'Advertisement', artist: '' })), null);
  assert.equal(A.songOf(p(['Spotify.exe'], { title: '' })), null);
  // an unknown app needs someone singing
  assert.equal(A.songOf(p(['SomeApp'], { artist: '' })), null);
  assert.equal(A.songOf(p(['SomeApp'])).app, '');
});

test('songs: music videos in browsers, tidied', () => {
  const t = (title, artist) => A.tidyBrowserSong({ title, artist, album: '' });
  assert.deepEqual(t('Taylor Swift - Anti-Hero (Official Music Video)', 'TaylorSwiftVEVO'), { title: 'Anti-Hero', artist: 'Taylor Swift', album: '' });
  assert.deepEqual(t('Not Like Us', 'Kendrick Lamar - Topic'), { title: 'Not Like Us', artist: 'Kendrick Lamar', album: '' });
  assert.deepEqual(t('Daft Punk - Get Lucky [Official Audio]', 'Daft Punk'), { title: 'Get Lucky', artist: 'Daft Punk', album: '' });
  // a title with a dash that isn't "Artist - Song" stays as it is
  assert.deepEqual(t('lofi hip hop radio - beats to relax/study to', 'Lofi Girl'), { title: 'lofi hip hop radio - beats to relax/study to', artist: 'Lofi Girl', album: '' });
  // "(Remastered 2011)" is part of the song's name
  assert.equal(t('Here Comes the Sun (Remastered 2019)', 'The Beatles').title, 'Here Comes the Sun (Remastered 2019)');
});

test('songs: playing beats paused, and two playing at once don\'t swap places', () => {
  const a = { ids: ['Spotify.exe'], title: 'A', artist: 'X', playing: false };
  const b = { ids: ['chrome'], title: 'B', artist: 'Y', album: 'Z', playing: true };
  assert.equal(A.pickSong([a, b]).title, 'B');
  const c = { ids: ['Spotify.exe'], title: 'C', artist: 'Z', playing: true };
  const d = { ids: ['AIMP'], title: 'D', artist: 'W', playing: true };
  const first = A.pickSong([c, d]);
  assert.equal(A.pickSong([d, c], first).title, first.title);
  assert.equal(A.pickSong([]), null);
});

// ---- Windows (PowerShell) -------------------------------------------------------------------------------------

test('PowerShell: media sessions, one or many, with escaped characters', () => {
  const line =
    '{"media":[{"app":"Spotify.exe","status":"Playing","type":"Music","title":"Caf\\u00e9 del Mar \\u0027Energy\\u0027 \\ud83c\\udfb5","artist":"Energy 52","album":"","albumArtist":""},' +
    '{"app":"MSEdge","status":"Paused","type":"Video","title":"Some video","artist":"","album":"","albumArtist":""}]}';
  const said = A.parsePsLine(line);
  assert.equal(said.media.length, 2);
  assert.deepEqual(A.pickSong(said.media), { title: "Café del Mar 'Energy' 🎵", artist: 'Energy 52', album: '', app: 'Spotify', playing: true });
  // a list of one written as the one thing alone
  const one = A.parsePsLine('{"media":{"app":"Microsoft.ZuneMusic_8wekyb3d8bbwe!Microsoft.ZuneMusic","status":"Changing","type":"Music","title":"Song","artist":"","album":"Album","albumArtist":"Band"}}');
  assert.deepEqual(A.pickSong(one.media), { title: 'Song', artist: 'Band', album: 'Album', app: 'Media Player', playing: true });
  // Firefox's app id is a code (here playing YouTube Music, which says the album)
  const ff = A.parsePsLine('{"media":[{"app":"308046B0AF4A39CB","status":"Playing","type":"Music","title":"Song","artist":"Artist","album":"Album","albumArtist":""}]}');
  assert.equal(A.pickSong(ff.media).app, 'Firefox');
  assert.deepEqual(A.parsePsLine('{"media":[]}'), { media: [] });
  assert.deepEqual(A.parsePsLine('{"media":null,"unavailable":true}'), { unavailable: true });
  assert.equal(A.parsePsLine('not json'), null);
  assert.equal(A.parsePsLine(''), null);
});

test('PowerShell: programs, and the games among them', () => {
  const said = A.parsePsLine(
    '{"procs":[{"n":"explorer","p":""},{"n":"steamwebhelper","p":"C:\\\\Program Files (x86)\\\\Steam\\\\bin\\\\cef\\\\cef.win7x64\\\\steamwebhelper.exe"},' +
      '{"n":"Hollow Knight","p":"D:\\\\SteamLibrary\\\\steamapps\\\\common\\\\Hollow Knight\\\\Hollow Knight.exe"}]}'
  );
  assert.equal(said.procs.length, 3);
  assert.equal(A.pickGame(said.procs), 'Hollow Knight');
  assert.equal(A.pickGame(A.parsePsLine('{"procs":{"n":"javaw","p":"C:\\\\Program Files\\\\Java\\\\bin\\\\javaw.exe","t":"Minecraft* 1.21.4 - Singleplayer"}}').procs), 'Minecraft');
});

test('tasklist, when PowerShell cannot run', () => {
  const procs = A.parseTasklist('"System Idle Process","0","Services","0","8 K"\r\n"RobloxPlayerBeta.exe","4242","Console","1","412,332 K"\r\n');
  assert.deepEqual(procs, [{ n: 'System Idle Process' }, { n: 'RobloxPlayerBeta.exe' }]);
  assert.equal(A.pickGame(procs), 'Roblox');
});

test('the PowerShell script travels whole', () => {
  const encoded = Buffer.from(A.PS_SCRIPT, 'utf16le').toString('base64');
  // Windows' command lines hold 32767 characters
  assert.ok(encoded.length < 30000, `${encoded.length} characters`);
  assert.equal(Buffer.from(encoded, 'base64').toString('utf16le'), A.PS_SCRIPT);
  assert.ok(A.PS_SCRIPT.includes("'IAsyncOperation`1'"));
  assert.ok(!A.PS_SCRIPT.includes('${'));
  // brackets and braces pair up (a typo here would only show on Windows)
  for (const [open, close] of ['{}', '()', '[]']) assert.equal(A.PS_SCRIPT.split(open).length, A.PS_SCRIPT.split(close).length, open + close);
});

// ---- games ---------------------------------------------------------------------------------------------------

test('games by their programs, on Windows and Linux', () => {
  const g = (n, p = '', a) => A.pickGame([{ n, p, a }]);
  assert.equal(g('FortniteClient-Win64-Shipping'), 'Fortnite');
  assert.equal(g('cs2'), 'Counter-Strike 2');
  assert.equal(g('Terraria.bin.x86_64', '/home/a/GOG Games/Terraria/game/Terraria.bin.x86_64'), 'Terraria');
  assert.equal(g('hollow_knight.x86_64'), 'Hollow Knight');
  assert.equal(g('bg3_dx11'), "Baldur's Gate 3");
  assert.equal(g('Minecraft.Windows'), 'Minecraft');
  assert.equal(g('RobloxPlayerBeta'), 'Roblox');
  // a program that runs two games: where it's installed says which
  assert.equal(g('PathOfExile_x64', 'C:\\Program Files (x86)\\Grinding Gear Games\\Path of Exile 2\\PathOfExile_x64.exe'), 'Path of Exile 2');
  assert.equal(g('hl2', 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\GarrysMod\\hl2.exe'), "Garry's Mod");
  // nothing that isn't a game
  for (const n of ['chrome', 'code', 'explorer', 'steam', 'EpicGamesLauncher', 'RiotClientServices']) assert.equal(g(n), null, n);
  assert.equal(A.GAMES.size > 250, true);
  assert.ok(new Set(A.GAMES.values()).size >= 150);
});

test('games by their library folder, named nicely', () => {
  const g = (p, a) => A.pickGame([{ n: p.split(/[\\/]/).pop(), p, a }]);
  assert.equal(g('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Lethal Company\\Lethal Company.exe'), 'Lethal Company');
  assert.equal(g('/home/a/.local/share/Steam/steamapps/common/StardewValley/StardewValley'), 'Stardew Valley');
  assert.equal(g('D:\\Games\\Epic Games\\MarvelRivals\\MarvelGame\\Marvel.exe'), 'Marvel Rivals');
  assert.equal(g('C:\\Program Files\\Epic Games\\rocketleague\\Binaries\\Win64\\Launcher.exe'), 'Rocket League');
  assert.equal(g('C:\\Riot Games\\VALORANT\\live\\VALORANT.exe'), 'VALORANT');
  assert.equal(g('C:\\Riot Games\\League of Legends\\LeagueClient.exe'), 'League of Legends');
  assert.equal(g('/home/a/.local/share/Steam/steamapps/common/dota 2 beta/game/bin/linuxsteamrt64/dota2'), 'Dota 2');
  assert.equal(g('C:\\GOG Games\\Disco Elysium\\launcher.exe'), 'Disco Elysium');
  assert.equal(g('/home/a/Games/Heroic/SomeIndieGame/game.x86_64'), 'Some Indie Game');
  assert.equal(g('C:\\XboxGames\\Sea of Thieves\\Content\\SoTGame.exe'), 'Sea of Thieves');
  assert.equal(g('/home/a/.local/share/Steam/steamapps/common/terraria/Terraria'), 'Terraria');
  assert.equal(g('C:\\Program Files (x86)\\Steam\\steamapps\\common\\ELDEN RING™\\Game\\start_protected_game.exe'), 'ELDEN RING');
  // launchers, runtimes, tools and apps sold as games
  for (const p of [
    'C:\\Program Files (x86)\\Epic Games\\Launcher\\Portal\\Binaries\\Win64\\EpicGamesLauncher.exe',
    'C:\\Riot Games\\Riot Client\\RiotClientServices.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\wallpaper_engine\\wallpaper64.exe',
    '/home/a/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/pressure-vessel/bin/pv-adverb',
    '/home/a/.local/share/Steam/steamapps/common/Proton 9.0 (Beta)/files/bin/wineserver',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Lossless Scaling\\LosslessScaling.exe',
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hollow Knight\\UnityCrashHandler64.exe',
  ])
    assert.equal(g(p), null, p);
});

test('Proton and Wine games on Linux', () => {
  // the game itself: Wine's program, started as the game's Windows program
  const wine = { n: 'wine64-preloader', p: '/home/a/.local/share/Steam/steamapps/common/Proton 9.0 (Beta)/files/bin/wine64-preloader', a: ['Z:\\home\\a\\.local\\share\\Steam\\steamapps\\common\\Hades II\\Ship\\Hades2.exe'] };
  assert.equal(A.pickGame([wine]), 'Hades II');
  // Steam's reaper holds the runtime, Proton and the game in one command line: the game is the one that counts
  const reaper = {
    n: 'reaper',
    p: '/home/a/.local/share/Steam/ubuntu12_32/reaper',
    a: ['/home/a/.local/share/Steam/ubuntu12_32/reaper', 'SteamLaunch', 'AppId=1145360', '--', '/home/a/.local/share/Steam/steamapps/common/SteamLinuxRuntime_sniper/_v2-entry-point', '--verb=waitforexitandrun', '--', '/home/a/.local/share/Steam/steamapps/common/Proton 9.0 (Beta)/proton', 'waitforexitandrun', '/home/a/.local/share/Steam/steamapps/common/Some Game/Game.exe'],
  };
  assert.equal(A.pickGame([reaper]), 'Some Game');
  // an Epic game through Wine
  assert.equal(A.pickGame([{ n: 'wine-preloader', p: '/usr/bin/wine-preloader', a: ['C:\\Program Files\\Epic Games\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe'] }]), 'Fortnite');
});

test('Minecraft: Java Edition, by its command line', () => {
  assert.equal(A.pickGame([{ n: 'java', p: '/usr/lib/jvm/java-21/bin/java', a: ['java', '-Xmx4G', '-cp', 'x.jar', 'net.minecraft.client.main.Main', '--gameDir', '/home/a/.minecraft'] }]), 'Minecraft');
  assert.equal(A.pickGame([{ n: 'java', p: '/usr/bin/java', a: ['java', '-cp', 'x.jar', 'org.prismlauncher.EntryPoint'] }]), 'Minecraft');
  assert.equal(A.pickGame([{ n: 'javaw', p: 'C:\\Users\\a\\AppData\\Local\\Packages\\Microsoft.4297127D64EC6_8wekyb3d8bbwe\\LocalCache\\Local\\runtime\\java-runtime-delta\\windows-x64\\java-runtime-delta\\bin\\javaw.exe', t: '' }]), 'Minecraft');
  // any other Java program isn't
  assert.equal(A.pickGame([{ n: 'java', p: '/usr/bin/java', a: ['java', '-jar', 'idea.jar'] }]), null);
});

test('games: well-known first, and the one already playing stays', () => {
  const steam = { n: 'Game', p: '/home/a/.local/share/Steam/steamapps/common/Cozy Farm/Game' };
  const known = { n: 'balatro', p: '/x/balatro' };
  assert.equal(A.pickGame([steam, known]), 'Balatro');
  assert.equal(A.pickGame([steam, known], 'Cozy Farm'), 'Cozy Farm');
  assert.equal(A.pickGame([], 'Cozy Farm'), null);
});

// ---- watching ------------------------------------------------------------------------------------------------

/** a pretend gdbus that answers from the recorded fixtures */
function fakeGdbus(players) {
  const calls = [];
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args]);
    if (cmd !== 'gdbus') return { missing: true };
    const dest = args[args.indexOf('--dest') + 1];
    const method = args[args.indexOf('--method') + 1];
    if (method.endsWith('ListNames')) return { text: `(['org.freedesktop.DBus', ${Object.keys(players).map((p) => `'${MPRIS}${p}'`).join(', ')}],)` };
    const p = players[dest.slice(MPRIS.length)];
    if (!p) return { error: new Error('no such name') };
    if (method.endsWith('.GetAll')) return { text: p.props() };
    return { text: `(<'${p.id}'>,)` };
  };
  return { exec, calls };
}

test('Linux: watching finds the song and the game, and says so once', async () => {
  const heard = [];
  const players = { spotify: { id: 'Spotify', props: () => fixture('gdbus-spotify.txt') } };
  const { exec, calls } = fakeGdbus(players);
  const procs = async () => [{ n: 'Celeste', p: '/home/a/.local/share/Steam/steamapps/common/Celeste/Celeste' }];
  const w = A.create({ platform: 'linux', exec, procs, sh: () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill() {} }), onChange: (a, beat) => heard.push({ a, beat }) });
  w.start({ music: true, games: true });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(heard, [{ a: { music: { title: 'Get Lucky', artist: 'Daft Punk, Pharrell Williams', album: 'Random Access Memories', app: 'Spotify', playing: true }, game: { name: 'Celeste' } }, beat: false }]);
  // gdbus was asked for UTF-8
  assert.ok(calls.every((c) => c[0] === 'gdbus'));
  // games off: the page hears the game go, the song stays
  w.start({ music: true, games: false });
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(heard[heard.length - 1].a, { music: heard[0].a.music, game: null });
  assert.deepEqual(w.current().game, null);
  w.stop();
  assert.deepEqual(w.current(), { music: null, game: null });
  assert.equal(w.running, false);
});

test('Linux: neither gdbus nor dbus-send means no music, not a wait', async () => {
  const heard = [];
  const logged = [];
  const w = A.create({ platform: 'linux', exec: async () => ({ missing: true }), procs: async () => [], sh: () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill() {} }), log: (...x) => logged.push(x.join(' ')), onChange: (a) => heard.push(a) });
  w.start({ music: true, games: true });
  await new Promise((r) => setTimeout(r, 50));
  w.stop();
  assert.deepEqual(heard, [{ music: null, game: null }]);
  assert.equal(logged.filter((l) => /neither gdbus nor dbus-send/.test(l)).length, 1);
});

test('Windows: one hidden PowerShell, its lines become the activity', async () => {
  const heard = [];
  const spawned = [];
  const sh = (cmd, args, opts) => {
    const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill() {} });
    spawned.push({ cmd, args, opts, child });
    return child;
  };
  const w = A.create({ platform: 'win32', sh, ownPid: 4321, onChange: (a) => heard.push(a) });
  w.start({ music: true, games: true });
  assert.equal(spawned.length, 1);
  const { cmd, args, opts, child } = spawned[0];
  assert.match(cmd, /WindowsPowerShell[\\/]v1\.0[\\/]powershell\.exe$/);
  assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
  assert.equal(Buffer.from(args[4], 'base64').toString('utf16le'), A.PS_SCRIPT);
  assert.equal(opts.windowsHide, true);
  assert.equal(opts.env.BUDGIE_ACTIVITY, 'music,games');
  assert.equal(opts.env.BUDGIE_PARENT, '4321');
  child.stdout.write('{"media":[{"app":"Spotify.exe","status":"Playing","type":"Music","title":"Song","artist":"Band","album":"","albumArtist":""}]}\r\n');
  await new Promise((r) => setTimeout(r, 20));
  // nothing yet: the games haven't been looked at, and the page shouldn't hear "no game" before they have
  assert.equal(heard.length, 0);
  child.stdout.write('{"procs":[{"n":"cs2","p":"C:\\\\Steam\\\\steamapps\\\\common\\\\Counter-Strike Global Offensive\\\\game\\\\bin\\\\win64\\\\cs2.exe"}]}\r\n');
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(heard, [{ music: { title: 'Song', artist: 'Band', album: '', app: 'Spotify', playing: true }, game: { name: 'Counter-Strike 2' } }]);
  // the same again: nothing new to say
  child.stdout.write('{"media":[{"app":"Spotify.exe","status":"Playing","type":"Music","title":"Song","artist":"Band","album":"","albumArtist":""}]}\r\n');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(heard.length, 1);
  // music off: PowerShell starts again, asked only for games
  w.start({ music: false, games: true });
  assert.equal(spawned.length, 2);
  assert.equal(spawned[1].opts.env.BUDGIE_ACTIVITY, 'games');
  assert.deepEqual(heard[heard.length - 1], { music: null, game: { name: 'Counter-Strike 2' } });
  w.stop();
});

test('Windows: a song that vanishes for a moment between tracks is not "stopped"', async () => {
  const heard = [];
  let child;
  const sh = () => (child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), kill() {} }));
  const w = A.create({ platform: 'win32', sh, onChange: (a) => heard.push(a) });
  w.start({ music: true, games: false });
  child.stdout.write('{"media":[{"app":"Spotify.exe","status":"Playing","type":"Music","title":"One","artist":"Band","album":"","albumArtist":""}]}\n');
  await new Promise((r) => setTimeout(r, 20));
  child.stdout.write('{"media":[]}\n');
  await new Promise((r) => setTimeout(r, 20));
  child.stdout.write('{"media":[{"app":"Spotify.exe","status":"Playing","type":"Music","title":"Two","artist":"Band","album":"","albumArtist":""}]}\n');
  await new Promise((r) => setTimeout(r, 20));
  w.stop();
  assert.deepEqual(
    heard.map((a) => a.music && a.music.title),
    ['One', 'Two']
  );
});

// ---- Mac (1.7) -----------------------------------------------------------------------------------------------------

/** the Mac's script, run here with pretend apps in place of macOS's scripting */
function runMacScript(apps, argv) {
  const run = new Function('Application', MAC_RUNNER)(macApplication(apps));
  return JSON.parse(run(argv));
}
const MAC_RUNNER = A.MAC_SCRIPT + '\nreturn run;';
function macApplication(apps) {
  return (name) => {
    const app = apps[name];
    if (!app) throw new Error("Application can't be found.");
    if (app.denied) return { running: () => true, playerState: () => { const e = new Error('Not authorized to send Apple events to ' + name + '.'); e.errorNumber = -1743; throw e; } };
    return {
      running: () => app.running !== false,
      playerState: () => {
        if (app.running === false) throw new Error('asking opened the app');
        return app.state;
      },
      playerPosition: () => app.position,
      currentTrack: { name: () => app.title, artist: () => app.artist, album: () => app.album, duration: () => app.duration },
    };
  };
}

test('Mac: the script asks open apps only, and says where in the song', () => {
  const apps = {
    Music: { state: 'playing', title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', duration: 175.5, position: 42.25 },
    Spotify: { running: false },
  };
  assert.deepEqual(runMacScript(apps, ['Music', 'Spotify', 'Nothing']), [{ app: 'Music', title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', playing: true, duration: 175500, position: 42250 }]);
  // Spotify says its length in milliseconds already; stopped means nothing
  const spotify = runMacScript({ Spotify: { state: 'paused', title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', duration: 369626, position: 10 } }, ['Spotify']);
  assert.deepEqual(spotify, [{ app: 'Spotify', title: 'Get Lucky', artist: 'Daft Punk', album: 'Random Access Memories', playing: false, duration: 369626, position: 10000 }]);
  assert.deepEqual(runMacScript({ Music: { state: 'stopped' } }, ['Music']), []);
  // not allowed: macOS's error, so Budgie stops asking
  assert.deepEqual(runMacScript({ Music: { denied: true } }, ['Music']), [{ app: 'Music', error: '-1743' }]);
});

test('Mac: what the script says becomes the song', () => {
  const said = A.parseMacLine(JSON.stringify([{ app: 'Music', title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', playing: true, duration: 175500, position: 42250 }, { app: 'Spotify', error: '-1743' }, { app: 'Finder', title: 'x' }]), 1000);
  assert.deepEqual(said.denied, ['Spotify']);
  assert.deepEqual(A.pickSong(said.players, null), { title: 'Espresso', artist: 'Sabrina Carpenter', album: 'Short n’ Sweet', app: 'Apple Music', playing: true, duration: 175500, position: 42250, at: 1000 });
  assert.equal(A.parseMacLine('not json'), null);
  assert.deepEqual(A.parseMacLine(''), { players: [], denied: [] });
});

test('Mac: watching asks osascript, and stops asking an app the person said no to', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const settle = () => new Promise((r) => setTimeout(r, 30));
  const heard = [];
  const logged = [];
  const calls = [];
  let answer = JSON.stringify([{ app: 'Spotify', error: '-1743' }, { app: 'Music', title: 'Espresso', artist: 'Sabrina Carpenter', album: '', playing: true, duration: 175500, position: 1000 }]);
  const exec = async (cmd, args) => {
    calls.push([cmd, ...args.slice(0, 3), ...args.slice(4)]);
    return { text: answer };
  };
  const w = A.create({ platform: 'darwin', exec, log: (...x) => logged.push(x.join(' ')), onChange: (a, beat) => heard.push({ a, beat }) });
  try {
    w.start({ music: true, games: true });
    await settle();
    assert.deepEqual(calls[0], ['osascript', '-l', 'JavaScript', '-e', 'Music', 'Spotify']);
    assert.equal(heard.length, 1);
    const { at, ...song } = heard[0].a.music;
    assert.deepEqual(song, { title: 'Espresso', artist: 'Sabrina Carpenter', album: '', app: 'Apple Music', playing: true, duration: 175500, position: 1000 });
    assert.ok(Math.abs(at - Date.now()) < 5000);
    assert.equal(heard[0].a.game, null);
    assert.equal(logged.filter((l) => /didn't let Budgie ask Spotify/.test(l)).length, 1);
    // twelve seconds on: asked again, without Spotify; the same song further on isn't news, but it's kept
    answer = JSON.stringify([{ app: 'Music', title: 'Espresso', artist: 'Sabrina Carpenter', album: '', playing: true, duration: 175500, position: 13000 }]);
    t.mock.timers.tick(12000);
    await settle();
    assert.deepEqual(calls[1], ['osascript', '-l', 'JavaScript', '-e', 'Music']);
    assert.equal(heard.length, 1);
    assert.equal(w.current().music.position, 13000);
    // a minute in: the beat says it again, from where the song is now
    t.mock.timers.tick(48000);
    await settle();
    const last = heard[heard.length - 1];
    assert.equal(last.beat, true);
    assert.equal(last.a.music.position, 13000);
    // paused: that is news
    answer = JSON.stringify([{ app: 'Music', title: 'Espresso', artist: 'Sabrina Carpenter', album: '', playing: false, duration: 175500, position: 14000 }]);
    t.mock.timers.tick(12000);
    await settle();
    assert.equal(heard[heard.length - 1].a.music.playing, false);
    assert.equal(heard[heard.length - 1].beat, false);
  } finally {
    w.stop();
  }
});
