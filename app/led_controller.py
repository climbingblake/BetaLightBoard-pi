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
            pixel_order=neopixel.RGB,
        )
        logger.info("adafruit neopixel strip initialized via SPI")
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
        _strip.show()


def set_led(row: int, col: int, color: str, num_cols: int = 20):
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
