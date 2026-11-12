# Laser Range

An experimental browser-based dry-fire range for a computer, projector, and fixed-mounted iPhone or Android camera. Built for **ickynk**. Version **0.1.0 — hardware-validation alpha**.

Repository: [ickynk/laserrange](https://github.com/ickynk/laserrange) (private).

## Portable and home-server deployment

Use **Start-Laser-Range.cmd** (Windows) or **Start-Laser-Range.command** (macOS/Linux) for guided first-time setup and repeat launches. `npm run setup` configures portable LAN HTTPS or an existing home HTTPS proxy. Docker Compose presets provide persistent home hosting with an existing proxy/tunnel or a bundled Caddy gateway. Remote QR links use phone-only pairing keys. See [Deployment guide](docs/DEPLOYMENT.md) for setup, updates and backups.

For **Portainer + CasaOS on port 80**, use the [443-only setup guide](docs/PORTAINER.md) and `compose.portainer.yaml`.

## Start on the computer

Install Node.js 22 or newer, then:

```sh
npm ci
npm start
```

Run `npm run host:link` in a second terminal and open the **private operator URL it prints**, including its `#host=…` fragment. Normal server/container startup logs omit this credential; the interactive portable launcher displays it explicitly. The default `http://localhost:8443` supports a computer-only demo immediately. Phones require **trusted HTTPS**, not an ordinary LAN HTTP address. Follow [the exact setup guide](docs/SETUP.md) before connecting a phone.

No build step, database, paid service, or native mobile app is needed. Dependencies are served by the host after installation. Local files and 3D scenarios work without an internet connection; YouTube does not.

## Included

- Dedicated operator and projector windows, with source frames and scoring owned by the projector. Operator controls, scenario edits, video playback/seek, calibration commands, and shot review stay on the main screen.
- Three.js 3D range with stationary and moving targets, visible armed/unarmed symbols, barriers, and viewpoint translation along an editable path.
- Overhead drag-and-drop placement, numeric properties, target appearance windows, speed, ordered paths, and randomized armed/unarmed roles per run.
- Full-volume mannequins, rotating targets, improved vehicles/walls/doorways/drums/ported barricades, and custom target-image upload with drag/zoom cropping onto cardboard.
- Reactive dueling trees, Texas stars, knockdown/sliding steel, rubber dodecahedrons, breakable bottles and stackable cans, with adjustable impact strength and elevation. Cool-toned materials and contact shadows improve depth cues.
- Configurable scoring zones, target repeats/easing, camera speed/height/FOV and per-segment focus points with smooth view transitions.
- Collapsible editor groups, independent desktop scrolling and alternating camera node/focus placement.
- Synthesized gunshot/dry-click audio and an optional magazine counter with Reload prompt and assumed reload.
- Optional phone voice commands: Moving (next segment), Cover (reload), Retrograde (previous segment); browser support/internet requirements vary.
- Optional segment holds with shooter-operated Next/Previous; projector laser/click controls for Start, Restart, saved ranges and End.
- Scenario quick-save in browser storage, persistent host range/video-link folders, and versioned JSON import/export including custom target images.
- Host pairing link/QR code, six-digit phone pairing, role isolation, origin checks, limited connection attempts, and automatic cooldown/recovery after temporary message rate limits.
- Browser rear camera, automatic black-and-white coded-marker alignment with an independent center check and manual numbered-crosshair fallback, perspective rectification, ambient baseline, three test pulses, red/green selection, and adjustable threshold.
- Optional five-shot screen zero per shooter, with reviewed correction, group checks and reset on alignment changes.
- Experimental reference-frame subtraction, compact-blob detection, temporal pulse filtering, uncertainty flags, stale-reference handling, and readiness reset on disruption.
- Raycast hit/miss/no-shoot scoring that accounts for barriers and historical scene time; screen position and approximate first-shot/split timing; audible start tone.
- Uploaded-video playback with source-frame snapshots and manual scoring. YouTube IFrame playback with **phone camera snapshots**, manual scoring, and reduced-confidence detection.
- Small persistent impact dots on targets and barriers, attached to their 3D surfaces so they follow target movement. Misses and uncertain/video events retain small screen-position dots. New sessions clear the marks.
- Mouse-driven demo mode; countdown/configurable beep; turn-based shooter comparison for up to 50 runs, with images for the newest five. Review frames support arrow keys, previous/next buttons and image clicks.
- Camera Health controls on the phone and operator: acknowledged pause/resume/sensitivity refresh, capture-stall monitoring, and verified focus/exposure/white-balance settings where supported by the browser.
- Range Health panel and guided placement, pulse-count, no-fire and voice tests, with aggregate results retained in the operator browser.
- Automated geometry, image-processing, protocol, and browser tests; GitHub Actions verification.

## Important accuracy boundaries

This is a working software alpha, **not a validated replacement for a dedicated shot timer or commercial optical trainer**. No physical TitanX, DryFireMag, projector, iPhone, or Android testing has been performed in the development environment. The repository does not certify compatibility with any specific laser device.

1. A browser camera can miss a pulse that falls between exposures. A laser clipped to pure white may lose the chroma necessary for detection. A visible red/green pulse must actually reach the projected surface; a trigger-reset accessory alone does not guarantee an optical pulse.
2. Source subtraction reduces false positives; it cannot eliminate them. Rolling shutter, exposure, white balance, compression, ambient colored light, projection delay, and registration error remain concerns. Auto-detected corners must be visually checked.
3. At 480×270 processing resolution, a small/faint dot can disappear during resampling. Real-device experiments must determine acceptable distance, image size, camera settings, and pulse duration.
4. The initial 100 ms display/capture correction is an **unmeasured starting value**. Source frames are retained about 11 times per second and mobile timestamps approximate processing time. Scores on fast-moving targets can be wrong until timing is tuned. This is not frame-exact synchronization.
5. A “miss” means a detected pulse on the calibrated screen that does not hit a valid target, including a blocked target. Shots outside the screen or undetected pulses cannot be counted.
6. Hits use the rendered target geometry and configured local scoring zones. This is not anatomical injury modeling, firearm recognition, or automatic AI video scoring.
7. Multiple shooters take turns. The system cannot identify simultaneous shooters using identical laser colors. Multi-blob frames are marked uncertain.
8. YouTube does not expose source video pixels to this app. It has no source-frame deconfliction, so **every detected event requires manual review**. Its snapshots come from the rectified camera image, with the marker overlaid during review. Ads, restricted embedding, and playback controls can affect a run.

For safe dry-fire practice, use an appropriate unloaded/dedicated training setup and a safe direction. The app does not verify firearm condition.

## How to use the editor

1. Select **Overhead editor**. Choose a target/barrier in the list or click it in the scene; drag it across the floor. Numeric controls give exact placement and dimensions.
2. For a moving target, select it, choose **Draw target path**, and click ordered floor points. Press Escape when finished. A path replaces the target's static location; motion starts at its first point and travels back and forth at the chosen speed.
3. Set the target to Shoot, No-shoot, or Randomize. “Randomize” independently chooses a role with 50% probability at session start.
4. Set appearance/disappearance times within the scenario duration. Empty intervals never appear during a run.
5. Enable **Move viewpoint**, draw a camera path, and preview with a demo run. Adjust camera speed, height and field of view. Select each segment and click its focus point in overhead view; Focus transition eases the view direction at joins. The camera stops at the path end.
6. Save to the host range folder, quick-save in this browser, or use **Share JSON** to send the scenario to another user. JSON includes geometry, timing, POV settings and cropped target images; it does not include uploaded videos or session screenshots.

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

## Reactive targets

Add a target in the overhead editor and use **Target asset** to select **Steel · Dueling tree**, **Steel · Texas star**, **Steel · Knockdown plate**, **Steel · Sliding post plate**, **Rubber · Dodecahedron**, **Glass bottle · Breakable**, **Tin can**, or **Tin cans · Pyramid stack**. Adjust width, height and rotation as usual. Reactive properties add **Elevation**, **Impact strength**, and **Stack rows** for the can-stack preset. Individual cans can also be placed above one another or on a barricade using elevation (the height of the object's bottom above the floor).

- Tree paddles swing between sides and remain available for subsequent hits; their diameters are constrained by vertical spacing so adjacent plates cannot overlap. Star plates detach individually; the remaining weight drives rotor motion. Knockdown steel stays down until the next session. Sliding plates descend vertically along their post and stop at its base.
- Rubber dodecahedrons use a matching twelve-pentagon collision hull; off-center impacts and changing contact faces produce different tumbles. Existing saved `rubber-hex` targets automatically render and simulate as dodecahedrons. Rubber props roll/bounce, bottles break into fragments, and cans collide and topple. Bottle fragments and detached/downed steel do not earn further hits. Supports count as misses.
- Start or Restart resets every prop. Camera-segment holds and backward navigation do not reset physics. Reactive appearance/repeat schedules use elapsed session time and retain the prop's state when it reappears; they do not respawn broken targets.
- Physics replaces drawn movement paths for these targets. Custom uploaded/cropped target images remain available on the cardboard backer.

Impact strength is a simulation control, not a caliber or measured energy setting. Cans, falling plates and fragments use rigid bodies; tree/star/knockdown mechanisms use constrained rotation. Collision shapes and barrier surfaces are simplified, and these motions have not been calibrated against real target hardware. Scenarios are limited to 160 reactive bodies to bound simulation cost. Shadows and physics add host graphics/CPU load; validate camera detection with the updated projected scene before relying on it.

After updating an existing installation, run `npm ci`, restart the server, and refresh both operator and projector pages to load the new physics dependency.

### Steel hit counts and two-sided cardboard

For steel, set **Hits before fall / swing** (1–20, default 1). Each plate has its own counter. Knockdowns, sliding plates, and Texas-star plates stay active until that count is reached; tree paddles swing when the count is reached and start a fresh count for the next swing. Restart resets all counters. For sliding steel, width sets plate diameter and height sets total post height; height must exceed diameter by at least 0.1 m.

For cardboard, open **Cardboard sides and turning**. Choose a blank back, repeat the front image, or upload/crop a separate back image. Both images travel with saved/shared ranges. Set the back scoring role to Same as front, Shoot, or No-shoot to match the image; the app does not identify image content automatically. Scoring zones apply in each face's own left-to-right coordinates, and marks stay attached to the face struck.

Enable **Turn between sides during session**, select 90–180 degrees, and set hold time and turn duration. A 180-degree turn presents the opposite image; a 90-degree turn exposes/hides a face edge-on (use Target rotation to choose the starting orientation). Turns alternate with smooth starts/stops, continue during camera holds, and restart from the initial angle. Historical shot scoring uses the face presented at the captured frame's time. The overhead editor shows the initial orientation.
