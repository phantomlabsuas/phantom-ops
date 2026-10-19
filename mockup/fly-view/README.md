# Fly view mockup

The mockup is a 1920×1080 night-ops Fly view. It shows hour 9 of a cruise ISR orbit over NAI-3, with an engine CHT 2 caution active.

- **Live version:** https://claude.ai/artifact/VaWQGv4yfVVaLV8R26vCtU. Press **Play** to interact with it.
- **Copied from:** canvas version 1791272670-89cd, on 2026-10-16.

## Files

| File | Purpose |
|---|---|
| `Main.dc.html` | The whole artboard: markup plus logic. |
| `canvas.json` | The canvas index, which holds the frame size and title. |
| `assets/map.jpg` | Synthetic desert basemap. At 25 m/px the 1920×1080 image covers about 48×27 km. |
| `assets/ir.jpg` | Synthetic oblique IR (white-hot) frame of the compound. |
| `asset-generators/map.py`, `ir.py` | The scripts that produced the two images. They need numpy, scipy and Pillow. |
| `source-parts/` | The fragments `Main.dc.html` was assembled from: `top.html` (top bar and left rail), `right.html` (alerts and command window), `bottom.html` (engine and fuel windows, health strip, checklist drawer) and `script.js` (logic). |

## About the `.dc.html` format

The `.dc.html` files come from Claude's Design canvas. They are not plain HTML, and they need the canvas runtime (`support.js`) to render:

- The markup is inside `<x-dc>`.
- `{{hole}}` placeholders are bound to values returned by `renderVals()` in `class Component extends DCLogic`, a React-class-like component with `state`, `setState` and lifecycle methods.
- Conditionals use `<sc-if value="{{flag}}">`.
- Image URLs of the form `/_blob/<id>` point to the uploaded assets. Locally, those are `assets/map.jpg` and `assets/ir.jpg`:
  - `/_blob/141320d3d1c1639d4fc33d604d9402b6` is `map.jpg`.
  - `/_blob/a7e7cf258d545ccf8e4994c81d49c3fd` is `ir.jpg`.

To port it to React, turn `renderVals()` into component state and derived values, `{{x}}` into `{x}`, `<sc-if>` into `&&`, and inline style strings into style objects.

## What's interactive

- **Telemetry:** a simulated 1 Hz tick updates RPM, CHT, EGT, fuel, heading, flight time and the bingo countdown.
- **Picture-in-picture video:** Dock cycles the window through the four corners, and Swap exchanges it with the map. The default corner is set by the `pipCorner` tweak.
- **Health strip:**
  - The ENG segment opens the engine window: RPM dial, CHT 1/2 and EGT bars against their limits, throttle commanded vs actual, a 30-minute CHT trend, and MAP, ignition, mixture and engine hours.
  - The FUEL segment opens the fuel window: tank level with bingo and reserve lines, quantity and %, 2-hour burn rate, fuel temperature and pressure bands, and an endurance bar (now, bingo, landing, dry).
- **Alerts:** acknowledging the caution, from its card or the MASTER CAUTION button, turns off MASTER CAUTION and collapses the card into the "acknowledged · still active" list. The ENG segment stays amber because the condition persists.
- **Command window:**
  - HOLD and RETURN HOME need two taps within 4 s.
  - Speed and altitude targets are changed with −/+, then sent with Send or dropped with Cancel.
  - The verification chips run Sent › Acknowledged › Executed.
  - Resume mission appears after a hold or RTB.
- **Left menu:** every item opens a drawer, but only Checklists is designed. Its Pre-landing / back-transition tab has 5 items verified from telemetry and 4 items the operator ticks; "Arm back-transition" is enabled only once all of them are done. The other menus show a placeholder.
