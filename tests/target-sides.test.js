import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultScenario,
  validateScenario,
  targetRotation,
} from "../public/core/scenario.js";
test("Cardboard turns hold each side, ease continuously, return, and preserve initial yaw", () => {
  const t = {
    asset: "cardboard",
    start: 2,
    rotation: -90,
    turn: { enabled: true, angle: 180, hold: 1, duration: 0.5 },
  };
  const deg = (time) => (targetRotation(t, time) * 180) / Math.PI;
  assert.equal(deg(2), -90);
  assert.equal(deg(3), -90);
  assert.ok(Math.abs(deg(3.25)) < 1e-8);
  assert.equal(deg(3.5), 90);
  assert.equal(deg(4.5), 90);
  assert.equal(deg(5), -90);
  assert.ok(Math.abs(deg(3.5 - 1e-5) - deg(3.5 + 1e-5)) < 1e-5);
  t.turn.angle = 90;
  assert.equal(deg(3.5), 0);
  t.turn.enabled = false;
  assert.equal(deg(3.5), -90);
});
test("Both target images and turn/steel settings round-trip with bounded validation", () => {
  const s = defaultScenario(),
    t = s.targets[0];
  Object.assign(t, {
    asset: "cardboard",
    image: "data:image/png;base64,AAAA",
    backImage: "data:image/png;base64,BBBB",
    backImageMode: "separate",
    backRole: "no-shoot",
    turn: { enabled: true, angle: 180, hold: 2, duration: 0.5 },
  });
  assert.deepEqual(validateScenario(s).targets[0], t);
  for (const patch of [
    { backImage: "https://external.test/image.png" },
    { backImageMode: "invalid" },
    { backRole: "unknown" },
    { turn: { enabled: true, angle: 45 } },
    { turn: { hold: 0 } },
    { turn: { duration: NaN } },
  ]) {
    const c = structuredClone(s);
    Object.assign(c.targets[0], patch);
    assert.throws(() => validateScenario(c));
  }
  for (const n of [0, 21, 1.5, NaN]) {
    const c = structuredClone(s);
    Object.assign(c.targets[0], {
      asset: "drop-plate",
      path: [],
      hitsToFall: n,
    });
    assert.throws(() => validateScenario(c));
  }
  const c = structuredClone(s);
  c.targets[0].backImage = "data:image/png;base64," + "A".repeat(400000);
  assert.throws(() => validateScenario(c));
});
