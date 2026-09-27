# Development validation

Version 0.1.0, hardware-validation alpha.

| Check | Result |
|---|---|
| JavaScript syntax (`npm run check`) | Passed |
| Node unit/integration suite (`npm test`) | 41 passed, 0 failed |
| Playwright browser suite | 34 passed, 0 failed in one full run; saved-library layout regression also passed after the final markup adjustment |
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

Video regressions cover short red/green pulse confirmation with original timestamp/image, rejection of sustained and moving highlights, scene cuts and camera-frame gaps, dim-pulse detection with retained manual thresholds, and source chroma gain/tint compensation. The real synthetic-phone pipeline verifies the slider remains at 18 across refreshes and video playback, with a short confirmed video pulse in both display modes. Barricade tests verify length controls, invalid-value rejection, saved/imported depth and rendered geometry. Physical false-positive rate and faint-laser performance on the user's actual videos remain unmeasured.


Scenario/session extension regressions cover backward-compatible imports, malformed options, repeat boundaries, easing, zone priority and ellipse boundaries, settings/input-separated comparisons and within-run timing, muted/cancelled audio scheduling, asset/schedule persistence, window aperture versus frame occlusion, final camera heading, and countdown cancellation/early-shot exclusion/zone points in both display modes. A focused six-test rerun includes two additional uploaded-video checks proving an already-playing preview pauses for countdown and resumes at go. Original procedural assets were inspected in a rendered gallery. Physical audio/display synchronization and real-device video recall remain unmeasured.

Balanced-video regression confirms an onset core can fade while broad neighboring video changes continue, while a translated compact highlight is rejected. Earlier hardware feedback reported near-zero false positives but roughly one-in-ten true shots with the conservative filter. The latest feedback reports better video operation and fewer false positives with Balanced filtering, without a measured recall rate. This update is a candidate fix, not a measured hardware recall improvement; test the same clip with the new diagnostics.


Editor revision tests verify camera-focus continuity and deterministic historical poses, invalid POV/image/rotation inputs, authenticated folder access, range/image round-trips and persistence after server restart, invalid link rejection, and deletion. Browser coverage exercises crop application, target rotation, overhead focus selection, host-folder reloads, saved video-link creation, keyboard/button review navigation including disabled-button boundaries, full-volume mannequin geometry and limb gaps, rotated target local hit coordinates/impact attachment, and custom-image rendering plus scoring in the separate projector. Updated props were inspected in a rendered gallery. Full-volume mannequins and props remain procedural assets; their appearance is not a photorealism claim.


Segment progression regressions cover endpoint holds beyond the nominal duration, continued shot recording, forward/reverse travel, retained focus at holds, historical scene times, legacy/video behavior and invalid path durations. Projector controls are exercised with paired protocol-level laser messages and native pointer input: idle Start, Next/Previous, Restart, saved-range menu/load, and exclusion of control strikes from shot totals. Unit coverage checks disabled/stale controls and duplicate suppression. The rendered lower-border strip was visually inspected. Physical laser activation of the strip remains unverified.

In the previous segment-controls revision, the 30-test browser run passed 29 tests, but the separate-projector synthetic camera test recorded its first shot without classifying the expected miss. An unchanged isolated rerun passed the entire camera flow (including video, zero and reconnection) in 1.9 minutes. This is an intermittent scoring/timing test failure; its exact cause is not established. Scoring confidence and reference-age safeguards were not weakened.


Editor/pairing/audio revision: the full 34-test browser suite passed without retries, including both complete synthetic-camera flows. New browser coverage verifies independent editor scrolling, alternating movement/focus placement and saved schema, the QR-encoded URL with prefilled code, forced WebSocket rate limiting followed by automatic same-code recovery, magazine depletion/dry trigger/refill/reset in both display modes, distinct audio playback and mute behavior. Unit coverage tests magazine boundaries, disabled unlimited mode, invalid settings, distinct audio buffers, blocked-audio dropping and cancellation. Desktop and mobile layouts plus the Reload banner were inspected. The saved-range controls received a final full-width layout adjustment and their crop/focus/library regression was rerun successfully. Physical QR reliability, real laser/audio latency and perceived sound realism remain unmeasured. The original hardware rate-limit burst source was not reproduced; the verified fix is automatic recovery plus less redundant status traffic.
