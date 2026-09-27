import test from "node:test";
import assert from "node:assert/strict";
import { Magazine } from "../public/core/magazine.js";
import { defaultScenario, validateScenario } from "../public/core/scenario.js";
test("Magazine counts fired rounds, emits one unscored dry trigger, then reloads; disabled is unlimited", () => {
  const m = new Magazine({ ammoEnabled: true, magazineSize: 2 });
  assert.deepEqual([m.trigger().fired, m.remaining], [true, 1]);
  assert.deepEqual([m.trigger().fired, m.remaining], [true, 0]);
  assert.deepEqual([m.trigger().fired, m.remaining], [false, 2]);
  assert.deepEqual([m.trigger().fired, m.remaining], [true, 1]);
  const unlimited = new Magazine();
  for (let i = 0; i < 300; i++) assert.equal(unlimited.trigger().fired, true);
  for (const session of [
    { magazineSize: 0 },
    { magazineSize: 1.5 },
    { magazineSize: 201 },
    { ammoEnabled: "yes" },
    { shotAudio: 1 },
    { shotVolume: 2 },
  ])
    assert.throws(() => validateScenario({ ...defaultScenario(), session }));
  assert.doesNotThrow(() =>
    validateScenario({
      ...defaultScenario(),
      session: { ammoEnabled: true, magazineSize: 1, shotVolume: 0 },
    }),
  );
});
