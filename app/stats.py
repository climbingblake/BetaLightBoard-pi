"""Aggregate stats (ratings, ascents, attempts) for problems and routes.

Computed in bulk with grouped queries to avoid per-row N+1 lookups.
"""
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import Rating, Send, Attempt


def _count_by(db: Session, model, col: str) -> dict[int, int]:
    column = getattr(model, col)
    rows = (
        db.query(column, func.count(model.id))
        .filter(column.isnot(None))
        .group_by(column)
        .all()
    )
    return {row[0]: row[1] for row in rows}


def _ratings_by(db: Session, col: str) -> dict[int, tuple[float, int]]:
    column = getattr(Rating, col)
    rows = (
        db.query(column, func.avg(Rating.stars), func.count(Rating.id))
        .filter(column.isnot(None))
        .group_by(column)
        .all()
    )
    return {row[0]: (float(row[1]), int(row[2])) for row in rows}


def compute_stats(db: Session, col: str) -> dict[int, dict]:
    """Return {target_id: {ascents, attempts, send_rate, rating_avg, rating_count}}.

    `col` is "problem_id" or "route_id". send_rate is None when attempts == 0.
    """
    sends = _count_by(db, Send, col)
    attempts = _count_by(db, Attempt, col)
    ratings = _ratings_by(db, col)

    ids = set(sends) | set(attempts) | set(ratings)
    out: dict[int, dict] = {}
    for tid in ids:
        a = attempts.get(tid, 0)
        s = sends.get(tid, 0)
        ravg, rcount = ratings.get(tid, (None, 0))
        out[tid] = {
            "ascents": s,
            "attempts": a,
            "send_rate": (s / a) if a else None,
            "rating_avg": round(ravg, 2) if ravg is not None else None,
            "rating_count": rcount,
        }
    return out


def stats_for(db: Session, col: str, tid: int) -> dict:
    """Stats for a single target id (zero-filled defaults)."""
    return compute_stats(db, col).get(tid, {
        "ascents": 0, "attempts": 0, "send_rate": None,
        "rating_avg": None, "rating_count": 0,
    })


SORTS = {"created_desc", "created_asc", "rating_desc", "ascents_desc", "send_rate_desc"}


def sort_key(sort: str):
    """Return (key_fn, reverse) for sorting (obj, stats) tuples."""
    if sort == "created_asc":
        return (lambda t: t[0].created_at or t[0].id), False
    if sort == "rating_desc":
        return (lambda t: (t[1]["rating_avg"] is not None, t[1]["rating_avg"] or 0, t[1]["rating_count"])), True
    if sort == "ascents_desc":
        return (lambda t: t[1]["ascents"]), True
    if sort == "send_rate_desc":
        return (lambda t: (t[1]["send_rate"] is not None, t[1]["send_rate"] or 0)), True
    # created_desc (default)
    return (lambda t: t[0].created_at or t[0].id), True
