import subprocess
import threading
import logging

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])
logger = logging.getLogger(__name__)

REPO_DIR = "/home/pi/BetaLightBoard-pi"


def _restart_after_delay():
    import time
    time.sleep(1.5)
    try:
        subprocess.run(["systemctl", "restart", "betalightboard"], check=True)
    except Exception as e:
        logger.error(f"systemctl restart failed: {e}")


@router.post("/update")
def update():
    """Fetch latest from origin, hard-reset to it, then restart the service."""
    # Fetch
    fetch = subprocess.run(
        ["git", "fetch", "origin"],
        capture_output=True, text=True, cwd=REPO_DIR,
    )
    if fetch.returncode != 0:
        msg = fetch.stderr.strip() or "git fetch failed"
        logger.error(f"git fetch: {msg}")
        return {"status": "error", "message": f"git fetch failed: {msg}"}

    # Hard-reset to origin/main — remote is always the source of truth
    reset = subprocess.run(
        ["git", "reset", "--hard", "origin/main"],
        capture_output=True, text=True, cwd=REPO_DIR,
    )
    if reset.returncode != 0:
        msg = reset.stderr.strip() or "git reset failed"
        logger.error(f"git reset: {msg}")
        return {"status": "error", "message": f"git reset failed: {msg}"}

    logger.info(f"git reset: {reset.stdout.strip()}")
    threading.Thread(target=_restart_after_delay, daemon=True).start()
    return {"status": "ok", "message": "Updated successfully. Restarting…"}


@router.get("/version")
def version():
    """Return current git commit hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            capture_output=True, text=True,
            cwd="/home/pi/BetaLightBoard-pi",
        )
        return {"commit": result.stdout.strip()}
    except Exception:
        return {"commit": "unknown"}
