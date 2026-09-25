# Calibration pattern decision

## Why change it

The first hardware report found no cyan rings and outward shot-placement errors after manual alignment. The old detector required precise cyan dominance and dark ring centers in only 24×24 source pixels; exposure, white balance and projector blur can defeat those assumptions. The manual interface asked for the full frame while the prominent markers were inset. Selecting inset points as if they were edges expands coordinates outward. The regression suite reproduces this failure; the user’s exact physical cause is not established without a camera capture.

## Options investigated

| Option | Relevant properties | Decision for this browser app |
|---|---|---|
| Ordinary QR codes | Version 1 already uses 21×21 modules, plus a margin; optimized for carrying data. | Too much detail for a board needing only five identities. |
| ArUco MIP 36h12 | 8×8 cells including the black border; identifies orientation and ID. A pure JavaScript detector is available. | Selected: large, coarse monochrome codes with local processing and no CDN/native dependency. |
| AprilTag 3 | Purpose-built visual fiducials; improved small-tag detection and flexible layouts; official implementation is C. | Credible alternative, but adds a WASM integration/build path here. No claim that ArUco is universally more accurate. |
| ChArUco | Combines coded markers with checkerboard intersections; OpenCV recommends it for high-precision camera calibration. | Appropriate future work for intrinsic lens/distortion calibration. More machinery than this planar screen mapping requires. |

This choice is an engineering judgment for the current deployment, not a comparative hardware benchmark.

## Implemented board and mapping

- Four 96×96 markers near the corners plus one independent center marker, all with white quiet margins. Each marker is four times the former ring width.
- A fixed 960×540 board scales with the actual projected viewport. IDs resolve point correspondence even with rotation; corner positions are not guessed by image ordering.
- Local grayscale thresholding at three neighborhood sizes; perspective-normalized code decoding. The decoder is `js-aruco2@2.0.0`, MIP 36h12 dictionary, limited to fewer than three bit errors.
- Sixteen marker corners fit the screen-to-camera homography. The center marker is excluded from that fit and checked independently.
- Acceptance tolerance is max(2 pixels, 0.6% of the smaller camera dimension). RMS fit must stay below it, worst outer residual below twice it, and worst center residual below 1.5 times it. Outer marker sides must be at least 24 camera pixels. Three stable frames must agree within 0.006 normalized camera distance. These are software acceptance gates, not a physical accuracy guarantee.
- Missing or duplicate IDs, inconsistent geometry, an undersized pattern, and extrapolated frame clipping fail explicitly. A timeout reports the failure reason.
- Manual selection targets the centers of four separate numbered crosshairs at known insets. Both automatic and manual paths map the **whole screen**, not the rectangle connecting those inset points. Overlay circles let the user compare the predicted crosshair centers with the camera image.

Existing baseline/pulse validation remains. After arming, scene changes retain alignment and update sensitivity as before. Use Reset anchors if the camera or physical projected boundary moves.

## Limits and test procedure

A single homography handles a flat screen and perspective. It does not calibrate camera lens distortion, remove projector lens distortion, or straighten a curved wall. The fit/check can reject some inconsistent geometry; it cannot prove that every point is accurate. Prefer the normal 1× rear lens, include the whole frame, avoid clipping whites, and verify center plus four edge shots before using moving scenarios. Do not adjust latency to hide static scale errors.

Tests cover perspective, rotation, blurred/washed/tinted images, invalid boards, grid placement, edge laser pulses through the actual rectification/detector path, and the browser setup/live-shot flow. Physical hardware performance remains pending.

## Upstream and reproduction

`public/vendor/aruco/` contains the MIT-licensed detector and image routines, including license notices. `npm ci && npm run vendor:aruco` reproduces the files from the pinned development dependency. The script changes only CommonJS/global exports into ESM imports/exports. The application serves these files locally and requires no internet connection for detection. The application selects the detector stages/window sizes in `public/core/corners.js`.

Primary sources consulted September 25, 2026:

- [OpenCV ArUco detection: adaptive thresholding, contour candidates, perspective decoding and refinement](https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html)
- [js-aruco2: browser implementation, dictionary dimensions, marker generation and API](https://github.com/damianofalcioni/js-aruco2)
- [AprilTag 3: official implementation and capabilities](https://github.com/AprilRobotics/apriltag)
- [OpenCV ChArUco calibration guidance](https://docs.opencv.org/4.x/da/d13/tutorial_aruco_calibration.html)
- [OpenCV ChArUco detection and distortion limitations](https://docs.opencv.org/4.x/df/d4a/tutorial_charuco_detection.html)
- [DENSO WAVE QR version/module sizes](https://www.qrcode.com/en/about/version.html)
