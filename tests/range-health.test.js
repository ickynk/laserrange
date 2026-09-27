import test from "node:test";
import assert from "node:assert/strict";
import {
  HardwareTest,
  healthStatus,
  testPoints,
} from "../public/core/range-health.js";
import { sanitizeHealth } from "../public/core/health-telemetry.js";
test("Health flags stale/disconnected/settling data; YouTube does not require source frames", () => {
  const s = { connected: true, ready: true, adjusting: false, mode: "3d" },
    m = { fps: 30, referenceAge: 9999 };
  assert.match(healthStatus(m, 1000, 6000, s), /stale/);
  assert.match(healthStatus(m, 1000, 1001, s), /delayed/);
  assert.match(
    healthStatus(m, 1000, 1001, { ...s, mode: "youtube" }),
    /camera-only/,
  );
  assert.match(
    healthStatus(m, 1000, 1001, { ...s, adjusting: true }),
    /settling/,
  );
  assert.match(
    healthStatus(m, 1000, 1001, { ...s, connected: false }),
    /disconnected/,
  );
});
test("Telemetry sanitizes diagnostic metrics and only forwards known reason counts", () => {
  const m = sanitizeHealth({
    width: 1920,
    height: Infinity,
    threshold: -1,
    color: "blue",
    alignment: { method: "auto", rms: 2, checkError: 3, secret: "no" },
    reasons: { movement: 3, arbitrary: "payload" },
  });
  assert.equal(m.width, 1920);
  assert.equal(m.height, null);
  assert.equal(m.threshold, null);
  assert.equal(m.color, null);
  assert.deepEqual(m.reasons, { movement: 3 });
  assert.deepEqual(m.alignment, { method: "auto", rms: 2, checkError: 3 });
});
test("Placement separates raw and corrected errors, excludes settling, and labels partial grids incomplete", () => {
  const t = new HardwareTest("placement", { time: 0 });
  assert.equal(
    t.shot({ time: 100, x: 0.16, y: 0.15 }, { x: 0.15, y: 0.15 }, 100),
    false,
  );
  for (let i = 0; i < 9; i++) {
    const p = testPoints[i];
    for (let n = 0; n < 5; n++)
      t.shot(
        { time: i * 2000 + 1600, x: p.x + 0.01, y: p.y },
        { ...p },
        i * 2000 + 1600,
      );
    if (i < 8) t.next((i + 1) * 2000);
  }
  const r = t.finish(20000);
  assert.equal(r.status, "Completed");
  assert.equal(r.events, 45);
  assert.ok(Math.abs(r.grid[0].rawErrorWidth - 1) < 1e-8);
  assert.equal(r.grid[0].correctedErrorWidth, 0);
  assert.equal(
    new HardwareTest("placement", { time: 0 }).finish(2000).status,
    "Incomplete",
  );
});
test("Pulse and idle observations report counts honestly, interrupted duration and explicit voice acknowledgements", () => {
  const t = new HardwareTest("pulses", { time: 0, expected: 3 });
  for (let i = 0; i < 2; i++)
    t.shot({ time: 2000, confidence: i ? "review" : "high" }, {}, 2000);
  const r = t.finish(3000);
  assert.equal(r.events, 2);
  assert.equal(r.deficit, 1);
  assert.equal(r.review, 1);
  const idle = new HardwareTest("idle", { time: 0, seconds: 10 });
  idle.shot({ time: 2000, confidence: "review" }, {}, 2000);
  assert.equal(idle.finish(11500).eventsPerMinute, 6);
  assert.equal(
    new HardwareTest("idle", { time: 0 }).finish(2000, "Disconnected").status,
    "Interrupted",
  );
  const v = new HardwareTest("voice", { time: 0 });
  ["moving", "cover", "retrograde"].forEach((command, i) => {
    v.voice({ id: String(i), command, time: 2000 });
    v.voiceResult(String(i), { accepted: true, message: "OK" }, 2100);
  });
  assert.equal(v.finish(3000).voiceSteps, 3);
  assert.equal(v.voices[0].deliveryMs, 100);
});
