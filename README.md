# Laser Range

An experimental browser-based dry-fire range for a computer, projector, and fixed-mounted iPhone or Android camera. Built for **ickynk**. Version **0.1.0 — hardware-validation alpha**.

Repository: [ickynk/laserrange](https://github.com/ickynk/laserrange) (private).

## Start on the computer

Install Node.js 22 or newer, then:

```sh
npm ci
npm start
```

Open the **host URL printed in the terminal**, including its `#host=…` fragment. The default `http://localhost:8443` supports a computer-only demo immediately. Phones require **trusted HTTPS**, not an ordinary LAN HTTP address. Follow [the exact setup guide](docs/SETUP.md) before connecting a phone.

No build step, database, paid service, or native mobile app is needed. Dependencies are served by the host after installation. Local files and 3D scenarios work without an internet connection; YouTube does not.

## Included

- Dedicated operator and projector windows, with source frames and scoring owned by the projector. Operator controls, scenario edits, video playback/seek, calibration commands, and shot review stay on the main screen.
- Three.js 3D range with stationary and moving targets, visible armed/unarmed symbols, barriers, and viewpoint translation along an editable path.
- Overhead drag-and-drop placement, numeric properties, target appearance windows, speed, ordered paths, and randomized armed/unarmed roles per run.
- Scenario save/load in browser storage and versioned JSON import/export for sharing.
- Host pairing link/QR code, six-digit phone pairing, role isolation, origin checks, and limited connection attempts.
- Browser rear camera, automatic cyan-marker alignment with manual four-corner fallback, perspective rectification, ambient baseline, three test pulses, red/green selection, and adjustable threshold.
- Experimental reference-frame subtraction, compact-blob detection, temporal pulse filtering, uncertainty flags, stale-reference handling, and readiness reset on disruption.
- Raycast hit/miss/no-shoot scoring that accounts for barriers and historical scene time; screen position and approximate first-shot/split timing; audible start tone.
- Uploaded-video playback with source-frame snapshots and manual scoring. YouTube IFrame playback with **phone camera snapshots**, manual scoring, and reduced-confidence detection.
- Small persistent impact dots on targets and barriers, attached to their 3D surfaces so they follow target movement. Misses and uncertain/video events retain small screen-position dots. New sessions clear the marks.
- Mouse-driven demo mode; turn-based shooter names and the last five completed sessions retained in memory.
- Automated geometry, image-processing, protocol, and browser tests; GitHub Actions verification.

## Important accuracy boundaries

This is a working software alpha, **not a validated replacement for a dedicated shot timer or commercial optical trainer**. No physical TitanX, DryFireMag, projector, iPhone, or Android testing has been performed in the development environment. The repository does not certify compatibility with any specific laser device.

1. A browser camera can miss a pulse that falls between exposures. A laser clipped to pure white may lose the chroma necessary for detection. A visible red/green pulse must actually reach the projected surface; a trigger-reset accessory alone does not guarantee an optical pulse.
2. Source subtraction reduces false positives; it cannot eliminate them. Rolling shutter, exposure, white balance, compression, ambient colored light, projection delay, and registration error remain concerns. Auto-detected corners must be visually checked.
3. At 480×270 processing resolution, a small/faint dot can disappear during resampling. Real-device experiments must determine acceptable distance, image size, camera settings, and pulse duration.
4. The initial 100 ms display/capture correction is an **unmeasured starting value**. Source frames are retained about 11 times per second and mobile timestamps approximate processing time. Scores on fast-moving targets can be wrong until timing is tuned. This is not frame-exact synchronization.
5. A “miss” means a detected pulse on the calibrated screen that does not hit a valid target, including a blocked target. Shots outside the screen or undetected pulses cannot be counted.
6. The scoring surface is the complete rectangular target board. Anatomical zones, firearm recognition, and automatic AI video scoring are not implemented.
7. Multiple shooters take turns. The system cannot identify simultaneous shooters using identical laser colors. Multi-blob frames are marked uncertain.
8. YouTube does not expose source video pixels to this app. It has no source-frame deconfliction, so **every detected event requires manual review**. Its snapshots come from the rectified camera image, with the marker overlaid during review. Ads, restricted embedding, and playback controls can affect a run.

For safe dry-fire practice, use an appropriate unloaded/dedicated training setup and a safe direction. The app does not verify firearm condition.

## How to use the editor

1. Select **Overhead editor**. Choose a target/barrier in the list or click it in the scene; drag it across the floor. Numeric controls give exact placement and dimensions.
2. For a moving target, select it, choose **Draw target path**, and click ordered floor points. Press Escape when finished. A path replaces the target's static location; motion starts at its first point and travels back and forth at the chosen speed.
3. Set the target to Shoot, No-shoot, or Randomize. “Randomize” independently chooses a role with 50% probability at session start.
4. Set appearance/disappearance times within the scenario duration. Empty intervals never appear during a run.
5. Enable **Move viewpoint**, draw a camera path, and preview with a demo run. The camera moves at 0.6 m/s and stops at the end. Its height and forward look direction are currently fixed.
6. Save locally, or use **Share JSON** to send the scenario to another user. The JSON includes geometry and timing, not uploaded media or session images.

## Test

```sh
npm run check
npm test
npx playwright install chromium
npx playwright test
```

See [architecture](docs/ARCHITECTURE.md), [hardware acceptance checks](docs/HARDWARE-VALIDATION.md), and [development roadmap](docs/ROADMAP.md). Screenshots in `test-results/` are temporary outputs and are not committed.

## Privacy and persistence

Camera processing runs on the phone. The phone sends coordinates, timestamps, status, and a rectified still for each detected pulse to the paired host. It does not continuously stream raw camera video to a cloud service. The host sends downsampled source frames to the phone. An optional HTTPS tunnel provider can see traffic metadata; use LAN TLS if you want a local-only connection.

Scenarios persist only when saved in browser storage or exported as JSON. Session results and snapshots remain in memory and disappear when the page closes. The latest five runs are retained for turn-based review. Share files intentionally; there is no hosted scenario directory or user-account system.

Host links contain an administrative secret. Phone pairing codes allow participation in a local session; do not publish them. Certificates and dependencies are excluded by `.gitignore`. No license for public redistribution is granted by this private project unless its owner adds one.
