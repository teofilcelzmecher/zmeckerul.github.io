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

   This installs Node.js and Tailscale, creates a `nook` system user, starts Budgie as a service that
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
| `sudo nook invite 3 "for school friends"` | Makes 3 new invite codes |
| `sudo nook invites` | Lists codes, used and unused |
| `sudo nook users` | Lists accounts |
| `sudo nook admin NAME` / `unadmin NAME` | Gives or takes away the Moderation page |
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

## Automatic checks

Everything posted or sent is checked on this laptop before it's saved; nothing is sent anywhere else.

- **Word lists** (`js/moderation.js`, the same as in the app): slurs, threats, sexual requests, adult
  links, scams, spam.
- **Pictures** (`pictures.js`): two small image models look at every picture, banner and GIF for nudity.
  They ship in `vendor/` and load a few seconds after the server starts. If they can't run, pictures
  are refused until they can.
- **Text** (`textmodel.js`): a small AI model reads posts, comments, bios, nests and messages for
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
