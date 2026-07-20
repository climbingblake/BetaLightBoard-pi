from fastapi import APIRouter
from pydantic import BaseModel
from app import led_controller as lc

router = APIRouter(prefix="/api/routines", tags=["routines"])

VALID_ROUTINES = {
    "rainbow", "chase", "iceflakes",
    "fire", "space_invader", "matrix_rain", "police_lights", "heartbeat",
    "game_of_life", "comet", "starfield_warp", "bouncing_ball",
}


class BrightnessIn(BaseModel):
    level: int


@router.post("/{name}", status_code=204)
def run_routine(name: str):
    if name == "stop":
        lc.animation.stop()
        return
    if name not in VALID_ROUTINES:
        from fastapi import HTTPException
        raise HTTPException(400, f"Unknown routine. Valid: {sorted(VALID_ROUTINES)}")
    lc.animation.run(name)


@router.post("/brightness/set", status_code=204)
def set_brightness(body: BrightnessIn):
    lc.set_brightness(body.level)


@router.get("/status")
def routine_status():
    return {"current": lc.animation.current}
