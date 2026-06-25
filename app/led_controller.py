"""
LED strip controller for NeoPixel on Raspberry Pi 5.

Uses adafruit-circuitpython-neopixel via SPI (GPIO10) which works reliably
on Pi5's RP1 GPIO chip. Falls back to simulate mode on non-Pi hardware or
when LED_SIMULATE=1 is set.
"""

import os
import threading
import time
import random
import logging

logger = logging.getLogger(__name__)

LED_COUNT  = 250
LED_BRIGHTNESS = 42 / 255  # adafruit uses 0.0-1.0

# Color map: RGB tuples
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
    global _strip, SIMULATE
    try:
        import board
        import neopixel
        _strip = neopixel.NeoPixel(
            board.MOSI,
            LED_COUNT,
            brightness=LED_BRIGHTNESS,
            auto_write=False,
            pixel_order=neopixel.GRB,
        )
        logger.info("adafruit neopixel strip initialized via SPI")
    except Exception as e:
        logger.warning(f"neopixel not available ({e}), running in simulate mode")
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
    _strip[pos] = (r, g, b)


def _show():
    if not SIMULATE:
        _strip.show()


def set_led(row: int, col: int, color: str, num_cols: int = 10):
    pos = address_to_pos(row, col, num_cols)
    r, g, b = COLORS.get(color, (0, 0, 0))
    _set_pixel(pos, r, g, b)
    _show()


def set_brightness(level: int):
    """level is 0-255 (from old API); convert to 0.0-1.0 for adafruit."""
    if not SIMULATE:
        _strip.brightness = max(0, min(255, level)) / 255
        _strip.show()


def all_off():
    if SIMULATE:
        return
    _strip.fill((0, 0, 0))
    _strip.show()


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
