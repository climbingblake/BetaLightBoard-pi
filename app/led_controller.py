"""
LED strip controller for NeoPixel on Raspberry Pi Zero / Zero 2 W.

Uses adafruit-circuitpython-neopixel, which on pre-Pi 5 boards drives the strip
through rpi_ws281x (PWM on GPIO18 by default). Needs root. Falls back to
simulate mode on non-Pi hardware or when LED_SIMULATE=1 is set.
"""

import os
import threading
import time
import random
import logging

logger = logging.getLogger(__name__)

LED_COUNT  = 200
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

# Data pin, as a Blinka board name. D18 = GPIO18 = physical pin 12 (PWM0).
# Blinka on pre-Pi 5 boards only drives NeoPixels from D10 (SPI MOSI, pin 19),
# D12 (pin 32), D18 (pin 12) or D21 (PCM, pin 40). The Pi 5 build of this app
# used D13, which is not on that list. Override with LED_PIN in the service
# environment if the wiring changes. PWM pins need onboard audio disabled
# (dtparam=audio=off).
LED_PIN = os.getenv("LED_PIN", "D18")

_strip = None
# Serializes anything that talks to the strip hardware: the animation threads and
# the HTTP handlers (brightness, LED edits) all call show(), and two overlapping
# writes corrupt a frame.
_strip_lock = threading.RLock()


def _init_strip():
    global _strip, SIMULATE
    try:
        import board
        import neopixel
        _strip = neopixel.NeoPixel(
            getattr(board, LED_PIN),
            LED_COUNT,
            brightness=LED_BRIGHTNESS,
            auto_write=False,
            pixel_order=neopixel.RGB,
        )
        logger.info(f"adafruit neopixel strip initialized on {LED_PIN}")
    except Exception as e:
        logger.warning(f"neopixel not available ({e}), running in simulate mode")
        SIMULATE = True


def address_to_pos(row: int, col: int, num_cols: int = 20) -> int:
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
        with _strip_lock:
            _strip.show()


def set_led(row: int, col: int, color: str, num_cols: int = 20):
    pos = address_to_pos(row, col, num_cols)
    r, g, b = COLORS.get(color, (0, 0, 0))
    _set_pixel(pos, r, g, b)
    _show()


def set_brightness(level: int):
    """level is 0-255 (from old API); convert to 0.0-1.0 for adafruit."""
    if not SIMULATE:
        with _strip_lock:
            _strip.brightness = max(0, min(255, level)) / 255
            _strip.show()


def apply_brightness_setting(value) -> None:
    """Apply a stored BRIGHTNESS setting (0-255, as text) to the strip."""
    try:
        set_brightness(int(value))
    except (TypeError, ValueError):
        logger.warning(f"Ignoring invalid BRIGHTNESS setting: {value!r}")


def all_off():
    if SIMULATE:
        return
    with _strip_lock:
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
            "rainbow":       self._rainbow,
            "chase":         self._chase,
            "iceflakes":     self._iceflakes,
            "fire":          self._fire,
            "space_invader": self._space_invader,
            "matrix_rain":   self._matrix_rain,
            "police_lights": self._police_lights,
            "heartbeat":     self._heartbeat,
            "game_of_life":  self._game_of_life,
            "comet":         self._comet,
            "starfield_warp": self._starfield_warp,
            "bouncing_ball": self._bouncing_ball,
            "twinkle":       self._twinkle,
            "fireflies":     self._fireflies,
            "aurora":        self._aurora,
            "image":         self._image,
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
                if i + q < LED_COUNT:
                    _set_pixel(i + q, 255, 0, 0)
            _show()
            for i in range(0, LED_COUNT, 3):
                if i + q < LED_COUNT:
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

    def _fire(self):
        ROWS, COLS = 10, 20
        heat = [[0] * COLS for _ in range(ROWS)]
        while not self._stop.is_set():
            # Propagate heat upward with cooling
            new_heat = [[0] * COLS for _ in range(ROWS)]
            for r in range(ROWS):
                for c in range(COLS):
                    below = heat[r + 1][c] if r < ROWS - 1 else heat[r][c]
                    avg = (heat[r][c] + below) // 2
                    new_heat[r][c] = max(0, avg - random.randint(5, 25))
            # Seed bottom 2 rows with hot values
            for c in range(COLS):
                new_heat[ROWS - 1][c] = random.randint(160, 255)
                new_heat[ROWS - 2][c] = random.randint(120, 210)
            heat = new_heat
            for r in range(ROWS):
                for c in range(COLS):
                    _set_pixel(address_to_pos(r, c), *_heat_to_rgb(heat[r][c]))
            _show()
            time.sleep(0.05)

    def _space_invader(self):
        ROWS, COLS = 10, 20
        SPRITE_W, SPRITE_H = 8, 8
        ROW_OFFSET = 1  # center vertically in 10-row grid
        FRAMES = [
            [0b00100100, 0b01111110, 0b11011011, 0b11111111,
             0b10111101, 0b10000001, 0b01000010, 0b00100100],
            [0b00100100, 0b01111110, 0b11011011, 0b11111111,
             0b10111101, 0b10000001, 0b00100100, 0b01000010],
        ]
        x = -SPRITE_W
        frame = 0
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 0, 0, 0)
            sprite = FRAMES[frame]
            for r in range(SPRITE_H):
                grid_row = ROW_OFFSET + r
                if 0 <= grid_row < ROWS:
                    for c in range(SPRITE_W):
                        grid_col = x + c
                        if 0 <= grid_col < COLS:
                            if sprite[r] & (0x80 >> c):
                                _set_pixel(address_to_pos(grid_row, grid_col), 0, 255, 0)
            _show()
            x += 1
            frame = 1 - frame
            if x >= COLS:
                x = -SPRITE_W
            time.sleep(0.15)

    def _matrix_rain(self):
        ROWS, COLS = 10, 20
        FADE = 42  # ~6 cells of trail before fading to black
        bright = [[0] * ROWS for _ in range(COLS)]
        heads = []  # [col, row]
        spawn_timer = [random.randint(0, 10) for _ in range(COLS)]
        while not self._stop.is_set():
            for col in range(COLS):
                spawn_timer[col] -= 1
                if spawn_timer[col] <= 0:
                    heads.append([col, 0])
                    spawn_timer[col] = random.randint(4, 14)
            for col in range(COLS):
                for row in range(ROWS):
                    bright[col][row] = max(0, bright[col][row] - FADE)
            new_heads = []
            for h in heads:
                col, row = h
                if row < ROWS:
                    bright[col][row] = 255
                next_row = row + 1
                if next_row < ROWS + int(255 / FADE) + 1:
                    new_heads.append([col, next_row])
            heads = new_heads
            for col in range(COLS):
                for row in range(ROWS):
                    b = bright[col][row]
                    _set_pixel(address_to_pos(row, col), 0, b, 0)
            _show()
            time.sleep(0.05)

    def _police_lights(self):
        ROWS, COLS = 10, 20
        phase = 0
        while not self._stop.is_set():
            for r in range(ROWS):
                for c in range(COLS):
                    pos = address_to_pos(r, c)
                    if c < 10:
                        _set_pixel(pos, 255 if phase == 0 else 0, 0, 0)
                    else:
                        _set_pixel(pos, 0, 0, 255 if phase == 1 else 0)
            _show()
            phase = 1 - phase
            time.sleep(0.06)

    def _heartbeat(self):
        while not self._stop.is_set():
            for _ in range(2):
                for i in range(LED_COUNT):
                    _set_pixel(i, 255, 255, 255)
                _show()
                time.sleep(0.08)
                for i in range(LED_COUNT):
                    _set_pixel(i, 0, 0, 0)
                _show()
                time.sleep(0.08)
            time.sleep(0.70)

    def _game_of_life(self):
        ROWS, COLS = 10, 20

        def random_board():
            return [[1 if random.random() < 0.3 else 0 for _ in range(COLS)] for _ in range(ROWS)]

        def step(board):
            new = [[0] * COLS for _ in range(ROWS)]
            for r in range(ROWS):
                for c in range(COLS):
                    live = sum(
                        board[(r + dr) % ROWS][(c + dc) % COLS]
                        for dr in (-1, 0, 1) for dc in (-1, 0, 1)
                        if not (dr == 0 and dc == 0)
                    )
                    if board[r][c]:
                        new[r][c] = 1 if live in (2, 3) else 0
                    else:
                        new[r][c] = 1 if live == 3 else 0
            return new

        board = random_board()
        seen: set[tuple] = set()
        while not self._stop.is_set():
            for r in range(ROWS):
                for c in range(COLS):
                    _set_pixel(address_to_pos(r, c), 0, 255 if board[r][c] else 0, 0)
            _show()
            time.sleep(0.2)
            state = tuple(cell for row in board for cell in row)
            if not any(state) or state in seen:
                board = random_board()
                seen = set()
            else:
                seen.add(state)
                board = step(board)

    def _comet(self):
        TAIL_LEN = 15
        head = 0
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 0, 0, 0)
            for t in range(TAIL_LEN):
                tail_pos = (head - t - 1) % LED_COUNT
                brightness = (TAIL_LEN - t) / TAIL_LEN
                r, g, b = _wheel(t * 256 // TAIL_LEN)
                _set_pixel(tail_pos, int(r * brightness), int(g * brightness), int(b * brightness))
            _set_pixel(head, 255, 255, 255)
            _show()
            head = (head + 1) % LED_COUNT
            time.sleep(0.02)

    def _starfield_warp(self):
        import math
        ROWS, COLS = 10, 20
        NUM_STARS = 40
        CX, CY = COLS / 2.0 - 0.5, ROWS / 2.0 - 0.5
        ACCEL = 1.08

        def new_star():
            angle = random.uniform(0, 2 * math.pi)
            spd = random.uniform(0.05, 0.15)
            return {'x': CX, 'y': CY, 'dx': math.cos(angle) * spd, 'dy': math.sin(angle) * spd}

        stars = [new_star() for _ in range(NUM_STARS)]
        # Stagger initial positions so display isn't empty at start
        for s in stars:
            for _ in range(random.randint(0, 18)):
                s['dx'] *= ACCEL
                s['dy'] *= ACCEL
                s['x'] += s['dx']
                s['y'] += s['dy']
                if not (0 <= s['x'] < COLS and 0 <= s['y'] < ROWS):
                    s.update(new_star())
                    break

        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 0, 0, 0)
            for s in stars:
                col, row = int(s['x']), int(s['y'])
                if 0 <= row < ROWS and 0 <= col < COLS:
                    spd = math.sqrt(s['dx'] ** 2 + s['dy'] ** 2)
                    bri = min(255, int(spd * 800))
                    _set_pixel(address_to_pos(row, col), bri, bri, min(255, bri + 25))
                s['dx'] *= ACCEL
                s['dy'] *= ACCEL
                s['x'] += s['dx']
                s['y'] += s['dy']
                if not (0 <= s['x'] < COLS and 0 <= s['y'] < ROWS):
                    s.update(new_star())
            _show()
            time.sleep(0.03)

    def _bouncing_ball(self):
        ROWS, COLS = 10, 20
        TRAIL_LEN = 6
        x = float(random.randint(1, COLS - 2))
        y = float(random.randint(1, ROWS - 2))
        dx = random.choice([-1, 1]) * random.uniform(0.5, 0.9)
        dy = random.choice([-1, 1]) * random.uniform(0.5, 0.9)
        trail: list[tuple[int, int, int]] = []
        hue = random.randint(0, 255)
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 0, 0, 0)
            for i, (tc, tr, th) in enumerate(trail):
                bri = (i + 1) / (TRAIL_LEN + 1)
                r, g, b = _wheel(th)
                _set_pixel(address_to_pos(tr, tc), int(r * bri), int(g * bri), int(b * bri))
            col, row = int(x), int(y)
            _set_pixel(address_to_pos(row, col), 255, 255, 255)
            _show()
            trail.append((col, row, hue))
            if len(trail) > TRAIL_LEN:
                trail.pop(0)
            x += dx
            y += dy
            hue = (hue + 10) % 256
            if x <= 0:
                x = 0.0
                dx = abs(dx)
            elif x >= COLS - 1:
                x = float(COLS - 1)
                dx = -abs(dx)
            if y <= 0:
                y = 0.0
                dy = abs(dy)
            elif y >= ROWS - 1:
                y = float(ROWS - 1)
                dy = -abs(dy)
            time.sleep(0.04)

    def _twinkle(self):
        """Dim, slow twinkling stars. Each LED ramps up to a random low peak in
        a soft white/blue/amber, then fades back out at a staggered cadence."""
        level = [0.0] * LED_COUNT
        direction = [0] * LED_COUNT
        peak = [0.0] * LED_COUNT
        color = [(0, 0, 0)] * LED_COUNT
        PALETTE = [
            (140, 142, 155),   # cool white
            (150, 138, 112),   # warm white
            (115, 150, 165),   # pale blue
            (150, 128, 90),    # pale amber
        ]
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                if level[i] <= 0.0:
                    if random.random() < 0.004:
                        direction[i] = 1
                        peak[i] = random.uniform(0.6, 1.0)
                        level[i] = 0.01
                        color[i] = random.choice(PALETTE)
                elif direction[i] == 1:
                    level[i] += random.uniform(0.006, 0.025)
                    if level[i] >= peak[i]:
                        direction[i] = -1
                else:
                    level[i] -= random.uniform(0.004, 0.015)
                    if level[i] <= 0.0:
                        level[i] = 0.0
                        direction[i] = 0
            for i in range(LED_COUNT):
                lv = level[i]
                r, g, b = color[i]
                _set_pixel(i, int(r * lv), int(g * lv), int(b * lv))
            _show()
            time.sleep(0.03)

    def _fireflies(self):
        """A few dim amber fireflies that flash briefly, rest, and drift very
        slowly across the board."""
        ROWS, COLS = 10, 20
        NUM = 12
        flies = [{
            'row': random.uniform(1, ROWS - 2),
            'col': random.uniform(1, COLS - 2),
            'phase': random.uniform(0.0, 4.0),
            'period': random.uniform(3.0, 6.0),
        } for _ in range(NUM)]
        while not self._stop.is_set():
            for i in range(LED_COUNT):
                _set_pixel(i, 0, 0, 0)
            for f in flies:
                f['phase'] += 0.05
                if f['phase'] >= f['period']:
                    f['phase'] = 0.0
                if random.random() < 0.02:
                    f['row'] = min(float(ROWS - 1), max(0.0, f['row'] + random.uniform(-0.5, 0.5)))
                    f['col'] = min(float(COLS - 1), max(0.0, f['col'] + random.uniform(-0.5, 0.5)))
                t = f['phase'] / f['period']  # 0..1 through the cycle
                if t < 0.10:
                    b = t / 0.10
                elif t < 0.35:
                    b = 1.0 - (t - 0.10) / 0.25
                else:
                    b = 0.0
                if b > 0.0:
                    b = b * b * (3.0 - 2.0 * b)  # smoothstep
                    row, col = int(round(f['row'])), int(round(f['col']))
                    if 0 <= row < ROWS and 0 <= col < COLS:
                        _set_pixel(address_to_pos(row, col), int(150 * b), int(190 * b), int(40 * b))
            _show()
            time.sleep(0.05)

    def _aurora(self):
        """Slow, dim northern-lights curtains drifting across the board."""
        import math
        ROWS, COLS = 10, 20
        t = 0.0
        while not self._stop.is_set():
            for r in range(ROWS):
                vband = 1.0 - abs(r - (ROWS - 1) / 2.0) / (ROWS / 2.0)
                for c in range(COLS):
                    wave = (
                        math.sin(c * 0.35 + t * 0.6)
                        + math.sin(c * 0.12 - t * 0.4 + r * 0.8)
                    ) / 2.0
                    v = (wave * 0.5 + 0.5) * vband
                    _set_pixel(
                        address_to_pos(r, c),
                        int(30 * v),
                        int(170 * v),
                        int(120 * v),
                    )
            _show()
            t += 0.05
            time.sleep(0.05)

    def _image(self):
        """Dim, slow screensaver of a fixed 20x10 image. Per-pixel flicker of a
        few percent, a gentle global breathing dip, and a slow shimmer wave
        drifting across the board. Nothing scrolls."""
        import math
        ROWS, COLS = 10, 20
        GAIN = 0.72           # nominal brightness relative to the base image
        MAX_GAIN = 0.85       # hard ceiling: no channel above 85% of its base value
        BREATH_PERIOD = 5.0   # seconds per breath
        BREATH_DEPTH = 0.12   # dips brightness by up to 12%
        SHIMMER_PERIOD = 12.0 # seconds per shimmer cycle
        SHIMMER_DEPTH = 0.04  # +/-4% brightness offset
        JITTER = 0.03         # +/-3% per-pixel, per-frame
        t0 = time.monotonic()
        while not self._stop.is_set():
            t = time.monotonic() - t0
            breath = 0.5 * (1.0 + math.sin(2.0 * math.pi * t / BREATH_PERIOD))
            global_gain = GAIN * (1.0 - BREATH_DEPTH * breath)
            phase = 2.0 * math.pi * t / SHIMMER_PERIOD
            for r in range(ROWS):
                for c in range(COLS):
                    pos = address_to_pos(r, c)
                    br, bg, bb = _IMAGE_COLORS[pos]
                    shimmer = SHIMMER_DEPTH * math.sin(phase - (c * 0.30 + r * 0.12))
                    jitter = random.uniform(-JITTER, JITTER)
                    g = min(MAX_GAIN, global_gain * (1.0 + shimmer + jitter))
                    _set_pixel(pos, int(br * g), int(bg * g), int(bb * g))
            _show()
            time.sleep(0.04)


# 20x10 base image for the "image" routine, in strip order (serpentine, so
# index = address_to_pos(row, col)). Generated by downsampling a source photo.
_IMAGE_COLORS: list[tuple[int, int, int]] = [
    (202, 212, 189), (209, 211, 181), (214, 213, 182), (213, 212, 182), (213, 213, 182),
    (221, 222, 190), (197, 216, 195), (136, 165, 164), (49, 83, 102), (19, 28, 58),
    (32, 49, 78), (31, 50, 76), (106, 108, 105), (199, 186, 148), (187, 179, 145),
    (110, 125, 118), (58, 89, 109), (25, 40, 69), (15, 27, 59), (66, 86, 103),
    (23, 34, 62), (28, 37, 63), (48, 77, 101), (65, 100, 113), (131, 142, 126),
    (191, 184, 150), (207, 196, 153), (241, 222, 169), (88, 90, 96), (19, 36, 69),
    (82, 109, 124), (39, 74, 103), (164, 189, 185), (227, 231, 199), (222, 221, 187),
    (221, 219, 185), (222, 220, 185), (223, 220, 185), (216, 214, 182), (213, 212, 185),
    (210, 210, 183), (215, 214, 183), (219, 218, 185), (219, 218, 184), (218, 217, 185),
    (221, 218, 184), (231, 234, 201), (110, 133, 143), (20, 36, 72), (141, 170, 165),
    (143, 151, 143), (161, 152, 128), (153, 159, 137), (128, 136, 116), (165, 163, 134),
    (66, 85, 93), (36, 70, 91), (48, 82, 101), (34, 48, 73), (39, 49, 73),
    (28, 35, 63), (57, 75, 92), (79, 102, 111), (78, 94, 100), (84, 101, 104),
    (145, 149, 128), (101, 122, 114), (105, 117, 113), (180, 166, 133), (212, 224, 199),
    (63, 85, 108), (64, 95, 118), (81, 108, 126), (211, 217, 191), (219, 215, 184),
    (216, 214, 184), (216, 215, 184), (215, 214, 183), (214, 213, 182), (212, 211, 183),
    (212, 211, 183), (213, 211, 180), (214, 212, 182), (214, 213, 182), (214, 212, 182),
    (222, 219, 186), (184, 192, 173), (47, 78, 110), (112, 144, 148), (61, 82, 101),
    (155, 168, 151), (142, 154, 140), (172, 176, 149), (155, 164, 142), (168, 173, 149),
    (184, 187, 159), (162, 172, 149), (156, 160, 137), (124, 133, 122), (120, 123, 113),
    (78, 101, 108), (64, 83, 95), (79, 105, 113), (81, 97, 104), (118, 137, 131),
    (156, 163, 145), (143, 156, 144), (141, 148, 136), (136, 142, 132), (142, 151, 134),
    (151, 161, 141), (122, 144, 137), (101, 125, 134), (200, 204, 178), (225, 224, 190),
    (216, 215, 182), (216, 216, 184), (215, 214, 183), (215, 213, 182), (215, 213, 183),
    (216, 214, 185), (217, 215, 184), (217, 215, 184), (215, 214, 183), (219, 217, 182),
    (244, 237, 195), (146, 165, 153), (161, 170, 147), (105, 121, 119), (155, 154, 137),
    (124, 139, 132), (161, 167, 149), (146, 158, 144), (137, 148, 134), (118, 123, 111),
    (49, 80, 99), (69, 97, 108), (85, 109, 116), (92, 109, 110), (78, 95, 104),
    (92, 108, 111), (117, 137, 135), (118, 134, 128), (131, 155, 145), (104, 121, 122),
    (123, 129, 117), (125, 137, 123), (102, 114, 110), (114, 126, 119), (136, 146, 133),
    (115, 124, 121), (145, 145, 129), (90, 107, 112), (153, 154, 132), (137, 150, 140),
    (215, 212, 179), (226, 220, 182), (219, 216, 181), (221, 218, 182), (221, 218, 184),
    (228, 221, 182), (225, 219, 178), (228, 221, 181), (200, 202, 173), (166, 171, 147),
    (111, 123, 117), (123, 130, 122), (130, 135, 122), (115, 122, 117), (118, 125, 118),
    (124, 131, 123), (119, 128, 122), (134, 143, 133), (159, 172, 155), (144, 153, 138),
    (107, 119, 116), (93, 110, 112), (129, 144, 133), (136, 154, 142), (99, 114, 111),
    (117, 130, 130), (120, 139, 133), (107, 131, 130), (96, 110, 113), (91, 106, 107),
    (106, 115, 112), (99, 108, 102), (144, 153, 138), (126, 130, 123), (110, 118, 113),
    (122, 128, 117), (110, 119, 112), (132, 138, 125), (99, 112, 112), (162, 162, 138),
    (69, 99, 111), (161, 168, 143), (168, 176, 150), (162, 170, 143), (163, 171, 146),
]


def _wheel(pos: int) -> tuple[int, int, int]:
    pos = 255 - pos
    if pos < 85:
        return (255 - pos * 3, 0, pos * 3)
    if pos < 170:
        pos -= 85
        return (0, pos * 3, 255 - pos * 3)
    pos -= 170
    return (pos * 3, 255 - pos * 3, 0)


def _heat_to_rgb(h: int) -> tuple[int, int, int]:
    """Map heat value 0-255 to black→red→orange→yellow→white."""
    if h < 64:
        return (h * 4, 0, 0)
    if h < 128:
        return (255, (h - 64) * 2, 0)
    if h < 192:
        return (255, 128 + (h - 128) * 2, 0)
    return (255, 255, (h - 192) * 4)


# ---------------------------------------------------------------------------
# Route animation controller
# ---------------------------------------------------------------------------

def _hue_to_rgb(hue: float, brightness: float = 1.0) -> tuple[int, int, int]:
    """
    Convert hue (0.0-1.0) + brightness (0.0-1.0) to RGB.
    Full saturation, so this gives vivid colors.
    """
    import colorsys
    r, g, b = colorsys.hsv_to_rgb(hue, 1.0, brightness)
    return (int(r * 255), int(g * 255), int(b * 255))


# Orange ≈ hue 0.08, Violet ≈ hue 0.75
_ROUTE_HUE_WARM = 0.08
_ROUTE_HUE_COOL = 0.75


class RouteAnimationController:
    """
    Plays a route: an ordered list of (row, col) holds.

    Each hold is "on" for `duration` seconds, transitioning hue from orange
    (warm, just activated) to violet (cool, about to go dark).
    New holds start every `duration / number_shown` seconds so that
    `number_shown` LEDs are visible simultaneously at steady state.
    """

    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop: threading.Event = threading.Event()
        self.current_route_id: int | None = None
        self.current_index: int = 0
        self.total: int = 0
        self.playing: bool = False

    def play(self, holds: list[tuple[int, int]], duration: float, number_shown: int,
             repeat: bool, num_cols: int = 20):
        self.stop()
        self._stop.clear()
        self.current_index = 0
        self.total = len(holds)
        self.playing = True
        self._thread = threading.Thread(
            target=self._run,
            args=(holds, duration, number_shown, repeat, num_cols),
            daemon=True,
        )
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        self.playing = False
        self.current_index = 0
        all_off()

    def _run(self, holds: list[tuple[int, int]], duration: float,
             number_shown: int, repeat: bool, num_cols: int):
        stagger = duration / max(number_shown, 1)
        tick = 0.05  # update interval in seconds

        try:
            while True:
                # active_holds: list of (row, col, start_time)
                active: list[tuple[int, int, float]] = []
                hold_idx = 0
                next_hold_t = 0.0
                t = 0.0

                while not self._stop.is_set():
                    # Activate next hold when it's time
                    if hold_idx < len(holds) and t >= next_hold_t:
                        active.append((holds[hold_idx][0], holds[hold_idx][1], t))
                        self.current_index = hold_idx
                        hold_idx += 1
                        next_hold_t = hold_idx * stagger

                    # Remove expired holds
                    active = [(r, c, st) for r, c, st in active if (t - st) < duration]

                    # Render all active holds
                    if not SIMULATE and _strip is not None:
                        _strip.fill((0, 0, 0))

                    for r, c, start_t in active:
                        age = t - start_t          # 0 → duration
                        progress = age / duration  # 0.0 (warm) → 1.0 (cool)
                        hue = _ROUTE_HUE_WARM + progress * (_ROUTE_HUE_COOL - _ROUTE_HUE_WARM)
                        brightness = 1.0 - (progress ** 1.5)  # non-linear fade
                        rgb = _hue_to_rgb(hue, brightness)
                        pos = address_to_pos(r, c, num_cols)
                        _set_pixel(pos, *rgb)

                    _show()

                    # Done when all holds activated and all have expired
                    last_hold_end = (len(holds) - 1) * stagger + duration
                    if hold_idx >= len(holds) and t >= last_hold_end:
                        break

                    time.sleep(tick)
                    t += tick

                if self._stop.is_set() or not repeat:
                    break

        finally:
            self.playing = False
            all_off()


# Module-level singletons
animation = AnimationController()
route_animation = RouteAnimationController()


def startup():
    if not SIMULATE:
        _init_strip()
    all_off()
