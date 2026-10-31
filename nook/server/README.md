# Budgie's server

The app used to be called Nook, so on the laptop its command, service, user and folders are still
called `nook`. Only the name people see changed.

Accounts, posts, comments, votes, nests, friends and messages, kept in one SQLite file. It's plain
Node.js (22.5 or newer) with nothing to install from npm: what its automatic checks need comes with it
in `vendor/`. With those loaded it uses about 800 MB of memory, so a laptop with 4 GB is plenty.

It only listens on the laptop itself (127.0.0.1). **Tailscale Funnel** puts it on the internet over
HTTPS: free, no router changes, a fixed address, and your home IP address stays hidden.

## Setting up the laptop (Arch Linux)

Plug the laptop in and connect it to the internet, then open a terminal.

1. **Update the system and get Budgie's code**

   ```sh
   sudo pacman -Syu git
   sudo git clone https://github.com/teofilcelzmecher/nook-early-access-website /opt/nook
   ```

2. **Install the server**

   ```sh
   sudo /opt/nook/server/install.sh
   ```

   This installs Node.js, FFmpeg (for videos) and Tailscale, creates a `nook` system user, starts Budgie as a service that
   restarts by itself (and after a reboot), sets up nightly backups, and stops the laptop sleeping when
   the lid closes. It ends with "Budgie's server is running".

3. **Put it on the internet**

   ```sh
   sudo tailscale up
   ```

   Open the link it prints and sign in. A free Tailscale account is fine. Then:

   ```sh
   sudo tailscale funnel --bg 8787
   ```

   If it says HTTPS or Funnel isn't enabled, open the link it prints, click **Enable**, and run the
   command again. It prints your server's address, something like `https://nook-laptop.tail1234.ts.net`.
   Check it works by opening `https://…ts.net/api/health` in a browser: it should say `"ok":true`.

4. **Connect the app**: the address goes in `js/config.js` of the website (`api: 'https://…ts.net'`).

5. **Make yourself an account and an admin**: sign up in the app, then:

   ```sh
   sudo nook admin YOUR_USERNAME
   ```

   Reload the app and you'll have a **Moderation** page for reports.

Anyone can sign up. If fake accounts ever pile up, switch invite codes back on with
`sudo nook signups invite`, make codes with `sudo nook invite 8 "friends"`, and open up again later
with `sudo nook signups open`. Even when it's open, the server lets only 60 new accounts a hour.

## Everyday commands

| Command | What it does |
|---|---|
| `sudo nook signups open` / `invite` | Anyone can join, or only with an invite code |
| `sudo nook captcha SITE_KEY SECRET_KEY` / `captcha off` | Turns the robot check (Cloudflare Turnstile) on sign-up on or off |
| `sudo nook turn KEY_ID API_TOKEN` / `turn off` | Sends calls through Cloudflare's TURN relay, or back to direct calls (see below). `sudo nook turn` also says how much of the month's allowance is used |
| `sudo nook turn-limit GB` | When calls stop for the month (950 GB unless you change it) |
| `sudo nook turn-usage ACCOUNT_ID TOKEN` / `turn-usage off` | Also checks Cloudflare's own count of the relay's data every hour |
| `sudo nook gifs KLIPY_APP_KEY` / `gifs off` | Turns GIF search in chats on or off (see below) |
| `sudo nook push key.json` / `push paste` / `push off` | Turns notifications on phones (the Android app) on or off (see below) |
| `sudo nook push apple AuthKey.p8 TEAM_ID` / `push apple off` | Turns notifications on iPhone, iPad and Mac on or off (see below) |
| `sudo nook invite 3 "for school friends"` | Makes 3 new invite codes |
| `sudo nook invites` | Lists codes, used and unused |
| `sudo nook users` | Lists accounts |
| `sudo nook admin NAME` / `unadmin NAME` | Gives or takes away the Moderation page |
| `sudo nook dev NAME` / `undev NAME` | Gives or takes away the Developer badge (developers can give people the Tester badge from their profile). u/teofil gets it by itself while it's an admin |
| `sudo nook tester NAME` / `untester NAME` | Gives or takes away the Tester badge |
| `sudo nook rename NAME NEW_NAME` | Changes a username that breaks the rules |
| `sudo nook ban NAME reason…` / `unban NAME` | Bans someone (they're signed out everywhere) |
| `sudo nook reset-password NAME` | Gives someone a temporary password and recovery code |
| `sudo nook remove post ID reason…` | Takes a post down and tells its author why |
| `sudo nook delete-user NAME` | Erases an account (for deletion requests) |
| `sudo nook stats` | How much is stored |
| `sudo nook text-check "some text"` | Is the text model ready? What does it make of this? |
| `sudo nook scan-images` / `scan-text` | Checks everything posted before; doubtful things go to the Moderation page |
| `sudo nook update` | Gets the latest version from GitHub, updates the service's settings and restarts |
| `sudo nook status` / `logs` / `restart` | Is it running? What is it saying? Restart it |

## The robot check on sign-up

Sign-up can make new accounts pass Cloudflare Turnstile first, which stops most bots. Usually it passes
by itself ("Success!"); now and then it asks for a tick. It's free, and it's off until you give the
server a key from Cloudflare (the same account that has budgiesocial.com):

1. Sign in at https://dash.cloudflare.com and open **Turnstile** in the menu, then **Add widget**.
2. Name it Budgie, and add the hostnames `budgiesocial.com`, `www.budgiesocial.com` and
   `teofilcelzmecher.github.io`. Pick the **Managed** widget mode, say no to pre-clearance, and create it.
3. It shows a **Site key** and a **Secret key**. Keep the secret one to yourself.
4. On the laptop:

   ```sh
   sudo nook captcha SITE_KEY SECRET_KEY
   ```

   It checks the secret key with Cloudflare first, and works straight away (no restart, no website
   update). `sudo nook captcha` says whether it's on; `sudo nook captcha off` turns it off.

If Cloudflare can't be reached, nobody can sign up until it's back (people already signed in aren't
affected). The secret key is kept in the database, so treat backups like the database itself.

## Calls, and the optional relay

Friends can call each other, and group chats can have calls of up to six people, with voice or video.
The server only rings people and passes on the short messages devices need to find each other; the
sound and pictures go straight between the devices, encrypted, and never reach the laptop. So calls
cost the laptop almost nothing, and nothing about a call is kept except a line in the chat ("Voice
call · 4 min", "Missed video call").

Out of the box, devices find each other with Cloudflare's free STUN server. That works on most home
and phone networks, but some (school or office Wi-Fi, some mobile networks) block direct calls, and
the people in a direct call can see each other's IP address. Cloudflare's TURN relay fixes both: every
call goes through Cloudflare, connects on any network, and nobody sees anyone else's IP address. The
first 1,000 GB a month are free (then $0.05 per GB; a voice call uses under 0.5 MB a minute, a video
call up to about 11 MB a minute per person):

1. In https://dash.cloudflare.com open **Realtime** → **TURN Server** (it may be under **Calls**),
   and **Create** a TURN key. Name it Budgie.
2. It shows a **Turn Token ID** (the key id) and an **API Token**. Keep the API token to yourself.
3. On the laptop:

   ```sh
   sudo nook turn KEY_ID API_TOKEN
   ```

   It checks them with Cloudflare first and works straight away (no restart). `sudo nook turn` says
   which way calls go; `sudo nook turn off` goes back to direct calls. If Cloudflare can't be reached,
   calls fall back to going direct by themselves.

**So it never costs money,** Budgie counts how much the relay carries each month: every device in a call
reports what it received through the relay, and the server adds it up (with a 10% margin). When the
total reaches 950 GB, every call ends with a message, and nobody can start one until the 1st of the next
month (UTC); messages and everything else carry on. `sudo nook turn` shows the count, and
`sudo nook turn-limit 500` (say) moves the line.

The devices' count is close, but Cloudflare's own is exact. To have the server check it every hour too
(and stop calls if Cloudflare's number is the higher one):

1. In the Cloudflare dashboard, open **Manage account** → **Account API tokens** → **Create token**, and
   make a custom token with one permission: **Account** → **Account Analytics** → **Read**.
2. Your account id is the long code in the dashboard's address (`dash.cloudflare.com/<account id>/…`).
3. On the laptop:

   ```sh
   sudo nook turn-usage ACCOUNT_ID ANALYTICS_TOKEN
   ```

   `sudo nook turn-usage off` stops it.

People can stop anyone from ringing them in Settings → Calls.

## GIF search in chats (KLIPY)

People can always send pictures and GIFs from their own device. To let them search for GIFs too, Budgie
uses KLIPY (Google closed Tenor's API in June 2026). It's free to start:

1. Sign up at https://partner.klipy.com and open **API Keys**. Create a platform (Web) for Budgie, with
   the website https://budgiesocial.com, and copy its **app key**.
2. In **Manage content**, set the content filter as strict as it goes (Budgie also asks for KLIPY's
   strictest filter with every search), and block any search terms you don't want.
3. On the laptop:

   ```sh
   sudo nook gifs YOUR_APP_KEY
   ```

   It checks the key with KLIPY first and works the next time people open Budgie (no restart).
   `sudo nook gifs` says whether it's on; `sudo nook gifs off` turns it off.

While the key is in KLIPY's testing mode, everyone together gets 100 searches an hour. Once it works,
ask for **production access** in the Partner Panel to lift that. KLIPY asks apps to search from the
person's own browser and to load its GIFs from its own links, so the key is handed to the app (it's
meant to be public, like the Turnstile site key) and searches don't touch the laptop.

## Notifications on phones (the Android app)

Budgie's Android app (`apps/android`) can show notifications for messages, calls and the inbox while
it's closed. They go through Google's Firebase Cloud Messaging, which is free. The app asks people
first, and only then sends the server its phone's notification token; the website itself never does.

1. Sign in at https://console.firebase.google.com and **Create a project** called Budgie (Google
   Analytics isn't needed: say no).
2. In the project, **Add app** → **Android**, with the package name `com.budgiesocial.app`. Download
   `google-services.json` and put it in `apps/android/android/app/` before building the app (it's
   kept out of the repository; the GitHub build takes it from a secret, see `apps/android/README.md`).
3. In **Project settings** (the cog) → **Service accounts**, press **Generate new private key**. It
   downloads a JSON file. It's a password to your Firebase project: never share it or put it in the
   repository.
4. On the laptop, either give the server the file:

   ```sh
   sudo nook push ~/Downloads/budgie-firebase-adminsdk.json
   ```

   or run `sudo nook push paste` and paste the file's contents (it's read as soon as it's all there,
   so this works over SSH from a phone too). It checks the key with
   Google first and works straight away (no restart). Then delete the downloaded file: the key is kept
   in the database. `sudo nook push` says whether it's on and how many phones signed up;
   `sudo nook push off` turns it off.

Each phone's token belongs to the sign-in it came from, so signing out (or a sign-in expiring) stops its
notifications. A notification is written in the language the app is in. What someone wrote in a message
is sent as it is, so Google carries it; the Privacy Policy says so.

### iPhone, iPad and Mac

Budgie's Apple app (`apps/apple`) gets its notifications straight from Apple's Push Notification service; no
Firebase is involved. It needs a paid Apple Developer account.

1. On https://developer.apple.com/account open **Certificates, Identifiers & Profiles → Keys → +**. Name it
   Budgie push, tick **Apple Push Notifications service (APNs)** (environment: Sandbox & Production), and
   **Register**. Download the key: a file called `AuthKey_XXXXXXXXXX.p8` (the X's are the key's id). Apple lets you
   download it only once, and it's a password: never share it or put it in the repository.
2. Your **Team ID** is on https://developer.apple.com/account under **Membership details** (10 letters and digits).
3. On the laptop:

   ```sh
   sudo nook push apple ~/Downloads/AuthKey_XXXXXXXXXX.p8 TEAM_ID
   ```

   or `sudo nook push apple paste KEY_ID TEAM_ID` and paste the key's text. It checks the key with Apple first and
   works straight away. `sudo nook push` shows both Android and Apple; `sudo nook push apple off` turns Apple's off.

Test builds from Xcode get their notifications through Apple's test service and TestFlight and App Store builds
through the real one; the app tells the server which, so both work with the same key.

## Automatic checks

Everything posted or sent is checked on this laptop before it's saved; nothing is sent anywhere else.

- **Word lists** (`js/moderation.js`, the same as in the app): slurs, threats, sexual requests, adult
  links, scams, spam.
- **Pictures** (`pictures.js`): two small image models look at every picture, banner and GIF for nudity.
- **Videos** (`video.js`): FFmpeg turns each posted video into a standard MP4 (at most 60 seconds and
  1280 pixels, without the phone's hidden details), and the image models check frames from it. One video
  is prepared at a time. If FFmpeg isn't installed, the app just doesn't offer videos;
  `sudo pacman -S ffmpeg` (or `sudo nook update`, which installs it) fixes that.
  They ship in `vendor/` and load a few seconds after the server starts. If they can't run, pictures
  are refused until they can.
- **Text** (`textmodel.js`): a small AI model reads posts, comments, usernames, bios, nests and messages for
  insults, threats, hate and sexual talk, in many languages. It's about 300 MB, so the server downloads
  it once from Hugging Face into `/var/lib/nook/text-model` (checked against its fingerprint) the first
  time it starts. Until then, or if it can't run, the word lists carry on alone. `sudo nook text-check`
  says whether it's ready, and why not.

What the models are very sure of is refused with a reason; what they're unsure of is posted and shows up
on the Moderation page as "flagged by the automatic check". In private messages, the text model only
stops what it's very sure of, and only flags messages that might be sexual.

The text model needs about 550 MB of memory on top of the rest, so the service may use up to 1.5 GB
(`MemoryMax=1536M`). **Coming from Budgie 0.4.0**, after `sudo nook update` run
`sudo /opt/nook/server/install.sh` once to raise the old 512 MB limit (until then the text model stays
off, and the logs say so). From then on, `sudo nook update` keeps the service's settings up to date
by itself.

In an emergency (say the laptop is running out of memory), `NOOK_TEXT_CHECK=off` or
`NOOK_PICTURE_CHECK=off` in the service's settings turns one off.

## Backups

Every night at 03:30 the database is copied to `/var/lib/nook/backups/` and copies older than 14 days
are deleted. A backup on the same laptop doesn't help if the laptop dies, so now and then copy the
newest one somewhere else, like a USB stick:

```sh
sudo cp /var/lib/nook/backups/nook-$(date +%F).db /run/media/$USER/YOUR_USB/
```

To restore: `sudo systemctl stop nook`, copy the backup over `/var/lib/nook/nook.db`
(and delete `nook.db-wal` and `nook.db-shm` next to it), then `sudo systemctl start nook`.

## Good to know

- **Keep it plugged in and on.** If the laptop is off, Budgie is off too: the app says it can't reach the server.
- **Updates:** run `sudo pacman -Syu` every week or two, and reboot if the kernel updated.
- **Security:** the server answers only the app's own website (`NOOK_ORIGINS`), stores passwords with
  scrypt, keeps only a hash of each sign-in token and recovery code, and enforces the same moderation rules as the app.
- **Your data folder** is `/var/lib/nook`. It holds people's accounts and messages, so keep the laptop's
  login password strong and don't share the laptop.
- **Settings** (in `/etc/systemd/system/nook.service`): `NOOK_PORT` (8787), `NOOK_DATA` (`/var/lib/nook`),
  `NOOK_ORIGINS` (`https://budgiesocial.com`, its `www.` and `https://teofilcelzmecher.github.io`),
  and `NOOK_TEXT_CHECK` / `NOOK_PICTURE_CHECK` (`off` to turn a check off). After changing them:
  `sudo systemctl daemon-reload && sudo systemctl restart nook`.
