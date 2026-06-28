# Plan: Ratings, Stats, Timestamps & Sessions

Date: 2026-06-28
Scope: `Beta Light Board` (FastAPI + SQLAlchemy 2 + SQLite backend, React/TS/Vite/Tailwind frontend)

This plan covers five additions to problems and routes: star ratings, global ascent/attempt stats, created/modified timestamps with sort and filter, and a new admin-managed **Sessions** feature (the workout playlist). No code has been written yet. This is the spec to approve first.

---

## Decisions locked in

- **Ratings** use the guidebook 0-3 whole-star scale. A user may rate an item only after they have logged a send or an attempt on it. One rating per user per item, editable. 0 stars is a valid "not worth it" rating; an item with no submissions shows as "unrated."
- **Stats are global** across all users. Each problem/route shows total ascents, total attempts, and a send rate.
- **Send rate = sends / attempts**, and **logging a send now also records an attempt**, so the ratio is always 0-100%.
- **Sessions** is the new name (avoids collision with the existing LED "Routines"). A session is an ordered, mixed list of problems and routes. Only admins create/edit/reorder them; every user can browse and run them.
- **Session end** shows a finish/summary screen.
- Sort options on both listings: date created (newest/oldest), star rating, ascents / send rate.

---

## 1. Star ratings (0-3)

### Data model
New table `ratings`, following the existing dual-target pattern used by `Attempt`/`Send`/`Favorite`:

- `id`, `user_id` (FK users), `problem_id` (nullable FK), `route_id` (nullable FK), `stars` (int 0-3), `created_at`, `updated_at`.
- `CheckConstraint("(problem_id IS NULL) != (route_id IS NULL)")` for exactly-one-target.
- `CheckConstraint("stars BETWEEN 0 AND 3")`.
- Unique constraint on `(user_id, problem_id)` and `(user_id, route_id)` so a user has at most one rating per item (upsert on submit).

### Gate
A rating POST is rejected with 403 unless the user has at least one `Send` or `Attempt` row for that target. This reuses existing tables, no extra tracking.

### API (`app/routers/ratings.py`, new)
- `POST /api/ratings` — body `{problem_id|route_id, stars}`. Upserts the caller's rating after the gate check. Returns the rating.
- `GET /api/ratings/me?problem_id=|route_id=` — the caller's current rating for an item (or null), so the UI can preselect.
- `DELETE /api/ratings?problem_id=|route_id=` — remove the caller's rating.

Aggregate values (average + count) are not a separate endpoint; they are folded into the problem/route list and detail payloads (see §2) to avoid N+1 client calls.

### Frontend
- Add a `RatingStars` component (read-only display mode + interactive input mode) under `frontend/src/components`.
- Display mode renders the average as partial-fill stars out of 3 with the count, e.g. `★★☆ 2.3 (8)`; "unrated" when count is 0.
- Interactive mode lives in `ActivityPanel` (shared by `ProblemEditor` and `RouteShow`). It is shown only when the gate is satisfied (the panel already loads the user's sends and attempts, so it knows). Otherwise show a muted hint: "Log an attempt or send to rate."
- `api.ts`: add `ratings.get / set / clear`.

---

## 2. Global ascent / attempt stats

### Definitions
- **Ascents** = total `Send` count for the item across all users.
- **Attempts** = total `Attempt` count across all users (which now includes the auto-attempt created with each send, see §3).
- **Send rate** = `ascents / attempts`, rendered as a percentage. When `attempts == 0`, show `—`.

### Backend
Extend `ProblemOut` and `RouteOut` with `rating_avg: float | null`, `rating_count: int`, `ascents: int`, `attempts: int`. Compute these with grouped aggregate subqueries in `list_problems`, `get_problem`, and the equivalent route handlers, rather than per-row queries, to keep the listing fast on the Pi.

### Frontend
- `ProblemList` cards and `RouteList` rows gain a stats line: star display, `N ascents`, and `send rate %`.
- Detail views (`ProblemEditor`/`RouteShow`) show the same stats near the title.

---

## 3. Send implies attempt

In `app/routers/sends.py`, `log_send` will also insert an `Attempt` for the same user/target in the same transaction. This makes the send rate meaningful and bounded at 100%.

Note on existing data: historical sends predate this change and have no paired attempt, so their send rate will read slightly high until new activity accumulates. I will not backfill unless you want it (a one-line migration could create a matching attempt for every existing send; flag if desired).

---

## 4. Created / modified timestamps, sort & filter

### Data model
- `Problem` and `Route` already have `created_at`. Add `updated_at` (DateTime, default now, `onupdate=datetime.utcnow`) to both.
- `updated_at` bumps on field edits (PUT) and on hold/LED add/remove/clear so "modified" reflects real changes to the layout, not just metadata.

### Backend sort/filter
`list_problems` and `list_routes` gain a `sort` query param accepting: `created_desc` (default), `created_asc`, `rating_desc`, `ascents_desc`, `send_rate_desc`. Implemented as ordering over the aggregate subqueries from §2.

Filters: problems keep the existing `grade` and `setter` filters. **Routes have no grade/setter fields**, so they instead get a `q` name search param. Both expose `created_at` and `updated_at` in their payloads.

### Frontend
- `ProblemList`: add a Sort dropdown alongside the existing Grade/Setter filters.
- `RouteList`: add Sort dropdown + a name search box (it currently has no controls).
- Both cards show a small "modified" relative date.

Note: you selected created/rating/ascents for sorting and did not pick "date modified" as a sort key, so modified is displayed but not in the sort dropdown. It is trivial to add later if you change your mind.

---

## 5. Sessions (admin-managed workout playlists)

### Data model
Two new tables:

`sessions`
- `id`, `name`, `description` (nullable), `created_by` (FK users), `created_at`, `updated_at`.

`session_items`
- `id`, `session_id` (FK, cascade delete), `position` (int, contiguous order), `problem_id` (nullable FK), `route_id` (nullable FK).
- `CheckConstraint("(problem_id IS NULL) != (route_id IS NULL)")`.
- Relationship ordered by `position`.

### API (`app/routers/sessions.py`, new)
Reads are open to any logged-in user; writes require admin (reuse the admin check pattern from the auth router).

- `GET /api/sessions` — list all (id, name, item count).
- `GET /api/sessions/{id}` — full session with ordered items, each item carrying enough of the problem/route (name, grade, hold count) to render the runner.
- `POST /api/sessions` (admin) — create.
- `PUT /api/sessions/{id}` (admin) — rename/describe.
- `DELETE /api/sessions/{id}` (admin).
- `POST /api/sessions/{id}/items` (admin) — add `{problem_id|route_id}` at end.
- `DELETE /api/sessions/{id}/items/{item_id}` (admin).
- `PUT /api/sessions/{id}/items/order` (admin) — body `{ordered_ids: [...]}`, rewrites `position`.

### Frontend
New pages and a nav link "Sessions":

- `SessionList` (`/sessions`) — lists sessions; admins see New/Edit/Delete, everyone sees Run.
- `SessionEditor` (`/sessions/:id/edit`, admin only) — add problems/routes via a picker, remove, and **reorder via drag-and-drop** (persisted through the order endpoint).
- `SessionRunner` (`/sessions/:id/run`) — the core experience:
  - Shows the current item, its board preview, and progress (item k of n).
  - On entering each item it loads it to the physical board: problems via `POST /problems/{id}/load`, routes via `POST /routes/{id}/play`.
  - Buttons: **Log Attempt** (records, stays), **Log Send** (records send -> auto-records attempt -> auto-advances), **Skip / Next** (advances without logging).
  - After the last item, show a **finish/summary screen** listing what was sent this run, with a Done button that clears the board and returns to the list.
  - Sends/attempts logged here are the running user's own, via the existing endpoints.

`api.ts`: add a `sessions` block mirroring the endpoints above.

---

## Migrations

A single new Alembic revision (the project already uses Alembic; `init_db`'s `create_all` will not alter the existing populated `betalightboard.db`):

1. `ratings` table.
2. `sessions` + `session_items` tables.
3. `ALTER TABLE problems ADD COLUMN updated_at`; same for `routes` (backfill `updated_at = created_at`).

Models in `app/models.py` updated to match, and `main.py` registers the two new routers.

---

## Build order

1. Models + Alembic migration (ratings, sessions, session_items, updated_at). Run migration against the dev DB.
2. Backend: send-implies-attempt; ratings router; aggregate fields + sort/filter on problem/route list and detail; sessions router. Register routers.
3. Frontend types/client (`api.ts`).
4. `RatingStars` + ActivityPanel rating UI; stats on lists and detail.
5. List page sort/filter controls; modified date display.
6. Sessions: list, editor (drag-reorder), runner, nav link.
7. Build frontend into `app/static`; smoke-test the API with curl and the UI in the browser. Verify gate logic, send-rate math, reorder persistence, and runner auto-advance.

## Open items / things I'd flag

- **Backfill of historical sends -> attempts?** Default is no. Say the word if you want past sends to count as attempts retroactively.
- **Rating display granularity**: average shown to one decimal with partial-fill stars. Fine?
- **Runner board behavior for routes**: routes "play" as an animation. During a session I'll start the route playing on entry; the user can re-play from the runner if needed. Confirm that matches how you'd use it.
