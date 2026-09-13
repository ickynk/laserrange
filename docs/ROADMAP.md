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
- Calibration survives operator layout changes; projector resize, closure, loss of heartbeat, or backgrounding stops the affected session and requires recalibration.
- Paired synthetic-camera and two-window regression coverage, including an uploaded-video fixture and mocked YouTube player.

## Hardware phase: optical reliability

1. Collect real camera fixtures for TitanX and the exact DryFireMag-associated laser setup, on iOS Safari and Android Chrome.
2. Replace approximate timing with encoded projected frame IDs or a validated optical time marker, retaining exact scene state.
3. Detect laser components at higher resolution with subpixel centroids, correct lens distortion, and measure calibration residuals.
4. Add robust photometric response estimation, exposure/white-balance controls where browser capabilities permit, and a continuous calibration health check.
5. Measure precision/recall and false-event rates against the hardware acceptance plan. Tune the classifier using recordings; do not optimize only against synthetic dots.

## Product polish after validation

- Better target assets and configurable scoring zones, target repeat schedules, movement easing, editable camera speed/heading.
- Session countdown, configurable beep, and fuller shooter comparison.
- Installer/launcher that simplifies HTTPS and device onboarding without requiring a native phone app.
- More portable scenario/media packages; account-based sharing only if desired later.
- Multi-shooter simultaneous attribution requires distinguishing optical signals or dedicated hardware; ordinary same-color dots are insufficient.

The project has no promise of zero false positives. Production-readiness is conditional on measured optical performance.
