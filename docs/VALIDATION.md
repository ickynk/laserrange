# Development validation

Version 0.1.0, hardware-validation alpha.

| Check | Result |
|---|---|
| JavaScript syntax (`npm run check`) | Passed |
| Node unit/integration suite (`npm test`) | 21 passed, 0 failed |
| Playwright browser suite | 17 passed, 0 failed |
| Rendered desktop interface | Screenshot inspected |
| Physical iPhone / Android camera | User reports working auto-alignment and horizontal placement; successful screen-zero correction; connection-recovery hardware retest pending |
| TitanX / DryFireMag-associated laser | User hardware feedback received; device-specific accuracy unverified |
| Projector optics and end-to-end latency | Not measured |
| YouTube live playback / uploaded media codec compatibility | Implementation present; not verified against real media in this environment |

Browser tests ran in headless Chromium 153 using software WebGL on Linux. The standard Playwright Chromium download timed out in the development environment; an alternate Chromium package supplied the executable via the optional `CHROMIUM_PATH` setting. This package is not a project dependency. CI uses Playwright's standard Chromium install.

The browser suite exercises scenario editing and persistence, path editing, demo shot capture and frame review, live-mode calibration gating, invalid-import rejection, phone UI guards, 3D target/obstacle/no-shoot scoring, and a full paired synthetic camera flow.

The synthetic camera test paints the host's reference frames into a browser MediaStream, adds red pulses, and verifies automatic corner alignment, baseline capture, three-pulse qualification, arming, live shot delivery/scoring, and deactivation on backgrounding. It validates the software integration under idealized optics. It **does not** simulate projector/camera latency, exposure, rolling shutter, distortion, real pulse durations, or changing ambient light.

The unit tests cover both red and green pulses, perspective mapping, malformed calibration, stale sources, duplicate suppression, moving projected-color rejection, ambiguous components, scoring summaries, validated scenario data, and WebSocket authentication/routing.

The physical acceptance gates in [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md) remain required before relying on live detection or timing.

Regression coverage also verifies HTTPS pairing recovery from a plain URL, QR rendering, reload persistence, and expired-key recovery using a test-only self-signed certificate. The test browser bypasses trust for this fixture only; real phones still require a trusted certificate. Impact regressions verify attachment to moving targets, repeat-shot raycasting without marker interference, persistent miss dots, and clearing on a new session.

The YouTube input regression uses a controlled cross-origin iframe and a mocked player API. It verifies that demo clicks record shots without reaching player controls, right-clicks do not fire, explicit play/pause remains usable, stopping restores native interaction, and changing modes disables the capture surface. It does not verify live YouTube playback, advertisements, or service availability.

Two-window regression coverage includes 3D shot scoring and projector-owned review frames, operator layout changes, scene/path editing, session resets, projector closure, uploaded-video Blob transfer and seeking, and YouTube control routing. A generated four-second WebM test pattern is included at `tests/fixtures/projector.webm`. The paired synthetic-camera flow also runs through the separate projector and verifies that operator resizing preserves readiness and fixed-frame projector resizing preserves it after automatic sensitivity refresh. Physical projector/camera/laser accuracy remains unmeasured.

Calibration regression coverage verifies automatic live-input selection, shot delivery after automatic sensitivity refresh, retained corners and pulse qualification through resizing and video/3D changes, and shots in repeated sessions. A unit regression checks both red and green pulses after adaptation with a moving background and verifies that sensitivity stays within the pulse-validated threshold.

Phone alignment regressions cover requesting/closing the calibration display in both display modes, automatic coded-board detection followed by live shots, blank-camera timeout and manual fallback on a 390-pixel phone viewport, undo, and zoom/drag/pinch coordinate behavior. Unit tests cover perspective and rotated coded-board recovery, soft focus, raised black levels, uneven illumination, color casts, missing/duplicate codes, rejected inconsistent center checks, and clipped frames. Real projector marker recognition under glare and extreme viewing angles still needs hardware validation.

Coded-board regression tests verify a grid of 25 independent ground-truth screen positions after detection and exercise camera image → rectification → laser detector at center and all four edges. A manual regression reproduces outward expansion when inset points are mistaken for edges, then verifies the known-anchor mapping removes it. Synthetic error bounds are not a hardware accuracy claim. The user reports successful coded-board alignment and accurate horizontal placement on hardware, with a remaining constant vertical offset. The optional screen-zero correction still requires a physical retest.

Five-shot screen-zero tests cover correction direction, retained raw coordinates, rejection of incomplete/scattered/excessive groups, unclamped off-screen misses, per-shooter isolation, cancellation, invalidation, and exactly-once application in both display modes. Paired synthetic-camera tests collect and apply the optional zero through the real phone detector and then record live shots. The user reports successful physical correction of the vertical offset.

Recovery regressions forcibly terminate each peer socket and verify the same pairing code, corners, three-pulse qualification and applied zero survive, then record new shots. Both display modes exercise looped uploaded video for over 40 seconds, overhead/perspective switching, and phone background/restore; the separate projector also exercises visibility restoration. Server coverage checks 100-message bursts, host-first/phone-first recovery and same-client socket replacement. Physical Wi-Fi loss and mobile browser suspension still require hardware retesting.
