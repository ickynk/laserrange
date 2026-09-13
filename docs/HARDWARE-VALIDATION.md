# Hardware acceptance plan

**Status: not performed on physical hardware.** Synthetic tests do not establish real-world detection accuracy. Record results separately for each phone, laser configuration, projection distance, projector mode, and lighting condition.

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
| Disruption | Background phone, unplug camera/network, resize host, rotate phone, change camera or color | Readiness removed and recalibration required |

Start with long visible test pulses, then use the actual devices. If a pulse is shorter than the camera exposure interval, some missed pulses are physically unavoidable. Browser camera auto-exposure can vary during a session; reduce brightness/clipping and keep light stable. These controls do not guarantee success.

For timing validation, use a repeatable non-firearm light stimulus at a fixed screen coordinate and a recorded moving target crossing that point. A second high-frame-rate recording can establish ground truth. Change the latency setting in 10 ms increments and test both motion directions. Until measured, treat timer and moving-target scores as approximate.

If these gates fail, keep live sessions labeled experimental. Prioritize recorded real-camera fixtures, exposure control where supported, higher-resolution spot detection, a robust photometric model, and visible frame-code synchronization before claiming reliability.
