from datetime import datetime
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session as DbSession

from app.auth import get_current_user, get_admin_user
from app.database import get_db
from app.models import Session, SessionItem, Problem, Route, User

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class SessionItemOut(BaseModel):
    id: int
    position: int
    kind: Literal["problem", "route"]
    ref_id: int
    name: str
    grade: Optional[str] = None
    holds: int = 0


class SessionOut(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    item_count: int
    items: list[SessionItemOut] = []


class SessionSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    item_count: int


class SessionIn(BaseModel):
    name: str = ""
    description: Optional[str] = None


class ItemIn(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None

    @model_validator(mode="after")
    def one_target(self):
        if (self.problem_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of problem_id or route_id")
        return self


class OrderIn(BaseModel):
    ordered_ids: list[int]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _item_out(item: SessionItem) -> SessionItemOut:
    if item.problem_id is not None:
        p = item.problem
        return SessionItemOut(
            id=item.id, position=item.position, kind="problem", ref_id=item.problem_id,
            name=(p.name if p else "") or "Untitled",
            grade=p.grade if p else None,
            holds=len(p.leds) if p else 0,
        )
    r = item.route
    return SessionItemOut(
        id=item.id, position=item.position, kind="route", ref_id=item.route_id,
        name=(r.name if r else "") or "Untitled",
        grade=None,
        holds=len(r.holds) if r else 0,
    )


def _get_or_404(session_id: int, db: DbSession) -> Session:
    s = db.get(Session, session_id)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


def _serialize(s: Session) -> SessionOut:
    items = [_item_out(i) for i in s.items]
    return SessionOut(
        id=s.id, name=s.name, description=s.description,
        created_at=s.created_at, updated_at=s.updated_at,
        item_count=len(items), items=items,
    )


# ---------------------------------------------------------------------------
# Reads (any authenticated user)
# ---------------------------------------------------------------------------

@router.get("", response_model=list[SessionSummary])
def list_sessions(db: DbSession = Depends(get_db), _: User = Depends(get_current_user)):
    out = []
    for s in db.query(Session).order_by(Session.created_at.desc()).all():
        out.append(SessionSummary(
            id=s.id, name=s.name, description=s.description,
            created_at=s.created_at, updated_at=s.updated_at,
            item_count=len(s.items),
        ))
    return out


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: DbSession = Depends(get_db), _: User = Depends(get_current_user)):
    return _serialize(_get_or_404(session_id, db))


# ---------------------------------------------------------------------------
# Writes (admin only)
# ---------------------------------------------------------------------------

@router.post("", response_model=SessionOut, status_code=201)
def create_session(body: SessionIn, db: DbSession = Depends(get_db), admin: User = Depends(get_admin_user)):
    s = Session(name=body.name, description=body.description, created_by=admin.id, created_at=datetime.utcnow())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.put("/{session_id}", response_model=SessionOut)
def update_session(session_id: int, body: SessionIn, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    s = _get_or_404(session_id, db)
    s.name = body.name
    s.description = body.description
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    s = _get_or_404(session_id, db)
    db.delete(s)
    db.commit()


@router.post("/{session_id}/items", response_model=SessionOut, status_code=201)
def add_item(session_id: int, body: ItemIn, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    s = _get_or_404(session_id, db)
    if body.problem_id is not None and not db.get(Problem, body.problem_id):
        raise HTTPException(404, "Problem not found")
    if body.route_id is not None and not db.get(Route, body.route_id):
        raise HTTPException(404, "Route not found")
    next_pos = len(s.items)
    db.add(SessionItem(
        session_id=session_id, position=next_pos,
        problem_id=body.problem_id, route_id=body.route_id,
    ))
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.delete("/{session_id}/items/{item_id}", response_model=SessionOut)
def remove_item(session_id: int, item_id: int, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    s = _get_or_404(session_id, db)
    item = db.get(SessionItem, item_id)
    if not item or item.session_id != session_id:
        raise HTTPException(404, "Item not found")
    db.delete(item)
    db.flush()
    # Re-pack positions to stay contiguous
    for idx, it in enumerate(sorted([i for i in s.items if i.id != item_id], key=lambda x: x.position)):
        it.position = idx
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.put("/{session_id}/items/order", response_model=SessionOut)
def reorder_items(session_id: int, body: OrderIn, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    s = _get_or_404(session_id, db)
    by_id = {i.id: i for i in s.items}
    if set(body.ordered_ids) != set(by_id.keys()):
        raise HTTPException(400, "ordered_ids must contain exactly the session's item ids")
    for pos, item_id in enumerate(body.ordered_ids):
        by_id[item_id].position = pos
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize(s)
