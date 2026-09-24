import test from "node:test";
import assert from "node:assert/strict";
import { detectCorners, markerCenters } from "../public/core/corners.js";
import { homography, unitCorners, project } from "../public/core/geometry.js";
const w = 640,
  h = 400;
function pattern(quad = unitCorners, extra = false) {
  const inverse = homography(quad, unitCorners),
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4,
        [u, v] = project(inverse, x / (w - 1), y / (h - 1));
      let ring = markerCenters.some(
        ([a, b]) =>
          Math.abs(u - a) < 12 / 960 &&
          Math.abs(v - b) < 12 / 540 &&
          !(Math.abs(u - a) < 5 / 960 && Math.abs(v - b) < 5 / 540),
      );
      // A solid cyan distractor must not qualify as a ring.
      ring ||= extra && x > 280 && x < 320 && y > 180 && y < 210;
      data[i] = 15;
      data[i + 1] = data[i + 2] = ring ? 160 : 20;
      data[i + 3] = 255;
    }
  return data;
}
test("Ring alignment recovers perspective screen edges and ignores solid cyan distractions", () => {
  const quad = [
    [0.12, 0.12],
    [0.87, 0.08],
    [0.94, 0.9],
    [0.06, 0.85],
  ];
  const found = detectCorners(pattern(quad, true), w, h);
  found.forEach((p, i) =>
    assert.ok(Math.hypot(p[0] - quad[i][0], p[1] - quad[i][1]) < 0.006),
  );
});
test("Blank, incomplete and clipped corner patterns fail rather than inventing alignment", () => {
  assert.throws(() => detectCorners(new Uint8ClampedArray(w * h * 4), w, h));
  const data = pattern();
  for (let y = 0; y < 40; y++)
    for (let x = 0; x < 50; x++)
      data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4);
  assert.throws(() => detectCorners(data, w, h));
  assert.throws(() =>
    detectCorners(
      pattern([
        [-0.1, 0],
        [1, 0],
        [1, 1],
        [-0.1, 1],
      ]),
      w,
      h,
    ),
  );
});
