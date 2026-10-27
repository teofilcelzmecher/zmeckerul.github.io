# Budgie's server

The app used to be called Nook, so on the laptop its command, service, user and folders are still
called `nook`. Only the name people see changed.

Accounts, posts, comments, votes, nests, friends and messages, kept in one SQLite file. It's plain
Node.js (22.5 or newer) with nothing to download from npm, and it uses about 50–80 MB of memory, so
an old laptop is plenty.

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
| `sudo nook invite 3 "for school friends"` | Makes 3 new invite codes |
| `sudo nook invites` | Lists codes, used and unused |
| `sudo nook users` | Lists accounts |
| `sudo nook admin NAME` / `unadmin NAME` | Gives or takes away the Moderation page |
| `sudo nook ban NAME reason…` / `unban NAME` | Bans someone (they're signed out everywhere) |
| `sudo nook reset-password NAME` | Gives someone a temporary password and recovery code |
| `sudo nook remove post ID reason…` | Takes a post down and tells its author why |
| `sudo nook delete-user NAME` | Erases an account (for deletion requests) |
| `sudo nook stats` | How much is stored |
| `sudo nook update` | Gets the latest version from GitHub and restarts |
| `sudo nook status` / `logs` / `restart` | Is it running? What is it saying? Restart it |

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
  `NOOK_ORIGINS` (`https://teofilcelzmecher.github.io`). After changing them:
  `sudo systemctl daemon-reload && sudo systemctl restart nook`.
