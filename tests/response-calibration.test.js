import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lowerExposure,
  measureResponse,
  responseThreshold,
} from "../public/core/response-calibration.js";
const frames = (noise = 0) =>
  Array.from({ length: 20 }, (_, f) =>
    Uint8ClampedArray.from({ length: 4096 }, (_, i) =>
      i % 4 === 3 ? 255 : 80 + (i % 4 === 0 && f % 2 ? noise : 0),
    ),
  );
test("response measures settled noise and accounts for the detector temporal gate", () => {
  const clean = measureResponse(frames(), "red");
  assert.equal(clean.noise, 0);
  assert.equal(responseThreshold([clean]), 5);
  const noisy = measureResponse(frames(6), "red");
  assert.equal(noisy.noise, 6);
  assert.equal(responseThreshold([noisy]), 15);
  assert.equal(measureResponse(frames(6), "green").noise, 6);
});
test("exposure drift and insufficient frames cannot qualify", () => {
  assert.throws(() => measureResponse(frames().slice(0, 3), "red"), /Too few/);
  const changing = frames().map((a, f) =>
    a.map((v, i) => (i % 4 === 3 ? v : v + f * 2)),
  );
  assert.throws(() => measureResponse(changing, "red"), /brightness/);
});
test("clipped images are measured and thresholds remain bounded", () => {
  const clipped = frames().map((a) => a.fill(255));
  assert.equal(measureResponse(clipped, "red").clipped, 1);
  assert.equal(responseThreshold([{ noise: 200 }]), 180);
});

test("automatic exposure reduction respects camera capability bounds and step size", () => {
  assert.equal(lowerExposure(null, 0), null);
  assert.equal(lowerExposure({ min: -2, max: 2, step: "any" }, 0), -0.5);
  assert.equal(lowerExposure({ min: -2, max: 2, step: 0.3 }, 0), -0.6);
  assert.equal(lowerExposure({ min: -2, max: 2, step: 0.5 }, -2), null);
  assert.equal(lowerExposure({ min: -2, max: 2, step: 0.5 }, -1.8), -2);
});
