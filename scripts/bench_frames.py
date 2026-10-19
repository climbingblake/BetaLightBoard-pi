#!/usr/bin/env python3
"""Measure per-frame compute cost of every LED routine, no hardware needed.

Run it ON the target board, since the CPU is the thing being measured:

    LED_SIMULATE=1 .venv/bin/python scripts/bench_frames.py [seconds_per_routine]

time.sleep is stubbed so each routine runs flat out. For each routine we report
the compute time per frame, the sleep it asks for per frame, and the CPU share
it would use at its real pace: compute / (compute + sleep).

This is a lower bound. Pixel writes are stubbed with a list store, so the
NeoPixel library's own per-pixel and show() cost is not included; on a Pi Zero W
that adds on top. Treat anything near 50% here as too tight.
"""
import os
import platform
import sys
import time

os.environ["LED_SIMULATE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import led_controller as lc  # noqa: E402

ROUTINES = [
    "rainbow", "chase", "iceflakes", "fire", "space_invader", "matrix_rain",
    "police_lights", "heartbeat", "game_of_life", "comet", "starfield_warp",
    "bouncing_ball", "twinkle", "fireflies", "aurora", "image",
]

REAL_SLEEP = time.sleep


def run_one(start, stop, seconds):
    frames = 0
    asked = 0.0
    buf = [None] * lc.LED_COUNT

    def fake_sleep(s):
        nonlocal asked
        asked += s
        REAL_SLEEP(0)  # yield so the timing thread wakes on a single core

    def fake_show():
        nonlocal frames
        frames += 1

    def fake_set(pos, r, g, b):
        buf[pos] = (r, g, b)

    saved = (lc._set_pixel, lc._show, time.sleep)
    lc._set_pixel, lc._show, time.sleep = fake_set, fake_show, fake_sleep
    try:
        start()
        t0 = time.monotonic()
        REAL_SLEEP(seconds)
        elapsed = time.monotonic() - t0
        n, a = frames, asked
        stop()
    finally:
        lc._set_pixel, lc._show, time.sleep = saved
    return n, a, elapsed


def main():
    seconds = float(sys.argv[1]) if len(sys.argv) > 1 else 3.0
    print(f"{platform.machine()}  python {platform.python_version()}  "
          f"cpus={os.cpu_count()}  {seconds:.0f}s per routine\n")
    print(f"{'routine':<16}{'compute ms':>11}{'sleep ms':>10}{'cpu share':>11}")

    ctl = lc.AnimationController()
    rows = [(name, lambda n=name: ctl.run(n), ctl.stop) for name in ROUTINES]

    holds = [(i % 10, (i * 3) % 20) for i in range(20)]
    rc = lc.route_animation
    rows.append(("route", lambda: rc.play(holds, 5.0, 5, True), rc.stop))

    worst = 0.0
    for name, start, stop in rows:
        frames, asked, elapsed = run_one(start, stop, seconds)
        if frames == 0:
            print(f"{name:<16}{'no frames':>11}")
            continue
        compute = elapsed / frames * 1000
        sleep = asked / frames * 1000
        share = compute / (compute + sleep) * 100 if (compute + sleep) else 0
        worst = max(worst, share)
        print(f"{name:<16}{compute:>11.2f}{sleep:>10.1f}{share:>10.0f}%")

    print(f"\nworst case: {worst:.0f}% of one core (excluding NeoPixel library cost)")


if __name__ == "__main__":
    main()
