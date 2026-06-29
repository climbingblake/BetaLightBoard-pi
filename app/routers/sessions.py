from datetime import datetime
from typing import Optional, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session as DbSession

from app.auth import get_current_user, get_admin_user, require_can_edit
from app.database import get_db
from app.models import Session, SessionItem, Problem, Route, User
from app import stats as stats_mod

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
    created_by: Optional[int]
    creator_name: Optional[str] = None
    is_public: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    item_count: int
    rating_avg: Optional[float] = None
    rating_count: int = 0
    items: list[SessionItemOut] = []


class SessionSummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    created_by: Optional[int]
    creator_name: Optional[str] = None
    is_public: bool
    created_at: Optional[datetime]
    updated_at: Optional[datetime]
    item_count: int
    rating_avg: Optional[float] = None
    rating_count: int = 0


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


class ShareIn(BaseModel):
    public: bool


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


def _can_view(user: User, s: Session) -> bool:
    """Owner, anyone for public sessions, or admins."""
    return bool(user.is_admin) or s.is_public or s.created_by == user.id


def _summary(s: Session, rating: dict, creator_name: Optional[str] = None) -> SessionSummary:
    return SessionSummary(
        id=s.id, name=s.name, description=s.description,
        created_by=s.created_by, creator_name=creator_name, is_public=s.is_public,
        created_at=s.created_at, updated_at=s.updated_at,
        item_count=len(s.items),
        rating_avg=rating["rating_avg"], rating_count=rating["rating_count"],
    )


def _serialize(s: Session, rating: dict, creator_name: Optional[str] = None) -> SessionOut:
    items = [_item_out(i) for i in s.items]
    return SessionOut(
        id=s.id, name=s.name, description=s.description,
        created_by=s.created_by, creator_name=creator_name, is_public=s.is_public,
        created_at=s.created_at, updated_at=s.updated_at,
        item_count=len(items), items=items,
        rating_avg=rating["rating_avg"], rating_count=rating["rating_count"],
    )


_NO_RATING = {"rating_avg": None, "rating_count": 0}


def _creator_name(db: DbSession, created_by: Optional[int]) -> Optional[str]:
    if created_by is None:
        return None
    u = db.get(User, created_by)
    return u.username if u else None


# ---------------------------------------------------------------------------
# Reads — your own sessions plus any public ones (admins see all)
# ---------------------------------------------------------------------------

_SORTS = {"created_desc", "created_asc", "rating_desc", "name_asc"}


@router.get("", response_model=list[SessionSummary])
def list_sessions(
    public: Optional[bool] = None,
    created_by: Optional[int] = None,
    min_stars: Optional[float] = None,
    sort: str = "created_desc",
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Admins see everything; non-admins see public + own
    if user.is_admin:
        rows = list(db.query(Session).all())
    else:
        rows = [s for s in db.query(Session).all() if _can_view(user, s)]

    if public is not None:
        rows = [s for s in rows if s.is_public == public]
    if created_by is not None:
        rows = [s for s in rows if s.created_by == created_by]

    ratings = stats_mod.ratings_by(db, "session_id")
    names = {u.id: u.username for u in db.query(User).all()}

    if min_stars is not None:
        rows = [
            s for s in rows
            if (ratings.get(s.id, _NO_RATING)["rating_avg"] or 0) >= min_stars
        ]

    sort = sort if sort in _SORTS else "created_desc"

    def rating_avg(s):
        return ratings.get(s.id, _NO_RATING)["rating_avg"]

    if sort == "created_asc":
        rows.sort(key=lambda s: s.created_at or datetime.min)
    elif sort == "name_asc":
        rows.sort(key=lambda s: (s.name or "").lower())
    elif sort == "rating_desc":
        rows.sort(key=lambda s: (rating_avg(s) is not None, rating_avg(s) or 0), reverse=True)
    else:  # created_desc
        rows.sort(key=lambda s: s.created_at or datetime.min, reverse=True)

    return [
        _summary(s, ratings.get(s.id, _NO_RATING), names.get(s.created_by))
        for s in rows
    ]


@router.get("/{session_id}", response_model=SessionOut)
def get_session(session_id: int, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    if not _can_view(user, s):
        raise HTTPException(404, "Session not found")
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


# ---------------------------------------------------------------------------
# Writes — any user creates their own; owner or admin edits
# ---------------------------------------------------------------------------

@router.post("", response_model=SessionOut, status_code=201)
def create_session(body: SessionIn, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = Session(name=body.name, description=body.description, created_by=user.id, created_at=datetime.utcnow())
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


@router.put("/{session_id}", response_model=SessionOut)
def update_session(session_id: int, body: SessionIn, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    require_can_edit(user, s.created_by)
    s.name = body.name
    s.description = body.description
    db.commit()
    db.refresh(s)
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


@router.delete("/{session_id}", status_code=204)
def delete_session(session_id: int, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    require_can_edit(user, s.created_by)
    db.delete(s)
    db.commit()


@router.put("/{session_id}/share", response_model=SessionOut)
def share_session(session_id: int, body: ShareIn, db: DbSession = Depends(get_db), _: User = Depends(get_admin_user)):
    """Publish or unpublish a session. Admin only."""
    s = _get_or_404(session_id, db)
    s.is_public = body.public
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


@router.post("/{session_id}/items", response_model=SessionOut, status_code=201)
def add_item(session_id: int, body: ItemIn, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    require_can_edit(user, s.created_by)
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
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


@router.delete("/{session_id}/items/{item_id}", response_model=SessionOut)
def remove_item(session_id: int, item_id: int, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    require_can_edit(user, s.created_by)
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
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))


@router.put("/{session_id}/items/order", response_model=SessionOut)
def reorder_items(session_id: int, body: OrderIn, db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    s = _get_or_404(session_id, db)
    require_can_edit(user, s.created_by)
    by_id = {i.id: i for i in s.items}
    if set(body.ordered_ids) != set(by_id.keys()):
        raise HTTPException(400, "ordered_ids must contain exactly the session's item ids")
    for pos, item_id in enumerate(body.ordered_ids):
        by_id[item_id].position = pos
    s.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(s)
    return _serialize(s, stats_mod.rating_for(db, "session_id", s.id), _creator_name(db, s.created_by))
