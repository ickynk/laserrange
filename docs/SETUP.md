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
5. Click **Show calibration screen** on the operator. The pattern appears on the projector. On the phone, use **Detect corner markers**, verify the outline, or manually select the four outer corners in TL → TR → BR → BL order.
6. Select red or green, capture the three-second baseline without firing, then start the three-pulse check. Verify each detected pulse corresponds to your actual laser and its location looks correct. Tap **Arm detection**.
7. Arming the phone automatically selects live camera input. On the operator, select **Return to range**, wait for the brief automatic sensitivity refresh to finish (“Camera calibrated”), select the shooter, and start the session. The projected image supplies reference frames and shot scoring. Camera processing still runs on the phone.
8. Use the operator's **End session** to review results. For videos, **Play / pause video** and **Seek video** control the projector player. Browser autoplay may require an initial click in the projector; entering fullscreen supplies that interaction on supported browsers.

You can switch operator tabs or resize the operator without altering the projection geometry. Use **Overhead editor** to edit the scenario between runs; the projector stays in perspective. Starting a run returns the operator to its live preview. Keep the projector visible and stationary: minimizing, closing, or disconnecting it stops the run and invalidates camera readiness. Resizing, changing scenes/videos, and returning from the calibration pattern preserve the fixed screen alignment and three-pulse check; sensitivity refreshes automatically (about one second, longer at low camera FPS). Hold fire while “Camera adjusting” is shown. Resizing assumes the physical projected outer frame remains unchanged. If the camera or that outer frame moves, use **Reset corners** and realign. Closing/reloading the operator also stops the projector. Both windows must remain on the same computer/browser origin.

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

Camera telemetry shows cumulative **live detections** independently of session shot totals. If that counter increases but session shots do not, check that a live session is running. If it does not increase, check the phone preview, laser color, exposure, and sensitivity. Calibration on a bright pattern does not guarantee optical detection on every background; clipped white spots or very short pulses may still be missed. Automatic refresh never raises the threshold above the value verified by the three-pulse check. Test hardware accuracy on the actual range image.
