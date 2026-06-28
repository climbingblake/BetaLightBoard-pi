# Remote access with Tailscale

Tailscale puts the Pi on a private, encrypted mesh network (a "tailnet") so you
can reach the board from another network without port forwarding or exposing
anything to the public internet. The board stays reachable on your LAN exactly
as before; this just adds a second, private path in.

## Install

On the Pi (over SSH or directly):

```bash
cd /home/pi/BetaLightBoard-pi
sudo ./scripts/setup-tailscale.sh
```

The script installs Tailscale (if missing), enables the `tailscaled` service so
it survives reboots, and runs `tailscale up`. With no auth key it prints a login
URL — open it in any browser and sign in to authorize the Pi on your tailnet.

Defaults: hostname `lightboard`, Tailscale SSH enabled. Override with env vars:

```bash
sudo TS_HOSTNAME=board2 ./scripts/setup-tailscale.sh   # different device name
sudo TS_SSH=0 ./scripts/setup-tailscale.sh             # don't enable Tailscale SSH
```

## Reaching the board

From any device signed into the same tailnet:

- `http://lightboard/` — uses MagicDNS (enable it once under **DNS** in the
  [admin console](https://login.tailscale.com/admin/dns); on by default for new
  tailnets).
- `http://100.x.y.z/` — the Pi's Tailscale IP, shown by `tailscale ip -4`.

The app still requires login, so this is access *and* auth, not just a tunnel.

## SSH

Two independent options:

- **Regular SSH** keeps working over the Tailscale IP: `ssh pi@100.x.y.z`. You
  manage keys/passwords on the Pi as usual.
- **Tailscale SSH** (enabled by the script's default) lets you `ssh pi@lightboard`
  with access governed by your Tailscale identity and ACLs in the admin console —
  no SSH keys to distribute or rotate, and access is revocable centrally. It only
  applies to connections that arrive over Tailscale.

## Re-flashing the Pi (unattended)

Generate a [reusable auth key](https://login.tailscale.com/admin/settings/keys)
and pass it so the Pi joins without a browser step:

```bash
sudo TS_AUTHKEY=tskey-auth-xxxxxxxx ./scripts/setup-tailscale.sh
```

## Useful commands

```bash
tailscale status        # devices on the tailnet and connection state
tailscale ip -4         # this Pi's Tailscale IP
sudo tailscale down     # leave the tailnet (LAN access unaffected)
sudo tailscale up       # rejoin
```

## Notes

- LAN access is unchanged. If you later want the board reachable *only* over the
  tailnet, that's a firewall change (restrict port 80 to the `tailscale0`
  interface) — ask and we can add it.
- `tailscaled` runs alongside the `betalightboard` service; they don't interact.
