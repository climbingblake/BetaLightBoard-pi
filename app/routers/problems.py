import random as rnd
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Problem, Led, Setting
from app import led_controller as leds

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
    created_at: datetime
    leds: list[LedOut] = []

    model_config = {"from_attributes": True}


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
    return int(s.value) if s else 10


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
def list_problems(grade: str | None = None, setter: str | None = None, db: Session = Depends(get_db)):
    q = db.query(Problem)
    if grade and grade != "ALL":
        q = q.filter(Problem.grade.ilike(grade))
    if setter and setter != "ALL":
        q = q.filter(Problem.setter.ilike(setter))
    return q.order_by(Problem.created_at.desc()).all()


@router.post("", response_model=ProblemOut, status_code=201)
def create_problem(body: ProblemIn, db: Session = Depends(get_db)):
    problem = Problem(**body.model_dump(), created_at=datetime.utcnow())
    db.add(problem)
    db.commit()
    db.refresh(problem)
    return problem


@router.get("/generate", response_model=list[LedOut])
def generate_random(hands: int = 7, feet: int = 3, db: Session = Depends(get_db)):
    num_cols = _num_cols(db)
    num_rows = _num_rows(db)

    leds.all_off()

    generated: list[Led] = []
    used: set[tuple[int, int]] = set()

    def unique_pos(row_range, col_range) -> tuple[int, int]:
        for _ in range(100):
            r, c = rnd.randint(*row_range), rnd.randint(*col_range)
            if (r, c) not in used:
                used.add((r, c))
                return r, c
        raise HTTPException(500, "Could not place all holds without collision")

    # Start holds (bottom row)
    for _ in range(2):
        r, c = unique_pos((num_rows - 1, num_rows - 1), (0, num_cols - 1))
        generated.append(Led(row=r, col=c, rgb="green", problem_id=0))

    # Hand holds
    for _ in range(hands):
        r, c = unique_pos((1, num_rows - 2), (0, num_cols - 1))
        generated.append(Led(row=r, col=c, rgb="blue", problem_id=0))

    # Foot holds
    for _ in range(feet):
        r, c = unique_pos((num_rows - 1, num_rows - 1), (0, num_cols - 1))
        generated.append(Led(row=r, col=c, rgb="purple", problem_id=0))

    for led in generated:
        leds.set_led(led.row, led.col, led.rgb, num_cols)

    # Return as LedOut-compatible dicts (no DB ids yet)
    return [LedOut(id=i, row=l.row, col=l.col, rgb=l.rgb) for i, l in enumerate(generated)]


@router.post("/save_random", response_model=ProblemOut, status_code=201)
def save_random(body: SaveRandomIn, db: Session = Depends(get_db)):
    problem = Problem(name=body.name, created_at=datetime.utcnow())
    db.add(problem)
    db.flush()
    for l in body.leds:
        db.add(Led(problem_id=problem.id, row=l.row, col=l.col, rgb=l.rgb))
    db.commit()
    db.refresh(problem)
    return problem


@router.get("/{problem_id}", response_model=ProblemOut)
def get_problem(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    return p


@router.put("/{problem_id}", response_model=ProblemOut)
def update_problem(problem_id: int, body: ProblemIn, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return p


@router.delete("/{problem_id}", status_code=204)
def delete_problem(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
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
def clear_leds(problem_id: int, db: Session = Depends(get_db)):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    for led in p.leds:
        db.delete(led)
    db.commit()
    leds.all_off()
