# Hardware acceptance plan

**Status: initial user hardware results received; acceptance gates remain open.** Synthetic tests do not establish real-world detection accuracy. Record results separately for each phone, laser configuration, projection distance, projector mode, and lighting condition.

## First physical test session

Complete this sequence with one phone, one laser configuration, and one color before comparing devices. This is a test procedure; no pass result is assumed.

1. **Establish the display.** Use extended desktop, open the separate projector window, move it to the projected display, and enter fullscreen before calibration. Keep the mount and projector fixed.
2. **Calibrate.** Pair the phone, show the calibration screen from the operator, verify all four corners, capture a no-shot baseline, and confirm three real pulses. Select **red** for your current laser setup.
3. **Check geometry first.** Fire at separated points near the center and four corners while watching the rectified preview. Consistent offset or skew means corner alignment needs correction; do not adjust the time-delay setting to fix static spatial error.
4. **Check detection on stationary targets.** Return to the range, disable demo mode, and fire 20 deliberately spaced pulses. Record detected count, unexpected extra detections, and any visible-but-missed pulses. Repeat at different screen areas. Proceed to the full 100-pulse gate below after the short check is stable.
5. **Check false positives.** Run the stationary scene with no pulses for two minutes, then a moving-target scene with no pulses for two minutes. Count both scored and review-only detections. Investigate false events before measuring accuracy.
6. **Tune moving-target timing last.** Once geometry and detection are stable, compare a target moving left and right past a known fixed screen coordinate. Adjust the operator's latency correction in 10 ms steps and repeat both directions. The 100 ms default is only a starting guess. Record residual error and repeatability.
7. **Check recovery.** Resize the operator: calibration should remain armed. Resize the projector while keeping its physical outer frame fixed: alignment and the pulse check should remain valid, sensitivity refreshes automatically, and subsequent shots should register. Hide the projector: the session must stop and readiness must reset. Explicitly reset corners if the physical projected frame or camera moves.

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
| Disruption | Background/restore phone, briefly interrupt network, minimize/restore projector, rotate phone or change camera/color | Temporary interruptions pause scoring and recover without corner/pulse/zero loss; camera/geometry changes require recalibration |

Start with long visible test pulses, then use the actual devices. If a pulse is shorter than the camera exposure interval, some missed pulses are physically unavoidable. Browser camera auto-exposure can vary during a session; reduce brightness/clipping and keep light stable. These controls do not guarantee success.

For timing validation, use a repeatable non-firearm light stimulus at a fixed screen coordinate and a recorded moving target crossing that point. A second high-frame-rate recording can establish ground truth. Change the latency setting in 10 ms increments and test both motion directions. Until measured, treat timer and moving-target scores as approximate.

If these gates fail, keep live sessions labeled experimental. Prioritize recorded real-camera fixtures, exposure control where supported, higher-resolution spot detection, a robust photometric model, and visible frame-code synchronization before claiming reliability.

## Regression check after first hardware feedback

The first user test detected all three calibration pulses but reported no session shots and repeated screen-change resets. The software now automatically selects live input after arming, retains alignment for fixed-frame display/content changes, and refreshes sensitivity without repeating test pulses. Repeat 20 spaced shots after returning to the range, then after switching video/3D modes and starting a second session. Compare the phone live-detection counter with session totals. Do not fire during the automatic adjustment notice. Subsequent user feedback confirms session shot delivery; see the coded-calibration retest below for the remaining placement issue.

## Coded calibration retest (September 25)

User feedback confirms that session shots now register, but cyan-ring recognition failed and manual alignment produced outward placement errors. After updating/reloading both displays, use **Show calibration & auto-align** to obtain a fresh coded-board fit; old corner selections are not reused. Keep all five codes visible and use the normal 1× lens. Record the fit and center-check error reported on the phone.

Before moving-target tests, put five stationary aiming marks at screen center and near the middle of each edge (about 10% in from the boundary). Fire spaced pulses at each mark. Compare the actual laser location with the reported impact, not the device's sight alignment. Record horizontal/vertical offset and projected width/height. If offsets still increase toward the edges, supply those measurements and the phone/lens model; lens distortion, physical frame changes or a non-flat surface remain possible. Do not compensate for a static scale error with the latency control. Manual fallback now requires the centers of numbered crosshairs 1–4, not the screen border.

## Constant vertical-offset retest

User feedback confirms automated coded-board alignment works and horizontal placement agrees, with a roughly one-inch upward offset. Use the optional five-shot screen zero after arming: actual laser strikes must land at the displayed center crosshair. Apply the proposed correction, then check center and four edge locations. An upward detection bias should yield a downward screen correction. Switch shooter names to verify separate corrections. If edge errors vary rather than remaining constant, revisit alignment/lens geometry; screen zero is translation only.

The user reports the optional five-shot correction works correctly. Next hardware regression: overhead/perspective transitions, video beyond 35 seconds with a longer scenario duration, and brief Wi-Fi interruptions while verifying automatic recovery and retained correction.

Latest report: video red hues generate false positives and actual laser detection requires the lowest threshold. Retest the revised detector with the same clips: first no-laser playback to count false positives, then separate visible pulses on varied backgrounds. Compare uploaded source-backed playback with camera-only YouTube. Verify the selected threshold remains unchanged across mode changes and the pulse duration setting covers the actual flash.


## Retest after video profiles and session controls

Latest user feedback: the previous conservative YouTube filter nearly eliminated false positives but registered about one in ten real shots. Begin the retest with Balanced and 600 ms, keeping the successful screen alignment/zero. On the same clip, fire ten spaced shots and record raw candidate/accepted count deltas and rejection reasons. Repeat without firing to measure false events. If raw candidates are absent, investigate exposure/threshold; if filtered, use the reported reason before trying Sensitive or a longer pulse. Compare Strict on the same footage. Retest on each phone/device combination and retain representative recordings; no hardware recall improvement has yet been measured for this version.

Check that countdown/beep timing is usable with the actual projector and operator audio output, and that shots immediately before/after go are handled as expected. Review zone scoring and target visibility with representative repeated/moving scenarios.

## Projector-control acceptance pass

With the projector geometry unchanged, arm the phone and test a laser strike on Start while idle, then Restart and End. Confirm that none of these strikes add scored shots or marks. Repeat over uploaded video and YouTube. Strike a disabled control and a gap; neither should score. Check that a single physical pulse triggers only one action and allow at least one second between commands.

Enable Pause at camera segment ends on a short path. Let the first hold exceed the normal scenario Duration, record a shot, then test Next and Previous. Confirm the camera and target schedule hold, historical shot placement remains correct, and the shot timer continues. At the last point, use End. Open Ranges, page through saved entries, load another range and use Start; confirm alignment and the shooter zero remain valid without moving the phone/projector. Finally reopen calibration and confirm that the strip is hidden and calibration strikes cannot trigger simulator commands.

## Editor, audio and ammunition revision

- Scan the displayed QR on each real phone, connect without refresh/manual-code entry, and confirm retained readiness after a temporary connection interruption. If rate limiting persists, capture both phone and operator notices; the original burst source has not been reproduced on hardware.
- Preview gunshot audio on the operator's intended speakers, set a comfortable volume, then confirm one report per registered laser pulse in 3D and video. Listen for delay/clipping and verify the dry click is distinct. Browser-generated effects are not device-specific recordings.
- Set a small magazine (e.g. 3), confirm Reload after three shots, one unscored dry click on the fourth trigger, and a live shot on the fifth. Repeat via projector controls and confirm their strikes do not consume rounds or play gunshots. Restart should refill; countdown/calibration should consume none.
- Build a path with alternating node/focus clicks, review the saved focus points, and inspect the smoothed camera motion at each join and held endpoint.

## Phone voice controls

Test on the actual iPhone and Android browser while the camera is streaming and armed. Enable voice explicitly; verify microphone/speech permission prompts, continuous listening status and recognition after quiet periods. Confirm Moving/Retrograde advance one held segment, cannot interrupt travel, and do nothing during countdown/calibration. Confirm Cover refills partial/empty magazines without adding shots or sounds in both 3D and video. Check laser/pointer controls and the original dry-click reload still work. Test denial, Stop voice, phone backgrounding and network loss; no old commands should execute after returning. Check recognition with projector audio and deliberate command words in video dialogue; the recognizer cannot distinguish the shooter from speakers. Measure real command delay and camera frame-rate impact. These physical audio/recognition tests are not covered by the mocked browser recognizer.

## In-app measurement workflow

Use Camera → Range Health & hardware tests for the placement, pulse-count, no-fire and voice checks described in SETUP.md. These controls collect measurements; they do not establish acceptance by themselves. The placement board reports median offsets against the instructed strike positions and includes user aiming error. Compare actual laser strike positions visually or with an independent recording. Pulse count reports count agreement, not true detection recall, because missed pulses and false/duplicate events can cancel numerically. No-fire rates assume the operator fired no pulses, including projector controls. Voice timing begins after recognition, and unheard attempts require manual reporting.

Keep the same phone/laser/projector configuration and describe it in Test setup. Start with five shots at each of nine grid points, then 100 counted pulses, then a 10-minute no-fire observation for each relevant mode. Hold a segmented session or extend its duration to cover observation time. Record incomplete/interrupted tests separately and repeat. Save screenshots or transcribe the browser-held summaries before clearing browser data if you need to compare them elsewhere. The app retains only the latest 12 aggregate reports. Frame-ID synchronization, higher-resolution detection, lens correction and continuous mount-drift detection remain future work.


## 2026-09-27 user hardware baseline and pulse-tracking retest

Configuration: iPhone 16, TitanX red laser, room lighting, phone approximately 5 feet from the screen and straight-on. Projected image approximately 44 × 27 inches. Sensitivity 37, Balanced video profile, 600 ms maximum video pulse. Five-shot zero applied before the placement test; actual strikes aimed at the crosshairs. Browser/OS and projector model were not supplied.

| Test | User result before pulse-tracking revision |
|---|---|
| Nine-point placement | Completed; 58 samples total. Zero-corrected median radial errors by point: 1.3, 1.1, 1.2, 0.9, 1.2, 1.0, 1.2, 0.7, 0.6 percent of 16:9 frame width. Signed offsets consistently right/up. |
| Stationary 3D | Exactly 100 emissions; 153 events (51 high-confidence, 102 review). |
| Moving 3D | Exactly 100 emissions; 149 events (80 high-confidence, 69 review). |
| 3D no-fire | 0 events in 100.2 seconds. |
| YouTube no-fire | 16 events in 100.3 seconds (9.6/minute), all review. |
| YouTube pulses | Exactly 100 emissions; 88 events, all review. Count deficit is not measured recall. |
| Voice | All commands worked; approximately 2-second perceived delay. |
| Extended operation | User reports extended session working without calibration loss. |

Video benchmark: first 100 seconds of https://www.youtube.com/watch?v=dalEyyL6zNg. User sometimes observed a second dot above/right of the strike as the laser traveled. This supports investigating repeated detection of continuing pulses; it does not independently prove the cause. The clip could not be retrieved in the development environment, so its real pixels were not used as an automated fixture.

The revision tracks continuing pulses, consolidates tightly fragmented spots, and keeps their onset position. It also allows fading video pulse trails while retaining rejection of rigid translated highlights, checks nearby vacated color at onset, and rejects candidates across video frame gaps. No user threshold, zero formula, or connection/calibration-retention behavior was changed. A newer reference wins only when image-match errors are equal; previous high reference ages are not end-to-end latency measurements.

Retest on the same setup/settings:

1. Recollect the five-shot zero after updating, so old duplicate/trailing samples cannot affect it. Do not move the mount.
2. Stationary 3D: 20 counted emissions first. Check for one dot and one sound per emission. If clean, repeat the 100-emission stationary and moving tests. Report visible misses and duplicates separately.
3. Repeat the nine-point placement test after the fresh zero. Further lens/alignment correction is deferred until pulse identity is reliable.
4. Repeat both no-fire and 100-emission tests on the same first 100 seconds of the video. Keep sensitivity 37, Balanced, and 600 ms. Record candidate/accepted/rejection counters and visible misses/extras; no performance improvement is claimed until this retest.
5. Optionally enable Faster voice response on the phone. Compare responsiveness and unintended actions with final-only mode, including normal playback audio. Preliminary recognition can change after an action, and the browser may not provide early results.

Live detection remains experimental. The original longer-duration and additional-device acceptance gates still apply; a short clean no-fire run does not certify a zero false-event rate.
