import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateZero,
  applyZero,
  outsideScreen,
} from "../public/core/zero.js";
test("Five-shot mean corrects a constant vertical offset without changing horizontal position", () => {
  const points = [-0.001, 0, 0.001, -0.0005, 0.0005].map((d) => ({
    x: 0.5,
    y: 0.48 + d,
  }));
  const zero = calculateZero(points);
  assert.ok(Math.abs(zero.x) < 1e-12);
  assert.ok(Math.abs(zero.y - 0.02) < 1e-12);
  const corrected = applyZero({ x: 0.2, y: 0.3, time: 123 }, zero);
  assert.equal(corrected.x, 0.2);
  assert.ok(Math.abs(corrected.y - 0.32) < 1e-12);
  assert.equal(corrected.rawY, 0.3);
  assert.equal(corrected.time, 123);
});
test("Incomplete groups, outliers and excessive offsets cannot silently set a zero", () => {
  const points = Array.from({ length: 5 }, () => ({ x: 0.5, y: 0.48 }));
  assert.throws(() => calculateZero(points.slice(0, 4)));
  assert.throws(
    () => calculateZero([...points.slice(0, 4), { x: 0.6, y: 0.48 }]),
    /spread/,
  );
  assert.throws(
    () => calculateZero(points.map(() => ({ x: 0.5, y: 0.4 }))),
    /5%/,
  );
});
test("Correction preserves off-screen coordinates rather than clamping shots to the edge", () => {
  const shot = applyZero({ x: 0.99, y: 0.5 }, { x: 0.02, y: 0 });
  assert.equal(shot.x, 1.01);
  assert.equal(outsideScreen(shot), true);
  const unchanged = { x: 0.2, y: 0.3 };
  assert.equal(applyZero(unchanged, null), unchanged);
});
