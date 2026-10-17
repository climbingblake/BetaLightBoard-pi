# Image → LED routine prompt

Paste this into Claude (in the Beta Light Board repo), and attach the image you want on the board.

---

You're working in the "Beta Light Board" repo: a FastAPI + React climbing-board controller that drives a 200-LED NeoPixel strip on a Raspberry Pi 5. The strip is wired as a 10-row × 20-column grid.

## Board model

- 200 LEDs, rows 0-9, columns 0-19.
- Serpentine wiring: even rows run left→right, odd rows run right→left. The strip index for grid `(row, col)` is computed by `address_to_pos(row, col, num_cols=20)` in `app/led_controller.py` (even rows `col + row*20`, odd rows `(19 - col) + row*20`).
- Colors are plain RGB tuples `(r, g, b)`, 0-255. No FastLED; it's Adafruit NeoPixel over SPI.
- A "routine" is a method on `AnimationController` in `app/led_controller.py`. Existing examples: `_twinkle`, `_fireflies`, `_aurora`. Each runs `while not self._stop.is_set():`, writes pixels with `_set_pixel(pos, r, g, b)`, then calls `_show()`, then `time.sleep(...)`.

## Task

Take the image I attached and turn it into a new routine that shows the image on the board, with a subtle flicker/dim and a little slow motion, in a dim screensaver style. Nothing fast, nothing bright.

Do this:

1. **Downsample the image to 10×20.** Write and run a short Python script (Pillow, or numpy if it's available) that:
   - Locates the attached image file (ask me for its path if you can't find it).
   - Center-crops it to a 2:1 aspect ratio (the board is 20 wide × 10 tall).
   - Resizes to exactly 20 wide × 10 tall (use a high-quality resample).
   - Prints the average RGB of each cell as a 10×20 grid.
   Do not eyeball the colors from vision; compute them with the script. `pip install pillow` first if Pillow isn't installed.

2. **Map to strip order.** Reorder those 200 colors into serpentine strip order so `strip_index = address_to_pos(row, col)` is the color for `(row, col)`. Keep the result as a flat list of 200 `(r, g, b)` tuples.

3. **Add the routine.** In `app/led_controller.py`, add a method on `AnimationController` (name it `_image` or a snake_case name I give you) that:
   - Embeds the 200 base colors hardcoded in the source, not loaded from a file at runtime, so it survives deploy to the Pi.
   - Each frame writes all 200 pixels via `_set_pixel(...)` then `_show()`, inside `while not self._stop.is_set():`.
   - Adds subtle flicker: a tiny per-pixel luminance jitter of ±2-4% each frame, plus an optional slow global "breathing" (a sine over ~4-6s) that dips brightness ~10-15%. Keep it dim and barely noticeable.
   - Adds slight motion: a very slow shimmer wave that sweeps across the board (a sine offset in per-pixel brightness, moving at maybe one cycle per 8-15s). Nothing scrolls; nothing faster than a gentle drift.
   - Sleeps ~0.03-0.05s per frame.

4. **Register it in all three places:**
   - The `handlers` dict in `AnimationController._loop` in `app/led_controller.py`.
   - `VALID_ROUTINES` in `app/routers/routines.py`.
   - The `ROUTINES` array in `frontend/src/pages/Routines.tsx`, adding `{ name, label, color }` with a Tailwind gradient for the button.

5. **Verify:**
   - `python -m py_compile app/led_controller.py`
   - Run it in simulate mode (`LED_SIMULATE=1`) and confirm the thread stays alive.
   - `cd frontend && npm run build` and confirm `tsc` passes.

## Style constraints

- Dim: cap effective pixel values low, and never let flicker push any channel above ~85% of the base image value.
- Slow: only a gentle shimmer or drift. No scrolling, no strobe, no hard color cycling, no rainbows.
- Match existing conventions exactly (method names, `handlers` dict, `_set_pixel`/`_show`). Don't add dependencies.
