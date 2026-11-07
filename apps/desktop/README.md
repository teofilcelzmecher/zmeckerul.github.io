# Budgie for Windows and Linux

Budgie in a window of its own, for Windows 10 and 11 and for Linux (x64 and ARM). Its screens are budgiesocial.com's,
as they are, so the app is always the newest Budgie: a change to the website reaches the app at once, with nothing to
install. Around the website, the app adds what a computer can do:

- **Calls ring, always.** Closing the window keeps Budgie running in the tray, and it starts with the computer (in
  the tray, without a window), so a call rings even when nobody has opened it: a small window pops up over everything
  in the corner of the screen, with Answer and Decline, as the ringtone plays. Starting with the computer can be
  turned off from the tray icon; **Quit Budgie** there (or Ctrl+Q) stops it.
- **Notifications** for new messages, group messages, replies and the rest of the inbox, while Budgie isn't in front.
  A click opens what it's about.
- **Unread**: a count on the taskbar button (Windows) or in the dock (Linux, where the dock supports it), and a dot on
  the tray icon.
- **Sharing a screen**: a picker for a screen or a window, and on Windows the computer's sound with it (everything the
  computer plays, the call included).
- **What's playing** (Budgie 1.4): the song the computer is playing and the game it's running show on your Budgie
  profile, in chats and in your friends' lists as "Listening to" and "Playing", for the people you choose
  (Settings → Activity on the website). Music comes from the computer's own media controls (what the media keys and
  the volume overlay use), so Spotify, Apple Music, TIDAL, foobar2000, VLC, Rhythmbox, YouTube Music in a browser and
  most other players work; music apps come before a video in a browser, and films, streams and calls are left out.
  Games are found by about 240 well-known games' programs (Minecraft, Roblox, Fortnite, Valorant, CS2, League,
  Genshin, Elden Ring, Baldur's Gate 3…) and by anything running from a Steam, Epic, GOG, Riot, EA, Ubisoft, Xbox,
  Heroic or itch library (Proton and Wine games too), named after its folder. It's on unless turned off: in Settings
  → Activity (music and games apart), or **Share what I'm playing** in the tray, which also shows what Budgie sees
  right now. The first time something is shown, the app says so once.
- **The rest**: right-click to cut, copy, paste and fix spelling (Windows' own spelling); links to other sites open in
  the browser; no ads; the window remembers its size and place; a page that says so when there's no internet.
- **A newer app?** The app checks GitHub twice a day and says so once (the tray then has a link).

The app's own words (tray menu, ringing window, picker, offline page) are in Budgie's six languages, following the
language the website is in.

## How it's made

[Electron](https://www.electronjs.org) 44: Chromium, so calls and screen sharing work as in Chrome, on every Linux.

| File | What it does |
|---|---|
| `main.js` | the window, the tray, starting with the computer, the ringing window, notifications, the screen picker, permissions, links |
| `preload.js` | the only thing the website sees of the app: `window.BUDGIE_DESKTOP` (notify, unread count, language, what's playing), and it notices a call ringing in the page |
| `activity.js` | what's playing and running: the media controls (Windows) or MPRIS (Linux), and the games among the programs running |
| `desktop.js` | run inside the website by the app: turns new messages and inbox items into notifications, counts unread, keeps checking while the window is closed |
| `pages/` | the app's own small pages: the ringing window, the screen picker, the offline page |
| `strings.js` | the app's own words in six languages |
| `tools/make-icons.js` | the icons, drawn from the design system (Playwright) |
| `tools/aur.py` | the Arch User Repository package (PKGBUILD and .SRCINFO) for a release |
| `test/` | tests for `activity.js` (`npm test`), with answers recorded from D-Bus |

### What's playing, in detail

No native modules: only what the computer already has.

- **Windows 10 (1809 or newer) and 11**: one hidden Windows PowerShell 5.1 runs for as long as sharing is on. It asks
  the System Media Transport Controls (`GlobalSystemMediaTransportControlsSessionManager`) every 2.5 seconds and prints
  a line of JSON when the music changes (and every 15 seconds), and lists this person's programs (`Get-Process`, not
  Windows' own) every 30 seconds. It ends itself when Budgie does. If PowerShell can't run, games come from
  `tasklist` and music isn't found.
- **Linux**: every MPRIS player on the session bus (`gdbus`, or `dbus-send`), every 12 seconds and at once when a
  player says its song changed (`dbus-monitor`); this person's programs from `/proc/*/exe` and their command lines,
  every 30 seconds.
- **To the website**: `BUDGIE_DESKTOP.onActivity(cb)` gives `{ music: { title, artist, album, app, playing } | null,
  game: { name } | null }` when it changes and every minute; `activityOptions()` and `setActivityOptions({ music,
  games })` read and change what may be shared (kept in the app's `settings.json`); `onActivityOptions(cb)` hears
  changes made from the tray. Nothing is looked for until the website asks, nor while sharing is off; after the page
  goes, looking stops within 15 seconds.

Only a song's title, artist, album and player's name, and a game's name, ever leave `activity.js` — never paths,
other programs or anything else about the computer — and only to Budgie's page, which posts them to Budgie when
someone is signed in. The app sends nothing anywhere itself.

The website knows nothing about the app except that it shows no ads inside it (`nook/js/ads.js`) and doesn't offer
it for download there (`nook/js/views.js`).

Security: the website runs sandboxed, with context isolation and no Node.js; the app's windows only show
budgiesocial.com and its own pages (anything else opens in the browser); the website may use the microphone, camera,
screen sharing, notifications and full screen, and nothing else; only budgiesocial.com's own page hears what's
playing.

## Try it

```sh
cd apps/desktop
npm install
npm start                               # the real website
BUDGIE_SITE=http://localhost:8790/ npm start   # a Budgie running on your own computer
npm test                                # what's playing and running: the parts that read Windows' and Linux's answers
```

## Releases

`.github/workflows/desktop.yml` builds everything on GitHub's machines on each push that changes `apps/desktop`:

| | File |
|---|---|
| Windows 10 and 11 (installs for one person, no administrator) | `Budgie-Setup.exe` |
| Debian, Ubuntu, Linux Mint, Pop!_OS, Zorin, elementary | `budgie-social-amd64.deb`, `budgie-social-arm64.deb` |
| Fedora, openSUSE, Nobara | `budgie-social-x86_64.rpm`, `budgie-social-aarch64.rpm` |
| Arch, Manjaro, EndeavourOS, CachyOS | `budgie-social-x64.pacman`, `budgie-social-aarch64.pacman`, and the AUR |
| Any Linux | `Budgie-x86_64.AppImage`, `Budgie-arm64.AppImage`, `budgie-social-x64.tar.gz`, `budgie-social-arm64.tar.gz` |

When `version` in `package.json` hasn't been released yet, it publishes them as the release `desktop-v<version>`,
with the AUR files and every file's checksum. budgiesocial.com/download.html links to the newest release's files, so
the links never change. A release is never changed afterwards: for a new app, raise the version.

The Linux package is called **budgie-social** (its command too), because `budgie` is already the name of a Linux
desktop (Budgie Desktop, as in Ubuntu Budgie).

## The Arch User Repository (once)

Arch people expect `yay -S budgie-social-bin`. To put Budgie there (an AUR account is free):

1. Make an account on [aur.archlinux.org](https://aur.archlinux.org) and add your SSH public key in *My Account*.
2. From the newest release, download `PKGBUILD` and `SRCINFO`.
3. `git clone ssh://aur@aur.archlinux.org/budgie-social-bin.git`, copy `PKGBUILD` in, and `SRCINFO` in as
   `.SRCINFO`; then `git add PKGBUILD .SRCINFO && git commit -m "Budgie 1.3.0" && git push`.

For each later release, do steps 2 and 3 again (the clone is already there). Then add the AUR line back to the
download page.

## Windows' warning

The installer isn't signed with a code-signing certificate yet, so Windows SmartScreen says *Windows protected your
PC* (More info → Run anyway) until enough people have installed it. The ways to lose the warning: publish Budgie in
the Microsoft Store (Microsoft signs it; it needs a Partner Center account), or a certificate (Azure Trusted Signing, or a certificate from a certificate
authority, both paid).
