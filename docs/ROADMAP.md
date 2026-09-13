# Development roadmap

## Implemented alpha

- Local Node host, secure-context deployment options, paired phone browser.
- 3D editor, target/barrier placement, movement paths, timed roles, randomization, viewpoint translation, JSON sharing.
- Manual/marker-assisted calibration, baseline and pulse-check gate.
- Experimental laser detection with source subtraction and manual-review fallback.
- Uploaded/YouTube video workflows; approximate source-frame and camera snapshot review.
- Hit/miss/no-shoot summaries, timing, named turn-based runs, desktop demo.

## Next phase: separate operator and projector views

Physical laser/projector validation is deferred until the hardware is available. The next recommended software phase is to separate the clean projected range from the operator controls:

1. Add a dedicated projector window that shows only the 3D range or video and impact marks.
2. Keep scenario editing, media controls, shooter selection, start/stop, and session review on the operator's main screen.
3. Synchronize scenario state, resolved randomized roles, playback commands, shots, and readiness between the two views. The projector view must own reference-frame capture and scoring history so calibration matches the actual projected image.
4. Preserve calibration when changing operator panels, and stop safely when the projector closes or disconnects.
5. Add two-window tests for moving targets, playback controls, reference delivery, and session resets before hardware validation.

This phase can be tested on a computer now and will make later projector trials easier. It is proposed work, not implemented yet.

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
