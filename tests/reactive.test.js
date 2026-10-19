import test from "node:test";
import assert from "node:assert/strict";
import { ReactiveWorld } from "../public/core/reactive-world.js";
import { defaultScenario, validateScenario } from "../public/core/scenario.js";
import { reactiveDefaults } from "../public/core/reactive-types.js";
function scenario(asset, extra = {}) {
  const s = defaultScenario();
  s.barriers = [];
  s.duration = 60;
  s.targets = [
    {
      ...s.targets[0],
      id: "toy",
      asset,
      x: 0,
      z: 0,
      width: reactiveDefaults[asset][0],
      height: reactiveDefaults[asset][1],
      path: [],
      ...extra,
    },
  ];
  return validateScenario(s);
}
function hit(w, p, time = 0.5) {
  w.impact({
    key: p.key,
    time,
    point: p.body.position.toArray(),
    direction: [0, 0, -1],
  });
}
test("Tree paddles switch independently and can return; knockdowns stay down until restart", () => {
  const tree = new ReactiveWorld(scenario("dueling-tree"));
  tree.seek(0.5);
  hit(tree, tree.joints[0].parts[0]);
  tree.seek(2);
  assert.ok(tree.joints[0].angle > 2.5);
  assert.equal(tree.joints[2].angle, 0);
  hit(tree, tree.joints[0].parts[0], 2);
  tree.seek(4);
  assert.ok(tree.joints[0].angle < 0.6);
  const s = scenario("drop-plate"),
    w = new ReactiveWorld(s);
  w.seek(0.5);
  const p = w.joints[0].parts[0];
  hit(w, p);
  w.seek(2);
  assert.ok(w.joints[0].angle > 1.4);
  assert.equal(w.canScore(p), false);
  assert.equal(new ReactiveWorld(s).joints[0].angle, 0);
});
test("Star imbalance changes rotation, plates detach independently and fall", () => {
  const w = new ReactiveWorld(scenario("texas-star"));
  w.seek(0.5);
  const j = w.joints[0],
    a = j.angle,
    p = j.parts[1],
    y = p.body.position.y;
  hit(w, p);
  w.seek(2);
  assert.equal(j.attached.filter(Boolean).length, 4);
  assert.ok(Math.abs(j.angle - a) > 0.2);
  assert.ok(p.body.position.y < y);
  assert.equal(w.canScore(p), false);
});
test("Rubber moves, bottle fractures once, and stacked cans have coupled contacts", () => {
  const rubber = new ReactiveWorld(scenario("rubber-hex"));
  rubber.seek(0.5);
  hit(rubber, rubber.parts[0]);
  rubber.seek(1.5);
  assert.ok(rubber.parts[0].body.position.z < -0.1);
  const glass = new ReactiveWorld(scenario("glass-bottle"));
  glass.seek(0.5);
  hit(glass, glass.parts[0]);
  glass.seek(0.6);
  assert.equal(glass.parts[0].active, false);
  assert.equal(glass.parts.filter((p) => p.active).length, 8);
  assert.equal(glass.canScore(glass.parts[0]), false);
  const cans = new ReactiveWorld(scenario("can-stack"));
  cans.seek(1);
  const positions = cans.parts.map((p) => p.body.position.toArray());
  assert.ok(cans.parts.every((p) => p.body.position.y > 0));
  hit(cans, cans.parts[0], 1);
  cans.seek(3);
  assert.ok(
    cans.parts
      .slice(1)
      .some(
        (p, i) =>
          p.body.position.distanceTo({
            x: positions[i + 1][0],
            y: positions[i + 1][1],
            z: positions[i + 1][2],
          }) > 0.01,
      ),
  );
});
test("Historical pose queries preserve impacts and replay the same current state", () => {
  const w = new ReactiveWorld(scenario("texas-star"));
  w.seek(1);
  hit(w, w.joints[0].parts[1], 0.8);
  w.seek(3);
  const state = w.parts.map((p) => p.body.position.toArray());
  w.seek(0.5);
  assert.ok(w.joints[0].attached.every(Boolean));
  w.seek(3);
  w.parts.forEach((p, i) =>
    p.body.position
      .toArray()
      .forEach((x, j) => assert.ok(Math.abs(x - state[i][j]) < 1e-6)),
  );
});
test("Reactive settings round-trip and reject malformed or excessive simulations", () => {
  const s = scenario("can-stack", {
    elevation: 0.3,
    impactStrength: 1.5,
    stackRows: 4,
  });
  assert.equal(
    validateScenario(JSON.parse(JSON.stringify(s))).targets[0].stackRows,
    4,
  );
  for (const change of [
    { elevation: -1 },
    { impactStrength: NaN },
    { stackRows: 2.5 },
    { path: [{ x: 0, z: 0 }] },
  ])
    assert.throws(() => scenario("tin-can", change));
  s.targets = Array.from({ length: 20 }, (_, i) => ({
    ...s.targets[0],
    id: String(i),
    stackRows: 5,
  }));
  assert.throws(() => validateScenario(s), /160/);
});

test("Elevated cans rest on barricades and fall to the floor after an impact", () => {
  const s = scenario("tin-can", { elevation: 1 });
  s.barriers = [{
    id: "support", asset: "block", x: 0, z: 0,
    width: 0.4, height: 1, depth: 0.4,
  }];
  const w = new ReactiveWorld(s);
  w.seek(1);
  const can = w.parts[0];
  assert.ok(Math.abs(can.body.position.y - 1.11) < 0.005);
  hit(w, can, 1);
  w.seek(3);
  assert.ok(can.body.position.z < -0.3);
  assert.ok(can.body.position.y > 0 && can.body.position.y < 0.2);
});
