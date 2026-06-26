from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, model_validator
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Send, User

router = APIRouter(prefix="/api/sends", tags=["sends"])


class SendCreate(BaseModel):
    problem_id: Optional[int] = None
    route_id: Optional[int] = None
    notes: Optional[str] = None

    @model_validator(mode="after")
    def exactly_one_target(self):
        if (self.problem_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of problem_id or route_id")
        return self


class SendOut(BaseModel):
    id: int
    user_id: int
    problem_id: Optional[int]
    route_id: Optional[int]
    timestamp: datetime
    notes: Optional[str]

    model_config = {"from_attributes": True}


@router.post("", response_model=SendOut, status_code=status.HTTP_201_CREATED)
def log_send(
    body: SendCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    send = Send(
        user_id=current_user.id,
        problem_id=body.problem_id,
        route_id=body.route_id,
        notes=body.notes,
    )
    db.add(send)
    db.commit()
    db.refresh(send)
    return send


@router.get("", response_model=list[SendOut])
def list_sends(
    problem_id: Optional[int] = None,
    route_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Send).filter(Send.user_id == current_user.id)
    if problem_id is not None:
        q = q.filter(Send.problem_id == problem_id)
    if route_id is not None:
        q = q.filter(Send.route_id == route_id)
    return q.order_by(Send.timestamp.desc()).all()


@router.delete("/{send_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_send(
    send_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    send = db.get(Send, send_id)
    if not send:
        raise HTTPException(status_code=404, detail="Send not found")
    if send.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your send")
    db.delete(send)
    db.commit()
