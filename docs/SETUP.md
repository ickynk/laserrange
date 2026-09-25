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

The phone now confirms that a video candidate is a short flash before registering it. Persistent red/green areas, moving highlights and large scene changes are filtered. Shot timing and review frames use the original onset even though the marker appears after the pulse ends. **Maximum video pulse · ms** defaults to 350; increase it if your actual device pulse lasts longer. This guard applies to video, not the static calibration/zeroing screens.

Prefer an uploaded file for the strongest filtering: the camera can subtract the known source image, including projector/camera color differences. Uploaded-video detection waits if source frames become stale. YouTube does not expose source pixels; brief laser-like colors can still produce false positives, and cuts or fast motion can suppress genuine pulses. Confirm performance on your chosen video.

The sensitivity slider now keeps your chosen value through automatic refreshes. Lower means more sensitive; the range extends down to 5 for faint pulses, and quiet baseline capture can select 15 instead of the previous 35 floor. Start with a fresh baseline after updating, then run the three-pulse check. Adjust downward only as needed while checking for false positives. Optical exposure and clipped white spots still affect detection.

### Barricade length

Select a barricade in the overhead editor and set **Length · front–back (m)** beside its width/height settings. Width spans left–right; length extends along the range floor toward/away from the viewer. The 0.1–10 m value is stored in the existing `depth` field, so saved/shared scenarios and the projector use the same geometry.
