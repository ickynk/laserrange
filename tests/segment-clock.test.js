import test from "node:test";
import assert from "node:assert/strict";
import { SegmentClock } from "../public/core/segment-clock.js";
import { defaultScenario, validateScenario } from "../public/core/scenario.js";
import { ProjectorControls } from "../public/core/projector-controls.js";
const scenario = () => ({
  ...defaultScenario(),
  pauseAtSegments: true,
  cameraMotion: true,
  cameraSpeed: 1,
  cameraPath: [
    { x: 0, z: 8 },
    { x: 0, z: 7 },
    { x: 0, z: 6 },
  ],
});
test("Segment holds preserve scene time, reverse smoothly and keep historical timestamps stable", () => {
  const c = new SegmentClock(scenario(), 1000);
  assert.equal(c.time(0), 0);
  assert.equal(c.time(1500), 0.5);
  assert.equal(c.time(99999), 1);
  assert.equal(c.state(99999).held, true);
  assert.equal(c.step(1, 1500), false);
  assert.equal(c.step(1, 4000), true);
  assert.equal(c.time(4500), 1.5);
  assert.equal(c.time(6000), 2);
  assert.equal(c.step(1, 6000), false);
  assert.equal(c.step(-1, 6000), true);
  assert.equal(c.time(6500), 1.5);
  assert.equal(c.time(100000), 1);
  assert.equal(c.time(4500), 1.5);
  assert.equal(c.step(-1, 100000), true);
  assert.equal(c.time(101000), 0);
  assert.equal(c.state(101000).previous, false);
});
test("Legacy and video modes continue normally; segment option rejects too-short scenarios", () => {
  const s = scenario();
  assert.equal(
    new SegmentClock({ ...s, pauseAtSegments: false }, 0).time(10000),
    10,
  );
  assert.equal(new SegmentClock(s, 0, "youtube").enabled, false);
  assert.throws(() => validateScenario({ ...s, duration: 2 }));
  assert.throws(() => validateScenario({ ...s, pauseAtSegments: "yes" }));
  assert.doesNotThrow(() => validateScenario(s));
});
test("Projector strip consumes disabled/stale hits and debounces actions", () => {
  let clock = 1000,
    events = [];
  const ctx = {
    clearRect() {},
    fillRect() {},
    strokeRect() {},
    fillText() {},
    measureText(t) {
      return { width: t.length * 10 };
    },
  };
  const c = new ProjectorControls(
    { getContext: () => ctx },
    () => clock,
    (action) => events.push(action),
  );
  const s = { visible: true, ready: true, running: false };
  c.draw(s);
  assert.equal(c.hit(0.1, 0.5), false);
  assert.equal(c.hit(0.6, 0.95), true);
  assert.deepEqual(events, []);
  c.hit(0.08, 0.95);
  c.hit(0.08, 0.95);
  assert.deepEqual(events, ["start"]);
  clock += 1000;
  c.draw({ ...s, running: true });
  c.hit(0.25, 0.95, 1000);
  assert.deepEqual(events, ["start"]);
  c.hit(0.25, 0.95);
  assert.deepEqual(events, ["start", "restart"]);
});
