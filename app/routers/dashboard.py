"""Dashboard aggregates for the home page.

One endpoint returns everything the dashboard renders: headline totals, weekly
sparklines, grade distribution, sends over time, top-rated problems, a recent
activity feed, the signed-in user's own stats, and a sends leaderboard. Counts
are small on a single board, so weekly bucketing is done in Python.
"""
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from app.auth import get_current_user
from app.database import get_db
from app.models import Problem, Route, Session, Send, Attempt, Favorite, User
from app import stats as stats_mod

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

WEEKS = 12


def _weekly(dts, weeks: int, now: datetime) -> list[int]:
    """Bucket datetimes into `weeks` trailing 7-day buckets (oldest first)."""
    buckets = [0] * weeks
    for dt in dts:
        if dt is None:
            continue
        days = (now - dt).days
        if days < 0:
            days = 0
        idx = weeks - 1 - days // 7
        if 0 <= idx < weeks:
            buckets[idx] += 1
    return buckets


def _grade_num(g: str | None) -> int | None:
    if not g or len(g) < 2 or g[0].upper() != "V":
        return None
    try:
        return int(g[1:])
    except ValueError:
        return None


@router.get("")
def dashboard(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.utcnow()
    wk_ago = now - timedelta(days=7)

    # --- headline totals ---
    totals = {
        "problems": db.query(func.count(Problem.id)).scalar() or 0,
        "routes": db.query(func.count(Route.id)).scalar() or 0,
        "sessions": db.query(func.count(Session.id)).scalar() or 0,
        "sends": db.query(func.count(Send.id)).scalar() or 0,
        "attempts": db.query(func.count(Attempt.id)).scalar() or 0,
        "climbers": db.query(func.count(User.id)).scalar() or 0,
    }

    # --- timestamps for sparklines / trends (single fetch each) ---
    problem_dts = [r[0] for r in db.query(Problem.created_at).all()]
    route_dts = [r[0] for r in db.query(Route.created_at).all()]
    session_dts = [r[0] for r in db.query(Session.created_at).all()]
    send_rows = db.query(Send.timestamp, Send.problem_id).all()
    send_dts = [r[0] for r in send_rows]

    new_last_7 = {
        "problems": sum(1 for d in problem_dts if d and d >= wk_ago),
        "routes": sum(1 for d in route_dts if d and d >= wk_ago),
        "sessions": sum(1 for d in session_dts if d and d >= wk_ago),
        "sends": sum(1 for d in send_dts if d and d >= wk_ago),
    }

    sparklines = {
        "problems": _weekly(problem_dts, WEEKS, now),
        "routes": _weekly(route_dts, WEEKS, now),
        "sessions": _weekly(session_dts, WEEKS, now),
        "sends": _weekly(send_dts, WEEKS, now),
    }

    # --- sends over time, split problems vs routes ---
    p_send_dts = [ts for ts, pid in send_rows if pid is not None]
    r_send_dts = [ts for ts, pid in send_rows if pid is None]
    p_weekly = _weekly(p_send_dts, WEEKS, now)
    r_weekly = _weekly(r_send_dts, WEEKS, now)
    sends_over_time = []
    for i in range(WEEKS):
        wk_start = now - timedelta(days=(WEEKS - 1 - i) * 7)
        sends_over_time.append({
            "week": wk_start.strftime("%b %d"),
            "problems": p_weekly[i],
            "routes": r_weekly[i],
            "total": p_weekly[i] + r_weekly[i],
        })

    # --- grade distribution (problems) ---
    grade_rows = db.query(Problem.grade, func.count(Problem.id)).group_by(Problem.grade).all()
    counts: dict[int, int] = {}
    for g, c in grade_rows:
        n = _grade_num(g)
        if n is not None:
            counts[n] = counts.get(n, 0) + c
    grade_distribution = []
    grade_summary = {"total": 0, "most_common": None, "hardest": None}
    if counts:
        hi = max(counts)
        grade_distribution = [{"grade": f"V{n}", "count": counts.get(n, 0)} for n in range(hi + 1)]
        grade_summary = {
            "total": sum(counts.values()),
            "most_common": f"V{max(counts, key=lambda k: counts[k])}",
            "hardest": f"V{hi}",
        }

    # --- top problems: rated first, then by ascents so the card isn't blank
    # on a fresh board ---
    pstats = stats_mod.compute_stats(db, "problem_id")
    rated = [(p, pstats.get(p.id, {})) for p in db.query(Problem).all()]
    rated = [(p, s) for p, s in rated if s.get("rating_avg") is not None or s.get("ascents", 0) > 0]
    rated.sort(
        key=lambda t: (
            t[1].get("rating_avg") or 0,
            t[1].get("rating_count") or 0,
            t[1].get("ascents") or 0,
        ),
        reverse=True,
    )
    top_problems = [{
        "id": p.id, "name": p.name or "Untitled", "grade": p.grade, "setter": p.setter,
        "rating_avg": s.get("rating_avg"), "rating_count": s.get("rating_count", 0),
        "ascents": s.get("ascents", 0),
    } for p, s in rated[:6]]

    # --- recent activity (sends + attempts) ---
    def _name(obj_problem, obj_route):
        if obj_problem is not None:
            return obj_problem.name or "Untitled", "problem"
        return (obj_route.name if obj_route else "Untitled") or "Untitled", "route"

    recent = []
    for s in db.query(Send).order_by(Send.timestamp.desc()).limit(10).all():
        nm, kind = _name(s.problem, s.route)
        recent.append({"kind": "send", "target": kind, "name": nm,
                       "who": s.user.username if s.user else "—", "when": s.timestamp})
    for a in db.query(Attempt).order_by(Attempt.timestamp.desc()).limit(10).all():
        nm, kind = _name(a.problem, a.route)
        recent.append({"kind": "attempt", "target": kind, "name": nm,
                       "who": a.user.username if a.user else "—", "when": a.timestamp})
    recent.sort(key=lambda r: r["when"] or now, reverse=True)
    recent_activity = [{
        "kind": r["kind"], "target": r["target"], "name": r["name"], "who": r["who"],
        "when": r["when"].isoformat() + "Z" if r["when"] else None,
    } for r in recent[:8]]

    # --- signed-in user's own stats ---
    my_sends = db.query(func.count(Send.id)).filter(Send.user_id == user.id).scalar() or 0
    my_attempts = db.query(func.count(Attempt.id)).filter(Attempt.user_id == user.id).scalar() or 0
    my_favs = db.query(func.count(Favorite.id)).filter(Favorite.user_id == user.id).scalar() or 0
    me = {
        "sends": my_sends,
        "attempts": my_attempts,
        "send_rate": (my_sends / my_attempts) if my_attempts else None,
        "favorites": my_favs,
    }

    # --- leaderboard by sends ---
    lb_rows = (
        db.query(User.username, func.count(Send.id))
        .join(Send, Send.user_id == User.id)
        .group_by(User.id)
        .order_by(func.count(Send.id).desc())
        .limit(5)
        .all()
    )
    leaderboard = [{"username": u, "sends": c} for u, c in lb_rows]

    overall_rate = (totals["sends"] / totals["attempts"]) if totals["attempts"] else None

    return {
        "totals": totals,
        "new_last_7": new_last_7,
        "sparklines": sparklines,
        "grade_distribution": grade_distribution,
        "grade_summary": grade_summary,
        "sends_over_time": sends_over_time,
        "send_rate_overall": overall_rate,
        "top_problems": top_problems,
        "recent_activity": recent_activity,
        "me": me,
        "leaderboard": leaderboard,
    }
