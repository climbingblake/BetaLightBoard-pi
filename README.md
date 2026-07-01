# Beta Light Board

Web-based controller for a NeoPixel LED climbing training board. Runs on a Raspberry Pi 5, served over the local network, accessed from a tablet or browser.

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, SQLite
- **Frontend:** React + TypeScript + Vite + Tailwind CSS (built output committed to `app/static/`)
- **LED control:** adafruit-circuitpython-neopixel via SPI (GPIO10 / MOSI pin)
- **Board:** 20 cols × 10 rows = 200 LEDs, serpentine layout

---

## Raspberry Pi 5 — Fresh Setup

### 1. OS

Flash **Raspberry Pi OS Lite (64-bit)** using Raspberry Pi Imager. In the imager's advanced settings, set hostname, enable SSH, and configure WiFi before flashing.

### 2. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3-pip python3-venv liblgpio-dev swig python3-dev
```

### 3. Enable SPI

```bash
sudo raspi-config
# Interface Options → SPI → Enable
sudo reboot
```

SPI is required for NeoPixel control via adafruit-blinka on the Pi 5's RP1 GPIO chip. The older `rpi_ws281x` library does **not** work on Pi 5.

### 4. Clone the repo

```bash
cd /home/pi
git clone https://github.com/climbingblake/BetaLightBoard-pi.git
cd BetaLightBoard-pi
```

### 5. Python environment

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install adafruit-circuitpython-neopixel adafruit-blinka lgpio
```

> `adafruit-circuitpython-neopixel` and `adafruit-blinka` are kept out of `requirements.txt` since they only install cleanly on the Pi. Install them manually as above.

### 6. Database

The app builds its own schema at startup (`init_db` in `app/main.py`, via
SQLAlchemy `create_all` + column reconciliation) — this is the live source of
truth, not Alembic. On a fresh DB, run `alembic upgrade head` first and it
will fail (`no such table: problems`) because no migration creates the base
tables, they only exist via `create_all`.

Initialize the schema directly instead:

```bash
python3 -c "from app.main import init_db; init_db()"
python3 -m alembic stamp head
```

`init_db()` creates all tables and reconciles columns. `alembic stamp head`
marks the DB as current without running any migrations, since they'd just
duplicate what `init_db()` already did. You don't need to touch Alembic again
after this, see "Deploying updates" below, schema changes reconcile
automatically on every restart.

### 7. systemd service

```bash
sudo cp betalightboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable betalightboard
sudo systemctl start betalightboard
```

Or use the Makefile shortcut: `make install-service`

Check status: `sudo systemctl status betalightboard`
Stream logs: `sudo journalctl -u betalightboard -f` (or `make logs`)

The service runs as root (required for port 80 and GPIO access).

### 8. Verify

Open a browser on the local network: `http://<pi-ip>/`

---

## LED wiring

- Data line: GPIO 10 (MOSI, physical pin 19)
- No level shifter required for 5V strips when testing, but a 74AHCT125 is recommended for production
- Power: 5V strips drawing up to 60mA/LED at full white. For a 200-LED strip inject power at multiple points — every 10–15 feet as home runs back to the PSU
- Strip color order: **RGB** (not GRB) — already configured in `led_controller.py`

---

## Local development (Mac)

```bash
# Backend (simulated LEDs)
LED_SIMULATE=1 uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Frontend dev server (separate terminal)
cd frontend && npm install && npm run dev
```

The Vite dev server proxies `/api` to `localhost:8000`.

---

## Deploying updates

Build the frontend on Mac, commit, push, then use the **Pull & Restart** button in the Settings page:

```bash
cd frontend && npm run build
cd .. && git add -A && git commit -m "your message" && git push
```

The Pi pulls and restarts automatically — **no SSH required**, including for schema
changes and new dependencies:

- **Dependencies** install on every start via `scripts/start.sh` (the service
  entrypoint), so a pushed `requirements.txt` change is picked up on the next
  restart or reboot. The install is non-fatal: if the board is offline it boots
  with whatever is already installed instead of failing.
- **Schema** is reconciled in the app at startup (`init_db`): missing columns are
  added and owner-less items are backfilled. Alembic migrations remain the formal
  record but you do not need to run them by hand on the Pi.
- **A reboot** does the same as the button: deps install, schema reconciles, app
  starts.

One-time step to adopt the self-updating entrypoint: after pulling the commit that
adds `scripts/start.sh`, reinstall the unit once (it now points at the script, so
this is the last unit edit you should need):

```bash
cd /home/pi/BetaLightBoard-pi
sudo cp betalightboard.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl restart betalightboard
```

Not handled automatically: OS-level `apt` upgrades, and changes to the systemd
unit itself. Those still need a one-time SSH session.

---

## Project layout

```
app/
  main.py              # FastAPI app, lifespan, router registration
  models.py            # SQLAlchemy ORM models (Problem, Led, Route, RouteHold, Setting)
  led_controller.py    # NeoPixel control, AnimationController, RouteAnimationController
  database.py          # Engine, session, get_db
  routers/
    problems.py        # CRUD + random generate + load to board
    leds.py            # Add / update / delete individual LEDs
    routes.py          # Route CRUD, hold management, play/stop/status
    routines.py        # Named LED animations (rainbow, chase, iceflakes)
    settings.py        # Board dimensions and brightness
    system.py          # Git pull + restart, version endpoint
  static/              # Built React frontend (committed, served by FastAPI)
alembic/               # DB migrations
frontend/              # React source (build output → app/static/)
betalightboard.service # systemd unit file
```
