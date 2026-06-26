from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, Boolean, ForeignKey, DateTime, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_admin: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    attempts: Mapped[list["Attempt"]] = relationship("Attempt", back_populates="user", cascade="all, delete-orphan")
    sends: Mapped[list["Send"]] = relationship("Send", back_populates="user", cascade="all, delete-orphan")
    favorites: Mapped[list["Favorite"]] = relationship("Favorite", back_populates="user", cascade="all, delete-orphan")


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


class Route(Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    description: Mapped[str | None] = mapped_column(Text)
    duration: Mapped[float] = mapped_column(Float, nullable=False, default=3.0)
    number_shown: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    repeat: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    holds: Mapped[list["RouteHold"]] = relationship(
        "RouteHold", back_populates="route", cascade="all, delete-orphan",
        order_by="RouteHold.sequence",
    )


class RouteHold(Base):
    __tablename__ = "route_holds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    col: Mapped[int] = mapped_column(Integer, nullable=False)

    route: Mapped["Route"] = relationship("Route", back_populates="holds")


SETTING_DEFAULTS = {
    "NUMB_ROWS": "10",
    "NUMB_COLS": "20",
    "BRIGHTNESS": "42",
}


class Attempt(Base):
    __tablename__ = "attempts"
    __table_args__ = (
        CheckConstraint(
            "(problem_id IS NULL) != (route_id IS NULL)",
            name="attempt_one_target",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    problem_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("problems.id"), nullable=True)
    route_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("routes.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship("User", back_populates="attempts")
    problem: Mapped["Problem | None"] = relationship("Problem")
    route: Mapped["Route | None"] = relationship("Route")


class Send(Base):
    __tablename__ = "sends"
    __table_args__ = (
        CheckConstraint(
            "(problem_id IS NULL) != (route_id IS NULL)",
            name="send_one_target",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    problem_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("problems.id"), nullable=True)
    route_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("routes.id"), nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    notes: Mapped[str | None] = mapped_column(Text)

    user: Mapped["User"] = relationship("User", back_populates="sends")
    problem: Mapped["Problem | None"] = relationship("Problem")
    route: Mapped["Route | None"] = relationship("Route")


class Favorite(Base):
    __tablename__ = "favorites"
    __table_args__ = (
        CheckConstraint(
            "(problem_id IS NULL) != (route_id IS NULL)",
            name="favorite_one_target",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    problem_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("problems.id"), nullable=True)
    route_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("routes.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="favorites")
    problem: Mapped["Problem | None"] = relationship("Problem")
    route: Mapped["Route | None"] = relationship("Route")
