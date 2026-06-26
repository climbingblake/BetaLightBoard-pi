from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os
import logging

from app.database import engine, SessionLocal
from app.models import Base, Setting, SETTING_DEFAULTS, Attempt, Send, Favorite, User
from app.routers import problems, leds, routines, settings, system, routes, auth, attempts, sends, favorites
from app import led_controller

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init_db():
    Base.metadata.create_all(bind=engine)
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

# Serve the built React frontend — only mount if the build exists
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(STATIC_DIR) and os.listdir(STATIC_DIR):
    app.mount("/assets", StaticFiles(directory=os.path.join(STATIC_DIR, "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        index = os.path.join(STATIC_DIR, "index.html")
        return FileResponse(index)
