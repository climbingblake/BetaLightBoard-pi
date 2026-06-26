from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Attempt, User

router = APIRouter(prefix="/attempts", tags=["attempts"])


class AttemptCreate(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.problem_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of problem_id or route_id")
        return self


class AttemptOut(BaseModel):
    id: int
    user_id: int
    problem_id: Optional[int]
    route_id: Optional[int]
    timestamp: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


@router.post("", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def log_attempt(
    body: AttemptCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    attempt = Attempt(
        user_id=current_user.id,
        problem_id=body.problem_id,
        route_id=body.route_id,
        notes=body.notes,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


@router.get("", response_model=list[AttemptOut])
def list_attempts(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Attempt).filter(Attempt.user_id == current_user.id)
    if problem_id is not None:
        q = q.filter(Attempt.problem_id == problem_id)
    if route_id is not None:
        q = q.filter(Attempt.route_id == route_id)
    return q.order_by(Attempt.timestamp.desc()).all()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def clear_attempts(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if problem_id is None and route_id is None:
        raise HTTPException(status_code=400, detail="Provide problem_id or route_id to clear attempts")
    q = db.query(Attempt).filter(Attempt.user_id == current_user.id)
    if problem_id is not None:
        q = q.filter(Attempt.problem_id == problem_id)
    if route_id is not None:
        q = q.filter(Attempt.route_id == route_id)
    q.delete(synchronize_session=False)
    db.commit()
