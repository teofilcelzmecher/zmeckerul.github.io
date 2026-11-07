// Copyright (C) 2026 teofilcelzmecher. All rights reserved. See LICENSE.
/*
 * What this computer is playing and running, for "Listening to" and "Playing" on Budgie (Budgie 1.4).
 *
 *   music   the song the computer's own media controls know about (the ones its media keys and the volume overlay
 *           use). On Windows that's the System Media Transport Controls, asked by one hidden PowerShell that stays
 *           running and says what's playing when it changes (and every 15 seconds). On Linux it's every player that
 *           speaks MPRIS over D-Bus (Spotify, Rhythmbox, Elisa, Strawberry, VLC, browsers…), asked every 12 seconds,
 *           and straight away when a player says its song changed. Music apps come before a video in a browser,
 *           and what clearly isn't music (a film, a stream, a call) is left out
 *   games   what's running, every 30 seconds: about 150 well-known games by their programs' names, and anything
 *           run from a game library's folder (Steam, Epic, GOG, Riot, EA, Ubisoft, Xbox, Heroic, itch), named
 *           after its folder. Proton and Wine games run from those folders too, so they're found the same way
 *
 * Only the answer leaves this file: { music: { title, artist, album, app, playing } | null, game: { name } | null }.
 * Never paths, other programs, or anything else about the computer. The page posts it to Budgie as part of being
 * signed in; nothing is sent anywhere from here.
 *
 * No native modules: only what Windows and Linux already have (PowerShell, gdbus or dbus-send, /proc). Everything
 * that reads their answers is a plain function, exported for the tests (test/activity.test.js).
 */
'use strict';
const { execFile, spawn } = require('node:child_process');
const fsp = require('node:fs/promises');
const path = require('node:path');
const readline = require('node:readline');

// the same limits the server keeps (nook/server/presence.js)
const LIMITS = { title: 150, artist: 100, album: 100, app: 32, game: 80 };
const MUSIC_EVERY = 12 * 1000; // Linux: how often players are asked
const GAMES_EVERY = 30 * 1000;
const HEARTBEAT = 60 * 1000; // the page hears the same again, so the server knows it's still true
const GRACE = 7 * 1000; // a song that vanishes for a moment (between tracks) isn't "stopped" until it's been gone this long

const clip = (s, n) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

// ---- games -----------------------------------------------------------------------------------------------------

/*
 * Well-known games, by the program that runs them (its name without .exe, in lower case). Many run a launcher
 * first; only the game itself is listed, so "Playing" starts when the game does. Folder detection below finds
 * everything else installed through a game library.
 */
const GAME_LIST = {
  Minecraft: ['minecraft.windows'], // Bedrock; Java is found by its command line (see minecraft())
  Roblox: ['robloxplayerbeta', 'sober'], // Sober: Roblox on Linux
  Fortnite: ['fortniteclient-win64-shipping', 'fortniteclient-win64-shipping_eac_eos'],
  VALORANT: ['valorant-win64-shipping'],
  'League of Legends': ['league of legends', 'leagueclientux'],
  'Legends of Runeterra': ['lor'],
  'Counter-Strike 2': ['cs2'],
  'Counter-Strike: Global Offensive': ['csgo'],
  'Dota 2': ['dota2'],
  'Grand Theft Auto V': ['gta5', 'gta5_enhanced', 'gta5_be'],
  'Grand Theft Auto IV': ['gtaiv'],
  'Grand Theft Auto: San Andreas': ['gta_sa', 'gta-sa', 'sanandreas'],
  'Red Dead Redemption 2': ['rdr2'],
  'Red Dead Redemption': ['rdr'],
  'Apex Legends': ['r5apex', 'r5apex_dx12'],
  'Overwatch 2': ['overwatch'],
  'Genshin Impact': ['genshinimpact', 'yuanshen'],
  'Honkai: Star Rail': ['starrail'],
  'Honkai Impact 3rd': ['bh3'],
  'Zenless Zone Zero': ['zenlesszonezero'],
  'Rocket League': ['rocketleague'],
  'Among Us': ['among us'],
  Terraria: ['terraria', 'tmodloader'],
  'Stardew Valley': ['stardew valley', 'stardewvalley', 'stardewmodapi'],
  'Elden Ring': ['eldenring'],
  'Elden Ring Nightreign': ['nightreign'],
  'Cyberpunk 2077': ['cyberpunk2077'],
  "Baldur's Gate 3": ['bg3', 'bg3_dx11'],
  Rust: ['rustclient'],
  Palworld: ['palworld-win64-shipping', 'palworld-wingdk-shipping'],
  'Helldivers 2': ['helldivers2'],
  'Marvel Rivals': ['marvel-win64-shipping'],
  'The Sims 4': ['ts4_x64', 'ts4_dx9_x64', 'ts4'],
  'Hollow Knight': ['hollow_knight', 'hollow knight'],
  'Hollow Knight: Silksong': ['hollow knight silksong'],
  Celeste: ['celeste'],
  Hades: ['hades'],
  'Hades II': ['hades2'],
  'Lethal Company': ['lethal company'],
  Phasmophobia: ['phasmophobia'],
  'Dead by Daylight': ['deadbydaylight-win64-shipping', 'deadbydaylight-egs-shipping', 'deadbydaylight-wingdk-shipping'],
  'Destiny 2': ['destiny2'],
  'Call of Duty': ['cod'],
  'Call of Duty: Modern Warfare': ['modernwarfare'],
  'Call of Duty: Black Ops Cold War': ['blackopscoldwar'],
  'Call of Duty: Black Ops III': ['blackops3'],
  'Battlefield 6': ['bf6'],
  'Battlefield 2042': ['bf2042'],
  'Battlefield V': ['bfv'],
  'Battlefield 1': ['bf1'],
  'Battlefield 4': ['bf4'],
  'PUBG: Battlegrounds': ['tslgame'],
  'Rainbow Six Siege': ['rainbowsix', 'rainbowsix_vulkan', 'rainbowsix_be'],
  Warframe: ['warframe', 'warframe.x64'],
  'Path of Exile': ['pathofexile', 'pathofexile_x64', 'pathofexilesteam', 'pathofexile_x64steam'],
  'Diablo IV': ['diablo iv'],
  'Diablo III': ['diablo iii64', 'diablo iii'],
  'Diablo II: Resurrected': ['d2r'],
  'World of Warcraft': ['wow', 'wowclassic'],
  Hearthstone: ['hearthstone'],
  'StarCraft II': ['sc2_x64', 'sc2'],
  'Final Fantasy XIV': ['ffxiv_dx11'],
  'Final Fantasy XVI': ['ffxvi'],
  'Final Fantasy VII Rebirth': ['ff7rebirth_'],
  'Monster Hunter Wilds': ['monsterhunterwilds'],
  'Monster Hunter: World': ['monsterhunterworld'],
  'Monster Hunter Rise': ['monsterhunterrise'],
  'Sea of Thieves': ['sotgame', 'seaofthieves'],
  "No Man's Sky": ['nms'],
  Subnautica: ['subnautica'],
  'Subnautica: Below Zero': ['subnauticazero'],
  Valheim: ['valheim'],
  'ARK: Survival Ascended': ['arkascended'],
  Satisfactory: ['factorygamesteam-win64-shipping', 'factorygameegs-win64-shipping', 'factorygame-win64-shipping'],
  Factorio: ['factorio'],
  RimWorld: ['rimworldwin64', 'rimworldwin', 'rimworldlinux'],
  "Don't Starve Together": ['dontstarve_steam_x64', 'dontstarve_steam', 'dontstarve_x64'],
  "Garry's Mod": ['gmod'],
  'Half-Life 2': ['hl2'],
  'Half-Life: Alyx': ['hlvr'],
  'Portal 2': ['portal2'],
  'Team Fortress 2': ['tf_win64', 'tf'],
  'Left 4 Dead 2': ['left4dead2'],
  Deadlock: ['project8'],
  'Deep Rock Galactic': ['fsd-win64-shipping'],
  'Risk of Rain 2': ['risk of rain 2'],
  Balatro: ['balatro'],
  'Vampire Survivors': ['vampiresurvivors'],
  Brawlhalla: ['brawlhalla'],
  'Fall Guys': ['fallguys_client_game', 'fallguys_client'],
  'Stumble Guys': ['stumble guys'],
  'The Witcher 3: Wild Hunt': ['witcher3'],
  'The Elder Scrolls V: Skyrim': ['skyrimse', 'skyrimvr', 'tesv', 'skyrim'],
  'The Elder Scrolls IV: Oblivion Remastered': ['oblivionremastered-win64-shipping'],
  'The Elder Scrolls Online': ['eso64'],
  'Fallout 4': ['fallout4'],
  'Fallout 76': ['fallout76'],
  'Fallout: New Vegas': ['falloutnv'],
  Starfield: ['starfield'],
  'Hogwarts Legacy': ['hogwartslegacy'],
  'God of War': ['gow'],
  'God of War Ragnarök': ['gowr'],
  "Marvel's Spider-Man Remastered": ['spider-man'],
  "Marvel's Spider-Man: Miles Morales": ['milesmorales'],
  "Marvel's Spider-Man 2": ['spider-man2'],
  'Horizon Zero Dawn': ['horizonzerodawn', 'horizonzerodawnremastered'],
  'Horizon Forbidden West': ['horizonforbiddenwest'],
  'Ghost of Tsushima': ['ghostoftsushima'],
  'Sekiro: Shadows Die Twice': ['sekiro'],
  'Dark Souls III': ['darksoulsiii'],
  'Dark Souls: Remastered': ['darksoulsremastered'],
  'Armored Core VI': ['armoredcore6'],
  'Black Myth: Wukong': ['b1-win64-shipping'],
  "Dragon's Dogma 2": ['dd2'],
  'It Takes Two': ['ittakestwo'],
  'Split Fiction': ['splitfiction'],
  'A Way Out': ['awayout'],
  'Sons of the Forest': ['sonsoftheforest'],
  'The Forest': ['theforest'],
  Raft: ['raft'],
  'Content Warning': ['content warning'],
  'R.E.P.O.': ['repo'],
  PEAK: ['peak'],
  'Schedule I': ['schedule i'],
  'Supermarket Simulator': ['supermarket simulator'],
  'Escape from Tarkov': ['escapefromtarkov'],
  'Naraka: Bladepoint': ['narakabladepoint'],
  'War Thunder': ['aces'],
  'World of Tanks': ['worldoftanks'],
  'World of Warships': ['worldofwarships64'],
  'Lost Ark': ['lostark'],
  'Black Desert': ['blackdesert64'],
  'Guild Wars 2': ['gw2-64'],
  'New World': ['newworld'],
  'Old School RuneScape': ['osclient', 'runelite'],
  RuneScape: ['rs2client'],
  MapleStory: ['maplestory'],
  'Albion Online': ['albion-online'],
  'osu!': ['osu!'],
  'Geometry Dash': ['geometrydash'],
  Cuphead: ['cuphead'],
  Undertale: ['undertale'],
  Deltarune: ['deltarune'],
  'Cult of the Lamb': ['cult of the lamb'],
  'Dave the Diver': ['davethediver'],
  Dredge: ['dredge'],
  'Outer Wilds': ['outerwilds'],
  Inscryption: ['inscryption'],
  'Dead Cells': ['deadcells'],
  'Enter the Gungeon': ['enterthegungeon'],
  'The Binding of Isaac: Rebirth': ['isaac-ng'],
  'Cities: Skylines': ['cities'],
  'Cities: Skylines II': ['cities2'],
  "Sid Meier's Civilization VI": ['civilizationvi', 'civilizationvi_dx12'],
  'Europa Universalis IV': ['eu4'],
  'Hearts of Iron IV': ['hoi4'],
  'Crusader Kings III': ['ck3'],
  Stellaris: ['stellaris'],
  'Victoria 3': ['victoria3'],
  'Age of Empires II: Definitive Edition': ['aoe2de_s'],
  'Age of Empires IV': ['reliccardinal'],
  'Total War: Warhammer III': ['warhammer3'],
  'XCOM 2': ['xcom2'],
  'EA Sports FC 26': ['fc26'],
  'EA Sports FC 25': ['fc25'],
  'EA Sports FC 24': ['fc24'],
  'NBA 2K26': ['nba2k26'],
  'NBA 2K25': ['nba2k25'],
  'Forza Horizon 5': ['forzahorizon5'],
  'Forza Horizon 4': ['forzahorizon4'],
  'Euro Truck Simulator 2': ['eurotrucks2'],
  'American Truck Simulator': ['amtrucks'],
  'BeamNG.drive': ['beamng.drive'],
  'F1 25': ['f1_25'],
  'F1 24': ['f1_24'],
  'Need for Speed Unbound': ['needforspeedunbound'],
  'Need for Speed Heat': ['needforspeedheat'],
  "Assassin's Creed Shadows": ['acshadows'],
  "Assassin's Creed Mirage": ['acmirage'],
  "Assassin's Creed Valhalla": ['acvalhalla'],
  "Assassin's Creed Odyssey": ['acodyssey'],
  "Assassin's Creed Origins": ['acorigins'],
  'Far Cry 6': ['farcry6'],
  'Far Cry 5': ['farcry5'],
  'Resident Evil 4': ['re4'],
  'Resident Evil Village': ['re8'],
  'Resident Evil 2': ['re2'],
  'Resident Evil 7': ['re7'],
  'Street Fighter 6': ['streetfighter6'],
  'Mortal Kombat 1': ['mk12'],
  'Dragon Ball: Sparking! Zero': ['sparkingzero-win64-shipping'],
  'Persona 5 Royal': ['p5r'],
  'Persona 3 Reload': ['p3r'],
  'Kingdom Come: Deliverance': ['kingdomcome'],
  'Clair Obscur: Expedition 33': ['sandfall-win64-shipping'],
  'Space Engineers': ['spaceengineers'],
  'Kerbal Space Program': ['ksp_x64', 'ksp'],
  'Project Zomboid': ['projectzomboid64', 'projectzomboid32'],
  '7 Days to Die': ['7daystodie'],
  DayZ: ['dayz_x64', 'dayz'],
  'Arma 3': ['arma3_x64', 'arma3'],
  Squad: ['squadgame'],
  'Hell Let Loose': ['hll-win64-shipping'],
  'Ready or Not': ['readyornot', 'readyornot-win64-shipping'],
  'Payday 2': ['payday2_win32_release'],
  'Doom Eternal': ['doometernalx64vk'],
  'Doom: The Dark Ages': ['doomthedarkages'],
  'Halo Infinite': ['haloinfinite'],
  'Halo: The Master Chief Collection': ['mcc-win64-shipping'],
  'Titanfall 2': ['titanfall2'],
  Unturned: ['unturned'],
  Starbound: ['starbound'],
  'Core Keeper': ['corekeeper'],
  Enshrouded: ['enshrouded'],
  'V Rising': ['vrising'],
  'Grim Dawn': ['grim dawn'],
  'Last Epoch': ['last epoch'],
  'Borderlands 4': ['borderlands4'],
  'Borderlands 3': ['borderlands3'],
  "Tiny Tina's Wonderlands": ['wonderlands'],
  'Chivalry 2': ['chivalry2-win64-shipping'],
  'For Honor': ['forhonor'],
  'The Division 2': ['thedivision2'],
  'Planet Zoo': ['planetzoo'],
  'Two Point Hospital': ['twopointhospital'],
  'Microsoft Flight Simulator 2024': ['flightsimulator2024'],
  'Microsoft Flight Simulator': ['flightsimulator'],
  'Beat Saber': ['beat saber'],
  VRChat: ['vrchat'],
  'Rec Room': ['recroom'],
  'Divinity: Original Sin 2': ['eocapp'],
  'Disco Elysium': ['disco elysium'],
  'The Long Dark': ['tld'],
  'Frostpunk 2': ['frostpunk2'],
  'Manor Lords': ['manorlords', 'manorlords-win64-shipping'],
  'Anno 1800': ['anno1800'],
  'Oxygen Not Included': ['oxygennotincluded'],
  'Dwarf Fortress': ['dwarf fortress'],
  'Once Human': ['oncehuman'],
};
const GAMES = new Map();
for (const [name, exes] of Object.entries(GAME_LIST)) for (const exe of exes) GAMES.set(exe, name);

// a few programs run more than one game; where they're installed says which
const REFINE = [
  [/path of exile 2/i, 'Path of Exile 2'],
  [/garrysmod/i, "Garry's Mod"],
  [/team fortress 2/i, 'Team Fortress 2'],
  [/deliverance ii/i, 'Kingdom Come: Deliverance II'],
];

// game libraries' folders: the game's own folder comes right after these
const LIBRARIES = [
  /[\\/]steamapps[\\/]common[\\/]([^\\/\n]+)/gi,
  /[\\/]Epic Games[\\/]([^\\/\n]+)/gi,
  /[\\/]GOG Galaxy[\\/]Games[\\/]([^\\/\n]+)/gi,
  /[\\/]GOG Games[\\/]([^\\/\n]+)/gi,
  /[\\/]Riot Games[\\/]([^\\/\n]+)/gi,
  /[\\/]EA Games[\\/]([^\\/\n]+)/gi,
  /[\\/]Ubisoft Game Launcher[\\/]games[\\/]([^\\/\n]+)/gi,
  /[\\/]XboxGames[\\/]([^\\/\n]+)/gi,
  /[\\/]Games[\\/]Heroic[\\/]([^\\/\n]+)/gi,
  /[\\/]itch[\\/]apps[\\/]([^\\/\n]+)/gi,
];
// what lives in those folders but isn't a game being played: tools, runtimes, launchers, apps sold on Steam, and
// the little idle games that sit in the background all day
const NOT_GAMES =
  /^(steamworks shared|steam controller configs|steamvr|steam ?linux ?runtime.*|proton.*|riot client|directxredist|epic online services|epiconlineservices|prefixes|_commonredist|wallpaper[ _]engine|lossless scaling|soundpad|obs studio|voicemod|blender|krita|aseprite|godot.*|rpg ?maker.*|gamemaker.*|unity|unreal engine|ue_[\d.]+|bongo ?cat|banana|desktop ?mate|vtube studio|virtual desktop|ovr ?toolkit|xsoverlay|fpsmonitor|spacewar|.*\blauncher\b.*|.*\bserver\b.*|.*\bsdk\b.*|.*\btools?\b|.*redist.*|.*benchmark.*|.*anti-?cheat.*)$/i;
// programs in a game's folder that don't mean it's being played (they come and go around it)
const NOT_PLAYING = /^(unitycrashhandler(32|64)?|crashreportclient|crashpad_handler|crashhandler|crashreporter|unins\d*|uninstall(er)?|vc_?redist.*|dxsetup|dotnetfx.*|oalinst|physx.*|easyanticheat.*|start_protected_game_eac|beservice.*|steamerrorreporter.*|ue4prereqsetup.*|ueprereqsetup.*)$/i;
// folder names that don't say the game's name well
const FOLDERS = {
  'dota 2 beta': 'Dota 2',
  'counter-strike global offensive': 'Counter-Strike 2',
  garrysmod: "Garry's Mod",
  'baldurs gate 3': "Baldur's Gate 3",
  rocketleague: 'Rocket League',
  lor: 'Legends of Runeterra',
  gtav: 'Grand Theft Auto V',
  'grand theft auto v enhanced': 'Grand Theft Auto V',
  pubg: 'PUBG: Battlegrounds',
  tslgame: 'PUBG: Battlegrounds',
  'cities skylines': 'Cities: Skylines',
  'cities skylines ii': 'Cities: Skylines II',
  'dont starve together': "Don't Starve Together",
  'the binding of isaac rebirth': 'The Binding of Isaac: Rebirth',
  'beamng.drive': 'BeamNG.drive',
  overwatch: 'Overwatch 2',
  rimworld: 'RimWorld',
  'r.e.p.o.': 'R.E.P.O.',
  vrising: 'V Rising',
  'tom clancys rainbow six siege': 'Rainbow Six Siege',
  "tom clancy's rainbow six siege": 'Rainbow Six Siege',
  'sid meiers civilization vi': "Sid Meier's Civilization VI",
};

/** a program's name to look up: lower case, without .exe and the like */
function exeKey(name) {
  let s = String(name || '').toLowerCase().trim();
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/(\.exe|\.x86_64|\.x86|\.x64|\.bin|\.sh|\.appimage|_linux64|_linux)$/, '');
  }
  return s;
}
const baseName = (p) => String(p || '').split(/[\\/]/).pop();

/** a game library's folder name, as people would say it ("StardewValley" → "Stardew Valley") */
function cleanFolder(raw) {
  let s = String(raw || '').replace(/[™®©]/g, '').replace(/_+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!s || NOT_GAMES.test(s)) return '';
  const known = FOLDERS[s.toLowerCase()];
  if (known) return known;
  // one word in CamelCase: its words apart
  if (!/\s/.test(s)) s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
  s = s.replace(/\s+(beta|demo|playtest|x64|64-?bit|win64)$/i, '').trim();
  // all in lower case (a folder named "terraria"): capitals where the words start
  if (s === s.toLowerCase()) s = s.replace(/(^|\s)(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  return NOT_GAMES.test(s) ? '' : clip(s, LIMITS.game);
}

/** Minecraft: Java Edition runs in Java, so it's found by what Java was asked to run (or its window's title) */
function minecraft(proc) {
  const n = exeKey(proc.n || baseName(proc.p));
  if (n !== 'java' && n !== 'javaw') return false;
  const said = [proc.p || '', ...(proc.a || []).slice(0, 80)].join(' ');
  return /net\.minecraft|[\\/.]minecraft|minecraft launcher|4297127D64EC6|org\.prismlauncher\.EntryPoint|org\.multimc\.EntryPoint|com\.moonsworth|lunarclient/i.test(said) || /^(Minecraft\*? ?\d|Lunar Client|Badlion|Feather)/.test(proc.t || '');
}

/**
 * The game one running program is, if any: { name, sure } (sure: from the list of well-known games; otherwise
 * from the library folder it runs from). A program is { n: its name, p: its path, a: its command line (Linux),
 * t: its window's title (Java on Windows) }.
 */
function gameOf(proc) {
  if (!proc) return null;
  const where = [proc.p || '', ...(proc.a || []).slice(0, 40)].join('\n');
  if (minecraft(proc)) return { name: 'Minecraft', sure: true };
  // by name: the program, and on Linux what it was started as (a Wine game's Windows program)
  const names = [proc.n, baseName(proc.p), proc.a && proc.a[0] && baseName(proc.a[0])].filter(Boolean).map(exeKey);
  if (names.some((n) => NOT_PLAYING.test(n))) return null;
  for (const n of names) {
    const known = GAMES.get(n);
    if (!known) continue;
    for (const [re, name] of REFINE) if (re.test(where)) return { name, sure: true };
    return { name: known, sure: true };
  }
  // by folder: the first library folder in its path or command line that's a game
  for (const re of LIBRARIES) {
    re.lastIndex = 0;
    for (let m; (m = re.exec(where)); ) {
      const name = cleanFolder(m[1]);
      if (name) return { name, sure: false };
    }
  }
  return null;
}

/** the game being played, from everything running: a well-known one first, and the one already said if it's still on */
function pickGame(procs, previous) {
  let best = null;
  for (const p of procs || []) {
    const g = gameOf(p);
    if (!g) continue;
    if (previous && g.name === previous) return previous;
    if (!best || (g.sure && !best.sure)) best = g;
  }
  return best ? best.name : null;
}

/** Windows' tasklist (when PowerShell can't run): just the programs' names */
function parseTasklist(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const m = /^"([^"]+)"/.exec(line.trim());
    if (m) out.push({ n: m[1] });
  }
  return out;
}

// ---- music -------------------------------------------------------------------------------------------------------

/*
 * Who's playing: music apps, video players (music only when they're clearly playing music), browsers (a song on
 * YouTube Music, SoundCloud or a music video, but last in line), and apps whose sounds aren't songs at all.
 * Matched against Windows' app id or a Linux player's name and its own name for itself.
 */
const APPS = [
  [/budgie|discord|slack|teams|zoom|telegram|whatsapp|signal|element|skype|vesktop|webcord/, '', 'skip'],
  [/netflix|disney|primevideo|prime video|hulu|crunchyroll|twitch|appletv|apple tv|max\.com/, '', 'skip'],
  [/ncspot|spotify_player|spotifyd|spotube|psst|spotify/, 'Spotify', 'music'],
  [/zunemusic/, 'Media Player', 'music'],
  [/applemusic|itunes/, 'Apple Music', 'music'],
  [/tidal/, 'TIDAL', 'music'],
  [/deezer/, 'Deezer', 'music'],
  [/amazon.?music/, 'Amazon Music', 'music'],
  [/youtube.?music|ytmdesktop|ytmusic|th-ch\.youtube/, 'YouTube Music', 'music'],
  [/soundcloud/, 'SoundCloud', 'music'],
  [/qobuz/, 'Qobuz', 'music'],
  [/pandora/, 'Pandora', 'music'],
  [/foobar2000/, 'foobar2000', 'music'],
  [/musicbee/, 'MusicBee', 'music'],
  [/aimp/, 'AIMP', 'music'],
  [/winamp/, 'Winamp', 'music'],
  [/mediamonkey/, 'MediaMonkey', 'music'],
  [/dopamine/, 'Dopamine', 'music'],
  [/cider/, 'Cider', 'music'],
  [/plexamp/, 'Plexamp', 'music'],
  [/audirvana/, 'Audirvana', 'music'],
  [/rhythmbox/, 'Rhythmbox', 'music'],
  [/elisa/, 'Elisa', 'music'],
  [/strawberry/, 'Strawberry', 'music'],
  [/clementine/, 'Clementine', 'music'],
  [/audacious/, 'Audacious', 'music'],
  [/lollypop/, 'Lollypop', 'music'],
  [/amberol/, 'Amberol', 'music'],
  [/tauon/, 'Tauon', 'music'],
  [/quodlibet|quod libet/, 'Quod Libet', 'music'],
  [/deadbeef/, 'DeaDBeeF', 'music'],
  [/gnomemusic|gnome-music|gnome music/, 'GNOME Music', 'music'],
  [/\b(cmus|mpd|mopidy|juk|kew|roon)\b|cantata|g4music|gapless|harmonoid|musikcube|feishin|sonixd|sublime-music|nuclear|termusic|museeks|fooyin/, '', 'music'],
  [/vlc/, 'VLC', 'video'],
  [/\bmpv\b/, 'mpv', 'video'],
  [/celluloid|totem|showtime|smplayer|haruna|kodi|mplayer|dragonplayer|clapper|mpc-hc|mpc-be|potplayer|zunevideo|plex|jellyfin|kmplayer|\bgom\b/, '', 'video'],
  [/firefox|librewolf|waterfox|floorp|^[0-9a-f]{16}$/, 'Firefox', 'browser'], // Firefox's Windows app id is a code like 308046B0AF4A39CB
  [/msedge|microsoft.?edge/, 'Edge', 'browser'],
  [/google.?chrome|^chrome\b/, 'Chrome', 'browser'],
  [/chromium/, 'Chromium', 'browser'],
  [/brave/, 'Brave', 'browser'],
  [/vivaldi/, 'Vivaldi', 'browser'],
  [/opera/, 'Opera', 'browser'],
  [/epiphany|gnome web/, 'Web', 'browser'],
  [/plasma-browser-integration|falkon|qutebrowser|midori|thorium|zen browser|\barc\b/, '', 'browser'],
];
// a browser's song can say which site it's on (Linux players may give its address)
const SITES = [
  [/(^|\.)music\.youtube\.com$/, 'YouTube Music', 'music'],
  [/(^|\.)open\.spotify\.com$/, 'Spotify', 'music'],
  [/(^|\.)soundcloud\.com$/, 'SoundCloud', 'music'],
  [/(^|\.)bandcamp\.com$/, 'Bandcamp', 'music'],
  [/(^|\.)deezer\.com$/, 'Deezer', 'music'],
  [/(^|\.)music\.apple\.com$/, 'Apple Music', 'music'],
  [/(^|\.)tidal\.com$/, 'TIDAL', 'music'],
  [/(^|\.)music\.amazon\./, 'Amazon Music', 'music'],
  [/(^|\.)(netflix|twitch|disneyplus|primevideo|hulu|crunchyroll|max|vimeo|kick)\.(com|tv)$/, '', 'skip'],
];
const AUDIO_FILE = /\.(mp3|flac|ogg|oga|opus|m4a|aac|wav|wma|alac|aiff?|ape|wv|mka|dsf|dff)(\?|$)/i;
const VIDEO_FILE = /\.(mp4|mkv|webm|avi|mov|m4v|wmv|flv|ts|m2ts|mpe?g)(\?|$)/i;

/** what kind of player an app is, and its name as people know it */
function classify(...ids) {
  for (const id of ids) {
    const s = String(id || '').toLowerCase();
    if (!s) continue;
    for (const [re, name, kind] of APPS) if (re.test(s)) return { name, kind };
  }
  return null;
}
/** a player's own name for itself, if it's one the website can show ("Spotify", not "org.mpris…instance123") */
function niceApp(name) {
  const s = clip(String(name || '').replace(/\s+(media player|music player|music box)$/i, ''), LIMITS.app);
  return /^[\p{L}\p{N}][\p{L}\p{N} .&+'’!-]*$/u.test(s) ? s : '';
}

/** "Song (Official Video)" by "ArtistVEVO" → "Song" by "Artist": what a music video in a browser says, tidied */
function tidyBrowserSong(m) {
  let { title, artist } = m;
  artist = artist.replace(/\s+-\s+Topic$/i, '').trim();
  const vevo = /VEVO$/.test(artist);
  if (vevo) artist = artist.replace(/VEVO$/, '').trim();
  const split = /^(.+?)\s+[-–—]\s+(.+)$/.exec(title);
  const letters = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  if (split && (vevo || !artist || letters(artist) === letters(split[1]) || letters(split[1]).startsWith(letters(artist)))) {
    artist = split[1].trim();
    title = split[2].trim();
  }
  title = title
    .replace(/\s*[([](official\s*)?(music\s*)?(video|audio|visuali[sz]er|lyric\s*video|lyrics?|clip officiel|videoclip|mv|m\/v|hd|hq|4k)[)\]]/gi, '')
    .replace(/\s*[([]official[)\]]/gi, '')
    .trim();
  return { ...m, title: title || m.title, artist };
}

/**
 * One player's song as Budgie shows it, or null when it isn't music: { title, artist, album, app, playing, rank }.
 * `p` is { ids: [what names the app], title, artist, album, playing, type (Windows: Music, Video…), url (Linux) }.
 */
function songOf(p) {
  if (!p) return null;
  const app = classify(...p.ids) || { name: '', kind: 'other' };
  let { name, kind } = app;
  if (kind === 'skip') return null;
  let song = { title: clip(p.title, LIMITS.title), artist: clip(p.artist, LIMITS.artist), album: clip(p.album, LIMITS.album) };
  if (!song.title) return null;
  let host = '';
  try {
    host = p.url && /^https?:/i.test(p.url) ? new URL(p.url).hostname.toLowerCase() : '';
  } catch (_) {
    /* not an address */
  }
  if (kind === 'browser' && host) {
    const site = SITES.find(([re]) => re.test(host));
    if (site && site[2] === 'skip') return null;
    if (site) [name, kind] = [site[1], 'music'];
  }
  const type = String(p.type || '').toLowerCase();
  if (type === 'image') return null;
  if (kind === 'video') {
    // a video player playing a song (a tagged file, or one Windows calls music); films and clips aren't
    const audio = type === 'music' || AUDIO_FILE.test(p.url || '') || (!!song.artist && !VIDEO_FILE.test(p.url || '') && type !== 'video');
    if (!audio) return null;
  }
  if (kind === 'browser') {
    song = tidyBrowserSong(song);
    // a browser saying it's a video: only what looks like a music video ("Artist - Song", "(Official Video)")
    if (type === 'video' && !(/\s[-–—]\s/.test(p.title) || /official|lyric|\bmv\b|visuali[sz]er/i.test(p.title) || /VEVO$|- Topic$/.test(p.artist))) return null;
  }
  // a song without anyone singing it is most likely something else (a video, a podcast's ad, the app's own sounds)
  if (!song.artist && kind !== 'music') return null;
  if (/^(advertisement|spotify|spotify free|spotify premium)$/i.test(song.title) && !song.artist) return null;
  const rank = (p.playing ? 100 : 0) + { music: 40, other: 30, video: 20, browser: 10 }[kind] + (song.album ? 2 : 0) + (song.artist ? 1 : 0);
  return { title: song.title, artist: song.artist, album: song.album, app: niceApp(name || p.appName || ''), playing: !!p.playing, rank };
}

const songKey = (m) => (m ? `${m.app}\n${m.title}\n${m.artist}` : '');
/** the song to show, from everything playing: playing before paused, music apps before browsers, and no hopping
 * between two that play at once (the one already said stays) */
function pickSong(players, previous) {
  const songs = (players || []).map(songOf).filter(Boolean);
  if (!songs.length) return null;
  songs.sort((a, b) => b.rank - a.rank);
  const top = songs[0];
  const same = previous && songs.find((s) => songKey(s) === songKey(previous) && s.rank === top.rank);
  const { rank, ...song } = same || top;
  return song;
}

// ---- Windows: the System Media Transport Controls and the programs running, from PowerShell ----------------------

/*
 * Runs in Windows PowerShell 5.1 (every Windows 10 and 11 has it; PowerShell 7 can't reach Windows' own APIs like
 * this). It prints a line of JSON when the music changes (looking every 2.5 seconds, and saying it again every 15),
 * and the programs running every 30 seconds: only this person's, and not Windows' own. Everything that isn't plain
 * ASCII is written as \uXXXX, so song titles survive whatever the console's code page is. It ends itself when Budgie
 * does (or when nobody reads what it writes).
 */
const PS_SCRIPT = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$want = [string]$env:BUDGIE_ACTIVITY
$music = $want.Contains('music')
$games = $want.Contains('games')
$parent = $null
try { $parent = [Diagnostics.Process]::GetProcessById([int]$env:BUDGIE_PARENT) } catch { }
$session = [Diagnostics.Process]::GetCurrentProcess().SessionId
$windows = [string]$env:SystemRoot

function Say([string]$json) {
  $json = [regex]::Replace($json, '[^\x20-\x7e]', { param($c) '\u{0:x4}' -f [int][char]$c.Value })
  try { [Console]::Out.WriteLine($json); [Console]::Out.Flush() } catch { exit }
}

function Wait-Op($op, [Type]$type) {
  $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op))
  if ($task.Wait(2500)) { return $task.Result }
  return $null
}

$mgr = $null
if ($music) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation${'`'}1' } | Select-Object -First 1
    [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType = WindowsRuntime] | Out-Null
    $mgr = Wait-Op ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
  } catch { $mgr = $null }
  if (-not $mgr) { Say '{"media":null,"unavailable":true}' }
}

function Get-Media {
  $list = New-Object System.Collections.ArrayList
  foreach ($s in $mgr.GetSessions()) {
    try {
      $p = $null
      $p = Wait-Op ($s.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      if (-not $p) { continue }
      $info = $s.GetPlaybackInfo()
      [void]$list.Add([ordered]@{ app = [string]$s.SourceAppUserModelId; status = [string]$info.PlaybackStatus; type = [string]$p.PlaybackType; title = [string]$p.Title; artist = [string]$p.Artist; album = [string]$p.AlbumTitle; albumArtist = [string]$p.AlbumArtist })
    } catch { }
  }
  ConvertTo-Json -InputObject @{ media = $list.ToArray() } -Compress -Depth 3
}

function Get-Programs {
  $seen = @{}
  $list = New-Object System.Collections.ArrayList
  foreach ($p in Get-Process) {
    try {
      if ($p.SessionId -ne $session) { continue }
      $path = ''
      try { $path = [string]$p.Path } catch { }
      if ($windows -and $path.StartsWith($windows, [StringComparison]::OrdinalIgnoreCase)) { continue }
      $key = $p.ProcessName + '|' + $path
      if ($seen.ContainsKey($key)) { continue }
      $seen[$key] = 1
      $o = [ordered]@{ n = $p.ProcessName }
      if ($path) { $o.p = $path }
      if ($p.ProcessName -match '^javaw?$') { $o.t = [string]$p.MainWindowTitle }
      [void]$list.Add($o)
    } catch { }
  }
  ConvertTo-Json -InputObject @{ procs = $list.ToArray() } -Compress -Depth 3
}

$lastMedia = ''
$mediaAt = [DateTime]::MinValue
$programsAt = [DateTime]::MinValue
while ($true) {
  if ($parent -and $parent.HasExited) { exit }
  $now = [DateTime]::UtcNow
  if ($mgr) {
    try {
      $m = Get-Media
      if ($m -ne $lastMedia -or ($now - $mediaAt).TotalSeconds -ge 15) { Say $m; $lastMedia = $m; $mediaAt = $now }
    } catch { }
  }
  if ($games -and ($now - $programsAt).TotalSeconds -ge 30) {
    try { Say (Get-Programs) } catch { }
    $programsAt = $now
  }
  Start-Sleep -Milliseconds 2500
}
`;

/** what PowerShell said, as players or programs: { media: [...] } | { procs: [...] } | { unavailable: true } | null */
function parsePsLine(line) {
  let j;
  try {
    j = JSON.parse(String(line || '').trim());
  } catch (_) {
    return null;
  }
  if (!j || typeof j !== 'object') return null;
  if (j.unavailable) return { unavailable: true };
  // PowerShell 5.1 can write a list of one as the one thing alone: either way, a list
  const list = (x) => (Array.isArray(x) ? x : x && typeof x === 'object' ? [x] : []);
  if ('media' in j) return { media: list(j.media).map(smtcPlayer) };
  if ('procs' in j) return { procs: list(j.procs).map((p) => ({ n: String(p.n || ''), p: String(p.p || ''), t: String(p.t || '') })) };
  return null;
}
/** one Windows media session, as songOf() reads players */
function smtcPlayer(s) {
  s = s || {};
  const status = String(s.status || '');
  return {
    ids: [String(s.app || '')],
    title: s.title,
    artist: s.artist || s.albumArtist,
    album: s.album,
    // "Changing" is the moment between two songs: still playing
    playing: status === 'Playing' || status === 'Changing',
    type: s.type,
  };
}

// ---- Linux: MPRIS players over D-Bus (gdbus, or dbus-send), and /proc ------------------------------------------

/**
 * GLib's text for D-Bus values (what `gdbus call` prints), into plain values: tuples and arrays as arrays,
 * dictionaries as objects, variants as what's in them.
 */
function parseGVariant(text) {
  const s = String(text || '');
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const fail = () => {
    throw new Error('GVariant text at ' + i);
  };
  function str() {
    const q = s[i++];
    let out = '';
    while (i < s.length && s[i] !== q) {
      if (s[i] === '\\') {
        const c = s[++i];
        const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', a: '\x07', '\\': '\\', "'": "'", '"': '"' };
        if (c === 'u' || c === 'U') {
          const len = c === 'u' ? 4 : 8;
          out += String.fromCodePoint(parseInt(s.slice(i + 1, i + 1 + len), 16) || 0xfffd);
          i += len + 1;
          continue;
        }
        if (/[0-7]/.test(c)) {
          const m = /^[0-7]{1,3}/.exec(s.slice(i));
          out += String.fromCharCode(parseInt(m[0], 8));
          i += m[0].length;
          continue;
        }
        out += c in simple ? simple[c] : c;
        i++;
        continue;
      }
      out += s[i++];
    }
    if (s[i] !== q) fail();
    i++;
    return out;
  }
  function list(close) {
    const out = [];
    ws();
    if (s[i] === close) {
      i++;
      return out;
    }
    for (;;) {
      out.push(value());
      ws();
      if (s[i] === ',') {
        i++;
        ws();
        if (s[i] === close) {
          i++;
          return out;
        }
        continue;
      }
      if (s[i] === close) {
        i++;
        return out;
      }
      fail();
    }
  }
  function value() {
    ws();
    const c = s[i];
    if (c === '(') return i++, list(')');
    if (c === '[') return i++, list(']');
    if (c === '<') {
      i++;
      const v = value();
      ws();
      if (s[i++] !== '>') fail();
      return v;
    }
    if (c === '{') {
      i++;
      const out = {};
      ws();
      if (s[i] === '}') return i++, out;
      for (;;) {
        const k = value();
        ws();
        if (s[i++] !== ':') fail();
        out[String(k)] = value();
        ws();
        if (s[i] === ',') {
          i++;
          continue;
        }
        if (s[i++] === '}') return out;
        fail();
      }
    }
    if (c === "'" || c === '"') return str();
    if (c === 'b' && (s[i + 1] === "'" || s[i + 1] === '"')) return i++, str();
    if (c === '@') {
      // a type for what follows (an empty list says what it would hold): the value is what matters
      while (i < s.length && !/\s/.test(s[i])) i++;
      return value();
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i));
    if (word) {
      const w = word[0];
      i += w.length;
      if (w === 'true') return true;
      if (w === 'false') return false;
      if (w === 'nothing') return null;
      if (w === 'inf' || w === 'nan') return w === 'inf' ? Infinity : NaN;
      // "uint64 3", "objectpath '/x'", "just 'y'": a type's name, then the value
      return value();
    }
    const num = /^[-+]?(0x[0-9a-fA-F]+|\d+(\.\d*)?([eE][-+]?\d+)?|\.\d+)/.exec(s.slice(i));
    if (num) {
      i += num[0].length;
      return Number(num[0]);
    }
    fail();
  }
  const v = value();
  return v;
}

/**
 * What `dbus-send --print-reply` prints, into plain values (the same shapes as parseGVariant): the reply's values,
 * in a list.
 */
function parseDbusSend(text) {
  const s = String(text || '').replace(/^method return[^\n]*\n/, '');
  let i = 0;
  const ws = () => {
    while (i < s.length && /\s/.test(s[i])) i++;
  };
  const fail = () => {
    throw new Error('dbus-send text at ' + i);
  };
  const take = (re) => {
    const m = re.exec(s.slice(i));
    if (!m) return null;
    i += m[0].length;
    return m;
  };
  function quoted() {
    // dbus-send doesn't escape what's inside: the string ends at the quote that ends its line
    if (s[i] !== '"') fail();
    const end = s.indexOf('"\n', i + 1);
    const stop = end < 0 ? s.lastIndexOf('"') : end;
    if (stop <= i) fail();
    const out = s.slice(i + 1, stop);
    i = stop + 1;
    return out;
  }
  function value() {
    ws();
    if (take(/^variant\b/)) return value();
    if (take(/^(string|object path|signature)\s+/)) return quoted();
    if (take(/^array of bytes\s+/)) {
      if (s[i] === '"') return quoted();
      const m = take(/^\[([^\]]*)\]/);
      return m ? Buffer.from(m[1].trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16))).toString('utf8') : '';
    }
    if (take(/^array\s*\[/)) return items(']');
    if (take(/^struct\s*\{/)) return items('}');
    if (take(/^dict entry\(/)) {
      const k = value();
      const v = value();
      ws();
      if (s[i++] !== ')') fail();
      return { __entry: [k, v] };
    }
    let m = take(/^boolean\s+(true|false)/);
    if (m) return m[1] === 'true';
    m = take(/^(?:u?int(?:16|32|64)|byte|double|unix fd)\s+(\S+)/);
    if (m) return Number(m[1]);
    fail();
  }
  function items(close) {
    const out = [];
    for (;;) {
      ws();
      if (s[i] === close) {
        i++;
        break;
      }
      if (i >= s.length) fail();
      out.push(value());
    }
    // an array of dict entries is a dictionary
    if (out.length && out.every((x) => x && x.__entry)) return Object.fromEntries(out.map((x) => [String(x.__entry[0]), x.__entry[1]]));
    return out;
  }
  const out = [];
  for (ws(); i < s.length; ws()) out.push(value());
  return out;
}

const MPRIS = 'org.mpris.MediaPlayer2.';
/** one MPRIS player's properties (org.mpris.MediaPlayer2.Player), as songOf() reads players */
function mprisPlayer(busName, props, identity) {
  const md = (props && props.Metadata) || {};
  const one = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v);
  const short = String(busName || '').slice(MPRIS.length).replace(/\.instance_?[\d_]+$/, '');
  return {
    ids: [identity, short],
    appName: identity,
    title: one(md['xesam:title']),
    artist: one(md['xesam:artist']) || one(md['xesam:albumArtist']),
    album: one(md['xesam:album']),
    url: one(md['xesam:url']),
    playing: (props && props.PlaybackStatus) === 'Playing',
  };
}

// ---- running it ----------------------------------------------------------------------------------------------------

/**
 * Watches the computer, while it's started: onChange(activity) when what's playing or running changes, and every
 * minute with the same again. start(options) and stop() can be called as often as wanted.
 */
function create({ onChange, log = () => {}, platform = process.platform, ownPid = process.pid, exec = run, procs = null, sh = spawn } = {}) {
  let options = { music: false, games: false };
  let on = false;
  let state = { music: null, game: null };
  let said = '';
  let fresh = { music: false, games: false }; // a first answer for each, so the page isn't told "nothing" too soon
  let goneSince = 0;
  let goneTimer = 0;
  const timers = [];
  let child = null;
  let failures = 0;
  let tasklist = false; // Windows without PowerShell: programs' names from tasklist instead
  const said1 = new Set(); // problems already written down once

  const once = (key, ...what) => {
    if (said1.has(key)) return;
    said1.add(key);
    log(...what);
  };

  function emit(beat) {
    if (!on) return;
    const a = current();
    const sig = JSON.stringify(a);
    if (sig === said && !beat) return;
    said = sig;
    try {
      onChange(a, !!beat);
    } catch (e) {
      log('activity listener', e);
    }
  }
  /** what's playing and running now, as the page hears it */
  function current() {
    return {
      music: options.music && state.music ? { ...state.music } : null,
      game: options.games && state.game ? { name: state.game } : null,
    };
  }
  function ready() {
    return (!options.music || fresh.music) && (!options.games || fresh.games);
  }
  function setMusic(song) {
    fresh.music = true;
    clearTimeout(goneTimer);
    if (!song && state.music) {
      // gone: only once it's been gone a little while (between two songs, players often say nothing)
      if (!goneSince) goneSince = Date.now();
      if (Date.now() - goneSince < GRACE) {
        goneTimer = setTimeout(() => setMusic(null), GRACE - (Date.now() - goneSince) + 50);
        return;
      }
    }
    goneSince = 0;
    state = { ...state, music: song || null };
    if (ready()) emit(false);
  }
  function setGame(name) {
    fresh.games = true;
    state = { ...state, game: name || null };
    if (ready()) emit(false);
  }

  // Linux ----------------------------------------------------------------------------------------------------------
  const UTF8 = Object.assign({}, process.env, { CHARSET: 'UTF-8' });
  let bus = null; // 'gdbus' or 'dbus-send', once one works
  const names = new Map(); // a player's bus name -> its own name for itself
  async function busCall(dest, objectPath, method, args) {
    const tries = bus ? [bus] : ['gdbus', 'dbus-send'];
    for (const tool of tries) {
      const out =
        tool === 'gdbus'
          ? // gdbus writes in the computer's language's character set: asked for UTF-8, titles keep their accents
            await exec('gdbus', ['call', '--session', '--timeout', '2', '--dest', dest, '--object-path', objectPath, '--method', method, ...args], { env: UTF8 })
          : await exec('dbus-send', ['--session', '--print-reply', '--reply-timeout=2000', '--dest=' + dest, objectPath, method, ...args.map((a) => 'string:' + a)]);
      if (out.missing) continue;
      bus = tool;
      if (out.error) return null;
      try {
        const v = tool === 'gdbus' ? parseGVariant(out.text) : parseDbusSend(out.text);
        return Array.isArray(v) ? v[0] : v;
      } catch (e) {
        once('parse:' + tool, 'activity: could not read', tool, e.message);
        return null;
      }
    }
    once('nobus', 'activity: neither gdbus nor dbus-send is here, so music is not found');
    return undefined;
  }
  let polling = false;
  async function linuxMusic() {
    if (polling) return;
    polling = true;
    try {
      const all = await busCall('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus.ListNames', []);
      if (!on || !options.music) return;
      if (!Array.isArray(all)) return setMusic(null);
      const players = all
        .filter((n) => typeof n === 'string' && n.startsWith(MPRIS) && /^[A-Za-z0-9_.-]+$/.test(n) && !/\.playerctld$/.test(n))
        // Budgie's own window (its ringtone, a video in a chat) isn't music someone's listening to
        .filter((n) => !new RegExp(`\\.instance_?${ownPid}$`).test(n))
        .sort()
        .slice(0, 12);
      for (const n of names.keys()) if (!players.includes(n)) names.delete(n);
      const found = await Promise.all(
        players.map(async (n) => {
          const props = await busCall(n, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties.GetAll', ['org.mpris.MediaPlayer2.Player']);
          if (!props || typeof props !== 'object') return null;
          if (!names.has(n)) {
            const id = await busCall(n, '/org/mpris/MediaPlayer2', 'org.freedesktop.DBus.Properties.Get', ['org.mpris.MediaPlayer2', 'Identity']);
            names.set(n, typeof id === 'string' ? id : '');
          }
          return mprisPlayer(n, props, names.get(n));
        })
      );
      if (on && options.music) setMusic(pickSong(found.filter(Boolean), state.music));
    } catch (e) {
      once('linuxMusic', 'activity: music', e);
    } finally {
      polling = false;
    }
  }
  // a player saying its song changed: asked again now, not in up to 12 seconds
  let monitor = null;
  let soon = 0;
  let lastAsk = 0;
  function watchSignals() {
    try {
      monitor = sh(
        'dbus-monitor',
        ['--session', "type='signal',interface='org.freedesktop.DBus.Properties',member='PropertiesChanged',path='/org/mpris/MediaPlayer2'", "type='signal',interface='org.freedesktop.DBus',member='NameOwnerChanged',arg0namespace='org.mpris.MediaPlayer2'"],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      );
    } catch (_) {
      monitor = null;
      return;
    }
    const m = monitor;
    m.on('error', () => {});
    m.on('exit', () => monitor === m && (monitor = null));
    m.stdout.setEncoding('utf8');
    m.stdout.on('data', (chunk) => {
      // only what matters: a song or play/pause, or a player coming or going
      if (!/PlaybackStatus|Metadata|NameOwnerChanged/.test(chunk)) return;
      clearTimeout(soon);
      const wait = Math.max(600, lastAsk + 3000 - Date.now());
      soon = setTimeout(() => {
        lastAsk = Date.now();
        linuxMusic();
      }, wait);
    });
  }
  let scanning = false;
  async function linuxGames() {
    if (scanning) return;
    scanning = true;
    try {
      const list = await (procs || linuxProcs)(ownPid);
      if (on && options.games) setGame(pickGame(list, state.game));
    } catch (e) {
      once('linuxGames', 'activity: games', e);
    } finally {
      scanning = false;
    }
  }

  // Windows --------------------------------------------------------------------------------------------------------
  function startPowerShell() {
    const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const want = [options.music && 'music', options.games && 'games'].filter(Boolean).join(',');
    const began = Date.now();
    let heard = false;
    let ps;
    try {
      ps = sh(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(PS_SCRIPT, 'utf16le').toString('base64')], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: Object.assign({}, process.env, { BUDGIE_ACTIVITY: want, BUDGIE_PARENT: String(ownPid) }),
      });
    } catch (e) {
      return psGone(e, began, false);
    }
    child = ps;
    ps.on('error', (e) => psGone(e, began, heard, ps));
    ps.on('exit', (code) => psGone(code, began, heard, ps));
    readline.createInterface({ input: ps.stdout }).on('line', (line) => {
      if (child !== ps) return;
      heard = true;
      const said = parsePsLine(line);
      if (!said) return;
      if (said.unavailable) {
        once('smtc', 'activity: this Windows has no media controls to ask (Windows 10 1809 or newer has)');
        setMusic(null);
      } else if (said.media) setMusic(pickSong(said.media, state.music));
      else if (said.procs) setGame(pickGame(said.procs, state.game));
    });
  }
  function psGone(why, began, heard, ps) {
    if (ps && child !== ps) return;
    child = null;
    if (!on) return;
    log('activity: PowerShell stopped', why && why.message ? why.message : why);
    // it ends now and then (Windows updates, a sleep); it starts again, more slowly each time it keeps failing
    failures = heard && Date.now() - began > 60000 ? 0 : failures + 1;
    if (!heard && failures >= 3) {
      // a computer that won't run PowerShell: no music, and programs' names from tasklist
      tasklist = true;
      once('tasklist', 'activity: using tasklist, without music');
      setMusic(null);
      return startTasklist();
    }
    const t = setTimeout(() => on && !child && startPowerShell(), Math.min(10 * 60000, 5000 * 2 ** failures));
    timers.push(t);
  }
  async function tasklistGames() {
    const out = await exec('tasklist', ['/fo', 'csv', '/nh']);
    if (on && options.games && !out.error && !out.missing) setGame(pickGame(parseTasklist(out.text), state.game));
  }
  function startTasklist() {
    if (!options.games) return;
    tasklistGames();
    timers.push(setInterval(tasklistGames, GAMES_EVERY));
  }

  // both -----------------------------------------------------------------------------------------------------------
  function begin() {
    fresh = { music: false, games: false };
    said = '';
    if (platform === 'win32') {
      if (tasklist) startTasklist();
      else startPowerShell();
    } else if (platform === 'linux') {
      if (options.music) {
        linuxMusic();
        timers.push(setInterval(linuxMusic, MUSIC_EVERY));
        watchSignals();
      }
      if (options.games) {
        linuxGames();
        timers.push(setInterval(linuxGames, GAMES_EVERY));
      }
    } else {
      // elsewhere (a Mac running this for testing): nothing to find
      fresh = { music: true, games: true };
      emit(false);
    }
    timers.push(setInterval(() => ready() && emit(true), HEARTBEAT));
  }
  function end() {
    for (const t of timers.splice(0)) clearTimeout(t), clearInterval(t);
    clearTimeout(goneTimer);
    clearTimeout(soon);
    goneSince = 0;
    for (const c of [child, monitor]) {
      try {
        if (c) c.kill();
      } catch (_) {
        /* already gone */
      }
    }
    child = null;
    monitor = null;
  }

  return {
    /** starts watching for what options ask ({ music, games }), or changes what it watches */
    start(o) {
      const next = { music: !!(o && o.music), games: !!(o && o.games) };
      if (!next.music && !next.games) return this.stop();
      if (on && next.music === options.music && next.games === options.games) return;
      const was = on;
      end();
      options = next;
      on = true;
      // what's no longer watched is no longer said
      if (!next.music) state = { ...state, music: null };
      if (!next.games) state = { ...state, game: null };
      if (was) emit(false);
      begin();
    },
    stop() {
      if (!on) return;
      end();
      on = false;
      options = { music: false, games: false };
      state = { music: null, game: null };
      said = '';
    },
    /** what's playing and running, as last found ({ music: null, game: null } while stopped) */
    current,
    /** true once the first look has been had (until then, nothing found means not looked yet) */
    ready: () => on && ready(),
    get running() {
      return on;
    },
  };
}

/** runs a program: its output, or { missing } when it isn't installed, or { error } */
function run(cmd, args, { timeout = 4000, env } = {}) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, env, maxBuffer: 1024 * 1024, windowsHide: true, encoding: 'utf8' }, (err, stdout) => {
      if (err && err.code === 'ENOENT') return resolve({ missing: true });
      if (err) return resolve({ error: err });
      resolve({ text: stdout });
    });
  });
}

/** the programs this person is running on Linux: { n: name, p: path, a: command line } (never anyone else's) */
async function linuxProcs(ownPid) {
  const uid = typeof process.getuid === 'function' ? process.getuid() : -1;
  const pids = (await fsp.readdir('/proc')).filter((d) => /^\d+$/.test(d) && d !== String(ownPid));
  const out = [];
  // a few at a time: a computer runs hundreds of processes, and this should never be noticed
  for (let k = 0; k < pids.length; k += 64) {
    await Promise.all(
      pids.slice(k, k + 64).map(async (pid) => {
        try {
          const st = await fsp.stat('/proc/' + pid);
          if (uid >= 0 && st.uid !== uid) return;
          const [exe, cmd] = await Promise.all([fsp.readlink(`/proc/${pid}/exe`).catch(() => ''), fsp.readFile(`/proc/${pid}/cmdline`, 'utf8').catch(() => '')]);
          const a = cmd.split('\0').filter(Boolean).slice(0, 80);
          if (!exe && !a.length) return;
          const p = exe.replace(/ \(deleted\)$/, '');
          out.push({ n: baseName(p), p, a });
        } catch (_) {
          /* it ended meanwhile */
        }
      })
    );
  }
  return out;
}

module.exports = {
  create,
  // for the tests
  GAMES,
  exeKey,
  cleanFolder,
  gameOf,
  pickGame,
  parseTasklist,
  songOf,
  pickSong,
  tidyBrowserSong,
  parsePsLine,
  smtcPlayer,
  parseGVariant,
  parseDbusSend,
  mprisPlayer,
  linuxProcs,
  PS_SCRIPT,
};
