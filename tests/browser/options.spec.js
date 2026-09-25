import { test, expect } from "@playwright/test";
for (const separate of [false, true])
  test(`Countdown, zone scoring and comparison (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    const scenario = await page.evaluate(async () => {
      const { defaultScenario } = await import("/core/scenario.js");
      const s = defaultScenario();
      s.session = { countdown: 2, beep: false };
      s.targets = [
        {
          ...s.targets[0],
          x: 0,
          z: -7,
          zones: [
            {
              name: "Center",
              shape: "rectangle",
              x: 0.5,
              y: 0.5,
              width: 1,
              height: 1,
              points: 5,
            },
          ],
        },
      ];
      s.barriers = [];
      return s;
    });
    await page.locator("#importScenario").setInputFiles({
      name: "options.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scenario)),
    });
    let display = page;
    if (separate) {
      const popup = page.waitForEvent("popup");
      await page.locator("#openProjector").click();
      display = await popup;
      await expect(page.locator("#notice")).toContainText("Projector ready");
      display.on("pageerror", (e) => errors.push(e.message));
    }
    await page.locator("#shooter").fill("Alice");
    await page.locator("#startRun").click();
    await expect(display.locator("#countdownDisplay")).toBeVisible();
    await display
      .locator(separate ? "#projectorInput" : "#range")
      .dispatchEvent("click", { clientX: 30, clientY: 30 });
    await expect(page.locator("#statShots")).toHaveText("0");
    await page.locator("#stopRun").click();
    await expect(display.locator("#countdownDisplay")).toBeHidden();
    await expect(page.locator("#pastSessions option")).toHaveCount(1);
    for (const name of ["Alice", "Bob"]) {
      await page.locator("#shooter").fill(name);
      await page.locator("#startRun").click();
      await expect(display.locator("#countdownDisplay")).toBeVisible();
      await expect(display.locator("#countdownDisplay")).toBeHidden({
        timeout: 5000,
      });
      const point = await display.evaluate(async (separate) => {
        const THREE = await import("/vendor/three/build/three.module.js");
        const el = document.querySelector(
            separate ? "#projectorStage" : "#range",
          ),
          r = el.getBoundingClientRect();
        const camera = new THREE.PerspectiveCamera(
          55,
          r.width / r.height,
          0.1,
          150,
        );
        camera.position.set(0, 1.65, 8);
        camera.lookAt(0, 1.4, -12);
        camera.updateMatrixWorld();
        const p = new THREE.Vector3(0, 1, -7).project(camera);
        return { x: ((p.x + 1) / 2) * r.width, y: ((1 - p.y) / 2) * r.height };
      }, separate);
      await display
        .locator(separate ? "#projectorInput" : "#range")
        .click({ position: point });
      await expect(page.locator("#statHits")).toHaveText("1");
      await expect(page.locator("#statPoints")).toHaveText("5");
      await page.locator("#stopRun").click();
    }
    await expect(page.locator("#comparisonBody tr")).toHaveCount(2);
    await expect(page.locator("#comparisonBody")).toContainText("Alice");
    await expect(page.locator("#comparisonBody")).toContainText("Bob");
    expect(errors).toEqual([]);
  });
test("Asset and scheduling controls persist with scenario export state", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#addBarrier").click();
  await page.locator("#barrierAsset").selectOption("car");
  await page.locator("#barrierRotation").fill("45");
  await page.locator("#barrierRotation").blur();
  await page.locator("#objects").selectOption("alpha");
  await page.locator("#targetAsset").selectOption("cardboard");
  await page.locator("#targetEasing").selectOption("smooth");
  await page.locator("#repeatEvery").fill("4");
  await page.locator("#repeatEvery").blur();
  await page.locator("#save").click();
  const s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
  );
  expect(s.barriers.at(-1)).toMatchObject({
    asset: "car",
    rotation: 45,
    depth: 4.4,
  });
  expect(s.targets[0]).toMatchObject({
    asset: "cardboard",
    easing: "smooth",
    repeatEvery: 4,
    visibleFor: 1,
  });
});
test("Window aperture permits hits while frame blocks; camera holds final heading", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { RangeScene } = await import("/range.js"),
      { defaultScenario } = await import("/core/scenario.js"),
      THREE = await import("/vendor/three/build/three.module.js");
    const r = new RangeScene(document.createElement("canvas")),
      s = defaultScenario();
    s.targets = [{ ...s.targets[0], x: 0, z: -7, width: 8, height: 5 }];
    s.barriers = [
      {
        id: "window",
        asset: "window",
        x: 0,
        z: 0,
        width: 3,
        height: 2.6,
        depth: 0.3,
      },
    ];
    r.resize(960, 540);
    r.setScenario(s);
    r.render(1);
    const score = (x, y) => {
      const p = new THREE.Vector3(x, y, 0).project(r.camera);
      return r.score((p.x + 1) / 2, (1 - p.y) / 2, 1).result;
    };
    const aperture = score(0, 1.3),
      frame = score(1.3, 1.3);
    s.cameraMotion = true;
    s.cameraHeadingMode = "path";
    s.cameraSpeed = 2;
    s.cameraPath = [
      { x: 0, z: 8 },
      { x: 4, z: 8 },
    ];
    r.setScenario(s);
    r.setTime(20);
    const d = r.camera.getWorldDirection(new THREE.Vector3());
    r.renderer.dispose();
    return { aperture, frame, dx: d.x };
  });
  expect(result.aperture).toBe("hit");
  expect(result.frame).toBe("miss");
  expect(result.dx).toBeGreaterThan(0.99);
});
for (const separate of [false, true])
  test(`Video pauses for countdown (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByText("Session start", { exact: true }).click();
    await page.locator("#countdownSeconds").fill("2");
    await page.locator("#countdownSeconds").blur();
    await page.locator("[data-tab=video]").click();
    await page
      .locator("#videoFile")
      .setInputFiles("tests/fixtures/projector.webm");
    let display = page;
    if (separate) {
      const p = page.waitForEvent("popup");
      await page.locator("#openProjector").click();
      display = await p;
      await expect(page.locator("#notice")).toContainText("Projector ready");
    }
    const video = display.locator(separate ? "#media" : "#movie");
    await expect
      .poll(() => video.evaluate((v) => v.readyState))
      .toBeGreaterThanOrEqual(2);
    await video.evaluate((v) => v.play());
    await page.locator("#startRun").click();
    await expect(display.locator("#countdownDisplay")).toBeVisible();
    expect(await video.evaluate((v) => v.paused)).toBe(true);
    await expect(display.locator("#countdownDisplay")).toBeHidden({
      timeout: 5000,
    });
    await expect.poll(() => video.evaluate((v) => v.paused)).toBe(false);
    await page.locator("#stopRun").click();
  });
