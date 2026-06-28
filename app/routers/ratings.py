from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Rating, Send, Attempt, User

router = APIRouter(prefix="/api/ratings", tags=["ratings"])


class RatingCreate(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None
    stars: int

    @model_validator(mode="after")
    def validate(self):
        if (self.problem_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of problem_id or route_id")
        if not (0 <= self.stars <= 3):
            raise ValueError("stars must be between 0 and 3")
        return self


class RatingOut(BaseModel):
    id: int
    user_id: int
    problem_id: Optional[int]
    route_id: Optional[int]
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


@router.post("", response_model=RatingOut, status_code=status.HTTP_201_CREATED)
def set_rating(
    body: RatingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not _has_logged(db, current_user.id, body.problem_id, body.route_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Log an attempt or send before rating",
        )

    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    if body.problem_id is not None:
        q = q.filter(Rating.problem_id == body.problem_id)
    else:
        q = q.filter(Rating.route_id == body.route_id)
    rating = q.first()

    if rating:
        rating.stars = body.stars
    else:
        rating = Rating(
            user_id=current_user.id,
            problem_id=body.problem_id,
            route_id=body.route_id,
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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (problem_id is None) == (route_id is None):
        raise HTTPException(400, "Provide exactly one of problem_id or route_id")
    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    if problem_id is not None:
        q = q.filter(Rating.problem_id == problem_id)
    else:
        q = q.filter(Rating.route_id == route_id)
    return q.first()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_rating(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if (problem_id is None) == (route_id is None):
        raise HTTPException(400, "Provide exactly one of problem_id or route_id")
    q = db.query(Rating).filter(Rating.user_id == current_user.id)
    if problem_id is not None:
        q = q.filter(Rating.problem_id == problem_id)
    else:
        q = q.filter(Rating.route_id == route_id)
    q.delete(synchronize_session=False)
    db.commit()
