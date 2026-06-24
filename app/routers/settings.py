from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Setting, SETTING_DEFAULTS

router = APIRouter(prefix="/api/settings", tags=["settings"])


class SettingOut(BaseModel):
    key: str
    value: str | None

    model_config = {"from_attributes": True}


class SettingsUpdateIn(BaseModel):
    values: dict[str, str]


@router.get("", response_model=list[SettingOut])
def get_settings(db: Session = Depends(get_db)):
    return db.query(Setting).all()


@router.put("", response_model=list[SettingOut])
def update_settings(body: SettingsUpdateIn, db: Session = Depends(get_db)):
    for key, value in body.values.items():
        s = db.query(Setting).filter(Setting.key == key).first()
        if s:
            s.value = value
        else:
            db.add(Setting(key=key, value=value))
    db.commit()
    return db.query(Setting).all()
