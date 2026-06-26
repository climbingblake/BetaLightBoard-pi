from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Favorite, User

router = APIRouter(prefix="/favorites", tags=["favorites"])


class FavoriteCreate(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.problem_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of problem_id or route_id")
        return self


class FavoriteOut(BaseModel):
    id: int
    user_id: int
    problem_id: Optional[int]
    route_id: Optional[int]
    created_at: datetime

    model_config = {"from_attributes": True}


@router.post("", response_model=FavoriteOut, status_code=status.HTTP_201_CREATED)
def add_favorite(
    body: FavoriteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # prevent duplicates
    existing = db.query(Favorite).filter(
        Favorite.user_id == current_user.id,
        Favorite.problem_id == body.problem_id,
        Favorite.route_id == body.route_id,
    ).first()
    if existing:
        return existing

    fav = Favorite(
        user_id=current_user.id,
        problem_id=body.problem_id,
        route_id=body.route_id,
    )
    db.add(fav)
    db.commit()
    db.refresh(fav)
    return fav


@router.get("", response_model=list[FavoriteOut])
def list_favorites(
    type: Optional[Literal["problem", "route"]] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Favorite).filter(Favorite.user_id == current_user.id)
    if type == "problem":
        q = q.filter(Favorite.problem_id.isnot(None))
    elif type == "route":
        q = q.filter(Favorite.route_id.isnot(None))
    return q.order_by(Favorite.created_at.desc()).all()


@router.delete("/{favorite_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_favorite(
    favorite_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fav = db.get(Favorite, favorite_id)
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")
    if fav.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your favorite")
    db.delete(fav)
    db.commit()
