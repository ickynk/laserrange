import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultScenario,
  validateScenario,
  targetActive,
  pathPosition,
  zoneScore,
  compareSessions,
} from "../public/core/scenario.js";
test("Optional scenario settings preserve old files and reject malformed options", () => {
  const s = defaultScenario();
  assert.deepEqual(validateScenario(s), s);
  for (const session of ["bad", [], null, { countdown: 16 }, { volume: 1 }])
    assert.throws(() => validateScenario({ ...s, session }));
  s.targets[0].repeatEvery = 2;
  s.targets[0].visibleFor = 3;
  assert.throws(() => validateScenario(s));
  s.targets[0].visibleFor = 1;
  assert.doesNotThrow(() => validateScenario(s));
  s.targets[0].zones = [
    {
      name: "center",
      shape: "ellipse",
      x: 0,
      y: 0.5,
      width: 0.5,
      height: 0.5,
      points: 5,
    },
  ];
  assert.throws(() => validateScenario(s));
});
test("Repeat boundaries and easing keep schedules deterministic", () => {
  const t = { start: 2, end: 10, repeatEvery: 3, visibleFor: 1 };
  assert.deepEqual(
    [1, 2, 2.9, 3, 5, 6, 8, 10].map((x) => targetActive(t, x)),
    [false, true, true, false, true, false, true, false],
  );
  const p = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
  ];
  assert.equal(pathPosition(p, 1, true, "smooth").x, 0.625);
  assert.equal(pathPosition(p, 4, true, "smooth").x, 4);
  assert.equal(pathPosition(p, 8, true, "smooth").x, 0);
});
test("Zones use first match, ellipse edges, and legacy one-point scoring", () => {
  const zones = [
    {
      name: "inner",
      shape: "ellipse",
      x: 0.5,
      y: 0.5,
      width: 0.4,
      height: 0.4,
      points: 5,
    },
    {
      name: "outer",
      shape: "rectangle",
      x: 0.5,
      y: 0.5,
      width: 1,
      height: 1,
      points: 1,
    },
  ];
  assert.deepEqual(zoneScore({ zones }, { x: 0.5, y: 0.5 }), {
    zone: "inner",
    points: 5,
  });
  assert.equal(zoneScore({ zones }, { x: 0.69, y: 0.69 }).zone, "outer");
  assert.equal(
    zoneScore({ zones: zones.slice(0, 1) }, { x: 0, y: 0 }).points,
    0,
  );
  assert.equal(zoneScore({}, { x: 0, y: 0 }).points, 1);
});
test("Comparison separates settings/input and computes splits within runs", () => {
  const s = {
    scenarioKey: "a",
    scenarioName: "Range",
    mode: "3d",
    demo: true,
    shooter: "A",
    shots: [
      { time: 1, result: "hit", points: 5, zone: "center" },
      { time: 3, result: "miss" },
    ],
  };
  const groups = compareSessions([
    s,
    { ...s, shots: [{ time: 4, result: "hit", points: 2 }] },
    { ...s, demo: false },
    { ...s, scenarioKey: "b" },
    { ...s, shooter: "B" },
  ]);
  assert.equal(groups.length, 4);
  const g = groups[0];
  assert.equal(g.runs, 2);
  assert.equal(g.points, 7);
  assert.equal(g.averageFirst, 2.5);
  assert.equal(g.averageSplit, 2);
  assert.equal(g.bestPoints, 5);
  assert.equal(g.zones.center, 1);
});
