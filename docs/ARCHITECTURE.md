# Architecture and protocol

## Components

| Component | Responsibility |
|---|---|
| `server.js` | HTTP(S) static assets, QR generation, authenticated host sessions, origin-checked WebSocket relay |
| `public/host.js` | Editor controls, pairing, render history, turn-based sessions, video review |
| `public/range.js` | Three.js scene, geometry, camera path, historical raycasting, barriers |
| `public/phone.js` | Camera lifecycle, alignment, baseline/test gate, rectification, detection and shot snapshots |
| `public/core/geometry.js` | Eight-parameter homography solve, convexity validation, pixel mapping |
| `public/core/detector.js` | Chroma excess, temporal onset, connected components, source-frame selection |
| `public/core/scenario.js` | Versioned schema validation, deterministic path motion, summary math |
| `public/core/channel.js` | Browser WebSocket channel and round-trip clock-offset estimates |

## Image pipeline

The host downscales its renderer or uploaded-video presentation to 480×270 and retains approximately three seconds of JPEG source frames at ~11 Hz. The phone receives these references through the host server, keeping the latest 20 decoded frames.

The phone camera is requested at 1280×720 and ideally 60 fps; these are constraints, not guarantees. A four-point homography maps normalized projector coordinates into camera coordinates. A lookup table rectifies each fresh frame into 480×270 pixels using nearest-neighbor sampling. This trades optical precision for straightforward mobile performance.

Candidate detection requires laser-channel brightness, chroma excess over the other two channels, and a rise over the previous observed frame. When a recent source frame is available, the detector subtracts expected chroma with a five-by-five neighborhood tolerance. The reference is chosen by sparse grayscale error among recent frames, with a 400 ms age limit. Baseline calibration estimates a temporal-noise threshold with a 15-unit floor. A sparse, outlier-trimmed chroma gain/offset fit compensates camera/projector tint and amplification when source frames are available. The minimum selected-channel brightness is 40; chroma/onset/source checks still apply.

Connected components reject isolated single pixels, large patches, elongated artifacts, and sparse components. A 100 ms global cooldown prevents many duplicate detections but means very fast or simultaneous pulses can be missed. Multiple components, missing references, and YouTube events are marked for review. Source-correlated visual changes can still fool the heuristic; “high” confidence is a software classification, not a measured probability.

## Time and scoring

Clients estimate server time using ping/pong midpoint offsets, preferring the smallest measured RTT. A camera event uses processing-time server coordinates; host-side latency correction approximates the combined display/capture pipeline. The host chooses the nearest retained rendered frame and evaluates deterministic target positions, visibility, and camera pose at that frame's elapsed time. Raycasting checks target and barrier geometry together so the nearest visible object wins.

The alpha does not decode a frame ID from the projection, identify rolling-shutter scanlines, estimate exposure midpoint, or guarantee display/camera synchronization. This is the most important engineering limitation for moving-target accuracy.

## WebSocket messages

The first message must be `join` with `role: host` and the session secret, or `role: phone` and the pairing code. Each session permits one active host and one active phone. Replacing another active client is refused; a random per-page client ID permits the same authenticated client to replace its own half-open socket. A disconnected host retains the session for a two-minute reconnection grace period; phone disconnect revokes readiness. The server does not log images or pairing credentials.

Host → phone: `reference`, `mode`, `pattern`, `reset`.

Phone → host: `ready`, `shot`, `telemetry`.

Both roles: `ping`; server replies with `pong` including server time.

Messages are bounded to 400 KB, a token bucket refilling at 50 messages/second with a 200-message burst allowance, and backpressure is capped. Coordinates, event times, JPEG envelopes, roles, and credentials are checked. Sessions and rate-limit entries expire in memory. This is LAN-oriented session security, not a multi-tenant authorization system.

## Scenario schema v1

Scenario: `version`, `name`, `duration`, `targets`, `barriers`, `cameraMotion`, `cameraPath`.

Target: unique `id`, `x`, `z`, `width`, `height`, `kind` (`shoot`, `no-shoot`, `random`), `start`, `end`, `speed`, `path`.

Barrier: unique `id`, `x`, `z`, `width`, `height`, `depth`. The editor exposes `depth` as **Length · front–back (m)**, 0.1–10 m, using the existing schema and renderer geometry.

Path: array of `{x,z}` points in meters. Target motion ping-pongs; camera motion stops at its last point. Imported JSON is validated and rendered as text, never executed. Bounds are enforced for object counts, coordinates, dimensions, timing, and path length.

Randomized roles resolve once per run. No tactical decision engine or real-person recognition is included. Media is selected locally or embedded through YouTube's player API and is not included in exported scenarios.

## Separate projector runtime

`public/projector.html` and `public/projector.js` render the actual projected image. `public/core/projection-link.js` connects the two same-origin windows with an opener-bound, nonce-checked MessagePort. No admin or camera secret is copied into the projector URL. The operator continues to own authenticated phone pairing and relays projector reference frames through the existing server channel.

The operator sends validated scene changes, a single set of resolved randomized roles, start/stop, media commands, and calibration commands. Uploaded files are cloned as Blobs into the projector and get their own local object URLs. The projector owns its camera aspect ratio, frame history, elapsed scene time, surface marks, and raycast scoring; scored events return to the operator for review. Uploaded video uses the projector's retained frames for snapshots; YouTube still requires camera snapshots and manual scoring.

The operator does not produce camera reference frames while the separate projector is connected. Its 3D/video preview uses the projector's normalized JPEG image. Its renderer runs only when needed for editing. Fixed-frame projector size and content changes retain corner mapping and pulse qualification, then request an automatic sensitivity refresh. Operator layout changes do not affect the separate projection. A physical change to the projected boundary requires explicit corner reset; the app cannot infer mount movement from a browser resize. Ten seconds without projector messages pauses scoring but retains the MessagePort; traffic resuming requests a sensitivity refresh. Only confirmed closure/navigation tears down the link. Window minimization/backgrounding stops the relevant session without clearing calibration. This is a same-computer two-window workflow, not a network projector client or multi-operator system.

Automatic refresh uses about 900 ms and at least 10 camera frames, seeds onset history from the last background frame, and retains the exact user/pulse-qualified threshold. It suppresses detections while adjusting and reports that state to the operator; starting a live session is gated during adjustment. It does not continuously relearn from moving targets or laser pulses. Source switches between single and separate projector windows still require fresh alignment. Arming selects live camera input; explicit demo sessions retain mouse-only behavior with a diagnostic for received camera pulses.

## Phone-driven alignment

The authenticated phone can send a boolean `calibration-request` to its paired operator. The operator uses the existing calibration controls to stop any active session, switch either display mode, and acknowledge with `pattern`. The phone automatically searches the live camera after acknowledgment. Five 96-pixel black-and-white ArUco MIP 36h12 codes replace the 24-pixel cyan rings. The vendored MIT-licensed js-aruco2 detector uses grayscale/local thresholding, contour quads, perspective bit decoding and marker IDs. The application tries three threshold windows and accepts at most two bit errors (dictionary minimum distance 12). Sixteen corresponding corners from the outer four markers fit a normalized least-squares homography. The fifth code is held out and its four corners must agree with that transform. Missing/duplicate codes, undersized outer codes, inconsistent fits and clipped frames fail with a diagnostic. Three stable fits are required within eight seconds. The transform maps the full viewport; marker insets are never mistaken for frame edges or silently clamped.

Manual alignment uses separate numbered crosshair centers with explicit known inset coordinates. It uses the same screen-to-camera convention as automatic alignment. The preview overlays predicted crosshair locations and the derived outer frame so users can verify geometry. This is a planar mapping, not an intrinsic lens calibration or a correction for a curved projection surface. See [calibration design](CALIBRATION.md) for selection rationale, acceptance limits and hardware retest.

The preview uses CSS translation/scaling with inverse pointer coordinates. Pinch/drag gestures never place corners; taps select original normalized camera coordinates. Preview zoom never alters the camera stream, capture dimensions or existing homography.

## Per-shooter screen zero

Authenticated phone `zero-request` commands route to the operator; `zero-status` returns progress and apply availability. The operator switches the same calibration layer to a neutral center-crosshair target. It collects five fresh, high-confidence camera detections after a 1.5-second settling period and sensitivity completion, with 300 ms minimum separation. Samples over 8% from center on either axis are ignored. A group is rejected if maximum distance from its mean exceeds 2% in normalized coordinates, or its resulting translation exceeds 5% on either axis. The candidate requires explicit Apply; aborted/rejected attempts preserve an existing correction.

The correction is `(0.5 - meanX, 0.5 - meanY)` and is stored in a host-memory Map keyed by the trimmed shooter name. A run snapshots its correction. The active rendering/scoring owner applies it exactly once: the host in single-window mode, or the projector in separate-window mode. Shots retain rawX/rawY and the applied offset. Off-screen corrected shots are counted as misses without clamping or silently discarding them. Desktop demo coordinates are unchanged.

Phone alignment invalidation/application and color changes notify the host with `alignment-changed`; this clears corrections. Network/source disruption also clears them. Disarming cancels a pending zero; camera alignment changes clear all profiles. Zero samples never enter session review/statistics. The target stays still during collection to avoid feedback-driven aiming changes.

## Transport recovery

WebSocket clients retry temporary failures with backoff from 0.5 to 5 seconds plus jitter, using the same session credentials and per-page client ID. Thirty seconds without inbound traffic triggers reconnect; a pending join has a 15-second timeout. Policy rejection, oversized payloads and explicit replacement terminate retries with a visible recovery message. Intentional disconnect cancels retries. A host outage keeps the phone socket and session alive for a two-minute grace period; both peers can reconnect in either order. Server restart or expiry still requires pairing again.

Preview/telemetry frames are dropped above 150 KB of queued outbound data so stale imagery does not crowd out controls. Shot traffic is never queued for later reconnect replay. Genuine disconnection ends the current scored session and cancels pending zero collection, retaining completed shooter corrections and fixed camera geometry. Detection resumes after fresh sensitivity frames arrive; the user starts a new scored session. Phone backgrounding pauses detection and follows the same restoration path, provided the camera stream remains live. Changing camera, physical alignment or display source still invalidates geometry.

## Video pulse confirmation

`public/core/video-filter.js` adds a video-only stage after source subtraction and blob detection. Candidates must disappear within a configurable 80–1000 ms window (350 ms default); sustained patches and centroid drift are rejected. A change of more than 25 RGB levels (or the selected threshold, whichever is higher) over 15% of sampled pixels cancels candidates at cuts. Gaps above 250 ms cancel candidates rather than inferring an unseen pulse end. At most eight candidates retain compact baseline patches and onset JPEGs. Accepted events keep their original detection timestamp, position, confidence and image; confirmation adds visible delay, not a timestamp shift. Geometry calibration and pulse qualification bypass this stage.

Uploaded video suppresses detection when source frames are stale instead of falling back to camera-only hue detection. YouTube uses the same pulse/cut guard without source subtraction; a short, stationary colored flash can still be indistinguishable from a laser, so its shots remain review-only. Cuts and rapid motion may also suppress genuine laser pulses. This is false-positive mitigation, not a guarantee of separation for arbitrary video.

Manual thresholds range from 5 to 180 and become the authoritative setting immediately, before a host-triggered refresh can run. A manual choice survives baseline capture, content changes and reconnection in the current phone page. Changing it still requires the three-pulse check. Automatic scene refresh seeds the previous frame and updates color response without learning a higher noise threshold from video motion.
