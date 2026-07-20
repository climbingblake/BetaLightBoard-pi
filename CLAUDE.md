# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Web-based controller for a NeoPixel LED climbing training board. Runs on a Raspberry Pi 5, served over the local network. Stack: FastAPI + SQLAlchemy 2 + SQLite backend; React + TypeScript + Vite + Tailwind CSS frontend. Built frontend output is committed to `app/static/` and served by FastAPI.

## Commands

### Backend (local dev)
```bash
LED_SIMULATE=1 uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend (local dev)
```bash
cd frontend && npm install && npm run dev
# Vite proxies /api → localhost:8000
```

### Build frontend (must commit output)
```bash
make build   # or: cd frontend && npm run build
# Output goes to app/static/ — commit it with source changes
```

### Lint frontend
```bash
cd frontend && npm run lint  # oxlint
```

### Database migrations
```bash
make migrate                    # alembic upgrade head
make migrate-new msg="my msg"   # autogenerate a new migration
```

### Pi deployment
```bash
# After build + commit + push, use the Settings page "Pull & Restart" button.
# No SSH needed for normal deploys.

make install-service  # one-time systemd setup on Pi
make logs             # stream journalctl
```

## Architecture

### Schema management (important quirk)
`init_db()` in `app/main.py` is the live source of truth — it calls `create_all` then `_reconcile_columns()` on every startup to add new columns to existing tables. Alembic migrations exist as a formal record but are **not run automatically**. On a fresh DB, initialize with:
```bash
python3 -c "from app.main import init_db; init_db()"
python3 -m alembic stamp head
```
When adding a new column, add it to the model AND add an entry to the `additions` list in `_reconcile_columns()` with optional backfill SQL.

### Backend layout
- `app/main.py` — FastAPI app, lifespan, `init_db`, router registration, SPA catch-all
- `app/models.py` — SQLAlchemy ORM models: `User`, `Problem`, `Led`, `Route`, `RouteHold`, `Setting`, `Attempt`, `Send`, `Favorite`, `Rating`, `Session`, `SessionItem`
- `app/auth.py` — JWT helpers (`create_access_token`, `get_current_user`, `get_admin_user`), bcrypt password hashing; auth stored in an httponly cookie
- `app/led_controller.py` — NeoPixel control via SPI (GPIO10/MOSI); falls back to simulate mode when `LED_SIMULATE=1` or on non-Pi hardware; exposes `AnimationController` and `RouteAnimationController` run in background threads
- `app/database.py` — engine, `SessionLocal`, `get_db` dependency
- `app/stats.py` — shared query helpers for aggregate stats (ascents, attempts, send rate)
- `app/routers/` — one file per resource: `problems`, `leds`, `routes`, `routines`, `settings`, `system`, `auth`, `attempts`, `sends`, `favorites`, `ratings`, `sessions`, `backup`, `dashboard`

### Frontend layout
- `frontend/src/api.ts` — single API client with typed interfaces; all requests go to `/api` with `credentials: "include"` for cookie auth
- `frontend/src/store/useAuth.ts` — React context + hook for auth state (login/logout/register, wraps `api.auth`)
- `frontend/src/store/useProblemStore.ts` — Zustand store for problem CRUD and LED state (used by editor pages)
- `frontend/src/pages/` — one file per route; board interaction pages: `ProblemEditor`, `RouteEditor`, `SessionRunner`
- `frontend/src/components/BoardGrid.tsx` — shared LED grid component used across editor pages
- `frontend/src/lib/` — shared utilities

### Board hardware
- 20 cols × 10 rows = 200 LEDs, serpentine layout (even rows L→R, odd rows R→L)
- `address_to_pos(row, col)` in `led_controller.py` maps grid coordinates to strip index
- LED colors stored as named strings (e.g. `"blue"`, `"green"`) and resolved to RGB tuples via `COLORS` dict
- `adafruit-circuitpython-neopixel` and `adafruit-blinka` are **not** in `requirements.txt` — install manually on Pi only

### Key data relationships
- `Problem` → `Led[]` (holds positions + color for a bouldering problem)
- `Route` → `RouteHold[]` (ordered sequence of holds; shown progressively during playback)
- `Session` → `SessionItem[]` (ordered list of problems or routes for a training session)
- `Attempt`, `Send`, `Favorite`, `Rating` target either a `Problem` or `Route` (enforced by CHECK constraint)
- All users are authenticated; `is_admin` gate on user management and certain settings
