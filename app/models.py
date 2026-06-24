from datetime import datetime
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Problem(Base):
    __tablename__ = "problems"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text)
    setter: Mapped[str | None] = mapped_column(String(255))
    grade: Mapped[str | None] = mapped_column(String(10))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    leds: Mapped[list["Led"]] = relationship(
        "Led", back_populates="problem", cascade="all, delete-orphan"
    )


class Led(Base):
    __tablename__ = "leds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    problem_id: Mapped[int] = mapped_column(Integer, ForeignKey("problems.id"), nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    col: Mapped[int] = mapped_column(Integer, nullable=False)
    rgb: Mapped[str] = mapped_column(String(32), nullable=False, default="blue")

    problem: Mapped["Problem"] = relationship("Problem", back_populates="leds")


class Setting(Base):
    __tablename__ = "settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[str | None] = mapped_column(String(255))


SETTING_DEFAULTS = {
    "NUMB_ROWS": "10",
    "NUMB_COLS": "10",
    "BRIGHTNESS": "42",
}
