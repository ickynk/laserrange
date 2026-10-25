import test from "node:test";
import assert from "node:assert/strict";
import {
  cameraCapabilities,
  applyCameraSettings,
  sanitizeCameraHealth,
  cameraAdvisory,
} from "../public/core/camera-health.js";
test("Camera controls reject unsupported/out-of-range values and verify actual settings", async () => {
  const settings = {
    focusMode: "continuous",
    focusDistance: 2,
    exposureCompensation: 0,
  };
  let calls = 0;
  const track = {
    readyState: "live",
    getCapabilities: () => ({
      focusMode: ["continuous", "manual", "invented"],
      focusDistance: { min: 0.1, max: 10, step: 0.1 },
      exposureCompensation: { min: -2, max: 2, step: 0.5 },
      deviceId: "private",
    }),
    getSettings: () => ({ ...settings }),
    applyConstraints: async (c) => {
      calls++;
      Object.assign(settings, c.advanced[0]);
    },
  };
  assert.deepEqual(cameraCapabilities(track).supported.focusMode, [
    "continuous",
    "manual",
  ]);
  await applyCameraSettings(track, {
    focusMode: "manual",
    focusDistance: 3,
    exposureCompensation: -1,
  });
  assert.equal(settings.focusDistance, 3);
  assert.equal(calls, 1);
  for (const patch of [
    { zoom: 3 },
    { focusDistance: 20 },
    { focusMode: "invented" },
    { exposureCompensation: NaN },
    {},
  ])
    await assert.rejects(applyCameraSettings(track, patch));
  assert.equal(calls, 1);
  track.applyConstraints = async () => {};
  await assert.rejects(
    applyCameraSettings(track, { focusDistance: 4 }),
    /did not confirm/,
  );
  track.applyConstraints = async () => {
    throw Error("Device rejected");
  };
  await assert.rejects(
    applyCameraSettings(track, { focusDistance: 4 }),
    /Device rejected/,
  );
  track.readyState = "ended";
  await assert.rejects(
    applyCameraSettings(track, { focusMode: "continuous" }),
    /Enable/,
  );
});
test("Health heartbeat is bounded, omits device identifiers, and distinguishes stalled/stopped/background feeds", () => {
  const m = sanitizeCameraHealth({
    trackState: "live",
    visible: true,
    frameAgeMs: 20,
    sourceFPS: 60,
    settings: {
      deviceId: "private",
      focusMode: "continuous",
      exposureCompensation: Infinity,
    },
  });
  assert.equal(m.settings.deviceId, undefined);
  assert.equal(m.settings.exposureCompensation, null);
  assert.equal(cameraAdvisory(m), null);
  assert.match(cameraAdvisory({ ...m, frameAgeMs: 3000 }), /stalled/);
  assert.match(cameraAdvisory({ ...m, muted: true }), /interrupted/);
  assert.match(cameraAdvisory({ ...m, trackState: "ended" }), /stopped/);
  assert.match(cameraAdvisory({ ...m, visible: false }), /background/);
  assert.equal(sanitizeCameraHealth({ frameAgeMs: -1 }).frameAgeMs, null);
  assert.deepEqual(
    cameraCapabilities({
      getCapabilities() {
        throw Error();
      },
    }).supported,
    {},
  );
});
