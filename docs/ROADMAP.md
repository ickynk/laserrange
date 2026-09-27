# Development roadmap

## Implemented alpha

- Local Node host, secure-context deployment options, paired phone browser.
- 3D editor, target/barrier placement, movement paths, timed roles, randomization, viewpoint translation, JSON sharing.
- Manual/marker-assisted calibration, baseline and pulse-check gate.
- Experimental laser detection with source subtraction and manual-review fallback.
- Uploaded/YouTube video workflows; approximate source-frame and camera snapshot review.
- Hit/miss/no-shoot summaries, timing, named turn-based runs, desktop demo.

## Completed: separate operator and projector views

- Dedicated clean projector window and same-origin operator connection.
- Projector-owned rendered frame history, resolved scenario roles, hit scoring, and persistent impact marks.
- Live projector preview for 3D scenes and uploaded video; YouTube plays only in the projector when connected.
- Operator-side start/stop, play/pause, seek, shooter controls, calibration, and scenario editing.
- Calibration survives operator layout changes, fixed-frame resizing, transient transport interruptions and backgrounding. Confirmed display-source changes still require realignment.
- Paired synthetic-camera and two-window regression coverage, including an uploaded-video fixture and mocked YouTube player.

## Completed: editor and library revision

- Full-volume mannequins and target yaw rotation; improved vehicle geometry, masonry walls, open doorways, drums and port barricades.
- Custom target-image upload with drag/zoom crop onto a cardboard backer; embedded in shared range files.
- Per-segment overhead focus selection, eased camera direction transitions, configurable height/FOV.
- Shot review previous/next buttons, arrow keys and image clicks.
- Authenticated persistent host folders for saved ranges and named YouTube links.

## Completed: shooter progression controls

- Opt-in camera-segment endpoint holds, next/previous movement and explicit session end.
- Laser/click projector strip with Start, Restart, saved-range menu and segment controls.
- Control strikes excluded from scoring, cooldown/stale-pulse filtering, and preserved calibration frame.

## Hardware phase: optical reliability

1. Collect real camera fixtures for TitanX and the exact DryFireMag-associated laser setup, on iOS Safari and Android Chrome.
2. Replace approximate timing with encoded projected frame IDs or a validated optical time marker, retaining exact scene state.
3. Detect laser components at higher resolution with subpixel centroids, correct lens distortion, and measure calibration residuals.
4. Add robust photometric response estimation, exposure/white-balance controls where browser capabilities permit, and a continuous calibration health check.
5. Measure precision/recall and false-event rates against the hardware acceptance plan. Tune the classifier using recordings; do not optimize only against synthetic dots.

## Completed: scenario and session controls

- Original procedural car/pillar/fence/window/highway assets and illustrated target variants.
- Configurable scoring zones and points, repeat schedules, movement easing, camera speed/heading.
- Synchronized countdown, configurable operator beep, and per-shooter comparisons grouped by scenario/settings and input.
- Balanced/Strict/Sensitive video confirmation profiles with rejection diagnostics; physical recall validation remains pending.

## Product polish after validation
- Installer/launcher that simplifies HTTPS and device onboarding without requiring a native phone app.
- More portable scenario/media packages; account-based sharing only if desired later.
- Multi-shooter simultaneous attribution requires distinguishing optical signals or dedicated hardware; ordinary same-color dots are insufficient.

The project has no promise of zero false positives. Production-readiness is conditional on measured optical performance.

Completed in editor/pairing/audio revision:
- Collapsible editor groups and viewport-bounded desktop scrolling.
- Alternating camera destination/focus placement using saved segment focus points.
- Retryable rate-limit cooldown and reduced redundant pairing status traffic.
- Local synthesized shot/dry-click audio with independent mute/volume.
- Optional magazine count, Reload prompt and one dry-trigger assumed reload.

- Optional paired-phone voice commands: Moving / Cover / Retrograde, with explicit microphone opt-in, command feedback and retained laser/manual controls. Real-device speech accuracy and microphone/camera coexistence remain hardware acceptance items.
