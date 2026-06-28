from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Led, Problem, Setting, User
from app.auth import get_current_user, require_can_edit
from app import led_controller as lc

router = APIRouter(prefix="/api", tags=["leds"])


class LedIn(BaseModel):
    row: int
    col: int
    rgb: str


class LedColorIn(BaseModel):
    rgb: str


class LedOut(BaseModel):
    id: int
    row: int
    col: int
    rgb: str

    model_config = {"from_attributes": True}


def _num_cols(db: Session) -> int:
    s = db.query(Setting).filter(Setting.key == "NUMB_COLS").first()
    return int(s.value) if s else 10


@router.post("/problems/{problem_id}/leds", response_model=LedOut, status_code=201)
def add_led(
    problem_id: int,
    body: LedIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    p = db.get(Problem, problem_id)
    if not p:
        raise HTTPException(404, "Problem not found")
    require_can_edit(current_user, p.created_by)
    led = Led(problem_id=problem_id, row=body.row, col=body.col, rgb=body.rgb)
    db.add(led)
    p.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(led)
    lc.set_led(led.row, led.col, led.rgb, _num_cols(db))
    return led


@router.put("/leds/{led_id}", response_model=LedOut)
def update_led(
    led_id: int,
    body: LedColorIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    led = db.get(Led, led_id)
    if not led:
        raise HTTPException(404, "LED not found")
    require_can_edit(current_user, led.problem.created_by if led.problem else None)
    led.rgb = body.rgb
    if led.problem:
        led.problem.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(led)
    lc.set_led(led.row, led.col, led.rgb, _num_cols(db))
    return led


@router.delete("/leds/{led_id}", status_code=204)
def delete_led(
    led_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    led = db.get(Led, led_id)
    if not led:
        raise HTTPException(404, "LED not found")
    require_can_edit(current_user, led.problem.created_by if led.problem else None)
    row, col = led.row, led.col
    if led.problem:
        led.problem.updated_at = datetime.utcnow()
    db.delete(led)
    db.commit()
    lc.set_led(row, col, "off", _num_cols(db))
