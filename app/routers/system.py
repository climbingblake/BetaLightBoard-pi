import os
import pwd
import subprocess
import threading
import logging

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/system", tags=["system"])
logger = logging.getLogger(__name__)

REPO_DIR = "/home/pi/BetaLightBoard-pi"
# The service runs as root (needs port 80 + GPIO), but the repo is owned by this
# user. Run all git commands as them so root never creates root-owned objects in
# .git/objects, which would block manual `git pull` as that user.
REPO_USER = "pi"

# Branches the Settings page may switch this board to. Hard-coded on purpose: the
# value goes to git, so only these names are ever accepted.
ALLOWED_BRANCHES = ("main", "pizero")
DEFAULT_BRANCH = "main"


class UpdateRequest(BaseModel):
    branch: str | None = None


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


def _current_branch() -> str:
    """Checked-out branch name, or "" when detached or unknown."""
    try:
        name = _run_git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.strip()
    except Exception:
        return ""
    return "" if name == "HEAD" else name


@router.post("/update")
def update(req: UpdateRequest | None = None):
    """Fetch origin, switch to the requested branch (or stay on the current one),
    hard-reset it to origin, then restart the service."""
    branch = (req.branch if req else None) or _current_branch()
    if branch not in ALLOWED_BRANCHES:
        branch = DEFAULT_BRANCH if not (req and req.branch) else None
    if branch is None:
        allowed = ", ".join(ALLOWED_BRANCHES)
        return {"status": "error", "message": f"Branch not allowed. Choose one of: {allowed}."}

    # Fetch
    fetch = _run_git(["fetch", "origin"])
    if fetch.returncode != 0:
        msg = fetch.stderr.strip() or "git fetch failed"
        logger.error(f"git fetch: {msg}")
        return {"status": "error", "message": f"git fetch failed: {msg}"}

    remote_ref = f"refs/remotes/origin/{branch}"
    if _run_git(["rev-parse", "--verify", "--quiet", remote_ref]).returncode != 0:
        return {"status": "error", "message": f"origin/{branch} does not exist."}

    # Point the local branch at origin/<branch> and check it out, discarding local
    # changes. The remote is always the source of truth.
    checkout = _run_git(["checkout", "--force", "-B", branch, f"origin/{branch}"])
    if checkout.returncode != 0:
        msg = checkout.stderr.strip() or "git checkout failed"
        logger.error(f"git checkout: {msg}")
        return {"status": "error", "message": f"git checkout failed: {msg}"}

    logger.info(f"git checkout {branch}: {(checkout.stdout or checkout.stderr).strip()}")
    threading.Thread(target=_restart_after_delay, daemon=True).start()
    return {
        "status": "ok",
        "branch": branch,
        "message": f"Updated to {branch}. Restarting…",
    }


@router.get("/version")
def version():
    """Return current git commit hash, checked-out branch and selectable branches."""
    try:
        result = _run_git(["rev-parse", "--short", "HEAD"])
        commit = result.stdout.strip() or "unknown"
    except Exception:
        commit = "unknown"
    return {
        "commit": commit,
        "branch": _current_branch(),
        "branches": list(ALLOWED_BRANCHES),
    }
