# Hardware acceptance plan

**Status: not performed on physical hardware.** Synthetic tests do not establish real-world detection accuracy. Record results separately for each phone, laser configuration, projection distance, projector mode, and lighting condition.

## First physical test session

Complete this sequence with one phone, one laser configuration, and one color before comparing devices. This is a test procedure; no pass result is assumed.

1. **Establish the display.** Use extended desktop, open the separate projector window, move it to the projected display, and enter fullscreen before calibration. Keep the mount and projector fixed.
2. **Calibrate.** Pair the phone, show the calibration screen from the operator, verify all four corners, capture a no-shot baseline, and confirm three real pulses. Select **red** for your current laser setup.
3. **Check geometry first.** Fire at separated points near the center and four corners while watching the rectified preview. Consistent offset or skew means corner alignment needs correction; do not adjust the time-delay setting to fix static spatial error.
4. **Check detection on stationary targets.** Return to the range, disable demo mode, and fire 20 deliberately spaced pulses. Record detected count, unexpected extra detections, and any visible-but-missed pulses. Repeat at different screen areas. Proceed to the full 100-pulse gate below after the short check is stable.
5. **Check false positives.** Run the stationary scene with no pulses for two minutes, then a moving-target scene with no pulses for two minutes. Count both scored and review-only detections. Investigate false events before measuring accuracy.
6. **Tune moving-target timing last.** Once geometry and detection are stable, compare a target moving left and right past a known fixed screen coordinate. Adjust the operator's latency correction in 10 ms steps and repeat both directions. The 100 ms default is only a starting guess. Record residual error and repeatability.
7. **Check recovery.** Resize the operator: calibration should remain armed. Resize or hide the projector: the session must stop and camera readiness must reset. Recalibrate after restoring the projector.

Record the configuration and observations below. Begin with the TitanX, then repeat separately for the exact DryFireMag-associated laser configuration. Whether the laser pulse is long and bright enough for a given phone must be measured on that setup.

### Results to bring back

- Phone model, browser/OS, camera selected, reported FPS.
- Projector model, resolution, projected width/height, camera-to-screen distance.
- Device and laser color; pulse duration if available.
- Threshold and latency correction used.
- Observed pulses / detected shots / unexpected detections.
- Whether the offset appears on stationary targets, moving targets, or both.
- A short recording or screenshots of the rectified view and shot review, if practical.

## Record the test configuration

- Phone make/model, OS, browser, selected rear camera, reported fps, mounting position.
- Projector model/mode/refresh rate, host display resolution, projected dimensions.
- Laser device/accessory combination (TitanX or DryFireMag-associated laser), red/green color, pulse duration if documented or measured.
- Screen material, ambient lighting, processing threshold, alignment method, latency correction.

## Proposed acceptance gates, not achieved claims

| Check | Procedure | Proposed initial target |
|---|---|---|
| Geometric registration | At least 5 shots at each of 9 screen grid points; compare snapshot marks to known locations | Median error below 1% screen width; no systematic corner drift |
| Stationary pulse detection | 100 deliberately spaced pulses on a blank background per color/device | At least 98/100 detected, no duplicates; report misses separately |
| Idle false positives | 10 minutes each of static range, moving targets, camera path, and colorful uploaded video with zero pulses | Zero automatically scored false shots; count review-only events too |
| Projection confounds | Play small bright red/green dots, flashes, scrolling text, hard cuts, and laser-like glints with zero pulses | Zero automatically scored false shots; otherwise revise detector |
| Moving target timing | Send known-position shots while a target crosses both directions; compare recorded placement and score at multiple speeds | Tune delay until directional bias is minimal; document residual error |
| Pulse separation | Try 500, 250, 150, and 100 ms separation | Determine actual reliable interval; do not infer sub-100 ms support |
| Barrier scoring | Place a target behind a solid barrier and shoot its obscured position | Miss/blocked result, never a target hit |
| Role randomization | Repeat sessions; verify the visible armed/unarmed symbol matches score | Correct classification for every displayed target |
| Video review | Pause near a moving scene feature, fire a pulse, inspect retained source/camera frame | Placement and approximate time identifiable; mark uncertainty |
| Disruption | Background phone, unplug camera/network, resize projector, rotate phone, change camera or color | Readiness removed and recalibration required |

Start with long visible test pulses, then use the actual devices. If a pulse is shorter than the camera exposure interval, some missed pulses are physically unavoidable. Browser camera auto-exposure can vary during a session; reduce brightness/clipping and keep light stable. These controls do not guarantee success.

For timing validation, use a repeatable non-firearm light stimulus at a fixed screen coordinate and a recorded moving target crossing that point. A second high-frame-rate recording can establish ground truth. Change the latency setting in 10 ms increments and test both motion directions. Until measured, treat timer and moving-target scores as approximate.

If these gates fail, keep live sessions labeled experimental. Prioritize recorded real-camera fixtures, exposure control where supported, higher-resolution spot detection, a robust photometric model, and visible frame-code synchronization before claiming reliability.
