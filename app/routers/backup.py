"""Backup and export endpoints.

Two flavours:
- Admin full backup: a consistent SQLite snapshot of the live database, taken
  with `VACUUM INTO` so it is a clean point-in-time copy (never a file grabbed
  mid-write). This is the real "save the state" button and includes users.
- Content export: problems, routes, and sessions as portable JSON. Admins get
  everything; everyone else gets only what they created.
- Import: restore problems, routes, and sessions from the JSON export format.
"""
import json
import os
import tempfile
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel
from starlette.background import BackgroundTask
from sqlalchemy.orm import Session as DbSession

from app.auth import get_current_user, get_admin_user
from app.database import get_db, engine
from app.models import Led, Problem, Route, RouteHold, Session, SessionItem, User

router = APIRouter(prefix="/api/backup", tags=["backup"])

EXPORT_VERSION = 1


def _stamp() -> str:
    return datetime.utcnow().strftime("%Y%m%d-%H%M%S")


# ---------------------------------------------------------------------------
# Full database snapshot (admin)
# ---------------------------------------------------------------------------

@router.get("/database")
def download_database(_: User = Depends(get_admin_user)):
    """Stream a consistent SQLite snapshot of the live database."""
    fd, tmp = tempfile.mkstemp(suffix=".db", prefix="blb-backup-")
    os.close(fd)
    os.remove(tmp)  # VACUUM INTO requires the destination not to exist

    raw = engine.raw_connection()
    try:
        cur = raw.cursor()
        cur.execute(f"VACUUM INTO '{tmp}'")
        cur.close()
    finally:
        raw.close()

    return FileResponse(
        tmp,
        media_type="application/octet-stream",
        filename=f"betalightboard-backup-{_stamp()}.db",
        background=BackgroundTask(os.remove, tmp),
    )


# ---------------------------------------------------------------------------
# Content export (problems / routes / sessions) as JSON
# ---------------------------------------------------------------------------

def _problem_dict(p: Problem, names: dict[int, str]) -> dict:
    return {
        "id": p.id,
        "name": p.name,
        "description": p.description,
        "setter": p.setter,
        "grade": p.grade,
        "created_by": p.created_by,
        "creator": names.get(p.created_by) if p.created_by is not None else None,
        "leds": [{"row": l.row, "col": l.col, "rgb": l.rgb} for l in p.leds],
    }


def _route_dict(r: Route, names: dict[int, str]) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "duration": r.duration,
        "number_shown": r.number_shown,
        "repeat": r.repeat,
        "created_by": r.created_by,
        "creator": names.get(r.created_by) if r.created_by is not None else None,
        "holds": [
            {"sequence": h.sequence, "row": h.row, "col": h.col} for h in r.holds
        ],
    }


def _session_dict(s: Session, names: dict[int, str]) -> dict:
    items = []
    for it in s.items:
        items.append({
            "position": it.position,
            "kind": "problem" if it.problem_id is not None else "route",
            "ref_id": it.problem_id if it.problem_id is not None else it.route_id,
        })
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "is_public": s.is_public,
        "created_by": s.created_by,
        "creator": names.get(s.created_by) if s.created_by is not None else None,
        "items": items,
    }


@router.get("/content")
def export_content(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Export problems, routes and sessions as JSON.

    Admins export everything; other users export only what they created.
    """
    def scoped(model):
        q = db.query(model)
        return q if user.is_admin else q.filter(model.created_by == user.id)

    names = {u.id: u.username for u in db.query(User).all()}
    payload = {
        "version": EXPORT_VERSION,
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "scope": "all" if user.is_admin else "own",
        "problems": [_problem_dict(p, names) for p in scoped(Problem).all()],
        "routes": [_route_dict(r, names) for r in scoped(Route).all()],
        "sessions": [_session_dict(s, names) for s in scoped(Session).all()],
    }

    return Response(
        content=json.dumps(payload, indent=2),
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="betalightboard-content-{_stamp()}.json"'
        },
    )


# ---------------------------------------------------------------------------
# Import (problems / routes / sessions) from exported JSON
# ---------------------------------------------------------------------------

class _ImportLed(BaseModel):
    row: int
    col: int
    rgb: str


class _ImportProblem(BaseModel):
    id: int | None = None  # only used for session-item ref mapping
    name: str = ""
    description: str | None = None
    setter: str | None = None
    grade: str | None = None
    leds: list[_ImportLed] = []


class _ImportHold(BaseModel):
    sequence: int
    row: int
    col: int


class _ImportRoute(BaseModel):
    id: int | None = None  # only used for session-item ref mapping
    name: str = ""
    description: str | None = None
    duration: float = 3.0
    number_shown: int = 3
    repeat: bool = False
    holds: list[_ImportHold] = []


class _ImportSessionItem(BaseModel):
    position: int
    kind: str  # "problem" | "route"
    ref_id: int


class _ImportSession(BaseModel):
    name: str = ""
    description: str | None = None
    is_public: bool = False
    items: list[_ImportSessionItem] = []


class _ImportPayload(BaseModel):
    version: int
    problems: list[_ImportProblem] = []
    routes: list[_ImportRoute] = []
    sessions: list[_ImportSession] = []


class ImportResult(BaseModel):
    problems: int = 0
    routes: int = 0
    sessions: int = 0


@router.post("/import", response_model=ImportResult)
def import_content(
    payload: _ImportPayload,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Import problems, routes and sessions from an exported JSON file.

    All imported content is assigned to the current user. Session items
    referencing problems/routes not present in the import are skipped.
    """
    now = datetime.utcnow()

    # Problems
    prob_map: dict[int, int] = {}
    for p in payload.problems:
        problem = Problem(
            name=p.name,
            description=p.description,
            setter=p.setter,
            grade=p.grade,
            created_by=user.id,
            created_at=now,
            updated_at=now,
        )
        db.add(problem)
        db.flush()  # get the new id

        for l in p.leds:
            db.add(Led(
                problem_id=problem.id,
                row=l.row,
                col=l.col,
                rgb=l.rgb,
            ))

        if p.id is not None:
            prob_map[p.id] = problem.id
        db.flush()

    # Routes
    route_map: dict[int, int] = {}
    for r in payload.routes:
        route = Route(
            name=r.name,
            description=r.description,
            duration=r.duration,
            number_shown=r.number_shown,
            repeat=r.repeat,
            created_by=user.id,
            created_at=now,
            updated_at=now,
        )
        db.add(route)
        db.flush()

        for h in r.holds:
            db.add(RouteHold(
                route_id=route.id,
                sequence=h.sequence,
                row=h.row,
                col=h.col,
            ))

        if r.id is not None:
            route_map[r.id] = route.id
        db.flush()

    # Sessions
    for s in payload.sessions:
        session = Session(
            name=s.name,
            description=s.description,
            is_public=s.is_public,
            created_by=user.id,
            created_at=now,
            updated_at=now,
        )
        db.add(session)
        db.flush()

        for it in s.items:
            if it.kind == "problem":
                new_id = prob_map.get(it.ref_id)
                if new_id is None:
                    continue
                db.add(SessionItem(
                    session_id=session.id,
                    position=it.position,
                    problem_id=new_id,
                ))
            elif it.kind == "route":
                new_id = route_map.get(it.ref_id)
                if new_id is None:
                    continue
                db.add(SessionItem(
                    session_id=session.id,
                    position=it.position,
                    route_id=new_id,
                ))

    db.commit()

    return ImportResult(
        problems=len(payload.problems),
        routes=len(payload.routes),
        sessions=len(payload.sessions),
    )
