import subprocess
import threading
import logging

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])
logger = logging.getLogger(__name__)


def _run_update():
    """Run in a background thread so the HTTP response returns before restart."""
    import time
    time.sleep(1.5)
    try:
        result = subprocess.run(
            ["git", "pull"],
            capture_output=True, text=True,
            cwd="/home/pi/BetaLightBoard-pi",
        )
        logger.info(f"git pull: {result.stdout.strip()} {result.stderr.strip()}")
    except Exception as e:
        logger.error(f"git pull failed: {e}")
        return

    try:
        subprocess.run(["systemctl", "restart", "betalightboard"], check=True)
    except Exception as e:
        logger.error(f"systemctl restart failed: {e}")


@router.post("/update")
def update():
    """Pull latest code from git and restart the service."""
    threading.Thread(target=_run_update, daemon=True).start()
    return {"status": "updating", "message": "Pulling latest code and restarting…"}


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
