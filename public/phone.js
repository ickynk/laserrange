import { Channel } from "./core/channel.js";
import {
  homography,
  unitCorners,
  validQuad,
  warpMap,
  warp,
  project,
} from "./core/geometry.js";
import { LaserDetector, chooseReference } from "./core/detector.js";
const $ = (id) => document.getElementById(id),
  notify = (m) => ($("phoneNotice").textContent = m);
const W = 480,
  H = 270,
  detector = new LaserDetector(W, H),
  capture = document.createElement("canvas"),
  captureCtx = capture.getContext("2d", { willReadFrequently: true }),
  rectCtx = $("rectified").getContext("2d", { willReadFrequently: true }),
  out = rectCtx.createImageData(W, H),
  referenceCanvas = document.createElement("canvas");
referenceCanvas.width = W;
referenceCanvas.height = H;
const referenceCtx = referenceCanvas.getContext("2d", {
  willReadFrequently: true,
});
let channel,
  stream,
  corners = [],
  mapping = null,
  referenceHistory = [],
  baselineFrames = [],
  baselineUntil = 0,
  baselineDone = false,
  testing = false,
  testCount = 0,
  armed = false,
  mode = "3d",
  frameCount = 0,
  lastTelemetry = 0,
  lastVideoTime = -1,
  loopGeneration = 0,
  wakeLock = null,
  lastReferenceAge = 0,
  connected = false;
$("code").value = new URLSearchParams(location.hash.slice(1)).get("code") || "";
history.replaceState(null, "", location.pathname);
function ready(value) {
  armed = value;
  channel?.send({ type: "ready", ready: value });
  $("arm").textContent = value ? "Detection armed" : "Arm detection";
}
function invalidate(reason, { keepCorners = false } = {}) {
  ready(false);
  baselineDone = false;
  testing = false;
  testCount = 0;
  baselineFrames = [];
  baselineUntil = 0;
  detector.reset();
  $("arm").disabled = true;
  $("testStatus").textContent = "0 / 3 pulses detected";
  if (!keepCorners) {
    corners = [];
    mapping = null;
    drawCorners();
  }
  if (reason) notify(reason);
}
$("connect").onclick = () => {
  if (channel) channel.ws.close();
  connected = false;
  invalidate();
  channel = new Channel({ role: "phone", code: $("code").value.trim() });
  channel
    .on("joined", () => {
      connected = true;
      notify("Connected. Enable camera and align the projected frame.");
    })
    .on("reference", receiveReference)
    .on("mode", (m) => {
      mode = m.mode;
      referenceHistory = [];
    })
    .on("reset", () => invalidate("Host display changed. Recalibrate."))
    .on("closed", (m) => {
      connected = false;
      invalidate(m);
    })
    .on("host-offline", () => {
      connected = false;
      invalidate("Host disconnected. Reconnect and calibrate.");
    })
    .on("fault", notify);
};
async function receiveReference(m) {
  try {
    const bitmap = new Image();
    bitmap.src = m.image;
    await bitmap.decode();
    referenceCtx.drawImage(bitmap, 0, 0, W, H);
    referenceHistory.push({
      time: m.time,
      data: referenceCtx.getImageData(0, 0, W, H).data,
    });
    referenceHistory.sort((a, b) => a.time - b.time);
    if (referenceHistory.length > 20)
      referenceHistory.splice(0, referenceHistory.length - 20);
  } catch {
    notify(
      "Reference frame could not be decoded. Detection will require manual review.",
    );
  }
}
async function startCamera() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    return notify(
      "Phone cameras require trusted HTTPS. Use docs/SETUP.md to configure the host certificate or HTTPS tunnel.",
    );
  invalidate();
  stream?.getTracks().forEach((t) => t.stop());
  loopGeneration++;
  try {
    const deviceId = $("cameraSelect").value;
    stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        ...(deviceId
          ? { deviceId: { exact: deviceId } }
          : { facingMode: { ideal: "environment" } }),
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 60, min: 24 },
      },
    });
    $("camera").srcObject = stream;
    await $("camera").play();
    capture.width = $("camera").videoWidth;
    capture.height = $("camera").videoHeight;
    $("cornerOverlay").width = capture.width;
    $("cornerOverlay").height = capture.height;
    const devices = await navigator.mediaDevices.enumerateDevices(),
      selected = stream.getVideoTracks()[0].getSettings().deviceId;
    $("cameraSelect").replaceChildren();
    for (const d of devices.filter((d) => d.kind === "videoinput"))
      $("cameraSelect").add(new Option(d.label || "Camera", d.deviceId));
    $("cameraSelect").value = selected;
    stream.getVideoTracks()[0].onended = () =>
      invalidate("Camera stopped. Enable it and recalibrate.");
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {}
    notify(
      "Camera running. Show the host calibration screen, then locate its four corners.",
    );
    drawCorners();
    const generation = loopGeneration;
    const next = () => {
      if (generation !== loopGeneration) return;
      processFrame();
      if ($("camera").requestVideoFrameCallback)
        $("camera").requestVideoFrameCallback(next);
      else requestAnimationFrame(next);
    };
    next();
  } catch (e) {
    notify(`Camera unavailable: ${e.message}`);
  }
}
$("startCamera").onclick = startCamera;
$("cameraSelect").onchange = startCamera;
function drawCorners() {
  const c = $("cornerOverlay"),
    x = c.getContext("2d");
  x.clearRect(0, 0, c.width, c.height);
  x.lineWidth = Math.max(2, c.width / 400);
  x.strokeStyle = "#00ffff";
  x.fillStyle = "#00ffff";
  x.font = `bold ${Math.max(18, c.width / 35)}px sans-serif`;
  corners.forEach(([u, v], i) => {
    x.beginPath();
    x.arc(u * c.width, v * c.height, 8, 0, Math.PI * 2);
    x.stroke();
    x.fillText(String(i + 1), u * c.width + 12, v * c.height + 10);
  });
  if (corners.length > 1) {
    x.beginPath();
    corners.forEach(([u, v], i) =>
      i
        ? x.lineTo(u * c.width, v * c.height)
        : x.moveTo(u * c.width, v * c.height),
    );
    if (corners.length === 4) x.closePath();
    x.stroke();
  }
  $("cornerStatus").textContent =
    `${corners.length} / 4 corners${mapping ? " · aligned" : ""}`;
}
function applyCorners() {
  if (!validQuad(corners)) {
    corners = [];
    mapping = null;
    throw Error(
      "Corners must form a convex screen in TL → TR → BR → BL order. Try again.",
    );
  }
  const h = homography(unitCorners, corners);
  mapping = warpMap(h, W, H, capture.width, capture.height);
  detector.reset();
  drawCorners();
  notify("Screen aligned. Capture a baseline without firing.");
}
$("cornerOverlay").onpointerdown = (e) => {
  if (!stream) return;
  if (corners.length === 4) invalidate(null);
  const r = $("cornerOverlay").getBoundingClientRect();
  corners.push([
    (e.clientX - r.left) / r.width,
    (e.clientY - r.top) / r.height,
  ]);
  if (corners.length === 4)
    try {
      applyCorners();
    } catch (error) {
      notify(error.message);
    }
  drawCorners();
};
$("resetCorners").onclick = () =>
  invalidate("Tap the four outer screen corners.");
$("autoCorners").onclick = () => {
  if (!stream) return notify("Enable the camera first.");
  invalidate();
  captureCtx.drawImage($("camera"), 0, 0, capture.width, capture.height);
  const data = captureCtx.getImageData(
      0,
      0,
      capture.width,
      capture.height,
    ).data,
    w = capture.width,
    h = capture.height,
    mask = new Uint8Array(w * h),
    groups = [];
  for (let p = 0; p < mask.length; p++) {
    const i = p * 4;
    if (
      data[i + 1] > 130 &&
      data[i + 2] > 130 &&
      data[i + 1] - data[i] > 55 &&
      data[i + 2] - data[i] > 55
    )
      mask[p] = 1;
  }
  for (let p = 0; p < mask.length; p++)
    if (mask[p]) {
      const stack = [p];
      mask[p] = 0;
      let n = 0,
        x = 0,
        y = 0;
      while (stack.length) {
        const q = stack.pop(),
          qx = q % w;
        n++;
        x += qx;
        y += Math.floor(q / w);
        for (const z of [q - 1, q + 1, q - w, q + w])
          if (
            z >= 0 &&
            z < mask.length &&
            mask[z] &&
            Math.abs((z % w) - qx) <= 1
          ) {
            mask[z] = 0;
            stack.push(z);
          }
      }
      if (n >= 5 && n < w * h * 0.015)
        groups.push({ x: x / n / w, y: y / n / h, n });
    }
  const candidates = groups.sort((a, b) => b.n - a.n).slice(0, 4);
  if (candidates.length !== 4)
    return notify(
      "Could not isolate four cyan markers. Tap the screen corners manually.",
    );
  candidates.sort((a, b) => a.y - b.y);
  const top = candidates.slice(0, 2).sort((a, b) => a.x - b.x),
    bottom = candidates.slice(2).sort((a, b) => b.x - a.x);
  const ordered = [...top, ...bottom].map((p) => [p.x, p.y]);
  try {
    const h = homography(
      [
        [0.035, 0.035],
        [0.965, 0.035],
        [0.965, 0.965],
        [0.035, 0.965],
      ],
      ordered,
    );
    corners = unitCorners.map(([u, v]) => project(h, u, v));
    if (corners.some((p) => p.some((v) => v < -0.005 || v > 1.005)))
      throw Error("Screen is partly out of frame.");
    corners = corners.map((p) => p.map((v) => Math.max(0, Math.min(1, v))));
    applyCorners();
    notify(
      "Markers found. Verify the outline matches the outer screen before capturing baseline.",
    );
  } catch (e) {
    corners = [];
    mapping = null;
    drawCorners();
    notify(`${e.message} Select corners manually.`);
  }
};
$("laserColor").onchange = () => {
  detector.color = $("laserColor").value;
  invalidate("Laser color changed. Capture a new baseline and test pulses.", {
    keepCorners: true,
  });
};
$("threshold").oninput = () => {
  detector.threshold = Number($("threshold").value);
  $("thresholdValue").textContent = detector.threshold;
  ready(false);
  testCount = 0;
  testing = false;
  $("arm").disabled = true;
  $("testStatus").textContent = "0 / 3 pulses detected";
};
$("baseline").onclick = () => {
  if (!mapping) return notify("Align the screen first.");
  invalidate(null, { keepCorners: true });
  baselineUntil = performance.now() + 3000;
  baselineFrames = [];
  notify("Capturing baseline for 3 seconds. Do not fire.");
};
$("test").onclick = () => {
  if (!baselineDone) return notify("Capture a baseline first.");
  ready(false);
  testCount = 0;
  testing = true;
  // Seed onset detection with the latest aligned frame so an immediate first
  // test pulse is not consumed as the detector's initial background.
  detector.previous = new Uint8ClampedArray(out.data);
  $("arm").disabled = true;
  $("testStatus").textContent = "0 / 3 pulses detected";
  notify(
    "Fire three separate test pulses onto the calibration screen. Check their positions in the rectified preview.",
  );
};
$("arm").onclick = () => {
  if (!connected || !mapping || !baselineDone || testCount < 3)
    return notify(
      "Connect, align, capture baseline, and detect three test pulses first.",
    );
  testing = false;
  ready(true);
  notify(
    "Detection armed. Return the host to its range, then start a live session.",
  );
};
$("disarm").onclick = () => {
  ready(false);
  notify("Detection disarmed.");
};
function processFrame() {
  const video = $("camera");
  if (
    video.readyState < 2 ||
    document.hidden ||
    video.currentTime === lastVideoTime
  )
    return;
  lastVideoTime = video.currentTime;
  if (
    capture.width !== video.videoWidth ||
    capture.height !== video.videoHeight
  ) {
    invalidate(
      "Camera resolution changed. Enable camera again and recalibrate.",
    );
    return;
  }
  frameCount++;
  const clock = channel?.now() ?? Date.now();
  if (mapping) {
    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
    warp(
      captureCtx.getImageData(0, 0, capture.width, capture.height).data,
      mapping,
      out.data,
    );
    rectCtx.putImageData(out, 0, 0);
    if (baselineUntil) {
      if (performance.now() < baselineUntil) {
        if (baselineFrames.length < 90)
          baselineFrames.push(new Uint8ClampedArray(out.data));
      } else {
        baselineUntil = 0;
        try {
          const threshold = detector.calibrate(
            baselineFrames,
            $("laserColor").value,
          );
          baselineDone = true;
          $("threshold").value = threshold;
          $("thresholdValue").textContent = threshold;
          const ref = chooseReference(out.data, referenceHistory, clock);
          if (ref) detector.photometric(out.data, ref.data);
          notify("Baseline captured. Run the three-pulse laser check.");
        } catch (e) {
          notify(e.message);
        }
        baselineFrames = [];
      }
    } else if (testing || armed) {
      const ref =
        mode === "youtube"
          ? null
          : chooseReference(out.data, referenceHistory, clock);
      lastReferenceAge = ref ? clock - ref.time : 9999;
      const hits = detector.detect(out.data, ref?.data, clock, {
        temporalOnly: mode === "youtube" || !ref,
      });
      for (const hit of hits) {
        const image = $("rectified").toDataURL("image/jpeg", 0.75);
        rectCtx.strokeStyle = "white";
        rectCtx.lineWidth = 2;
        rectCtx.strokeRect(hit.x * W - 7, hit.y * H - 7, 14, 14);
        if (testing) {
          testCount++;
          $("testStatus").textContent = `${testCount} / 3 pulses detected`;
          $("arm").disabled = testCount < 3 || !connected;
          if (testCount >= 3) {
            testing = false;
            notify(
              "Three pulses detected. Verify placement, then arm detection.",
            );
          }
        } else if (armed)
          channel?.send({ type: "shot", ...hit, time: clock, image });
      }
    }
  }
  if (performance.now() - lastTelemetry > 1000) {
    const fps = (frameCount * 1000) / (performance.now() - lastTelemetry);
    lastTelemetry = performance.now();
    frameCount = 0;
    $("cameraTelemetry").textContent =
      `${Math.round(fps)} fps · ${detector.color} · ${armed ? "ARMED" : "disarmed"} · source reference ${lastReferenceAge >= 9999 ? "unavailable" : Math.round(lastReferenceAge) + " ms"}`;
    channel?.send({
      type: "telemetry",
      fps,
      referenceAge: lastReferenceAge,
      tests: testCount,
    });
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    invalidate("Camera page was backgrounded. Recalibrate before resuming.", {
      keepCorners: true,
    });
    wakeLock?.release();
  }
});
window.addEventListener("orientationchange", () =>
  invalidate("Orientation changed. Recheck the screen corners."),
);
