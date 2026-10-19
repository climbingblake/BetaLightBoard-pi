# Beta Light Board

Web-based controller for a NeoPixel LED climbing training board, served over the local network and accessed from a tablet or browser.

This is the **`pizero` branch**: it targets a Raspberry Pi Zero W or Zero 2 W running Raspberry Pi OS Lite. `main` targets a Raspberry Pi 5 (setup steps for it are kept below).

## Stack

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, SQLite
- **Frontend:** React + TypeScript + Vite + Tailwind CSS (built output committed to `app/static/`)
- **LED control:** adafruit-circuitpython-neopixel (rpi_ws281x, PWM on GPIO18). The Pi 5 build used a different pin and driver path.
- **Board:** 20 cols × 10 rows = 200 LEDs, serpentine layout

---

## Raspberry Pi Zero / Zero 2 W: Fresh Setup (this branch)

Not yet tested on hardware. Run `scripts/bench_frames.py` first (step 7).

### 1. OS

Flash **Raspberry Pi OS Lite** with Raspberry Pi Imager. In the advanced settings set the hostname, enable SSH, configure Wi-Fi (2.4 GHz only on both Zeros), and create the user `pi`; `betalightboard.service`, `scripts/start.sh` and `app/routers/system.py` assume `/home/pi/BetaLightBoard-pi`.

- **Zero W** (ARMv6, one core): use the **32-bit** image.
- **Zero 2 W** (quad Cortex-A53): the **64-bit** image is the easy path, since every dependency has an aarch64 wheel on PyPI. 32-bit also works.

### 2. System packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git python3-pip python3-venv python3-dev build-essential
```

`python3-dev` and `build-essential` are only needed if pip has to compile `rpi_ws281x`.

### 3. Disable onboard audio

PWM LED output conflicts with the analog audio block. Add this to `/boot/firmware/config.txt` (`/boot/config.txt` on older images), then reboot:

```
dtparam=audio=off
```

SPI is not needed with the default pin.

### 4. Clone and install

```bash
cd /home/pi
git clone https://github.com/climbingblake/BetaLightBoard-pi.git
cd BetaLightBoard-pi
git switch pizero
python3 -m venv .venv
source .venv/bin/activate
pip config list   # should show extra-index-url=https://www.piwheels.org/simple
pip install --only-binary=:all: -r requirements.txt
pip install rpi_ws281x adafruit-circuitpython-neopixel adafruit-blinka
```

On the **Zero W** there is no ARMv6 wheel for `pydantic-core` or `bcrypt` on PyPI, so the install depends on [piwheels](https://www.piwheels.org), which Raspberry Pi OS enables by default. Do not let pip build these from source on a 512 MB board; `--only-binary=:all:` makes it fail fast instead. If a pinned version has no piwheels build, install the newest version piwheels does have.

### 5. Database and service

Same as steps 6 (Database) and 7 (systemd service) of the Pi 5 setup below. The service runs as root, which `rpi_ws281x` requires.

### 6. Wiring

- Data line: **GPIO18** (physical pin 12), ground on pin 14. To use another pin set `LED_PIN` in the service environment: `D12` (GPIO12, pin 32), `D10` (SPI MOSI, pin 19, needs SPI enabled) or `D21` (PCM, pin 40). Blinka does not support other pins on pre-Pi 5 boards.
- A 74AHCT125 level shifter (3.3 V to 5 V) is recommended for production.
- Power the strip separately and inject power along the run, as described under "LED wiring" below.

### 7. Check CPU headroom

```bash
LED_SIMULATE=1 .venv/bin/python scripts/bench_frames.py
```

Prints compute time per frame for each routine and the share of one core it would use. It excludes the NeoPixel library's own cost, so treat anything near 50% as too tight. Expect login to be slow on the Zero W because bcrypt runs at cost 12.

---

## Raspberry Pi 5 — Fresh Setup (main branch)

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

- Data line: GPIO 18 on this branch (physical pin 12, ground on pin 14). The Pi 5 build on `main` uses GPIO 13 (pin 33, ground on pin 34). Set `LED_PIN` to use a different Blinka pin name
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
