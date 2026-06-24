# Beta Light Board — Rebuild Plan

**Stack:** FastAPI + React + TailwindCSS + SQLite on Raspberry Pi 5 (OS Lite)  
**Goal:** Single cohesive Python repo that controls the LED strip directly via GPIO and serves a dark, tablet-optimized web UI for managing climbing problems.

---

## Architecture Overview

```
betalightboard-pi5/
├── app/
│   ├── main.py              # FastAPI app, CORS, static mount
│   ├── database.py          # SQLAlchemy engine + session
│   ├── models.py            # ORM models
│   ├── routers/
│   │   ├── problems.py
│   │   ├── leds.py
│   │   ├── routines.py
│   │   └── settings.py
│   ├── led_controller.py    # rpi_ws281x control + animation thread
│   └── static/              # Built React app (Vite output)
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   └── api/             # API client (fetch wrappers)
│   ├── vite.config.ts
│   └── tailwind.config.ts
├── alembic/                 # DB migrations
├── requirements.txt
└── betalightboard.service   # systemd unit file
```

The FastAPI app serves the React SPA from `/app/static/` and exposes all data/control via a `/api` prefix. No separate frontend server needed in production — Vite builds to `app/static/` and FastAPI serves it.

---

## Database (SQLAlchemy + SQLite)

Direct port of the existing schema with minor cleanup:

```python
# models.py
class Problem(Base):
    id, name, description, setter, grade, created_at

class Led(Base):
    id, problem_id (FK), row, col, rgb
    # Store row/col as integers instead of the "[row,col]" string hack

class Setting(Base):
    key, value
```

**Change from current:** `Led.address` is currently stored as a Ruby array literal string `"[9,0]"` and `eval()`'d everywhere. Replace with two integer columns `row` and `col`. Much cleaner, same data.

**Migrations:** Alembic. Initialize from current SQLite schema or start fresh with seeds.

---

## LED Controller

```python
# led_controller.py
from rpi_ws281x import PixelStrip, Color
import threading

LED_COUNT = 250
LED_PIN = 18       # GPIO18 (PWM) — standard for rpi_ws281x
LED_BRIGHTNESS = 42

strip = PixelStrip(LED_COUNT, LED_PIN, brightness=LED_BRIGHTNESS)
strip.begin()
```

### Address-to-position mapping

Port the serpentine logic from `address_to_pos` in `app.rb`:

```python
def address_to_pos(row: int, col: int, num_cols: int = 10) -> int:
    if row % 2 == 0:
        return col + row * num_cols
    else:
        return (num_cols - 1 - col) + row * num_cols
```

### Color mapping

Fix the GRB/RGB swap from the Arduino sketch (NeoPixels are GRB but the `.ino` has green/red reversed in the color assignments). Map color names to correct RGB tuples:

```python
COLORS = {
    "green":     Color(0, 255, 0),
    "red":       Color(255, 0, 0),
    "blue":      Color(0, 0, 255),
    "purple":    Color(128, 0, 128),
    "white":     Color(255, 255, 255),
    "orange":    Color(255, 165, 0),
    "lightblue": Color(173, 216, 230),
    "off":       Color(0, 0, 0),
}
```

### Animation thread

The Arduino `loop()` pattern becomes a background thread that runs animations non-blocking while the web server handles requests:

```python
class AnimationController:
    def __init__(self):
        self._thread = None
        self._stop_event = threading.Event()
        self.current_routine = None

    def run_routine(self, name: str): ...
    def stop(self): ...
    def _animate(self, name: str): ...  # rainbow, chase, iceflakes loops
```

---

## API Routes

All routes under `/api` prefix. JSON in, JSON out. FastAPI auto-generates OpenAPI docs at `/docs`.

### Problems

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/problems` | List all, supports `?grade=` and `?setter=` filters |
| POST | `/api/problems` | Create |
| GET | `/api/problems/{id}` | Get with LEDs |
| PUT | `/api/problems/{id}` | Update metadata |
| DELETE | `/api/problems/{id}` | Delete + clear board |
| POST | `/api/problems/{id}/load` | Push all LEDs to strip |
| POST | `/api/problems/{id}/clear` | Delete all LEDs + turn off strip |
| GET | `/api/problems/generate` | Random problem generator |
| POST | `/api/problems/save_random` | Save a generated random problem |

### LEDs

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/problems/{id}/leds` | Add LED to problem + light it |
| PUT | `/api/leds/{id}` | Change color + update strip |
| DELETE | `/api/leds/{id}` | Remove LED + turn off pixel |

### Routines

| Method | Path | Action |
|--------|------|--------|
| POST | `/api/routines/{name}` | Start named routine (rainbow, chase, iceflakes) |
| POST | `/api/routines/stop` | Stop current routine, all off |

### Settings

| Method | Path | Action |
|--------|------|--------|
| GET | `/api/settings` | Get all settings |
| PUT | `/api/settings` | Bulk update |

---

## Frontend (React + Vite + TailwindCSS)

### UI Direction

**Dark, minimal, gym-terminal.** Think slate-900 base, slate-800 cards, slate-600 borders. LED colors (green, blue, purple, etc.) pop against the dark background — the board grid itself becomes the color. No decorative chrome.

**Tablet-first layout** (landscape, ~1024px). Primary layout is two-column: board grid left, problem controls/list right.

### Key Views

**1. Board Editor (`/problems/:id`)**  
The centerpiece. A 10x10 interactive grid representing the physical board.  
- Tap a cell to cycle through colors (green → blue → purple → orange → off)
- Active LEDs show their color; inactive are dark slate
- Top bar: problem name, grade, setter, save button
- Side panel: color palette picker, "Load to Board" button, "Clear" button

**2. Problem List (`/`)**  
Card grid of all problems. Filter by grade and setter.  
- Each card: name, grade, setter, LED count, load/edit/delete actions
- FAB or top-right button for "New Problem" and "Random Generate"

**3. Random Generator (`/generate`)**  
Sliders for hand hold count and foot hold count, generates a random layout and lights the board immediately. "Save Problem" to persist it.

**4. Settings (`/settings`)**  
Simple form: grid dimensions, brightness, board connection. Rarely touched.

### Tech Decisions

- **Vite** — build tooling, fast HMR in dev
- **React Router** — client-side routing
- **TailwindCSS** — utility-first, no component library needed at this scale
- **fetch** — no Axios, keep deps minimal. Wrap in a small `api.ts` module.
- **Zustand** — lightweight state for current problem / board LED state (no Redux overhead)

---

## Pi5 Setup

### OS

Raspberry Pi OS Lite 64-bit. Headless, SSH only.

### GPIO / rpi_ws281x

`rpi_ws281x` requires either root or specific permissions. Use a systemd service running as root, or configure `/dev/mem` permissions. Root is simpler for a single-purpose device.

```
sudo pip install rpi_ws281x
```

Connect the data line to **GPIO 18** (hardware PWM). Level-shift from Pi's 3.3V logic to 5V for the NeoPixel strip — a simple 74AHCT125 buffer works.

### Production Server

```
uvicorn app.main:app --host 0.0.0.0 --port 80 --workers 1
```

Single worker only — the animation thread and LED strip are process-global state. Multiple workers would conflict.

### systemd Service

```ini
# /etc/systemd/system/betalightboard.service
[Unit]
Description=Beta Light Board
After=network.target

[Service]
User=root
WorkingDirectory=/home/blake/betalightboard-pi5
ExecStart=/usr/bin/uvicorn app.main:app --host 0.0.0.0 --port 80 --workers 1
Restart=always

[Install]
WantedBy=multi-user.target
```

Enable with `systemctl enable betalightboard && systemctl start betalightboard`.

### Dev Workflow

Run Vite dev server on your Mac, proxy `/api` calls to the Pi's IP. Iterate on frontend locally, push changes to Pi when ready. Pi runs the FastAPI backend in dev mode with `--reload` during active development.

---

## Build Phases

### Phase 1 — Backend Foundation
- FastAPI app scaffold, SQLAlchemy models, Alembic migrations
- Seed data from existing SQLite db
- All API routes implemented and tested (curl / `/docs`)
- LED controller module with direct pixel control and animation thread
- Verified working on Pi5 hardware

### Phase 2 — Frontend Core
- Vite + React + Tailwind scaffold
- Problem list page
- Board editor with interactive grid
- API client module wired up end-to-end

### Phase 3 — Feature Parity
- Random problem generator
- Routine controls (rainbow, chase, iceflakes)
- Settings page
- Problem filtering by grade/setter

### Phase 4 — Polish
- Tablet layout tuning
- Loading states and error handling
- Brightness control
- Production build pipeline (Vite → `app/static/`)
- systemd service, autostart on boot

---

## Open Questions

- **Hold library:** The existing schema has `holds` and `holds_problems` tables that aren't used in the app yet. Worth implementing a named-hold system where you tag physical holds on your board by position, then reference them in problems? Punting to a future phase.
- **Auth:** Currently no auth. Fine for a home gym. If this ever goes multi-user, add simple HTTP basic auth or a single shared PIN via FastAPI middleware.
- **WebSockets:** Real-time board state sync (e.g., two people editing the same problem) would use FastAPI's native WebSocket support. Not needed now but easy to add later.
