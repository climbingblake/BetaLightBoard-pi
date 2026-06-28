#!/usr/bin/env bash
#
# Service entrypoint for the Beta Light Board.
#
# The systemd unit points here (not directly at uvicorn) so the whole startup
# sequence lives in the repo and ships via `git pull` / the in-app update button.
# After the unit is installed once, future changes to how the app boots —
# dependency installs, migration steps, flags — deploy with no SSH needed.
#
# Runs on every service start: reboot, `systemctl restart`, and the update
# button (which restarts the service). Schema migrations are handled inside the
# app at startup (init_db reconciles columns), so this script only needs to keep
# Python dependencies current and then launch the server.

set -u

APP_DIR="/home/pi/BetaLightBoard-pi"
VENV="$APP_DIR/.venv"

cd "$APP_DIR" || exit 1

# Install/upgrade dependencies. Non-fatal on purpose: if the board is offline,
# pip will fail and we still boot with whatever is already installed rather than
# leaving the service dead (this box may have no SSH for recovery).
if [ -f "$VENV/bin/pip" ]; then
  "$VENV/bin/pip" install -q -r requirements.txt \
    || echo "start.sh: dependency install skipped or failed (offline?); booting with existing packages"
fi

exec "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 80 --workers 1
