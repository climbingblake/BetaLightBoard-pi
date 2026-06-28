import os
import pwd
import subprocess
import threading
import logging

from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])
logger = logging.getLogger(__name__)

REPO_DIR = "/home/pi/BetaLightBoard-pi"
# The service runs as root (needs port 80 + GPIO), but the repo is owned by this
# user. Run all git commands as them so root never creates root-owned objects in
# .git/objects, which would block manual `git pull` as that user.
REPO_USER = "pi"


def _run_git(args: list[str]) -> subprocess.CompletedProcess:
    """Run a git command in the repo as REPO_USER (when we have root to drop to)."""
    kwargs = dict(capture_output=True, text=True, cwd=REPO_DIR)
    try:
        if os.geteuid() == 0:
            pw = pwd.getpwnam(REPO_USER)
            kwargs["user"] = pw.pw_uid
            kwargs["group"] = pw.pw_gid
            kwargs["env"] = {
                **os.environ,
                "HOME": pw.pw_dir,
                "USER": REPO_USER,
                "LOGNAME": REPO_USER,
            }
    except (KeyError, AttributeError):
        # User missing, or non-root without privilege to drop: run as-is.
        pass
    return subprocess.run(["git", *args], **kwargs)


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
    fetch = _run_git(["fetch", "origin"])
    if fetch.returncode != 0:
        msg = fetch.stderr.strip() or "git fetch failed"
        logger.error(f"git fetch: {msg}")
        return {"status": "error", "message": f"git fetch failed: {msg}"}

    # Hard-reset to origin/main — remote is always the source of truth
    reset = _run_git(["reset", "--hard", "origin/main"])
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
        result = _run_git(["rev-parse", "--short", "HEAD"])
        return {"commit": result.stdout.strip() or "unknown"}
    except Exception:
        return {"commit": "unknown"}
