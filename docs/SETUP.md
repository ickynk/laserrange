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

## 3. Projector and phone alignment

1. Project the host browser onto the screen/wall and mount the phone so all of the projected frame is visible. Prefer the phone's rear main camera, stable lighting, and enough contrast to see a laser dot.
2. On the host, open **Camera** and scan its QR code. If the origin is wrong, edit **Phone-accessible host origin** and update the link. Tap **Connect** and **Enable rear camera** on the phone; allow camera permission.
3. Click **Projector** on the computer to enter fullscreen **before calibrating**. Hover near the upper-left corner to reveal projector controls. Select **Calibrate**.
4. On the phone, tap **Detect corner markers**. Visually verify that its outline follows the actual projected frame. If detection fails or is inaccurate, reset and tap the four outer corners: top-left, top-right, bottom-right, bottom-left. The cyan markers are inset; manual selection uses the outer screen border, not marker centers.
5. Select red or green. Capture the three-second baseline with no shots and no one crossing the camera view.
6. Choose **Start pulse test** and emit three distinct pulses at separated positions. Observe the rectified preview and verify that detections correspond to actual pulses. If ambient changes trigger the test counter, do not arm; recalibrate or raise the threshold and repeat the test.
7. Tap **Arm detection**. On the host's fullscreen controls, select **Range**. Before entering fullscreen, uncheck **Demo** for a live session; if you forgot, exit fullscreen, change it, and recalibrate after re-entering.
8. Select **Start** on the projector controls. A brief audible tone starts the timer. Move the pointer away so controls fade. **End** stops the session; exit fullscreen to review it.

The phone screen must stay awake and the camera page must remain in the foreground. Camera interruption, backgrounding, color changes, or host display resizing requires recalibration. A screen wake lock is requested where supported.

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

Load a YouTube link under **Video**, leave **Demo · click to shoot** enabled, then start a session. Left-clicks on the video now record shots and leave small marks instead of reaching the embedded player's pause control. Use **Play / pause video** in the Video panel (or **Play / pause** in fullscreen projector controls) to control playback. End the session to restore normal YouTube interaction, including seeking and player controls.

YouTube demo shots require manual scoring. Without a paired phone they do not have camera snapshots; browsers do not expose embedded YouTube video pixels for source-frame capture.
