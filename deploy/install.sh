#!/bin/sh
# Installs the automatic updater. Run as root: sh install.sh [user]
set -eu

user=${1:-deploy}
ref=${EV_REF:-main}
base="https://raw.githubusercontent.com/noahtrr/ev-dashboard/$ref/deploy"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

for f in ev-dashboard-update ev-dashboard-deploy ev-dashboard-update.service ev-dashboard-update.timer; do
	curl -fsSL -o "$tmp/$f" "$base/$f"
done

install -m 0755 "$tmp/ev-dashboard-update" /usr/local/bin/ev-dashboard-update
install -m 0755 "$tmp/ev-dashboard-deploy" /usr/local/bin/ev-dashboard-deploy
sed "s/^User=.*/User=$user/" "$tmp/ev-dashboard-update.service" >/etc/systemd/system/ev-dashboard-update.service
install -m 0644 "$tmp/ev-dashboard-update.timer" /etc/systemd/system/ev-dashboard-update.timer

systemctl daemon-reload
systemctl enable --now ev-dashboard-update.timer
echo "installed; check with: systemctl list-timers ev-dashboard-update.timer"
