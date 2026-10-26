import { installCameraControls } from "./core/camera-controls.js";
import { cameraAdvisory, sanitizeCameraHealth } from "./core/camera-health.js";
import { VoiceControl } from "./core/voice-control.js";
import { VideoPulseFilter } from "./core/video-filter.js";
import {
  detectCalibration,
  manualCalibration,
  outerCorners,
} from "./core/corners.js";
import { manualAnchors } from "./core/calibration-board.js";
import { alignmentView } from "./core/alignment-view.js";
import { Channel } from "./core/channel.js";
import { warpMap, warp, project } from "./core/geometry.js";
import { LaserDetector, chooseReference } from "./core/detector.js";
const videoFilter = new VideoPulseFilter(480, 270);
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
  manualPoints = [],
  calibrationTransform = null,
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
  connected = false,
  adaptingUntil = 0,
  adaptationFrames = [],
  validatedThreshold = 55,
  manualThreshold = null,
  detectedShots = 0,
  autoUntil = 0,
  autoLast = 0,
  autoCandidate = null,
  autoFailure = "No codes detected yet.",
  autoStable = 0,
  patternActive = false,
  autoRequested = false,
  patternTimer;
let alignmentQuality = null;
let lastCameraFrame = 0,
  cameraStalled = false;
let voiceRunId = null,
  pendingVoice = null,
  voiceReplyTimer;
const voice = new VoiceControl({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  available: () => connected && !document.hidden,
  runId: () => voiceRunId,
  fast: () => $("fastVoice").checked,
  command: (command, runId) => {
    if (!runId) {
      $("voiceResult").textContent = "Start a session first.";
      return;
    }
    clearTimeout(voiceReplyTimer);
    pendingVoice = crypto.randomUUID();
    const id = pendingVoice;
    voiceReplyTimer = setTimeout(() => {
      if (pendingVoice === id) {
        pendingVoice = null;
        $("voiceResult").textContent =
          "Command not confirmed. Check the range before repeating.";
      }
    }, 3500);
    channel.send({
      type: "voice-command",
      command,
      runId,
      id: pendingVoice,
      time: channel.now(),
    });
    $("voiceResult").textContent = `Heard ${command} · waiting for range…`;
  },
  status: (message, enabled) => {
    $("voiceStatus").textContent = voice.Recognition
      ? message
      : "Speech recognition unavailable in this browser. Existing range controls still work.";
    $("enableVoice").disabled = enabled || !voice.Recognition;
    $("disableVoice").disabled = !enabled;
  },
});
$("enableVoice").onclick = () => voice.start();
$("disableVoice").onclick = () => voice.stop();
$("fastVoice").onchange = () => voice.resetRun();
if (!voice.Recognition) {
  $("enableVoice").disabled = true;
  $("voiceStatus").textContent =
    "Speech recognition unavailable in this browser. Existing range controls still work.";
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden)
    voice.stop(
      "Voice stopped while phone is in the background. Enable again when ready.",
    );
});
window.addEventListener("pagehide", () => voice.stop());
const pairParams = new URLSearchParams(location.hash.slice(1));
let phonePairKey = pairParams.get("key") || undefined;
$("code").value = pairParams.get("code") || "";
$("code").oninput = () => {
  phonePairKey = undefined;
};
if (phonePairKey)
  notify("Secure phone link loaded. Tap Connect, then enable the camera.");
history.replaceState(null, "", location.pathname);
function ready(value) {
  armed = value;
  channel?.send({ type: "ready", ready: value });
  $("arm").textContent = value ? "Detection armed" : "Arm detection";
}
function invalidate(reason, { keepCorners = false } = {}) {
  videoFilter.reset();
  autoUntil = 0;
  resumeDetection = false;
  ready(false);
  adaptingUntil = 0;
  channel?.send({ type: "sensitivity", active: false });
  adaptationFrames = [];
  baselineDone = false;
  testing = false;
  testCount = 0;
  baselineFrames = [];
  baselineUntil = 0;
  detector.reset();
  $("arm").disabled = true;
  $("testStatus").textContent = "0 / 3 pulses detected";
  if (!keepCorners) {
    alignmentQuality = null;
    channel?.send({ type: "alignment-changed" });
    corners = [];
    manualPoints = [];
    calibrationTransform = null;
    mapping = null;
    drawCorners();
  }
  if (reason) notify(reason);
}
// Background changes do not change the fixed camera-to-screen mapping.
function refreshSensitivity() {
  videoFilter.reset();
  referenceHistory = [];
  if (!mapping || !baselineDone || testing) return;
  adaptingUntil = performance.now() + 900;
  channel?.send({ type: "sensitivity", active: true });
  adaptationFrames = [];
  notify(
    "Screen alignment retained. Adjusting sensitivity automatically; hold fire briefly.",
  );
}
$("connect").onclick = () => {
  voice.stop();
  voiceRunId = null;
  pendingVoice = null;
  if (channel) channel.close();
  connected = false;
  invalidate();
  channel = new Channel({
    role: "phone",
    code: $("code").value.trim(),
    phoneToken: phonePairKey,
  });
  channel
    .on("joined", (m) => {
      connected = m.hostOnline !== false;
      if (!connected)
        return pauseDetection(
          "Host reconnecting. Alignment retained; hold fire.",
        );
      if (m.reconnected && mapping && baselineDone) restoreConnection();
      else notify("Connected. Enable camera and align the projected frame.");
    })
    .on("reconnecting", () => {
      voice.stop("Connection lost. Enable voice again after reconnecting.");
      voiceRunId = null;
      pendingVoice = null;
      connected = false;
      pauseDetection(
        "Network interrupted. Reconnecting automatically; alignment retained.",
      );
    })
    .on("host-online", () => {
      connected = true;
      if (!mapping || !baselineDone)
        notify(
          "Host connection restored. Complete camera setup before arming detection.",
        );
      else restoreConnection();
    })
    .on("voice-state", (m) => {
      if (voiceRunId !== m.runId) {
        voiceRunId = m.runId;
        pendingVoice = null;
        voice.resetRun();
      }
    })
    .on("voice-result", (m) => {
      if (m.id === pendingVoice) {
        clearTimeout(voiceReplyTimer);
        $("voiceResult").textContent = m.message;
        pendingVoice = null;
      }
    })
    .on("zero-status", (m) => {
      $("zeroStatus").textContent = m.message;
      $("applyZero").disabled = !m.canApply;
      $("cancelZero").disabled = !m.active;
    })
    .on("camera-control", (m) => {
      if (Math.abs((channel?.now() ?? Date.now()) - m.time) > 3000) return;
      const result = cameraAction(m.action);
      channel.send({ type: "camera-control-result", id: m.id, ...result });
    })
    .on("reference", receiveReference)
    .on("mode", (m) => {
      if (mode !== m.mode) {
        mode = m.mode;
        refreshSensitivity();
      }
    })
    .on("pattern", (m) => {
      clearTimeout(patternTimer);
      patternActive = m.active === true;
      if (!patternActive) {
        autoUntil = 0;
        autoRequested = false;
        $("alignmentStatus").textContent =
          "Projector returned to range. Screen alignment retained.";
      }
      refreshSensitivity();
      if (patternActive && autoRequested) {
        if (stream) beginAuto();
        else
          $("alignmentStatus").textContent =
            "Pattern shown. Enable the camera to align automatically.";
      }
    })
    .on("reset", (m) => {
      if (m.preserveAlignment) refreshSensitivity();
      else invalidate("Display source changed. Align the new projected frame.");
    })
    .on("closed", (m) => {
      voice.stop("Connection closed. Reconnect before enabling voice.");
      connected = false;
      invalidate(m);
    })
    .on("host-offline", () => {
      voice.stop("Host disconnected. Enable voice again after reconnecting.");
      voiceRunId = null;
      connected = false;
      pauseDetection("Host reconnecting. Alignment retained; hold fire.");
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
  if (cameraControls.busy)
    return notify("Wait for the camera setting change to finish.");
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    return notify(
      "Phone cameras require trusted HTTPS. Use docs/SETUP.md to configure the host certificate or HTTPS tunnel.",
    );
  invalidate();
  stream?.getTracks().forEach((t) => t.stop());
  loopGeneration++;
  lastVideoTime = -1;
  lastCameraFrame = performance.now();
  cameraStalled = false;
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
    cameraControls.refresh();
    try {
      wakeLock = await navigator.wakeLock?.request("screen");
    } catch {}
    notify(
      "Camera running. Show the host calibration screen, then locate its four corners.",
    );
    drawCorners();
    if (patternActive && autoRequested) beginAuto();
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
const cameraControls = installCameraControls({
  root: $("cameraHardwareControls"),
  track: () => stream?.getVideoTracks()[0],
  blocked: () =>
    voiceRunId !== null ||
    !!(
      patternActive ||
      testing ||
      baselineUntil ||
      autoUntil ||
      adaptingUntil
    ) ||
    document.hidden,
  before: () => pauseDetection("Applying camera settings — hold fire."),
  after: (success) => {
    if (success) refreshSensitivity();
    else {
      resumeDetection = false;
      ready(false);
    }
  },
});
function cameraAction(action) {
  const fail = (message) => ({ accepted: false, message });
  if (!["pause", "resume", "refresh"].includes(action))
    return fail("Unknown camera action.");
  if (
    voiceRunId !== null ||
    patternActive ||
    testing ||
    baselineUntil ||
    autoUntil ||
    cameraControls.busy ||
    adaptingUntil
  )
    return fail(
      "End the session and wait for calibration/settings to finish first.",
    );
  if (action === "pause") {
    resumeDetection = false;
    ready(false);
    videoFilter.reset();
    return { accepted: true, message: "Detection paused. Alignment retained." };
  }
  if (
    !connected ||
    document.hidden ||
    stream?.getVideoTracks()[0]?.readyState !== "live" ||
    stream.getVideoTracks()[0].muted ||
    performance.now() - lastCameraFrame > 2500
  )
    return fail(
      "Bring the connected phone camera to the foreground and resume its preview first.",
    );
  if (!mapping || !baselineDone || testCount < 3)
    return fail(
      "Complete alignment, baseline and three test pulses on the phone first.",
    );
  if (action === "resume") {
    resumeDetection = true;
    ready(false);
  } else pauseDetection("Refreshing sensitivity — hold fire.");
  refreshSensitivity();
  return {
    accepted: true,
    message:
      "Sensitivity refresh started. Corners and pulse check retained; hold fire until ready.",
  };
}
for (const [id, action] of [
  ["refreshCameraSensitivity", "refresh"],
  ["resumeCameraDetection", "resume"],
  ["pauseCameraDetection", "pause"],
])
  $(id).onclick = () => notify(cameraAction(action).message);
$("resumeCameraPreview").onclick = async () => {
  try {
    if (voiceRunId !== null || cameraControls.busy)
      return notify("End the session before recovering the preview.");
    if (stream?.getVideoTracks()[0]?.readyState !== "live")
      return notify("Camera stopped. Enable it and recheck alignment.");
    await $("camera").play();
    notify(
      "Preview resume requested. Wait for fresh frames before resuming detection.",
    );
  } catch (e) {
    notify(`Preview could not resume: ${e.message}`);
  }
};
function drawCorners() {
  const c = $("cornerOverlay"),
    x = c.getContext("2d");
  x.clearRect(0, 0, c.width, c.height);
  x.lineWidth = Math.max(2, c.width / 400);
  x.strokeStyle = "#00ffff";
  x.fillStyle = "#00ffff";
  x.font = `bold ${Math.max(18, c.width / 35)}px sans-serif`;
  const anchors = calibrationTransform
    ? manualAnchors.map(([u, v]) => project(calibrationTransform, u, v))
    : manualPoints;
  anchors.forEach(([u, v], i) => {
    x.beginPath();
    x.arc(u * c.width, v * c.height, 10, 0, Math.PI * 2);
    x.stroke();
    x.fillText(String(i + 1), u * c.width + 14, v * c.height + 10);
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
    `${mapping ? 4 : manualPoints.length} / 4 anchors${mapping ? " · aligned" : ""}`;
}
function applyCalibration(transform) {
  alignmentQuality = { method: "manual", rms: null, checkError: null };
  channel?.send({ type: "alignment-changed" });
  corners = outerCorners(transform);
  calibrationTransform = transform;
  mapping = warpMap(transform, W, H, capture.width, capture.height);
  detector.reset();
  drawCorners();
  notify(
    "Screen aligned. Check the numbered overlay circles match the printed crosshair centers, then capture a baseline.",
  );
}
function placeCorner(point) {
  if (!stream) return notify("Enable the camera first.");
  autoUntil = 0;
  autoRequested = false;
  if (mapping || manualPoints.length === 4) invalidate(null);
  manualPoints.push(point);
  if (manualPoints.length === 4) {
    try {
      applyCalibration(manualCalibration(manualPoints).transform);
    } catch (error) {
      mapping = null;
      calibrationTransform = null;
      corners = [];
      drawCorners();
      $("alignmentStatus").textContent =
        `${error.message} Undo the last point or reset and retry.`;
      return;
    }
  }
  drawCorners();
  $("alignmentStatus").textContent = mapping
    ? "Manually aligned using crosshair centers. Verify all four overlay circles coincide with crosshairs before baseline."
    : `Tap the exact CENTER of crosshair ${manualPoints.length + 1}. Do not tap the frame edges or code corners.`;
}
const alignment = alignmentView($("alignmentViewport"), $("alignmentImage"), {
  onPoint: placeCorner,
  onZoom: (scale) => ($("zoomLevel").textContent = `${scale.toFixed(1)}×`),
});
$("zoomIn").onclick = () => alignment.zoom(1.4);
$("zoomOut").onclick = () => alignment.zoom(1 / 1.4);
$("fitImage").onclick = () => alignment.fit();
$("panImage").onchange = () => alignment.setPan($("panImage").checked);
$("resetCorners").onclick = () => {
  autoRequested = false;
  invalidate("Tap the centers of numbered crosshairs 1 → 2 → 3 → 4.");
  $("alignmentStatus").textContent =
    "Manual alignment: tap crosshair CENTERS 1 → 2 → 3 → 4. Do not tap the outer frame or code corners. Zoom and pan as needed.";
};
$("undoCorner").onclick = () => {
  const remaining = manualPoints.slice(0, -1);
  autoRequested = false;
  invalidate();
  manualPoints = remaining;
  drawCorners();
  $("alignmentStatus").textContent =
    "Last anchor removed. Tap its corrected crosshair center.";
};
function beginAuto() {
  if (!stream) return notify("Enable the camera first.");
  invalidate();
  autoRequested = false;
  autoUntil = performance.now() + 8000;
  autoLast = 0;
  autoStable = 0;
  autoCandidate = null;
  autoFailure = "No codes detected yet.";
  $("alignmentStatus").textContent =
    "Finding 5 black-and-white codes and checking alignment. Keep the camera steady…";
}
function requestPattern(active) {
  if (!connected) return notify("Connect to the host first.");
  autoRequested = active;
  autoUntil = 0;
  channel.send({ type: "calibration-request", active });
  $("alignmentStatus").textContent = active
    ? "Requesting calibration screen…"
    : "Returning projector to range…";
  clearTimeout(patternTimer);
  patternTimer = setTimeout(() => {
    autoRequested = false;
    $("alignmentStatus").textContent =
      "No response from the host. Check the operator connection and try again.";
  }, 5000);
}
$("showPattern").onclick = () => requestPattern(true);
$("hidePattern").onclick = () => requestPattern(false);
$("autoCorners").onclick = () =>
  patternActive ? beginAuto() : requestPattern(true);
function tryAuto(time) {
  if (!autoUntil || time - autoLast < 180) return;
  autoLast = time;
  if (time > autoUntil) {
    autoUntil = 0;
    $("alignmentStatus").textContent =
      `Automatic alignment could not find a stable pattern. ${autoFailure} Retry, or use Reset anchors and tap crosshair centers 1–4.`;
    return;
  }
  captureCtx.drawImage($("camera"), 0, 0, capture.width, capture.height);
  try {
    const result = detectCalibration(
      captureCtx.getImageData(0, 0, capture.width, capture.height).data,
      capture.width,
      capture.height,
    );
    const found = result.corners;
    const stable =
      autoCandidate &&
      found.every(
        (p, i) =>
          Math.hypot(p[0] - autoCandidate[i][0], p[1] - autoCandidate[i][1]) <
          0.006,
      );
    autoStable = stable ? autoStable + 1 : 1;
    autoCandidate = found;
    if (autoStable >= 3) {
      applyCalibration(result.transform);
      alignmentQuality = {
        method: "auto",
        rms: result.rms,
        checkError: result.checkError,
      };
      autoUntil = 0;
      $("alignmentStatus").textContent =
        `Automatically aligned: 5/5 codes; fit ${result.rms.toFixed(1)} px, independent center check ${result.checkError.toFixed(1)} px (camera pixels). Verify numbered overlay circles match the crosshairs, then capture baseline.`;
    }
  } catch (error) {
    autoFailure = error.message;
    $("alignmentStatus").textContent =
      `Finding calibration codes: ${autoFailure}`;
    autoStable = 0;
    autoCandidate = null;
  }
}
for (const action of ["start", "apply", "cancel", "clear"])
  $(action + "Zero").onclick = () => {
    if (!connected) return notify("Connect to the host first.");
    if (action === "start" && !armed)
      return notify("Arm detection before starting a screen zero.");
    channel.send({ type: "zero-request", action });
  };
$("laserColor").onchange = () => {
  channel?.send({ type: "alignment-changed" });
  detector.color = $("laserColor").value;
  invalidate("Laser color changed. Capture a new baseline and test pulses.", {
    keepCorners: true,
  });
};
$("threshold").oninput = () => {
  manualThreshold = Number($("threshold").value);
  validatedThreshold = manualThreshold;
  detector.threshold = manualThreshold;
  resumeDetection = false;
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
  validatedThreshold = detector.threshold;
  ready(true);
  notify(
    "Detection armed. Return the host to its range, then start a live session.",
  );
};
$("disarm").onclick = () => {
  resumeDetection = false;
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
  lastCameraFrame = performance.now();
  if (cameraStalled && !stream?.getVideoTracks()[0]?.muted) {
    cameraStalled = false;
    if (resumeDetection) restoreConnection();
  }
  if (
    capture.width !== video.videoWidth ||
    capture.height !== video.videoHeight
  ) {
    invalidate(
      "Camera resolution changed. Enable camera again and recalibrate.",
    );
    return;
  }
  tryAuto(performance.now());
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
          detector.threshold = manualThreshold ?? threshold;
          validatedThreshold = detector.threshold;
          $("threshold").value = detector.threshold;
          $("thresholdValue").textContent = detector.threshold;
          const ref = chooseReference(out.data, referenceHistory, clock);
          if (ref) detector.photometric(out.data, ref.data);
          notify("Baseline captured. Run the three-pulse laser check.");
        } catch (e) {
          notify(e.message);
        }
        baselineFrames = [];
      }
    } else if (adaptingUntil) {
      adaptationFrames.push(new Uint8ClampedArray(out.data));
      if (adaptationFrames.length > 30) adaptationFrames.shift();
      if (performance.now() >= adaptingUntil && adaptationFrames.length >= 10) {
        detector.adapt(adaptationFrames, validatedThreshold);
        const ref = chooseReference(out.data, referenceHistory, clock);
        if (ref) detector.photometric(out.data, ref.data);
        $("threshold").value = detector.threshold;
        $("thresholdValue").textContent = detector.threshold;
        adaptingUntil = 0;
        if (resumeDetection && connected && !document.hidden) {
          resumeDetection = false;
          ready(true);
        }
        channel?.send({ type: "sensitivity", active: false });
        adaptationFrames = [];
        notify(
          armed
            ? "Detection armed. Screen alignment retained; sensitivity updated."
            : "Sensitivity updated. Screen alignment retained.",
        );
      }
    } else if (testing || armed) {
      const ref =
        mode === "youtube" && !patternActive
          ? null
          : chooseReference(out.data, referenceHistory, clock);
      lastReferenceAge = ref ? clock - ref.time : 9999;
      const videoMode = mode !== "3d" && !patternActive && !testing;
      if (ref) detector.photometric(out.data, ref.data);
      let hits = detector.detect(out.data, ref?.data, clock, {
        temporalOnly: !ref,
      });
      if (videoMode) {
        // Uploaded media has a readable source: do not turn missing frames into shots.
        if (mode === "upload" && !ref) {
          videoFilter.reset();
          hits = [];
        } else {
          hits = videoFilter.process(out.data, hits, clock, {
            color: detector.color,
            threshold: detector.threshold,
            maxDuration: Number($("videoPulseDuration").value),
            profile: $("videoFilterProfile").value,
            image: () => $("rectified").toDataURL("image/jpeg", 0.75),
          });
        }
        $("videoFilterStatus").textContent =
          mode === "upload" && !ref
            ? "Video detection waiting for fresh source frames."
            : `${ref ? "Source subtraction +" : "YouTube: camera-only"} pulse filter · ${videoFilter.candidates} candidates · ${videoFilter.confirmed} accepted · ${
                Object.entries(videoFilter.reasons)
                  .map(([reason, count]) => `${count} ${reason}`)
                  .join(", ") || "no rejections"
              }`;
      } else videoFilter.reset();
      for (const hit of hits) {
        const image = hit.image || $("rectified").toDataURL("image/jpeg", 0.75);
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
        } else if (armed) {
          detectedShots++;
          channel?.send({
            type: "shot",
            ...hit,
            time: hit.time ?? clock,
            image,
          });
        }
      }
    }
  }
  if (performance.now() - lastTelemetry > 1000) {
    const fps = (frameCount * 1000) / (performance.now() - lastTelemetry);
    lastTelemetry = performance.now();
    frameCount = 0;
    $("cameraTelemetry").textContent =
      `${Math.round(fps)} fps · ${detector.color} · ${adaptingUntil ? "ADJUSTING" : armed ? "ARMED" : "disarmed"} · ${detectedShots} live detections · source reference ${lastReferenceAge >= 9999 ? "unavailable" : Math.round(lastReferenceAge) + " ms"}`;
    let bright = 0,
      dark = 0,
      n = 0;
    if (mapping)
      for (let i = 0; i < out.data.length; i += 64) {
        n++;
        const r = out.data[i],
          g = out.data[i + 1],
          b = out.data[i + 2];
        if (Math.min(r, g, b) >= 250) bright++;
        if (Math.max(r, g, b) <= 10) dark++;
      }
    channel?.send({
      type: "telemetry",
      width: capture.width,
      height: capture.height,
      color: detector.color,
      threshold: detector.threshold,
      brightPercent: n ? (bright * 100) / n : null,
      darkPercent: n ? (dark * 100) / n : null,
      alignment: alignmentQuality,
      suppressed: detector.suppressed,
      candidates: videoFilter.candidates,
      confirmed: videoFilter.confirmed,
      reasons: videoFilter.reasons,
      fps,
      referenceAge: lastReferenceAge,
      tests: testCount,
      detections: detectedShots,
      adapting: !!adaptingUntil,
    });
  }
}
// Geometry and pulse qualification survive a transport or browser visibility pause.
let resumeDetection = false;
function pauseDetection(message) {
  videoFilter.reset();
  resumeDetection = resumeDetection || armed;
  ready(false);
  referenceHistory = [];
  notify(message);
}
function restoreConnection() {
  if (document.hidden || !mapping || !baselineDone) return;
  if (!stream?.getVideoTracks().some((track) => track.readyState === "live"))
    return notify("Camera stopped. Enable it again before resuming.");
  refreshSensitivity();
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseDetection(
      "Camera page paused. Return here to resume with the same alignment.",
    );
    wakeLock?.release();
  } else {
    restoreConnection();
    navigator.wakeLock
      ?.request("screen")
      .then((lock) => {
        wakeLock = lock;
      })
      .catch(() => {});
  }
});
window.addEventListener("orientationchange", () =>
  invalidate("Orientation changed. Recheck the screen corners."),
);

// A separate heartbeat reports a frozen capture loop instead of silently losing telemetry.
function publishCameraHealth() {
  const track = stream?.getVideoTracks()[0];
  let settings = {};
  try {
    settings = track?.getSettings?.() || {};
  } catch {}
  const report = sanitizeCameraHealth({
    trackState: track?.readyState || "none",
    muted: track?.muted,
    visible: !document.hidden,
    awake: !!wakeLock && !wakeLock.released,
    frameAgeMs: lastCameraFrame
      ? Math.min(60000, performance.now() - lastCameraFrame)
      : null,
    sourceFPS: settings.frameRate,
    settings,
  });
  if (
    track?.readyState === "live" &&
    !document.hidden &&
    (track.muted || report.frameAgeMs === null || report.frameAgeMs > 2500) &&
    !cameraStalled
  ) {
    cameraStalled = true;
    pauseDetection(
      "Camera frames stalled. Alignment retained; resume the preview.",
    );
  }
  $("phoneHealthStatus").textContent =
    cameraAdvisory(report) ||
    (adaptingUntil
      ? "Sensitivity settling — hold fire."
      : armed
        ? "Fresh camera frames · detection armed."
        : "Fresh camera frames · detection paused.");
  $("phoneHealthMetrics").textContent =
    `Last frame ${report.frameAgeMs === null ? "—" : Math.round(report.frameAgeMs) + " ms"} · camera ${report.sourceFPS ?? "—"} fps · screen wake lock ${report.awake ? "held" : "not held"}`;
  cameraControls.tick();
  const busy =
    voiceRunId !== null ||
    !!(
      patternActive ||
      testing ||
      baselineUntil ||
      autoUntil ||
      adaptingUntil
    ) ||
    cameraControls.busy;
  for (const id of [
    "refreshCameraSensitivity",
    "pauseCameraDetection",
    "resumeCameraDetection",
  ])
    $(id).disabled = busy;
  $("resumeCameraPreview").disabled =
    voiceRunId !== null || cameraControls.busy;
  channel?.send({ type: "camera-health", ...report });
}
let cameraHealthTimer = setInterval(publishCameraHealth, 1000);
window.addEventListener("pagehide", () => {
  clearInterval(cameraHealthTimer);
  cameraHealthTimer = null;
});
window.addEventListener("pageshow", () => {
  if (!cameraHealthTimer)
    cameraHealthTimer = setInterval(publishCameraHealth, 1000);
});
