import test from "node:test";
import assert from "node:assert/strict";
import {
  detectCalibration,
  manualCalibration,
  fitBoard,
} from "../public/core/corners.js";
import {
  boardMarkers,
  markerSize,
  boardWidth,
  boardHeight,
  markerQuad,
  manualAnchors,
} from "../public/core/calibration-board.js";
import { homography, unitCorners, project } from "../public/core/geometry.js";
const w = 960,
  h = 640;
function image(
  quad,
  { blur = 0, washed = false, hide = [], shiftCenter = 0 } = {},
) {
  const inverse = homography(quad, unitCorners),
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [u, v] = project(inverse, x / (w - 1), y / (h - 1));
      let value = u >= 0 && u <= 1 && v >= 0 && v <= 1 ? 176 : 40;
      for (const m of boardMarkers) {
        if (hide.includes(m.id)) continue;
        const px =
            u * boardWidth -
            m.x -
            (m.id === 199 ? shiftCenter : 0) +
            markerSize / 2,
          py = v * boardHeight - m.y + markerSize / 2,
          cell = markerSize / 8;
        if (
          px >= -cell &&
          px < markerSize + cell &&
          py >= -cell &&
          py < markerSize + cell
        ) {
          value = 255;
          if (px >= 0 && py >= 0 && px < markerSize && py < markerSize) {
            const cx = Math.floor(px / cell) - 1,
              cy = Math.floor(py / cell) - 1;
            value =
              cx >= 0 &&
              cy >= 0 &&
              cx < 6 &&
              cy < 6 &&
              m.bits[cy * 6 + cx] === "1"
                ? 255
                : 0;
          }
        }
      }
      // Projector black levels, warm white balance, uneven ambient light and deterministic sensor noise.
      if (washed)
        value =
          55 +
          value * (0.38 + (0.25 * x) / w) +
          (16 * y) / h +
          (((x * 31 + y * 17) % 7) - 3);
      const i = (y * w + x) * 4;
      data[i] = value;
      data[i + 1] = value * (washed ? 0.86 : 1);
      data[i + 2] = value * (washed ? 0.74 : 1);
      data[i + 3] = 255;
    }
  if (blur) {
    const source = data.slice();
    for (let y = blur; y < h - blur; y++)
      for (let x = blur; x < w - blur; x++)
        for (let c = 0; c < 3; c++) {
          let sum = 0;
          for (let dy = -blur; dy <= blur; dy++)
            for (let dx = -blur; dx <= blur; dx++)
              sum += source[((y + dy) * w + x + dx) * 4 + c];
          data[(y * w + x) * 4 + c] = sum / (2 * blur + 1) ** 2;
        }
  }
  return data;
}
const quad = [
  [0.11, 0.13],
  [0.88, 0.06],
  [0.92, 0.9],
  [0.06, 0.82],
];
function checkPlacement(result, truth, tolerance = 0.006) {
  const inverse = homography(result.corners, unitCorners);
  for (const x of [0.08, 0.25, 0.5, 0.75, 0.92])
    for (const y of [0.08, 0.25, 0.5, 0.75, 0.92]) {
      const camera = project(truth, x, y),
        shot = project(inverse, ...camera);
      assert.ok(
        Math.hypot(shot[0] - x, shot[1] - y) < tolerance,
        `${x},${y} became ${shot}`,
      );
    }
}
test("Coded board fits perspective and preserves shot placement across the whole screen", () => {
  const result = detectCalibration(image(quad), w, h);
  assert.equal(result.markers, 5);
  checkPlacement(result, homography(unitCorners, quad));
});
test("Monochrome codes tolerate soft focus, warm color cast, raised black levels and uneven brightness", () => {
  const result = detectCalibration(
    image(quad, { blur: 1, washed: true }),
    w,
    h,
  );
  checkPlacement(result, homography(unitCorners, quad), 0.008);
});
test("Marker IDs resolve a rotated view without sorting corners by screen position", () => {
  const rotated = [quad[1], quad[2], quad[3], quad[0]];
  const result = detectCalibration(image(rotated), w, h);
  checkPlacement(result, homography(unitCorners, rotated), 0.008);
});
test("Missing codes, inconsistent center check, duplicates and clipped projection are rejected", () => {
  assert.throws(
    () => detectCalibration(image(quad, { hide: [42] }), w, h),
    /codes visible/,
  );
  assert.throws(
    () => detectCalibration(image(quad, { shiftCenter: 35 }), w, h),
    /inconsistent/,
  );
  const clipped = [
    [-0.12, 0],
    [1, 0],
    [1, 1],
    [-0.12, 1],
  ];
  assert.throws(() => detectCalibration(image(clipped), w, h));
  const markers = boardMarkers.map((m) => ({
    id: m.id,
    corners: markerQuad(m).map(([x, y]) => ({
      x: x * (w - 1),
      y: y * (h - 1),
    })),
  }));
  assert.throws(() => fitBoard([...markers, markers[0]], w, h), /Duplicate/);
});
test("Manual crosshair centers use their real insets, preventing outward shot expansion", () => {
  const truth = homography(unitCorners, quad),
    points = manualAnchors.map((p) => project(truth, ...p));
  const fixed = manualCalibration(points);
  checkPlacement(fixed, truth, 1e-8);
  const wrong = homography(points, unitCorners),
    left = project(wrong, ...project(truth, 0.1, 0.5));
  assert.ok(
    left[0] < 0.1 - 0.025,
    "Old edge assumption must reproduce the outward error",
  );
});

test("Rectified laser detections stay at physical impact positions near all four edges", async () => {
  const { warp, warpMap } = await import("../public/core/geometry.js");
  const { LaserDetector } = await import("../public/core/detector.js");
  const background = image(quad, { washed: true, blur: 1 });
  const result = detectCalibration(background, w, h),
    truth = homography(unitCorners, quad);
  const map = warpMap(result.transform, 480, 270, w, h);
  const blank = warp(background, map, new Uint8ClampedArray(480 * 270 * 4));
  for (const [u, v] of [
    [0.08, 0.5],
    [0.92, 0.5],
    [0.5, 0.08],
    [0.5, 0.92],
    [0.5, 0.5],
  ]) {
    const camera = background.slice(),
      [cx, cy] = project(truth, u, v);
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const i =
          ((Math.round(cy * (h - 1)) + dy) * w +
            Math.round(cx * (w - 1)) +
            dx) *
          4;
        camera.set([255, 12, 12, 255], i);
      }
    const pulse = warp(camera, map, new Uint8ClampedArray(blank.length));
    const detector = new LaserDetector(480, 270);
    detector.detect(blank, null, 0);
    const shots = detector.detect(pulse, null, 200);
    assert.equal(shots.length, 1);
    assert.ok(
      Math.hypot(shots[0].x - u, shots[0].y - v) < 0.008,
      JSON.stringify({ u, v, shot: shots[0] }),
    );
  }
});
