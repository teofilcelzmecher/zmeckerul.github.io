#!/usr/bin/env bash
# Installs Budgie's server on Arch Linux. Run it from the copy of the repository in /opt/nook:
#
#   sudo git clone https://github.com/teofilcelzmecher/nook-early-access-website /opt/nook
#   sudo /opt/nook/server/install.sh
#
# Safe to run again: it updates what's there and keeps the database.
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run me with sudo:  sudo $0"
  exit 1
fi

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${NOOK_PORT:-8787}"
ORIGINS="${NOOK_ORIGINS:-https://teofilcelzmecher.github.io}"
DATA=/var/lib/nook

if [[ "$REPO" == /home/* ]]; then
  echo "Budgie's code is in your home folder ($REPO), which the server can't read."
  echo "Put it in /opt/nook instead:"
  echo "  sudo git clone https://github.com/teofilcelzmecher/nook-early-access-website /opt/nook"
  echo "  sudo /opt/nook/server/install.sh"
  exit 1
fi

step() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

step "Installing Node.js, SQLite and Tailscale"
pacman -S --needed --noconfirm nodejs sqlite tailscale git
if ! node -e 'require("node:sqlite")' 2>/dev/null; then
  echo "This Node.js ($(node --version)) is too old: Budgie needs 22.5 or newer. Run: sudo pacman -Syu"
  exit 1
fi
NODE="$(command -v node)"

step "Creating the nook user and its data folder ($DATA)"
id nook &>/dev/null || useradd --system --home-dir "$DATA" --shell /usr/bin/nologin nook
install -d -o nook -g nook -m 750 "$DATA" "$DATA/backups"
chmod -R a+rX "$REPO"

step "Installing the nook service"
cat > /etc/systemd/system/nook.service <<EOF
[Unit]
Description=Budgie server
After=network-online.target
Wants=network-online.target

[Service]
User=nook
Group=nook
Environment=NOOK_DATA=$DATA
Environment=NOOK_PORT=$PORT
Environment=NOOK_ORIGINS=$ORIGINS
ExecStart=$NODE --disable-warning=ExperimentalWarning $REPO/server/server.js
Restart=always
RestartSec=3
MemoryMax=512M
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$DATA
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
RestrictNamespaces=yes
RestrictRealtime=yes
LockPersonality=yes
SystemCallArchitectures=native

[Install]
WantedBy=multi-user.target
EOF

step "Nightly backups (kept for 14 days in $DATA/backups)"
cat > /usr/local/lib/nook-backup <<EOF
#!/bin/sh
# Copies Budgie's database to $DATA/backups once a day and keeps the last 14 days.
set -e
file="$DATA/backups/nook-\$(date +%F).db"
[ -e "\$file" ] || NOOK_DATA=$DATA $NODE --disable-warning=ExperimentalWarning $REPO/server/cli.js backup "\$file"
find "$DATA/backups" -name 'nook-*.db' -mtime +14 -delete
EOF
chmod 755 /usr/local/lib/nook-backup
cat > /etc/systemd/system/nook-backup.service <<EOF
[Unit]
Description=Back up Budgie's database

[Service]
Type=oneshot
User=nook
Group=nook
ExecStart=/usr/local/lib/nook-backup
EOF
cat > /etc/systemd/system/nook-backup.timer <<EOF
[Unit]
Description=Back up Budgie's database every night

[Timer]
OnCalendar=*-*-* 03:30:00
Persistent=true

[Install]
WantedBy=timers.target
EOF

step "The nook command (invites, bans, backups, updates)"
cat > /usr/local/bin/nook <<EOF
#!/bin/sh
# Budgie's admin command. Try: sudo nook help
[ "\$(id -u)" -eq 0 ] || exec sudo "\$0" "\$@"
case "\$1" in
  update) cd $REPO && git pull --ff-only && chmod -R a+rX $REPO && systemctl restart nook && echo "Budgie is updated and restarted." ; exit ;;
  logs) exec journalctl -u nook -f ;;
  status) exec systemctl status nook ;;
  restart) systemctl restart nook && echo "Restarted." ; exit ;;
esac
cd $DATA && exec runuser -u nook -- env NOOK_DATA=$DATA $NODE --disable-warning=ExperimentalWarning $REPO/server/cli.js "\$@"
EOF
chmod 755 /usr/local/bin/nook

step "Keeping the laptop awake (it's a server now)"
install -d /etc/systemd/logind.conf.d
cat > /etc/systemd/logind.conf.d/nook-server.conf <<'EOF'
# Budgie runs on this laptop: closing the lid must not put it to sleep
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
EOF
systemctl mask --quiet sleep.target suspend.target hibernate.target hybrid-sleep.target
timedatectl set-ntp true || true

step "Starting everything"
systemctl daemon-reload
systemctl enable --now nook.service nook-backup.timer tailscaled.service
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null; then
  echo "Budgie's server is running on this laptop (port $PORT)."
else
  echo "The server didn't answer. See what went wrong with:  ${SUDO_USER:+sudo }nook logs"
  exit 1
fi

# logged in as root there may be no sudo at all, so it's only shown when this ran with sudo
S="${SUDO_USER:+sudo }"
cat <<EOF

Next, put it on the internet with Tailscale Funnel (free, no router changes):

  1. ${S}tailscale up --qr
       Scan the QR code with your phone and sign in (make a free account if you need one).
  2. ${S}tailscale funnel --bg $PORT
       If it asks you to enable HTTPS or Funnel, open the link it prints, click Enable, and run it again.
       It ends by printing your server's address, like https://your-laptop.tail1234.ts.net
  3. Send that address to whoever updates the app, so the app knows where its server is.

Then make invite codes (each works once; the old test-version codes don't work here):

  ${S}nook invite 1 "for me"     (sign up with it in the app, then:)
  ${S}nook admin YOUR_USERNAME   (you get the Moderation page and every report)
  ${S}nook invite 8 "friends"    (new codes to send your friends)

Closing the lid now keeps the laptop running (fully after the next reboot). Keep it plugged in.
EOF
