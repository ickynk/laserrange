import test from "node:test";
import assert from "node:assert/strict";
import { cameraPose } from "../public/core/camera-path.js";
import { defaultScenario, validateScenario } from "../public/core/scenario.js";
test("Focus directions transition continuously and scoring is independent of playback order", () => {
  const s = {
    ...defaultScenario(),
    cameraMotion: true,
    cameraSpeed: 1,
    cameraPath: [
      { x: 0, z: 8 },
      { x: 0, z: 4 },
      { x: 4, z: 4 },
    ],
    cameraSegments: [
      { focus: { x: -5, z: -6, y: 2 } },
      { focus: { x: 5, z: -6, y: 1 } },
    ],
    cameraFocusBlend: 2,
  };
  const left = cameraPose(s, 3.999),
    right = cameraPose(s, 4.001);
  assert.ok(Math.abs(right.yaw - left.yaw) < 0.01);
  assert.ok(Math.abs(right.pitch - left.pitch) < 0.01);
  const pose = cameraPose(s, 5);
  cameraPose(s, 1);
  assert.deepEqual(cameraPose(s, 5), pose);
  assert.equal(cameraPose(s, 100).x, 4);
  assert.ok(cameraPose(s, 1).yaw < 0);
  assert.ok(cameraPose(s, 7).yaw > 0);
});
test("POV validates bounds and malformed focus/image/rotation data", () => {
  for (const patch of [
    { cameraHeight: 0 },
    { cameraFov: 150 },
    { cameraFocusBlend: -1 },
    { cameraSegments: [{ focus: { x: 1, z: 1, y: 99 } }] },
  ])
    assert.throws(() => validateScenario({ ...defaultScenario(), ...patch }));
  const s = defaultScenario();
  s.targets[0].rotation = 90;
  s.cameraFov = 75;
  assert.doesNotThrow(() => validateScenario(s));
  s.targets[0].image = "https://external/image.jpg";
  assert.throws(() => validateScenario(s));
  s.targets[0].image = "data:image/svg+xml;base64,AAAA";
  assert.throws(() => validateScenario(s));
});
