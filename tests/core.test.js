import test from "node:test";
import assert from "node:assert/strict";
import {
  homography,
  project,
  validQuad,
  unitCorners,
  warpMap,
  warp,
} from "../public/core/geometry.js";
import {
  defaultScenario,
  validateScenario,
  pathPosition,
  summarize,
} from "../public/core/scenario.js";
import { LaserDetector, chooseReference } from "../public/core/detector.js";
test("Perspective calibration maps all four screen corners and rejects collapsed corners", () => {
  const dst = [
      [0.1, 0.2],
      [0.9, 0.1],
      [0.85, 0.95],
      [0.2, 0.8],
    ],
    h = homography(unitCorners, dst);
  unitCorners.forEach(([x, y], i) => {
    const p = project(h, x, y);
    assert.ok(Math.abs(p[0] - dst[i][0]) < 1e-8);
    assert.ok(Math.abs(p[1] - dst[i][1]) < 1e-8);
  });
  assert.equal(validQuad(dst), true);
  assert.equal(
    validQuad([
      [0, 0],
      [1, 1],
      [1, 0],
      [0, 1],
    ]),
    false,
  );
  assert.throws(() =>
    homography(
      [
        [0, 0],
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      unitCorners,
    ),
  );
});
test("Warping preserves identity and fills outside camera black", () => {
  const src = new Uint8ClampedArray([
    255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
  ]);
  const map = warpMap(homography(unitCorners, unitCorners), 2, 2, 2, 2);
  assert.deepEqual(warp(src, map, new Uint8ClampedArray(16)), src);
  assert.deepEqual(
    [...warp(src, new Int32Array([-1]), new Uint8ClampedArray(4))],
    [0, 0, 0, 255],
  );
});
test("Scenario validator rejects malformed, oversized, non-finite, duplicate and invalid timing data", () => {
  assert.equal(validateScenario(defaultScenario()).version, 1);
  for (const mutate of [
    (s) => (s.version = 2),
    (s) => (s.targets[0].x = Infinity),
    (s) => (s.targets[0].end = -1),
    (s) => s.targets.push(s.targets[0]),
    (s) => (s.cameraPath = [{ x: "0", z: 0 }]),
    (s) => (s.targets[0].kind = "other"),
  ]) {
    const s = defaultScenario();
    mutate(s);
    assert.throws(() => validateScenario(s));
  }
});
test("Movement follows path forward and back at distance-based speed", () => {
  const path = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
  ];
  assert.deepEqual(pathPosition(path, 1), { x: 1, z: 0 });
  assert.deepEqual(pathPosition(path, 5), { x: 3, z: 0 });
  assert.deepEqual(pathPosition(path, 12, false), { x: 4, z: 0 });
  assert.deepEqual(
    pathPosition(
      [
        { x: 2, z: 3 },
        { x: 2, z: 3 },
      ],
      5,
    ),
    { x: 2, z: 3 },
  );
});
const w = 100,
  h = 80;
const frame = (spots = [], color = "red") => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 20;
    d[i + 1] = 20;
    d[i + 2] = 20;
    d[i + 3] = 255;
  }
  for (const [x, y, size = 2] of spots)
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) {
        const p = ((y + dy) * w + x + dx) * 4;
        d[p + (color === "red" ? 0 : 1)] = 240;
      }
  return d;
};
test("Red and green pulses detected once; persistent spot does not retrigger", () => {
  for (const color of ["red", "green"]) {
    const d = new LaserDetector(w, h);
    d.color = color;
    const blank = frame(),
      pulse = frame([[40, 30]], color);
    d.detect(blank, blank, 0);
    const shots = d.detect(pulse, blank, 150);
    assert.equal(shots.length, 1);
    assert.equal(shots[0].confidence, "high");
    assert.ok(Math.abs(shots[0].x - 0.409) < 0.01);
    assert.equal(d.detect(pulse, blank, 400).length, 0);
    d.detect(blank, blank, 500);
    assert.equal(d.detect(pulse, blank, 700).length, 1);
  }
});
test("Moving projected laser-colored pixel is explained by source and rejected", () => {
  const d = new LaserDetector(w, h),
    blank = frame(),
    projected = frame([[40, 30]]);
  d.detect(blank, blank, 0);
  assert.equal(d.detect(projected, projected, 200).length, 0);
});
test("Large moving colored regions are rejected; missing source and multiple blobs require review", () => {
  let d = new LaserDetector(w, h),
    blank = frame();
  d.detect(blank, blank, 0);
  assert.equal(d.detect(frame([[20, 20, 15]]), blank, 200).length, 0);
  d = new LaserDetector(w, h);
  d.detect(blank, null, 0);
  assert.equal(
    d.detect(frame([[40, 30]]), null, 200, { temporalOnly: true })[0]
      .confidence,
    "review",
  );
  d = new LaserDetector(w, h);
  d.detect(blank, blank, 0);
  const hits = d.detect(
    frame([
      [40, 30],
      [60, 50],
    ]),
    blank,
    200,
  );
  assert.equal(hits.length, 2);
  assert.ok(hits.every((h) => h.confidence === "review"));
});
test("Stale references are not used and baseline adapts above measured noise", () => {
  const blank = frame();
  assert.equal(chooseReference(blank, [{ time: 0, data: blank }], 1000), null);
  assert.equal(
    chooseReference(blank, [{ time: 900, data: blank }], 1000).time,
    900,
  );
  const d = new LaserDetector(w, h);
  assert.ok(d.calibrate(Array.from({ length: 10 }, () => blank)) >= 35);
  assert.throws(() => d.calibrate([]));
});
test("Pending detections excluded from accuracy; no-shoot hits are penalized; splits ordered", () => {
  const s = summarize([
    { result: "hit", time: 2 },
    { result: "miss", time: 1 },
    { result: "review", time: 0.5 },
    { result: "no-shoot", time: 3 },
  ]);
  assert.equal(s.accuracy, 33);
  assert.equal(s.pending, 1);
  assert.equal(s.first, 1);
  assert.deepEqual(s.splits, [1, 1]);
});

test("Automatic background adaptation preserves tested sensitivity and detects the next pulse", () => {
  for (const color of ["red", "green"]) {
    const d = new LaserDetector(w, h);
    d.color = color;
    const blank = frame();
    const motion = frame([[20, 20, 20]], color);
    assert.ok(
      d.adapt(
        Array.from({ length: 12 }, (_, i) => (i % 2 ? blank : motion)),
        40,
      ) <= 40,
    );
    assert.equal(d.detect(frame([[40, 30]], color), blank, 200).length, 1);
  }
});
