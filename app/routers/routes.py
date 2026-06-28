from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Route, RouteHold, Setting, User
from app.auth import get_current_user, require_can_edit
from app import led_controller as leds
from app import stats as stats_mod

router = APIRouter(prefix="/api/routes", tags=["routes"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RouteHoldOut(BaseModel):
    id: int
    sequence: int
    row: int
    col: int

    model_config = {"from_attributes": True}


class RouteOut(BaseModel):
    id: int
    name: str
    description: str | None
    duration: float
    number_shown: int
    repeat: bool
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime | None = None
    holds: list[RouteHoldOut] = []
    rating_avg: float | None = None
    rating_count: int = 0
    ascents: int = 0
    attempts: int = 0
    send_rate: float | None = None

    model_config = {"from_attributes": True}


def _route_out(r: Route, st: dict) -> RouteOut:
    out = RouteOut.model_validate(r)
    out.rating_avg = st["rating_avg"]
    out.rating_count = st["rating_count"]
    out.ascents = st["ascents"]
    out.attempts = st["attempts"]
    out.send_rate = st["send_rate"]
    return out


class RouteIn(BaseModel):
    name: str = ""
    description: str | None = None
    duration: float = 3.0
    number_shown: int = 3
    repeat: bool = False


class HoldIn(BaseModel):
    row: int
    col: int


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _num_cols(db: Session) -> int:
    s = db.query(Setting).filter(Setting.key == "NUMB_COLS").first()
    return int(s.value) if s else 20


def _get_route_or_404(route_id: int, db: Session) -> Route:
    r = db.get(Route, route_id)
    if not r:
        raise HTTPException(404, "Route not found")
    return r


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------

@router.get("", response_model=list[RouteOut])
def list_routes(q: str | None = None, sort: str = "created_desc", db: Session = Depends(get_db)):
    query = db.query(Route)
    if q:
        query = query.filter(Route.name.ilike(f"%{q}%"))
    routes = query.all()

    stats = stats_mod.compute_stats(db, "route_id")
    default = {"ascents": 0, "attempts": 0, "send_rate": None, "rating_avg": None, "rating_count": 0}
    pairs = [(r, stats.get(r.id, default)) for r in routes]

    key, reverse = stats_mod.sort_key(sort if sort in stats_mod.SORTS else "created_desc")
    pairs.sort(key=key, reverse=reverse)
    return [_route_out(r, st) for r, st in pairs]


@router.post("", response_model=RouteOut, status_code=201)
def create_route(
    body: RouteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = Route(**body.model_dump(), created_by=current_user.id, created_at=datetime.utcnow())
    db.add(route)
    db.commit()
    db.refresh(route)
    return _route_out(route, stats_mod.stats_for(db, "route_id", route.id))


@router.get("/{route_id}", response_model=RouteOut)
def get_route(route_id: int, db: Session = Depends(get_db)):
    r = _get_route_or_404(route_id, db)
    return _route_out(r, stats_mod.stats_for(db, "route_id", route_id))


@router.put("/{route_id}", response_model=RouteOut)
def update_route(
    route_id: int,
    body: RouteIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route_or_404(route_id, db)
    require_can_edit(current_user, route.created_by)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(route, k, v)
    db.commit()
    db.refresh(route)
    return _route_out(route, stats_mod.stats_for(db, "route_id", route_id))


@router.delete("/{route_id}", status_code=204)
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route_or_404(route_id, db)
    require_can_edit(current_user, route.created_by)
    db.delete(route)
    db.commit()
    leds.all_off()


# ---------------------------------------------------------------------------
# Hold management
# ---------------------------------------------------------------------------

@router.post("/{route_id}/holds", response_model=RouteHoldOut, status_code=201)
def add_hold(
    route_id: int,
    body: HoldIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route_or_404(route_id, db)
    require_can_edit(current_user, route.created_by)
    next_seq = len(route.holds)
    hold = RouteHold(
        route_id=route_id,
        sequence=next_seq,
        row=body.row,
        col=body.col,
    )
    db.add(hold)
    route.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(hold)
    return hold


@router.delete("/{route_id}/holds/last", status_code=204)
def remove_last_hold(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    route = _get_route_or_404(route_id, db)
    require_can_edit(current_user, route.created_by)
    if not route.holds:
        raise HTTPException(400, "No holds to remove")
    last = route.holds[-1]
    db.delete(last)
    route.updated_at = datetime.utcnow()
    db.commit()
    # Turn off the LED for that hold
    leds.all_off()


# ---------------------------------------------------------------------------
# Preview hold (light up single LED for verification, no DB write)
# ---------------------------------------------------------------------------

@router.post("/{route_id}/preview", status_code=204)
def preview_hold(route_id: int, body: HoldIn, db: Session = Depends(get_db)):
    """Light a single LED yellow so the user can verify the hold on the wall."""
    num_cols = _num_cols(db)
    leds.all_off()
    pos = leds.address_to_pos(body.row, body.col, num_cols)
    leds._set_pixel(pos, 220, 180, 0)  # warm yellow
    leds._show()


# ---------------------------------------------------------------------------
# Playback
# ---------------------------------------------------------------------------

@router.post("/{route_id}/play", status_code=204)
def play_route(route_id: int, repeat: bool = False, db: Session = Depends(get_db)):
    route = _get_route_or_404(route_id, db)
    if not route.holds:
        raise HTTPException(400, "Route has no holds")
    num_cols = _num_cols(db)
    holds = [(h.row, h.col) for h in route.holds]
    leds.route_animation.play(
        holds=holds,
        duration=route.duration,
        number_shown=route.number_shown,
        repeat=repeat,
        num_cols=num_cols,
    )


@router.post("/{route_id}/stop", status_code=204)
def stop_route(route_id: int):
    leds.route_animation.stop()


@router.get("/{route_id}/status")
def route_status(route_id: int):
    return {
        "playing": leds.route_animation.playing,
        "current_index": leds.route_animation.current_index,
        "total": leds.route_animation.total,
    }
