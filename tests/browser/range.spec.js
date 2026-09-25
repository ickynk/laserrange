import { test, expect } from "@playwright/test";
test("Editor, persistence, timed demo session, scoring and screenshot review work", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator("#sceneTitle")).toHaveText("First light");
  await page.locator("#scenarioName").fill("Qualification draft");
  await page.locator("#scenarioName").blur();
  await expect(page.locator("#sceneTitle")).toHaveText("Qualification draft");
  await page.locator("#addTarget").click();
  await expect(page.locator("#objects option")).toHaveCount(5);
  await page.locator("#viewToggle").click();
  await page.locator("#targetPath").click();
  await page.locator("#range").click({ position: { x: 300, y: 200 } });
  await page.keyboard.press("Escape");
  await page.locator("#save").click();
  const scenario = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
  );
  expect(scenario.targets.at(-1).path).toHaveLength(1);
  await page.locator("#startRun").click();
  await expect(page.locator("#stopRun")).toBeEnabled();
  await page.waitForTimeout(250);
  await page.locator("#range").click({ position: { x: 30, y: 30 } });
  await expect(page.locator("#statShots")).toHaveText("1");
  await expect(page.locator("#statMisses")).toHaveText("1");
  await page.locator("#stopRun").click();
  await page.getByRole("button", { name: "View frame" }).click();
  await expect(page.locator("#snapshotDialog")).toBeVisible();
  await page.locator("#closeSnapshot").click();
  await page.screenshot({
    path: "test-results/range-studio.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("Live mode is gated by calibration and invalid scenario imports are rejected", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#demo").uncheck();
  await page.locator("#startRun").click();
  await expect(page.locator("#notice")).toContainText("calibrate");
  await expect(page.locator("#stopRun")).toBeDisabled();
  await page.locator("#importScenario").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"version":999}'),
  });
  await expect(page.locator("#notice")).toContainText("Invalid");
});
test("Phone UI loads and rejects baseline before alignment", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/phone");
  await page.locator("#baseline").click();
  await expect(page.locator("#phoneNotice")).toContainText("Align");
  await expect(page.locator("#arm")).toBeDisabled();
  expect(errors).toEqual([]);
});
test("3D scoring respects target visibility, barriers and no-shoot roles", async ({
  page,
}) => {
  await page.goto("/");
  const results = await page.evaluate(async () => {
    const { RangeScene } = await import("/range.js");
    const THREE = await import("/vendor/three/build/three.module.js");
    const { defaultScenario } = await import("/core/scenario.js");
    const canvas = document.createElement("canvas"),
      range = new RangeScene(canvas),
      s = defaultScenario();
    s.targets = [{ ...s.targets[0], x: 0, z: -7 }];
    s.barriers = [];
    range.resize(960, 540);
    range.setScenario(s);
    range.render(1);
    const targetPoint = new THREE.Vector3(0, 1, -7).project(range.camera),
      x = (targetPoint.x + 1) / 2,
      y = (1 - targetPoint.y) / 2;
    const hit = range.score(x, y, 1).result;
    s.barriers = [{ id: "block", x: 0, z: 0, width: 5, height: 5, depth: 1 }];
    range.setScenario(s);
    const blocked = range.score(x, y, 1).result;
    s.barriers = [];
    s.targets[0].kind = "no-shoot";
    range.setScenario(s);
    const noShoot = range.score(x, y, 1).result;
    const expired = range.score(x, y, 31).result;
    range.renderer.dispose();
    return { hit, blocked, noShoot, expired };
  });
  expect(results).toEqual({
    hit: "hit",
    blocked: "miss",
    noShoot: "no-shoot",
    expired: "miss",
  });
});

test("Impact marks follow moving target surfaces, do not intercept shots, and clear for a new session", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { RangeScene } = await import("/range.js");
    const THREE = await import("/vendor/three/build/three.module.js");
    const { defaultScenario } = await import("/core/scenario.js");
    const range = new RangeScene(document.createElement("canvas"));
    const s = defaultScenario();
    s.targets = [
      {
        ...s.targets[0],
        x: 0,
        z: -7,
        path: [
          { x: 0, z: -7 },
          { x: 4, z: -7 },
        ],
      },
    ];
    s.barriers = [];
    range.resize(960, 540);
    range.setScenario(s);
    range.render(0);
    const p = new THREE.Vector3(0, 1, -7).project(range.camera),
      x = (p.x + 1) / 2,
      y = (1 - p.y) / 2;
    const hit = range.score(x, y, 0);
    range.addImpact(hit.impact);
    const mark = range.impacts[0];
    const before = mark.getWorldPosition(new THREE.Vector3());
    const repeat = range.score(x, y, 0).result;
    range.setTime(2);
    const after = mark.getWorldPosition(new THREE.Vector3());
    const count = range.impacts.length;
    const attached = range.meshes[0].getObjectById(mark.id) === mark;
    range.setScenario(s);
    const cleared = range.impacts.length;
    range.renderer.dispose();
    return { repeat, attached, count, dx: after.x - before.x, cleared };
  });
  expect(result).toEqual({
    repeat: "hit",
    attached: true,
    count: 1,
    dx: 2,
    cleared: 0,
  });
  await page.locator("#startRun").click();
  await page.waitForTimeout(250);
  await page.locator("#range").click({ position: { x: 20, y: 20 } });
  await page.waitForTimeout(1000);
  await expect(page.locator(".shotMarker")).toHaveCount(1);
  await page.locator("#stopRun").click();
  await expect(page.locator(".shotMarker")).toHaveCount(1);
  await page.locator("#startRun").click();
  await expect(page.locator(".shotMarker")).toHaveCount(0);
});

test("Barricade length edits survive save/import and set rendered front-back geometry", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#viewToggle").click();
  await page.locator("#addBarrier").click();
  await expect(page.locator("#objLength")).toHaveValue("0.6");
  await page.locator("#objLength").fill("6.5");
  await page.locator("#objLength").blur();
  await page.locator("#save").click();
  const scenario = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
  );
  expect(scenario.barriers.at(-1).depth).toBe(6.5);
  await page.locator("#importScenario").setInputFiles({
    name: "length.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(scenario)),
  });
  await page.locator("#objects").selectOption(scenario.barriers.at(-1).id);
  await expect(page.locator("#objLength")).toHaveValue("6.5");
  const depth = await page.evaluate(async (s) => {
    const { RangeScene } = await import("/range.js");
    const range = new RangeScene(document.createElement("canvas"));
    range.setScenario(s);
    const THREE = await import("/vendor/three/build/three.module.js");
    const bounds = new THREE.Box3().setFromObject(
      range.meshes.find((m) => m.userData.id === s.barriers.at(-1).id),
    );
    return bounds.max.z - bounds.min.z;
  }, scenario);
  expect(depth).toBe(6.5);
  await page.locator("#objLength").fill("11");
  await page.locator("#objLength").dispatchEvent("change");
  await expect(page.locator("#objLength")).toHaveValue("6.5");
  await page.locator("#objects").selectOption(scenario.targets[0].id);
  await expect(page.locator("#barrierProperties")).toBeHidden();
});
