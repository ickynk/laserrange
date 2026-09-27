# Setup: host computer, projector, phone

## 1. Computer-only smoke test

Install Node.js 22+ from nodejs.org. In the project folder, run `npm ci` and `npm start`. Open the exact URL printed by the process. Keep the terminal open.

Leave **Demo · click to shoot** checked. Start a session and click targets. End it to inspect shot frames. This checks graphics/editor/scoring without a laser or phone.

## 2. Trusted HTTPS for the phone

Safari and Chrome require a secure context for `getUserMedia`. The localhost exception applies to the computer's own browser, not a phone visiting the computer's LAN address. A self-signed certificate warning that you simply click past may still block camera access.

### LAN-only option: mkcert

Install `mkcert` using its documented package for your OS. Give the host a reserved LAN address in your router if possible. This example uses `192.168.1.20`; replace it with the computer's actual address.

```sh
mkcert -install
mkdir certs
mkcert -cert-file certs/host.pem -key-file certs/host-key.pem localhost 127.0.0.1 192.168.1.20
mkcert -CAROOT
```

The last command prints the folder containing `rootCA.pem`. Transfer **only `rootCA.pem`**, never `rootCA-key.pem`, to your phone through a trusted local method. Keep the CA private key on the computer. The app intentionally does not expose certificate files over HTTP.

- **iPhone:** install the CA certificate profile in Settings, then enable full trust for that certificate under Settings → General → About → Certificate Trust Settings. Menu names can vary by OS version.
- **Android:** install the CA certificate under the device's security/encryption credentials settings. Exact menus vary by vendor. Chrome must trust this CA; managed devices may prohibit user-installed CAs.

Start the server with the certificate paths:

macOS/Linux:

```sh
TLS_CERT=certs/host.pem TLS_KEY=certs/host-key.pem PUBLIC_ORIGIN=https://192.168.1.20:8443 npm start
```

Windows PowerShell:

```powershell
$env:TLS_CERT = 'certs/host.pem'
$env:TLS_KEY = 'certs/host-key.pem'
$env:PUBLIC_ORIGIN = 'https://192.168.1.20:8443'
npm start
```

Open the printed host link using that same origin. `PUBLIC_ORIGIN` must exactly match the browser origin (scheme, hostname/IP, port) because WebSocket origin checks are enforced. Open `https://192.168.1.20:8443/phone` on the phone and check that there is no certificate warning. Allow Node on TCP 8443 for your private network. Devices must be on the same reachable network, without guest Wi-Fi/AP client isolation.

### Alternative: existing trusted HTTPS reverse proxy or tunnel

If you already operate a trusted HTTPS reverse proxy or tunnel, point it to `http://127.0.0.1:8443`, enable WebSocket forwarding, set `PUBLIC_ORIGIN` to its exact HTTPS origin, and bind the backend to loopback with `BIND=127.0.0.1`. Restart Node after setting the origin. Use the newly printed host link.

Do not expose the unencrypted backend directly to the internet. A tunnel requires internet access and its provider; local TLS does not. Production internet hosting and account security are outside this alpha's scope.

### Missing QR code after enabling HTTPS

Open the **new complete host link printed by the restarted server**, including `#host=…`. A plain HTTPS address can open the demo without authorizing camera pairing. Alternatively, open **Camera**, paste that current link into **Host link or access key**, and click **Enable phone pairing**.

The app now remembers host access in the current browser tab so a refresh recreates the pairing code. HTTP and HTTPS have separate storage; a server restart changes the access key. A missing or expired key displays recovery instructions instead of silently hiding the QR code. Re-pair the phone after refreshing the host because the session/code changes. Certificate trust still must be configured on the phone.

## 3. Operator, projector, and phone alignment

1. Set your computer's display mode to **Extend**, not Mirror/Duplicate. Open the current authenticated host URL on your main screen.
2. Click **Open projector window**. Allow popups for this host if prompted. Move the new window onto the projector display, then click **Enter fullscreen in that window**. Wait for “Projector ready” on the operator screen.
3. Keep the operator window on your main display. It holds the controls and shot review; the projector shows the actual training image. The operator preview for 3D/uploaded video comes from that image. YouTube displays only in the projector window to avoid duplicate playback and audio.
4. Mount the phone so the entire projected image is visible. On the operator screen, open **Camera** and scan its QR code. On the phone, tap **Connect** and **Enable rear camera**.
5. On the phone, tap **Show calibration & auto-align**. The paired operator switches the projector to its calibration pattern and ends any active session. Five large black-and-white ArUco codes identify the board. The phone fits the outer four codes, independently checks the center code, then accepts three stable detections. Keep the whole projected frame and all five codes visible; prefer the normal 1× rear lens. You can also show the pattern before enabling the camera. Verify that the numbered phone overlay circles coincide with the printed crosshair centers. The displayed fit/check errors are **camera pixels**, not guaranteed physical accuracy.

   If detection fails after eight seconds, the phone reports missing codes or an inconsistent fit. Move closer if codes are small, reduce glare/washed-out whites, or adjust the viewing angle. For manual alignment, use **Reset anchors** and tap the exact **centers of numbered crosshairs 1 → 2 → 3 → 4**. Do not tap the outer frame, white border, or code corners. Their known inset positions are accounted for automatically, preventing expansion toward the edges. Pinch or use +/− to zoom up to 6×; drag to pan. **Pan only** prevents accidental placement, **Fit image** resets the preview, and **Undo last anchor** corrects a tap. Zoom/pan affect only the preview, not capture or shot mapping.
6. Select red or green, capture the three-second baseline without firing, then start the three-pulse check. Verify each detected pulse corresponds to your actual laser and its location looks correct. Tap **Arm detection**.
7. Arming the phone automatically selects live camera input. On the phone, tap **Return projector to range** (or use **Return to range** on the operator), wait for the brief automatic sensitivity refresh to finish (“Camera calibrated”), select the shooter, and start the session. The projected image supplies reference frames and shot scoring. Camera processing still runs on the phone.
8. Use the operator's **End session** to review results. For videos, **Play / pause video** and **Seek video** control the projector player. Browser autoplay may require an initial click in the projector; entering fullscreen supplies that interaction on supported browsers.

You can switch operator tabs or resize the operator without altering the projection geometry. Use **Overhead editor** to edit the scenario between runs; the projector stays in perspective. Starting a run returns the operator to its live preview. Keep the projector visible and stationary: minimizing or a prolonged interruption stops the run but retains camera alignment. Closing it switches the display source and requires alignment again. Resizing, changing scenes/videos, and returning from the calibration pattern preserve the fixed screen alignment and three-pulse check; sensitivity refreshes automatically (about one second, longer at low camera FPS). Hold fire while “Camera adjusting” is shown. Resizing assumes the physical projected outer frame remains unchanged. If the camera or that outer frame moves, use **Reset anchors** and realign. Closing/reloading the operator also stops the projector. Both windows must remain on the same computer/browser origin.

The separate view is optional. **Use single window** closes it; recalibrate the newly displayed image before a live session. The original single-window fullscreen button still works when no separate projector is connected.

## 4. Tune timing and verify detection

The host's **Display/capture latency correction** defaults to 100 ms. This is not a measured hardware value. Run the moving-target procedure in [HARDWARE-VALIDATION.md](HARDWARE-VALIDATION.md), adjust it, and repeat. High speed and short exposures remain experimental. Use the same projector display mode and network for validation and training.

If a phone reports no reference frames, check host connection and ensure the host tab is visible. YouTube intentionally has no source references and requires manual scoring. Uploaded videos need a browser-supported codec, preferably H.264 in MP4.

## 5. Repository and updates

The private repository is **[ickynk/laserrange](https://github.com/ickynk/laserrange)**.

To get a fresh copy with GitHub CLI:

```sh
gh auth login
gh repo clone ickynk/laserrange
cd laserrange
npm ci
npm start
```

To update an existing checkout, stop the server, run `git pull --ff-only` and `npm ci`, then restart it. Commit or stash any local source edits before pulling. Never commit `certs/`, CA keys, or host-link secrets.

## 6. YouTube mouse demo

Load a YouTube link under **Video**, leave **Demo · click to shoot** enabled, then start a session. Left-clicks on the video now record shots and leave small marks instead of reaching the embedded player's pause control. Use **Play / pause video** in the operator Video panel (or **Play / pause** in the legacy single-window fullscreen controls) to control playback. End the session to restore normal YouTube interaction, including seeking and player controls.

YouTube demo shots require manual scoring. Without a paired phone they do not have camera snapshots; browsers do not expose embedded YouTube video pixels for source-frame capture.

### Camera shots not appearing

Arming detection selects live input automatically. If you deliberately turn Demo back on, that session accepts mouse clicks; an incoming camera pulse displays an explanation instead of being silently ignored. End the demo and uncheck Demo to use the phone.

Camera telemetry shows cumulative **live detections** independently of session shot totals. If that counter increases but session shots do not, check that a live session is running. If it does not increase, check the phone preview, laser color, exposure, and sensitivity. Calibration on a bright pattern does not guarantee optical detection on every background; clipped white spots or very short pulses may still be missed. Automatic refresh retains your exact selected threshold; it does not raise it based on video motion. Test hardware accuracy on the actual range image.

### Optional five-shot screen zero

Use this after alignment, baseline and the three-pulse check if registered shots have a consistent offset. Select the shooter on the operator’s **Range** tab, then tap **Start five-shot zero** on either the phone or the operator’s **Camera** tab. End any running session first.

Wait for the hold-fire notice to clear. Place **five separate actual laser strikes on the center crosshair**, at least 0.3 seconds apart. The app averages their raw detected positions and proposes a horizontal/vertical translation. Tap **Apply zero** only if the laser itself landed on the mark. Aiming at the mark while the laser actually strikes elsewhere would mix device/sight/aiming error into the screen correction. Zeroing shots do not count toward session scores.

Corrections are shown as percentages of screen width/height; physical inches cannot be calculated without measured projection dimensions. The correction is applied once to live camera scoring, impact marks and review coordinates, and does not alter mouse-demo clicks or camera geometry. Verify center and edge placement afterward. This corrects a constant offset, not distortion or scale errors.

Each shooter name has its own correction within the current connected setup. Switching shooters selects the matching correction. **Clear shooter zero** removes it; **Cancel zero** keeps any previous correction. A new alignment, camera/color change, expired/rejected pairing, display-source switch or page reload clears the stored corrections. They are intentionally not restored across hardware setups. Scattered groups and offsets over 5% of either screen dimension are rejected; retry alignment when necessary.

### Connection recovery and window changes

Switching between overhead and perspective, operator tabs, or video/3D content keeps the camera paired. Fixed screen geometry and completed five-shot corrections remain intact. Content changes automatically refresh sensitivity. A minimized projector or backgrounded phone pauses the active session; restoring the window retains calibration. Phones must keep their camera page visible to capture reliably.

Temporary network loss reconnects automatically with the same pairing code. The host keeps the pairing session for two minutes during a host outage. Wait for **Camera calibrated**, then start a new session; shots during an outage are not recovered or replayed. The app displays reconnecting status instead of asking for calibration. If the server restarts, pairing expires, the camera stream stops, or the physical frame moves, follow the displayed recovery instructions.

There is no fixed 35-second camera disconnect timer. The default scenario duration is 30 seconds, including video sessions. Increase **Duration** in the Range controls for longer playback sessions; reaching the duration ends scoring, not the camera connection.

### Video false positives and faint pulses

The phone now confirms that a video candidate is a short flash before registering it. Persistent red/green areas, moving highlights and large scene changes are filtered. Shot timing and review frames use the original onset even though the marker appears after the pulse ends. **Maximum video pulse · ms** defaults to 600; increase it if your actual device pulse lasts longer. This guard applies to video, not the static calibration/zeroing screens.

Prefer an uploaded file for the strongest filtering: the camera can subtract the known source image, including projector/camera color differences. Uploaded-video detection waits if source frames become stale. YouTube does not expose source pixels; brief laser-like colors can still produce false positives, and cuts or fast motion can suppress genuine pulses. Confirm performance on your chosen video.

The sensitivity slider now keeps your chosen value through automatic refreshes. Lower means more sensitive; the range extends down to 5 for faint pulses, and quiet baseline capture can select 15 instead of the previous 35 floor. Start with a fresh baseline after updating, then run the three-pulse check. Adjust downward only as needed while checking for false positives. Optical exposure and clipped white spots still affect detection.

### Barricade length

Select a barricade in the overhead editor and set **Length · front–back (m)** beside its width/height settings. Width spans left–right; length extends along the range floor toward/away from the viewer. The 0.1–10 m value is stored in the existing `depth` field, so saved/shared scenarios and the projector use the same geometry.


### Video detection profiles and diagnosis

Start with **Balanced** and a **600 ms** maximum pulse. Balanced confirms the fade of the original bright core rather than requiring the surrounding video patch to become quiet. It tolerates moderate scene motion and camera stutter. **Strict** retains the conservative motion/cut checks; **Sensitive** increases motion/cut and frame-gap tolerance, with a greater false-positive risk. All profiles reject overlong pulses. The maximum pulse must exceed your device flash plus the interval to the next captured frame.

Phone status reports raw candidates, confirmed pulses, and rejection reasons (movement, scene change, pulse too long, frame gap, unstable onset). If candidates do not rise when firing, adjust camera exposure/sensitivity; changing the confirmation profile cannot recover a pulse the detector never sees. If candidates rise but confirmations do not, use the reason counts to choose a profile or pulse limit. Try ten spaced shots on the same clip, then run that clip without firing to check false positives. These counts are diagnostics, not an automatic accuracy measurement. The reported one-in-ten hardware detection rate needs retesting with this update.

### Assets, scoring and movement

Select a barrier to choose a block, car, pillar, fence, window wall or highway barrier. Width, height, front–back length and rotation remain editable. Models are original procedural geometry; window/fence openings allow shots through and solid parts block them. Targets offer illustrated silhouette, cardboard and bullseye backers plus a full-volume mannequin. These are lightweight local assets, not photorealistic scans.

Under a target's scoring-zone controls, add up to twelve named rectangle/ellipse zones. Centers and dimensions use normalized target coordinates (0–1, with y increasing downward). Zones must fit inside the target. First matching zone wins; **Move first** changes priority. A target hit outside configured zones scores zero points but still counts as a hit. Targets without zones retain one point per hit; no-shoot hits score zero and remain separately reported.

**Repeat every** schedules visibility from the target's start time; **Visible for** sets each appearance length. Zero repeat disables repetition. The target stops at its end time, and movement continues while hidden. Smooth easing slows movement near path segment endpoints. Camera speed is in meters/second; heading can be fixed or follow the path with an angular offset. These settings and session settings travel with saved/shared scenario JSON.

### Countdown, beep and comparison

Expand **Session start** to configure a 0–15 second countdown and the beep's enable switch, frequency, duration and volume. Preview the beep on the operator device. The operator emits the start beep once; the projector shows the same countdown. Browser audio permission and device output volume apply. Shots during countdown are ignored, and countdown time does not consume scenario duration. Cancelling during countdown does not create a scored run.

Run sessions under different shooter names to fill the comparison table. It shows totals, hit accuracy, points/best run, no-shoot hits, pending reviews, mean first-shot time, mean within-run split and zone counts. Different scenario/settings, media sources, and demo/live inputs form separate comparison groups. Manual video reviews update the totals. History retains up to fifty runs in the current page, with review images only for the five newest; reloading clears history.


### Full 3D targets and custom target images

Choose **Mannequin** under Target asset for a freestanding model with a head, torso, pelvis, arms, hands and legs. It has no rectangular scoring backer; gaps between body parts remain empty. Selecting this asset sets a 0.75 m width and 1.8 m height, which you can adjust. Target **Rotation** turns the entire target around its vertical axis, including its scoring coordinates and attached shot marks. Scoring zones on mannequins use the target's local front-view x/y coordinates; zones are not painted onto the sculpted body.

Use **Custom target image** to upload JPEG, PNG or WebP (up to 12 MB / 40 megapixels). In the crop dialog, drag to reposition and use Zoom to fill the target-shaped crop. **Apply to cardboard** switches that target to a cardboard backer with your crop on its front. Cancel leaves the target unchanged; **Remove custom image** restores the standard artwork. Rotation and scoring zones still apply. Images are re-encoded to a bounded JPEG and embedded in exported/saved range JSON; no remote image service is required. A range permits up to 8 MB of embedded images and a 10 MB JSON import. Browser-local quick-save can reach the browser storage quota; the host folder supports the full range size.

Barriers now include a beveled vehicle with sloped glazing, mirrors, grille, trim and wheels; masonry walls; open doorways with an open leaf; oil drums with hoops/lid; and 3-gun port barricades. Doorways and ports have real gaps. These are original procedural models designed for local browser rendering, not photogrammetry assets. Rotation, width, height and front–back length remain editable.

### Segment focus and camera POV

Enable **Move viewpoint along camera path** and draw at least two camera path points. Select the desired **Camera segment**, choose **Click focus point**, then click the floor beneath what the shooter should look at in overhead view. **Focus height** sets its vertical position. A gold ring and line display each saved focus point. Repeat for other segments; **Clear segment focus** restores that segment's heading behavior. Clearing the camera path also clears its segment focus settings.

**Focus transition** controls how many seconds the camera spends easing between adjacent segment view directions, centered on the path join. The transition is shortened when neighboring segments are too short. A value of zero intentionally makes an immediate turn. Segments without explicit focus use the fixed/path-heading settings, and path-heading turns are also eased. Camera movement still follows the drawn line segments; this smooths the view rotation, not the shape of the travel path. **Camera height** and **Field of view** give additional POV control. The same time-based calculation drives both displays and shot scoring.

### Shot review navigation

Open **View frame** for a shot. Use **Previous shot / Next shot**, left/right arrow keys, or click the left/right half of the frame. The counter shows your position in chronological shot order. Navigation stops at the first/last shot and works for retained previous sessions. Older shots without retained images still show their metadata and counter. Existing hit/miss review controls remain in the shot list.

### Host folders for saved ranges and video links

Open **Saved ranges · host folder**, enter a name and select **Save range copy**. Each save creates a separate range file under `data/ranges/`; choose a saved item to load or delete it. The list refreshes when opened or when **Refresh list** is clicked. Range files include geometry, paths, focus points, settings and cropped target images.

In the Video tab, open **Saved video links**, give the current YouTube link a name, and save it. **Load selected video** loads it through the existing YouTube controls. Links live under `data/videos/`. This stores links, not video downloads; uploaded video files still use the existing file picker.

Both folders live beside the host server by default and survive browser resets and server restarts. Back up the entire `data` directory. Set `RANGE_DATA_DIR` to use another writable directory; Docker users should persist that location in a mounted volume. Saved user files are excluded from Git. Library access requires the unlocked host link printed by the server; the phone pairing code does not grant library access. The older browser quick-save and JSON import/export controls remain available.


### Shooter-controlled progression and projector buttons

Enable **Move viewpoint along camera path** and **Pause at camera segment ends** in the Range editor. Start moves the camera through the first segment, then holds at its endpoint. Use **Next** to move through the next segment or **Previous** to travel back to the previous endpoint. Navigation becomes available when the camera reaches an endpoint; it does not skip or teleport while moving. The last endpoint remains held until you select **End**, **Restart**, or another range. Duplicate path points are ignored for progression.

A hold freezes the camera **and scenario timeline**, including target motion and appearance schedules, while shots remain recordable. The shot timer continues in real time. Going backward rewinds scene progression; existing impact marks and shot history remain. The displayed scenario Duration must exceed the full path travel time, but holds do not consume it and do not automatically end a segmented session. The completed segment's focus is held at the endpoint, and its transition toward the next focus begins after advancing. With the option off, the existing timed session behavior remains.

The separate projector now reserves its **bottom 14%** for neutral-colored simulator controls: **Start, Restart, Ranges, Previous, Next, End**. This is an overlay within the existing calibrated screen boundary; it does not resize or remap the scene. Keep target content above that strip. Controls disappear during alignment and screen-zero patterns and return afterward. The operator also has Previous/Next buttons and endpoint status for single-window use.

With the phone calibrated/armed and live camera input selected, place a laser strike inside a control button. Start works before a scored session begins. Disabled buttons, control gaps and menu strikes do not add shots, misses or impact marks. Actions have a 900 ms cooldown, and stale pulses from before a changed button layout are ignored. Pointer clicks also work, including over YouTube playback. Previous/Next are enabled only for a held 3D segment; they do not seek video playback.

**Ranges** ends and archives the current run and opens a paginated list from the host's saved range folder. Select a range, wait for the projector and camera to be ready, then select Start. The menu has Back and page controls; an empty library directs you to save a range on the operator first. Restart ends/archives the current run, clears current marks/statistics, and starts again using the configured countdown. The unlocked operator handles range access; credentials are not sent to the projector. Physical laser-control reliability still needs testing on the projector, particularly during YouTube video.

### Compact editor and alternating camera placement

The Range tab groups settings into **Scenario & shooter**, **Targets & barriers**, **Shooter camera & movement**, and **Session, sound & ammunition**. Click each heading to expand/collapse it. On desktop the editor scrolls independently within the viewport; the range stays alongside it. Mobile keeps the range above the controls.

Open **Shooter camera & movement → Draw camera path**. Each click adds the next movement node; the following click places the focal point for that completed segment. Repeat node, focus, node, focus. If you cleared the path, the very first click establishes the starting position. The prompt above the range tells you which click comes next. Escape finishes. Existing segment focus controls still let you revise any segment individually. Focus points use the existing saved-range schema and smoothing settings.

### Shot sounds and optional magazine counter

Open **Session, sound & ammunition**. Gunshot/dry-click audio defaults on, with its own volume slider and **Preview gunshot** button. These are original synthesized report/click effects, not recordings of a particular firearm. Sound plays on the **operator computer's selected audio output**, including when a separate projector window is used. Click Preview gunshot once before laser-only operation to unlock browser audio; the status below it reports readiness. If audio is blocked, shots still record and no delayed sounds are queued. Muting the start beep does not mute shot sounds, and vice versa.

Enable **Magazine counter** and choose **Rounds per magazine** (1–200). Each accepted shot consumes one round. At zero the top of the range/projector displays **Reload**. The next detected trigger plays a dry click, does not score or leave an impact, and refills the counter. The following trigger fires normally. This is an assumed reload, not physical reload detection; reload your training device as needed. The counter starts full on every new/restarted session. Calibration pulses, countdown pulses and projector control/menu strikes do not consume ammo. Counter settings are saved with the range and apply to 3D and video sessions.

### Pairing rate-limit recovery

A temporary WebSocket rate-limit response now waits five seconds and reconnects automatically with the same credentials. You should not need to refresh or type the code again for this condition. Invalid/expired credentials and an already-connected different phone still produce a pairing error. QR scanning opens the prefilled phone link; select Connect, then enable the camera. Redundant readiness messages are suppressed; message-rate and authentication protections remain enabled.
