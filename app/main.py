from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging

from sqlalchemy import inspect, text

from app.database import engine, SessionLocal
from app.models import Base, Setting, SETTING_DEFAULTS, Attempt, Send, Favorite, User
from app.routers import problems, leds, routines, settings, system, routes, auth, attempts, sends, favorites, ratings, sessions
from app import led_controller

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _reconcile_columns():
    """Add columns that create_all cannot add to pre-existing tables.

    This repo uses create_all (not Alembic) as the live source of truth, and
    create_all only creates missing tables, never alters existing ones. So new
    columns on already-created tables are added here, idempotently, on every
    boot. That makes "pull and restart" deploys self-migrating. Keep the Alembic
    migrations in sync as the formal record. Each entry is (table, column, DDL,
    backfill-SQL-or-None).
    """
    additions = [
        ("problems", "updated_at", "ALTER TABLE problems ADD COLUMN updated_at DATETIME",
         "UPDATE problems SET updated_at = created_at WHERE updated_at IS NULL"),
        ("routes", "updated_at", "ALTER TABLE routes ADD COLUMN updated_at DATETIME",
         "UPDATE routes SET updated_at = created_at WHERE updated_at IS NULL"),
        ("problems", "created_by", "ALTER TABLE problems ADD COLUMN created_by INTEGER REFERENCES users(id)", None),
        ("routes", "created_by", "ALTER TABLE routes ADD COLUMN created_by INTEGER REFERENCES users(id)", None),
        ("sessions", "is_public", "ALTER TABLE sessions ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT 0", None),
    ]
    insp = inspect(engine)
    existing_tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl, backfill in additions:
            if table not in existing_tables:
                continue
            cols = {c["name"] for c in insp.get_columns(table)}
            if column in cols:
                continue
            conn.execute(text(ddl))
            if backfill:
                conn.execute(text(backfill))
            logger.info("Reconciled schema: added %s.%s", table, column)


def _backfill_owners():
    """Assign any owner-less problem/route to the first admin user (idempotent)."""
    with engine.begin() as conn:
        admin = conn.execute(
            text("SELECT id FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1")
        ).scalar()
        if admin is None:
            return
        for table in ("problems", "routes"):
            conn.execute(
                text(f"UPDATE {table} SET created_by = :a WHERE created_by IS NULL"),
                {"a": admin},
            )


def init_db():
    Base.metadata.create_all(bind=engine)
    _reconcile_columns()
    _backfill_owners()
    db = SessionLocal()
    try:
        for key, value in SETTING_DEFAULTS.items():
            if not db.query(Setting).filter(Setting.key == key).first():
                db.add(Setting(key=key, value=value))
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    led_controller.startup()
    logger.info("LED controller started")
    yield
    led_controller.animation.stop()
    led_controller.route_animation.stop()
    logger.info("LED controller stopped")


app = FastAPI(title="Beta Light Board", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten in prod if needed
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(problems.router)
app.include_router(leds.router)
app.include_router(routines.router)
app.include_router(settings.router)
app.include_router(system.router)
app.include_router(routes.router)
app.include_router(attempts.router)
app.include_router(sends.router)
app.include_router(favorites.router)
app.include_router(ratings.router)
app.include_router(sessions.router)

# Serve the built React frontend — only mount if the build exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR) and os.listdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
