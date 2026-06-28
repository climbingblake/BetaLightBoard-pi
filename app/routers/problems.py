import random as rnd
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Problem, Led, Setting, User
from app.auth import get_current_user, require_can_edit
from app import led_controller as leds
from app import stats as stats_mod

router = APIRouter(prefix="/api/problems", tags=["problems"])

VGRADES = [f"V{i}" for i in range(16)]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class LedOut(BaseModel):
    id: int
    row: int
    col: int
    rgb: str

    model_config = {"from_attributes": True}


class ProblemOut(BaseModel):
    id: int
    name: str
    description: str | None
    setter: str | None
    grade: str | None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime | None = None
    leds: list[LedOut] = []
    rating_avg: float | None = None
    rating_count: int = 0
    ascents: int = 0
    attempts: int = 0
    send_rate: float | None = None

    model_config = {"from_attributes": True}


def _problem_out(p: Problem, st: dict) -> ProblemOut:
    out = ProblemOut.model_validate(p)
    out.rating_avg = st["rating_avg"]
    out.rating_count = st["rating_count"]
    out.ascents = st["ascents"]
    out.attempts = st["attempts"]
    out.send_rate = st["send_rate"]
    return out


class ProblemIn(BaseModel):
    name: str = ""
    description: str | None = None
    setter: str | None = None
    grade: str | None = None


class RandomLedIn(BaseModel):
    row: int
    col: int
    rgb: str


class SaveRandomIn(BaseModel):
    name: str = "Random Problem"
    leds: list[RandomLedIn]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _num_cols(db: Session) -> int:
    s = db.query(Setting).filter(Setting.key == "NUMB_COLS").first()
    return int(s.value) if s else 20


def _num_rows(db: Session) -> int:
    s = db.query(Setting).filter(Setting.key == "NUMB_ROWS").first()
    return int(s.value) if s else 10


def _load_problem_to_board(problem: Problem, num_cols: int):
    leds.all_off()
    for led in problem.leds:
        leds.set_led(led.row, led.col, led.rgb, num_cols)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@router.get("", response_model=list[ProblemOut])
def list_problems(
    grade: str | None = None,
    setter: str | None = None,
    sort: str = "created_desc",
    db: Session = Depends(get_db),
):
    q = db.query(Problem)
    if grade and grade != "ALL":
        q = q.filter(Problem.grade.ilike(grade))
    if setter and setter != "ALL":
        q = q.filter(Problem.setter.ilike(setter))
    problems = q.all()

    stats = stats_mod.compute_stats(db, "problem_id")
    default = {"ascents": 0, "attempts": 0, "send_rate": None, "rating_avg": None, "rating_count": 0}
    pairs = [(p, stats.get(p.id, default)) for p in problems]

    key, reverse = stats_mod.sort_key(sort if sort in stats_mod.SORTS else "created_desc")
    pairs.sort(key=key, reverse=reverse)
    return [_problem_out(p, st) for p, st in pairs]


@router.post("", response_model=ProblemOut, status_code=201)
def create_problem(
    body: ProblemIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    problem = Problem(**body.model_dump(), created_by=current_user.id, created_at=datetime.utcnow())
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return _problem_out(problem, stats_mod.stats_for(db, "problem_id", problem.id))


# Max per-axis distance between consecutive holds (Chebyshev "3 holds apart").
REACH = 3
FOOT_SPREAD = REACH + 2  # feet wander wider than the reach limit


def _build_random_problem(num_rows: int, num_cols: int, hands: int, feet: int) -> list[Led]:
    """Generate a bottom-to-top problem as a reachable chain of holds.

    Row 0 is the top. A problem starts 3-4 rows up from the bottom and climbs to
    the top (row 0 or 1). Consecutive hand holds stay within REACH on each axis;
    a zero vertical step is a sideways move. Feet hang below the lower hand holds
    with wide lateral variance and are always fewer than the hands.
    """
    used: set[tuple[int, int]] = set()

    def free(row: int, col: int) -> bool:
        return 0 <= row < num_rows and 0 <= col < num_cols and (row, col) not in used

    def place(row: int, col: int, rgb: str) -> Led:
        used.add((row, col))
        return Led(row=row, col=col, rgb=rgb, problem_id=0)

    holds: list[Led] = []

    # --- start: 3rd or 4th row from the bottom, 1 or 2 holds ---
    start_row = max(1, min(num_rows - rnd.choice([3, 4]), num_rows - 1))
    start_col = rnd.randint(0, num_cols - 1)
    holds.append(place(start_row, start_col, "green"))
    if rnd.random() < 0.5:
        for _ in range(20):
            c2 = start_col + rnd.randint(-REACH, REACH)
            if c2 != start_col and free(start_row, c2):
                holds.append(place(start_row, c2, "green"))
                break

    # --- finish: top row 90% of the time, second row otherwise ---
    finish_row = min(0 if rnd.random() < 0.9 else 1, start_row - 1)
    span = start_row - finish_row  # rows to climb (> 0)

    # Honor the requested count, but guarantee the top is reachable in <=REACH steps.
    min_hands = -(-span // REACH)  # ceil(span / REACH)
    hands = max(hands, min_hands, 1)

    # Spread the climb across `hands` upward segments (each 0..REACH) summing to
    # span. Distributing one row at a time yields varied steps and occasional
    # zeros (sideways moves).
    steps = [0] * hands
    for _ in range(span):
        candidates = [i for i in range(hands) if steps[i] < REACH]
        steps[rnd.choice(candidates)] += 1

    # --- hand chain from the start anchor up to the finish ---
    prev_row, prev_col = start_row, start_col
    hdir = rnd.choice([-1, 1])  # lateral momentum, so the route snakes and spreads
    for i, up in enumerate(steps):
        new_row = prev_row - up
        is_finish = i == len(steps) - 1

        lo, hi = max(0, prev_col - REACH), min(num_cols - 1, prev_col + REACH)
        in_reach = [c for c in range(lo, hi + 1)
                    if free(new_row, c) and not (up == 0 and c == prev_col)]
        if in_reach:
            forward = [c for c in in_reach if (c - prev_col) * hdir >= 0]
            if up == 0:
                # sideways: step out in the momentum direction to avoid clustering
                pool = forward or in_reach
                new_col = max(pool, key=lambda c: abs(c - prev_col))
            else:
                new_col = rnd.choice(forward or in_reach)
            if new_col != prev_col:
                hdir = 1 if new_col > prev_col else -1
        elif is_finish:
            # Guarantee a finish hold exists even if the reach window is full.
            anywhere = [c for c in range(num_cols) if free(new_row, c)]
            if not anywhere:
                continue
            new_col = min(anywhere, key=lambda c: abs(c - prev_col))
        else:
            continue  # crowded row, no in-reach spot; leave the chain a hold shorter

        holds.append(place(new_row, new_col, "red" if is_finish else "blue"))
        prev_row, prev_col = new_row, new_col

    # --- feet: fewer than hands, with one guaranteed below the start ---
    start_cols = [h.col for h in holds if h.rgb == "green"]
    hand_holds = [h for h in holds if h.rgb in ("blue", "red")]
    n_feet = max(0, min(feet, len(hand_holds) - 1))
    placed = 0

    # Mandatory: at least one foot just below the start, on the bottom or
    # second-from-bottom row, within 5 columns of a start hold.
    if n_feet >= 1 and start_cols:
        anchor = rnd.choice(start_cols)
        for fr in rnd.sample([num_rows - 1, num_rows - 2], 2):
            cols = [c for c in range(max(0, anchor - 5), min(num_cols, anchor + 6)) if free(fr, c)]
            if cols:
                holds.append(place(fr, rnd.choice(cols), "purple"))
                placed += 1
                break

    # Remaining feet hang below the lower hand holds with wide lateral variance.
    lower = sorted(hand_holds, key=lambda h: h.row, reverse=True)[: max(1, len(hand_holds) // 2)]
    attempts = 0
    while placed < n_feet and attempts < n_feet * 40 + 40:
        attempts += 1
        base = rnd.choice(lower)
        frow = base.row + rnd.choice([1, 2])
        fcol = max(0, min(num_cols - 1, base.col + rnd.randint(-FOOT_SPREAD, FOOT_SPREAD)))
        if free(frow, fcol):
            holds.append(place(frow, fcol, "purple"))
            placed += 1

    # --- post-check: keep the finish within reach of its predecessor ---
    chain = [h for h in holds if h.rgb in ("blue", "red")]
    finish = next((h for h in holds if h.rgb == "red"), None)
    if finish is not None and len(chain) >= 2:
        pred = chain[-2]
        if max(abs(finish.row - pred.row), abs(finish.col - pred.col)) > REACH:
            used.discard((finish.row, finish.col))
            # nearest reachable cell to the predecessor, preferring the top
            for r in range(max(0, pred.row - REACH), pred.row + 1):
                cols = [c for c in range(max(0, pred.col - REACH), min(num_cols, pred.col + REACH + 1))
                        if free(r, c)]
                if cols:
                    finish.row, finish.col = r, min(cols, key=lambda c: abs(c - pred.col))
                    break
            used.add((finish.row, finish.col))

    return holds


@router.get("/generate", response_model=list[LedOut])
def generate_random(hands: int = 7, feet: int = 3, db: Session = Depends(get_db)):
    num_cols = _num_cols(db)
    num_rows = _num_rows(db)

    leds.all_off()
    generated = _build_random_problem(num_rows, num_cols, hands, feet)
    for led in generated:
        leds.set_led(led.row, led.col, led.rgb, num_cols)

    # Return as LedOut-compatible dicts (no DB ids yet)
    return [LedOut(id=i, row=l.row, col=l.col, rgb=l.rgb) for i, l in enumerate(generated)]


@router.post("/save_random", response_model=ProblemOut, status_code=201)
def save_random(
    body: SaveRandomIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    problem = Problem(name=body.name, created_by=current_user.id, created_at=datetime.utcnow())
    db.add(problem)
    db.flush()
    for l in body.leds:
        db.add(Led(problem_id=problem.id, row=l.row, col=l.col, rgb=l.rgb))
    db.commit()
    db.refresh(problem)
    return _problem_out(problem, stats_mod.stats_for(db, "problem_id", problem.id))


@router.get("/{problem_id}", response_model=ProblemOut)
def get_problem(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    return _problem_out(p, stats_mod.stats_for(db, "problem_id", problem_id))


@router.put("/{problem_id}", response_model=ProblemOut)
def update_problem(
    problem_id: int,
    body: ProblemIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    require_can_edit(current_user, p.created_by)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return _problem_out(p, stats_mod.stats_for(db, "problem_id", problem_id))


@router.delete("/{problem_id}", status_code=204)
def delete_problem(
    problem_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    require_can_edit(current_user, p.created_by)
    db.delete(p)
    db.commit()
    leds.all_off()


@router.post("/{problem_id}/load", status_code=204)
def load_to_board(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    _load_problem_to_board(p, _num_cols(db))


@router.post("/{problem_id}/clear", status_code=204)
def clear_leds(
    problem_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    require_can_edit(current_user, p.created_by)
    for led in p.leds:
        db.delete(led)
    p.updated_at = datetime.utcnow()
    db.commit()
    leds.all_off()
