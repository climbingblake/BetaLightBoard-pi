from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Rating, Send, Attempt, User

router = APIRouter(prefix="/api/ratings", tags=["ratings"])


def _one_target(problem_id, route_id, session_id) -> None:
    if sum(x is not None for x in (problem_id, route_id, session_id)) != 1:
        raise ValueError("Provide exactly one of problem_id, route_id, or session_id")


class RatingCreate(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None
    session_id: Optional[int] = None
    stars: int

    @model_validator(mode="after")
    def validate(self):
        _one_target(self.problem_id, self.route_id, self.session_id)
        if not (0 <= self.stars <= 3):
            raise ValueError("stars must be between 0 and 3")
        return self


class RatingOut(BaseModel):
    id: int
    user_id: int
    problem_id: Optional[int]
    route_id: Optional[int]
    session_id: Optional[int]
    stars: int

    model_config = {"from_attributes": True}


def _has_logged(db: Session, user_id: int, problem_id, route_id) -> bool:
    """True if the user has at least one send or attempt on the target."""
    def _q(model):
        q = db.query(model.id).filter(model.user_id == user_id)
        if problem_id is not None:
            q = q.filter(model.problem_id == problem_id)
        else:
            q = q.filter(model.route_id == route_id)
        return db.query(q.exists()).scalar()

    return _q(Send) or _q(Attempt)


def _target_filter(q, problem_id, route_id, session_id):
    if problem_id is not None:
        return q.filter(Rating.problem_id == problem_id)
    if route_id is not None:
        return q.filter(Rating.route_id == route_id)
    return q.filter(Rating.session_id == session_id)


@router.post("", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def set_rating(
    body: RatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Problems and routes require a logged attempt/send first. Sessions have
    # neither, so any authenticated user may rate one.
    if body.session_id is None and not _has_logged(
        db, current_user.id, body.problem_id, body.route_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Log an attempt or send before rating",
        )

    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    rating = _target_filter(q, body.problem_id, body.route_id, body.session_id).first()

    if rating:
        rating.stars = body.stars
    else:
        rating = Rating(
            user_id=current_user.id,
            problem_id=body.problem_id,
            route_id=body.route_id,
            session_id=body.session_id,
            stars=body.stars,
        )
        db.add(rating)
    db.commit()
    db.refresh(rating)
    return rating


@router.get("/me", response_model=RatingOut | None)
def my_rating(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    session_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        _one_target(problem_id, route_id, session_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    return _target_filter(q, problem_id, route_id, session_id).first()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_rating(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    session_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        _one_target(problem_id, route_id, session_id)
    except ValueError as e:
        raise HTTPException(400, str(e))
    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    _target_filter(q, problem_id, route_id, session_id).delete(synchronize_session=False)
    db.commit()
