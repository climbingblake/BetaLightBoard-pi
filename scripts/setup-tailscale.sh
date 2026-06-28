#!/usr/bin/env bash
#
# Install Tailscale on the Pi and join it to your tailnet, so the board is
# reachable (and SSH-able) from anywhere over an encrypted WireGuard mesh —
# no port forwarding, no exposing port 80 to the internet.
#
# Safe to re-run: installs only if missing, then (re)applies `tailscale up`.
# The board keeps working on the LAN exactly as before; this only adds a
# second, private way in.
#
# Usage (run on the Pi):
#   sudo ./scripts/setup-tailscale.sh                       # interactive login, Tailscale SSH on
#   sudo TS_HOSTNAME=lightboard ./scripts/setup-tailscale.sh
#   sudo TS_SSH=0 ./scripts/setup-tailscale.sh              # skip Tailscale SSH
#   sudo TS_AUTHKEY=tskey-auth-xxxx ./scripts/setup-tailscale.sh   # unattended (re-flash)
#
set -euo pipefail

TS_HOSTNAME="${TS_HOSTNAME:-lightboard}"
TS_SSH="${TS_SSH:-1}"

if [[ $EUID -ne 0 ]]; then
  echo "Please run with sudo." >&2
  exit 1
fi

if ! command -v tailscale >/dev/null 2>&1; then
  echo "Installing Tailscale..."
  curl -fsSL https://tailscale.com/install.sh | sh
else
  echo "Tailscale already installed: $(tailscale version | head -1)"
fi

# The installer adds and starts the tailscaled systemd unit; make sure it is
# enabled so it survives reboots.
systemctl enable --now tailscaled

up_args=( --hostname="$TS_HOSTNAME" )
[[ "$TS_SSH" == "1" ]] && up_args+=( --ssh )
[[ -n "${TS_AUTHKEY:-}" ]] && up_args+=( --authkey="$TS_AUTHKEY" )

echo "Running: tailscale up ${up_args[*]}"
# Without an auth key this prints a login URL; open it in any browser to
# authorize this device on your tailnet.
tailscale up "${up_args[@]}"

ts_ip="$(tailscale ip -4 2>/dev/null | head -1 || true)"

echo
echo "Tailscale is up."
[[ -n "$ts_ip" ]] && echo "  Tailscale IP : $ts_ip"
echo "  Hostname     : $TS_HOSTNAME"
[[ "$TS_SSH" == "1" ]] && echo "  Tailscale SSH: enabled (ssh ${SUDO_USER:-pi}@$TS_HOSTNAME)"
echo
echo "Reach the board from any device on your tailnet:"
echo "  http://$TS_HOSTNAME/        (needs MagicDNS enabled in the admin console)"
[[ -n "$ts_ip" ]] && echo "  http://$ts_ip/"
