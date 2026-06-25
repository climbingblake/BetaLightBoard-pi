"""
LED strip controller for rpi_ws281x (NeoPixel) on Raspberry Pi 5.

On non-Pi hardware (local dev), this module stubs out all hardware calls
so the rest of the app works normally. Set LED_SIMULATE=1 to force stub mode.
"""

import os
import threading
import time
import random
import logging

logger = logging.getLogger(__name__)

LED_COUNT = 250
LED_PIN = 10        # GPIO10 (SPI0 MOSI) — required for Pi5
LED_FREQ_HZ = 800000
LED_DMA = 10
LED_BRIGHTNESS = 42
LED_INVERT = False
LED_CHANNEL = 0

# Color map — correct RGB values (not the swapped GRB from the old .ino)
COLORS: dict[str, tuple[int, int, int]] = {
    "green":     (0, 255, 0),
    "red":       (255, 0, 0),
    "blue":      (0, 0, 255),
    "purple":    (128, 0, 128),
    "white":     (255, 255, 255),
    "orange":    (255, 165, 0),
    "lightblue": (173, 216, 230),
    "black":     (0, 0, 0),
    "off":       (0, 0, 0),
}

SIMULATE = os.getenv("LED_SIMULATE", "0") == "1"

_strip = None

def _init_strip():
    global _strip
    if _strip is not None:
        return
    try:
        from rpi_ws281x import PixelStrip, Color as WS_Color
        _strip = PixelStrip(
            LED_COUNT, LED_PIN, LED_FREQ_HZ,
            LED_DMA, LED_INVERT, LED_BRIGHTNESS, LED_CHANNEL
        )
        _strip.begin()
        logger.info("rpi_ws281x strip initialized")
    except Exception as e:
        logger.warning(f"rpi_ws281x not available ({e}), running in simulate mode")
        global SIMULATE
        SIMULATE = True


def address_to_pos(row: int, col: int, num_cols: int = 10) -> int:
    """Serpentine LED position. Even rows L→R, odd rows R→L."""
    if row % 2 == 0:
        return col + row * num_cols
    else:
        return (num_cols - 1 - col) + row * num_cols


def _set_pixel(pos: int, r: int, g: int, b: int):
    if SIMULATE:
        logger.debug(f"[sim] pixel {pos} = rgb({r},{g},{b})")
        return
    from rpi_ws281x import Color as WS_Color
    _strip.setPixelColor(pos, WS_Color(r, g, b))


def _show():
    if not SIMULATE:
        _strip.show()


def set_led(row: int, col: int, color: str, num_cols: int = 10):
    pos = address_to_pos(row, col, num_cols)
    r, g, b = COLORS.get(color, (0, 0, 0))
    _set_pixel(pos, r, g, b)
    _show()


def set_brightness(level: int):
    if not SIMULATE:
        _strip.setBrightness(max(0, min(255, level)))
        _strip.show()


def all_off():
    for i in range(LED_COUNT):
        _set_pixel(i, 0, 0, 0)
    _show()


# ---------------------------------------------------------------------------
# Animation controller
# ---------------------------------------------------------------------------

class AnimationController:
    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop: threading.Event = threading.Event()
        self.current: str | None = None

    def run(self, name: str):
        self.stop()
        self._stop.clear()
        self.current = name
        self._thread = threading.Thread(target=self._loop, args=(name,), daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=1.0)
        self.current = None
        all_off()

    def _loop(self, name: str):
        handlers = {
            "rainbow":   self._rainbow,
            "chase":     self._chase,
            "iceflakes": self._iceflakes,
        }
        fn = handlers.get(name)
        if fn is None:
            logger.warning(f"Unknown routine: {name}")
            return
        fn()

    # -- routines --

    def _rainbow(self):
        step = 0
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                pos = (i * 256 // LED_COUNT + step) & 255
                r, g, b = _wheel(pos)
                _set_pixel(i, r, g, b)
            _show()
            step = (step + 1) % 256
            time.sleep(0.02)

    def _chase(self):
        q = 0
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 255, 255, 255)
            for i in range(0, LED_COUNT, 3):
                _set_pixel(i + q, 255, 0, 0)
            _show()
            for i in range(0, LED_COUNT, 3):
                _set_pixel(i + q, 0, 0, 0)
            q = (q + 1) % 3
            time.sleep(0.2)

    def _iceflakes(self):
        pixels = [random.randint(0, 255) for _ in range(LED_COUNT)]
        step = 0
        while not self._stop.is_set():
            if step == 0:
                pixels = [random.randint(0, 255) for _ in range(LED_COUNT)]
            if step % 5 == 0:
                _set_pixel(random.randint(0, LED_COUNT - 1), 0, 0, 255)
            for p in range(LED_COUNT):
                _set_pixel(p, 0, 0, max(0, pixels[p]))
                pixels[p] = max(0, pixels[p] - 10)
            _show()
            step = (step + 1) % 200
            time.sleep(0.2)


def _wheel(pos: int) -> tuple[int, int, int]:
    pos = 255 - pos
    if pos < 85:
        return (255 - pos * 3, 0, pos * 3)
    if pos < 170:
        pos -= 85
        return (0, pos * 3, 255 - pos * 3)
    pos -= 170
    return (pos * 3, 255 - pos * 3, 0)


# Module-level singleton
animation = AnimationController()


def startup():
    if not SIMULATE:
        _init_strip()
    all_off()
