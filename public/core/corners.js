import { AR } from "../vendor/aruco/aruco.js";
import { CV } from "../vendor/aruco/cv.js";
import {
  homography,
  fitHomography,
  project,
  unitCorners,
  validQuad,
} from "./geometry.js";
import {
  boardMarkers,
  markerQuad,
  manualAnchors,
  dictionaryName,
} from "./calibration-board.js";
const detector = new AR.Detector({ dictionaryName, maxHammingDistance: 3 });
export function outerCorners(transform) {
  const corners = unitCorners.map(([x, y]) => project(transform, x, y));
  if (
    !validQuad(corners) ||
    corners.some((p) => p.some((v) => v < -0.005 || v > 1.005))
  )
    throw Error("Keep the entire projected frame inside the camera view.");
  return corners; // Never clamp an extrapolated frame: doing so changes scale.
}
export function manualCalibration(points) {
  if (!validQuad(points))
    throw Error("Tap crosshair centers 1 → 2 → 3 → 4 in order.");
  const transform = homography(manualAnchors, points);
  return { transform, corners: outerCorners(transform) };
}
export function fitBoard(markers, w, h) {
  const detected = new Map();
  for (const marker of markers)
    if (boardMarkers.some((m) => m.id === marker.id)) {
      if (detected.has(marker.id))
        throw Error(
          "Duplicate calibration codes detected. Keep only this projector board in view.",
        );
      detected.set(marker.id, marker);
    }
  const missing = boardMarkers.filter((m) => !detected.has(m.id));
  if (missing.length)
    throw Error(
      `${5 - missing.length}/5 codes visible. Move closer or adjust exposure; keep all five codes in view.`,
    );
  const from = [],
    to = [];
  for (const marker of boardMarkers.slice(0, 4)) {
    const q = detected.get(marker.id).corners;
    const lengths = q.map((p, i) =>
      Math.hypot(p.x - q[(i + 1) % 4].x, p.y - q[(i + 1) % 4].y),
    );
    if (Math.min(...lengths) < 24)
      throw Error("Calibration codes are too small. Move the camera closer.");
    from.push(...markerQuad(marker));
    to.push(...q.map((p) => [p.x / (w - 1), p.y / (h - 1)]));
  }
  const transform = fitHomography(from, to),
    corners = outerCorners(transform);
  function error(src, dst) {
    return src.map(([x, y], i) => {
      const p = project(transform, x, y);
      return Math.hypot((p[0] - dst[i][0]) * w, (p[1] - dst[i][1]) * h);
    });
  }
  const residuals = error(from, to),
    rms = Math.sqrt(
      residuals.reduce((sum, e) => sum + e * e, 0) / residuals.length,
    );
  const check = boardMarkers[4],
    actual = detected
      .get(check.id)
      .corners.map((p) => [p.x / (w - 1), p.y / (h - 1)]);
  const checkError = Math.max(...error(markerQuad(check), actual));
  const tolerance = Math.max(2, Math.min(w, h) * 0.006);
  if (
    rms > tolerance ||
    Math.max(...residuals) > tolerance * 2 ||
    checkError > tolerance * 1.5
  )
    throw Error(
      "Codes found, but alignment is inconsistent. Use the normal 1× lens, flatten the screen and reduce glare.",
    );
  return { transform, corners, rms, checkError, markers: 5 };
}
export function detectCalibration(data, w, h) {
  // Try multiple local threshold windows for uneven illumination and soft focus.
  CV.grayscale({ data, width: w, height: h }, detector.grey);
  let lastError;
  for (const radius of [2, 4, 7]) {
    CV.adaptiveThreshold(detector.grey, detector.thres, radius, 7);
    detector.contours = CV.findContours(detector.thres, detector.binary);
    let candidates = detector.findCandidates(
      detector.contours,
      w * 0.01,
      0.035,
      12,
    );
    candidates = detector.notTooNear(detector.clockwiseCorners(candidates), 6);
    const markers = detector.findMarkers(detector.grey, candidates, 64);
    try {
      return fitBoard(markers, w, h);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
export function detectCorners(data, w, h) {
  return detectCalibration(data, w, h).corners;
}
