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

`public/core/video-filter.js` adds a video-only stage after source subtraction and blob detection. The phone defaults to Balanced with a 600 ms limit; the filter also supports Strict and Sensitive profiles as detailed below. Candidates must disappear within a configurable 80–1000 ms window. In Strict mode, sustained patches and centroid drift are rejected. A change of more than 25 RGB levels (or the selected threshold, whichever is higher) over 15% of sampled pixels cancels candidates at cuts. In Strict mode, gaps above 250 ms cancel candidates rather than inferring an unseen pulse end. At most eight candidates retain compact baseline patches and onset JPEGs. Accepted events keep their original detection timestamp, position, confidence and image; confirmation adds visible delay, not a timestamp shift. Geometry calibration and pulse qualification bypass this stage.

Uploaded video suppresses detection when source frames are stale instead of falling back to camera-only hue detection. YouTube uses the same pulse/cut guard without source subtraction; a short, stationary colored flash can still be indistinguishable from a laser, so its shots remain review-only. Cuts and rapid motion may also suppress genuine laser pulses. This is false-positive mitigation, not a guarantee of separation for arbitrary video.

Manual thresholds range from 5 to 180 and become the authoritative setting immediately, before a host-triggered refresh can run. A manual choice survives baseline capture, content changes and reconnection in the current phone page. Changing it still requires the three-pulse check. Automatic scene refresh seeds the previous frame and updates color response without learning a higher noise threshold from video motion.


## Scenario extensions and video confirmation profiles

Version-1 scenario JSON accepts optional asset, rotation, scoring-zone, repeat/easing, camera speed/heading and session countdown/audio fields. Missing fields preserve legacy behavior. Both renderers use the same geometry, visibility and scoring functions. Raycasts recurse into asset parts; impacts attach in part coordinates. Zone priority is array order; points supplement existing hit/miss/no-shoot classification.

The operator sends a future shared start timestamp for countdown. Both views clamp elapsed time to zero and defer run media start to that timestamp. Input before start is discarded. One operator AudioContext schedules the beep; cancellation invalidates pending async scheduling. Comparison groups use exact scenario/media settings and demo/live identity and calculate splits within each run.

Video confirmation tracks onset-core chroma rather than the whole neighborhood in Balanced/Sensitive mode. A similarly sized translated highlight is rejected; broad surrounding changes do not alone veto a faded core. Strict retains whole-patch checks. All profiles have bounded pending candidates, pulse duration, scene-change and frame-gap checks, and preserve onset timestamp/review image. YouTube remains camera-only and ambiguous; counters expose filtering reasons but do not measure hardware recall.


## Editor assets, custom images and persistence

`core/assets.js` generates full-volume mannequins and multipart barrier models. Part-local impact transforms survive target yaw rotation. Custom-image backers load embedded raster data into a canvas texture, with late image callbacks ignored after texture disposal. `core/image-crop.js` crops/re-encodes raster uploads before adding them to scenario JSON. Per-image and total-image bounds are validated by both browser and host.

`core/camera-path.js` provides a pure elapsed-time camera pose for playback and historical raycasts. Optional per-segment focus points supply yaw/pitch; adjacent orientations interpolate across a bounded smoothstep window at path joins using the shortest yaw arc. No frame-history state is used, so delayed shots score from the same pose as the projector. Camera position still uses piecewise linear movement.

Authenticated `/api/library/ranges` and `/api/library/videos` endpoints list/save items and load/delete by server-generated UUID. The host writes individual JSON files using a temporary file and rename. Names are labels, never paths. Input size, scenario schema and supported YouTube URLs are checked. Files are outside the static public root; phone session tokens are insufficient. `RANGE_DATA_DIR` overrides the default host `data` folder.


## Segment clock and projector controls

`core/segment-clock.js` separates scene time from the wall-clock shot timer. Opt-in 3D progression records timestamped movement intervals between cumulative camera-path endpoints, holds indefinitely, and supports reverse traversal. Reference history retains scene time for historical raycasts; shot times remain elapsed wall time. Continuous and video sessions preserve their existing duration limits. Manual progression requires total travel time below scenario duration and keeps the final hold active until an explicit end action.

`core/projector-controls.js` draws a neutral canvas strip inside normalized y=0.86–1.0. It is composited into readable source reference frames so camera subtraction sees the same UI. Calibration/zero patterns bypass it. Laser coordinates use the current shooter's correction; routing consumes strip hits before scoring, including idle shots forwarded by the operator. Enabled controls send narrow action messages back to the operator, which enforces camera readiness and input selection. The host alone reads the authenticated range library. A shared cooldown and layout timestamps reject duplicate/stale control pulses; old run pulses outside the strip retain the start-time guard. A separate strip input layer captures mouse events over cross-origin video without interfering with ordinary range input.

The optional `session.ammoEnabled` / `magazineSize` settings use a shared `Magazine` state machine. The active scoring display owns the count; projector `ammunition` events carry the result to the host before `scored-shot`. A dry trigger resets the magazine and returns before scoring/impact creation. Session/range mode, timestamp and control-strip guards run before consuming a round. Host-only `ShotAudio` plays one local synthesized effect per accepted trigger, so the two windows do not double sound. Browser audio must be unlocked by a gesture; suspended audio drops effects instead of queuing delayed reports. Settings `shotAudio` and `shotVolume` are independent of the start beep.

WebSocket throughput exhaustion uses retryable close code 1013; `Channel` waits at least five seconds before reconnecting, and also recognizes legacy 1008/Rate limit responses. Other policy/authentication rejections remain terminal. The server suppresses unchanged ready announcements and the host sends initial mode/pattern only on a phone connection transition. This reduces duplicate initialization traffic without increasing the message limit.

Optional phone voice controls use the browser recognition service after explicit opt-in. Final whole-word commands are mapped to `moving`, `cover`, or `retrograde`; duplicate result indices, rapid repeats, late speech results and results from replaced recognizers are discarded. The paired phone sends a command/id/time/runId, not audio. The server whitelists commands, bounds their age and rate, and forwards them only to the paired host. The host and active projector recheck the session, countdown/calibration gates and command age. Shared `applyRangeCommand` invokes existing segment stepping or `Magazine.reload()`; explicit reload never enters shot scoring/audio. Results acknowledge the action to the phone and synchronize the host's magazine display. Run-state updates replace listening contexts so old-session recognition cannot control a new run. Microphone permission is allowed for same-origin pages but requested only when voice is explicitly enabled.

Range Health is measurement-only. Phone telemetry adds bounded calibration-fit, frame-size, laser/threshold, sparse rectified brightness and existing video-filter counter fields at the existing telemetry cadence. The server sanitizes diagnostic fields and whitelists rejection reason names before forwarding. No detection thresholds, confidence gates, frame matching or calibration transformations are changed.

`HardwareTest` computes raw-event counts, nine-point raw/zero-corrected placement medians, reference/FPS medians and acknowledged voice actions. The operator `health-panel` observes paired live shot messages before normal projector-control/ammunition scoring and labels that distinction. Placement instead consumes those pulses, uses the existing calibration canvas/reference path to show a static measurement board and snapshots the shooter zero; it applies no adjustment. The board uses the same fixed screen geometry in both display modes. Settling/old pulses are excluded between points. Other test types observe normal live sessions. Results are marked Completed, Incomplete or Interrupted, never automatically certified as accurate. A bounded 12-result aggregate history is stored in operator localStorage; raw video/audio/images are not retained.


Pulse identity is maintained in `LaserDetector` using bounded local tracks against the pre-onset camera frame (`pulse-track.js`). Continuations update the track location but cannot move the emitted shot. Tight disconnected islands are consolidated around their largest component; distant simultaneous components remain review-only. Observed absence lasting at least 35 ms rearms that neighborhood. When a readable source is available, projected color cannot hold a continuation track active. Adaptation/reset clears tracks, and long frame gaps reseed detection. The video filter separately follows fading trails to retain onset time/image while rejecting constant-strength translated highlights and nearby vacated-color onsets. This camera-only classification remains ambiguous; physically indistinguishable projected flashes cannot be guaranteed rejection.

Optional fast voice mode requests interim speech results and debounces exact commands for 250 ms. Recognition index, session identity, availability, stop/restart and final-result guards prevent repeated or stale execution. Final-only mode remains the default; neither mode stores audio. Equal-error source-reference matches now select the newest frame rather than the oldest, without altering the best-image-match criterion.

## Reactive target simulation

`reactive-types.js` owns asset IDs/default dimensions; `reactive-model.js` builds procedural Three.js models. `reactive-world.js` runs pinned cannon-es 0.20.0 rigid-body dynamics at 120 fixed steps/second, plus constrained tree, star and knockdown degrees of freedom. The server serves cannon locally and rewrites the simulation module's bare import for browsers; Node tests import the same source directly. No external CDN or new build step is required.

Rendered scene time and elapsed physics time are separate: camera endpoint holds/backtracking preserve ongoing physical motion. Display frame histories carry both clocks. Scoring temporarily seeks the captured pose, returns a keyed reaction and attachment-local impact, restores the current scene, then commits the accepted reaction. An event log and bounded periodic checkpoints reproduce historical poses. The separate projector owns live scoring and sends reactions to the host mirror. Starting a new session rebuilds the world and clears reactions/marks.

Hidden scheduled props stop colliding and freeze until visible again. They retain broken/released state across repeated appearances. Supports, shards and released steel do not score; shards do not intercept raycasts. Cans and rubber can be hit repeatedly. Scenario validation rejects drawn paths for reactive assets, invalid controls and configurations exceeding 160 estimated reactive bodies. Collision envelopes approximate detailed visual geometry; joint models, impulses, friction and restitution are simulation parameters, not measured ballistic response.
