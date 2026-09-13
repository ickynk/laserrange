# Development validation

Version 0.1.0, hardware-validation alpha.

| Check | Result |
|---|---|
| JavaScript syntax (`npm run check`) | Passed |
| Node unit/integration suite (`npm test`) | 10 passed, 0 failed |
| Playwright browser suite | 7 passed, 0 failed |
| Rendered desktop interface | Screenshot inspected |
| Physical iPhone / Android camera | Not tested |
| TitanX / DryFireMag-associated laser | Not tested |
| Projector optics and end-to-end latency | Not measured |
| YouTube live playback / uploaded media codec compatibility | Implementation present; not verified against real media in this environment |

Browser tests ran in headless Chromium 153 using software WebGL on Linux. The standard Playwright Chromium download timed out in the development environment; an alternate Chromium package supplied the executable via the optional `CHROMIUM_PATH` setting. This package is not a project dependency. CI uses Playwright's standard Chromium install.

The browser suite exercises scenario editing and persistence, path editing, demo shot capture and frame review, live-mode calibration gating, invalid-import rejection, phone UI guards, 3D target/obstacle/no-shoot scoring, and a full paired synthetic camera flow.

The synthetic camera test paints the host's reference frames into a browser MediaStream, adds red pulses, and verifies automatic corner alignment, baseline capture, three-pulse qualification, arming, live shot delivery/scoring, and deactivation on backgrounding. It validates the software integration under idealized optics. It **does not** simulate projector/camera latency, exposure, rolling shutter, distortion, real pulse durations, or changing ambient light.

The unit tests cover both red and green pulses, perspective mapping, malformed calibration, stale sources, duplicate suppression, moving projected-color rejection, ambiguous components, scoring summaries, validated scenario data, and WebSocket authentication/routing.

The physical acceptance gates in [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md) remain required before relying on live detection or timing.

Regression coverage also verifies HTTPS pairing recovery from a plain URL, QR rendering, reload persistence, and expired-key recovery using a test-only self-signed certificate. The test browser bypasses trust for this fixture only; real phones still require a trusted certificate. Impact regressions verify attachment to moving targets, repeat-shot raycasting without marker interference, persistent miss dots, and clearing on a new session.
