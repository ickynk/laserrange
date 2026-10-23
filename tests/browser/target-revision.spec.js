import { test, expect } from "@playwright/test";

test("Cardboard front/back crops, roles and turning controls persist alongside steel settings", async ({
  page,
}) => {
  await page.goto("/");
  const images = await page.evaluate(() =>
    ["#405bcc", "#d8d8d8"].map((color) => {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 96;
      const x = c.getContext("2d");
      x.fillStyle = color;
      x.fillRect(0, 0, 64, 96);
      return c.toDataURL("image/png").split(",")[1];
    }),
  );
  await page.locator("#targetImage").setInputFiles({
    name: "front.png",
    mimeType: "image/png",
    buffer: Buffer.from(images[0], "base64"),
  });
  await page.locator("#applyCrop").click();
  await page.locator("#cardboardOptions > summary").click();
  await page.locator("#backImageMode").selectOption("separate");
  await page.locator("#backTargetImage").setInputFiles({
    name: "back.png",
    mimeType: "image/png",
    buffer: Buffer.from(images[1], "base64"),
  });
  await page.locator("#applyCrop").click();
  await page.locator("#backRole").selectOption("no-shoot");
  await page.locator("#turnEnabled").check();
  await page.locator("#turnAngle").fill("135");
  await page.locator("#turnAngle").blur();
  await page.locator("#turnHold").fill("3");
  await page.locator("#turnHold").blur();
  await page.locator("#turnDuration").fill(".6");
  await page.locator("#turnDuration").blur();
  await page.locator("#addTarget").click();
  await page.locator("#targetAsset").selectOption("slide-plate");
  await page.locator("#hitsToFall").fill("3");
  await page.locator("#hitsToFall").blur();
  await page.locator("#save").click();
  const s = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
  );
  expect(s.targets[0].image).not.toBe(s.targets[0].backImage);
  expect(s.targets[0]).toMatchObject({
    backImageMode: "separate",
    backRole: "no-shoot",
    turn: { enabled: true, angle: 135, hold: 3, duration: 0.6 },
  });
  expect(s.targets.at(-1)).toMatchObject({
    asset: "slide-plate",
    hitsToFall: 3,
  });
  await page.reload();
  await page.locator("#load").click();
  await page.locator("#objects").selectOption(s.targets[0].id);
  await page.locator("#cardboardOptions > summary").click();
  await expect(page.locator("#backRole")).toHaveValue("no-shoot");
  await expect(page.locator("#turnAngle")).toHaveValue("135");
  await page.locator("#backImageMode").selectOption("repeat");
  await expect(page.locator("#backImageUpload")).toBeHidden();
  await page.locator("#backImageMode").selectOption("separate");
  await expect(page.locator("#removeBackTargetImage")).toBeEnabled();
});

test("Front/back images are upright, use face-local zones, preserve marks and score historical turns", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { RangeScene } = await import("/range.js"),
      { defaultScenario } = await import("/core/scenario.js"),
      THREE = await import("/vendor/three/build/three.module.js");
    function img(left, right) {
      const c = document.createElement("canvas");
      c.width = 64;
      c.height = 96;
      const x = c.getContext("2d");
      x.fillStyle = left;
      x.fillRect(0, 0, 32, 96);
      x.fillStyle = right;
      x.fillRect(32, 0, 32, 96);
      return c.toDataURL("image/png");
    }
    const s = defaultScenario();
    s.barriers = [];
    s.targets = [
      {
        ...s.targets[0],
        x: 0,
        z: -4,
        start: 0,
        asset: "cardboard",
        kind: "shoot",
        image: img("#ffffff", "#222222"),
        backImage: img("#3344cc", "#aabbcc"),
        backImageMode: "separate",
        backRole: "no-shoot",
        turn: { enabled: true, angle: 180, hold: 1, duration: 0.5 },
        zones: [
          {
            name: "Left",
            shape: "rectangle",
            x: 0.25,
            y: 0.5,
            width: 0.4,
            height: 0.6,
            points: 5,
          },
        ],
      },
    ];
    const r = new RangeScene(document.createElement("canvas"));
    r.resize(960, 540);
    r.setScenario(s);
    await new Promise((resolve) => setTimeout(resolve, 100));
    function shoot(time) {
      r.render(0, time);
      const root = r.meshes[0],
        back = time === 2;
      const mesh = root.getObjectByName(back ? "back-image" : "image");
      const p = mesh
        .localToWorld(new THREE.Vector3(-s.targets[0].width * 0.25, 0, 0))
        .project(r.camera);
      return r.score((p.x + 1) / 2, (1 - p.y) / 2, 0, time);
    }
    const front = shoot(0);
    r.addImpact(front.impact);
    const back = shoot(2);
    r.addImpact(back.impact);
    const maps = r.meshes[0].children
      .filter((m) => m.material?.map)
      .map((m) => ({
        name: m.name,
        rotation: m.rotation.y,
        pixel: Array.from(
          m.material.map.image.getContext("2d").getImageData(50, 384, 1, 1)
            .data,
        ),
      }));
    // Historical front query while currently showing the back must restore the back pose.
    const p = r.meshes[0].position.clone().project(r.camera);
    const old = r.score((p.x + 1) / 2, (1 - p.y) / 2, 0, 0);
    const restored = r.meshes[0].rotation.y;
    const parents = r.impacts.map((m) => m.parent.name);
    s.targets[0].backRole = "shoot";
    s.targets[0].backImageMode = "repeat";
    r.setScenario(s);
    r.render(0, 2);
    const repeated =
      r.meshes[0].getObjectByName("image").material.map ===
      r.meshes[0].getObjectByName("back-image").material.map;
    const repeatedShot = shoot(2);
    r.renderer.dispose();
    return {
      front,
      back,
      old,
      restored,
      parents,
      maps,
      repeated,
      repeatedShot,
    };
  });
  expect(result.front).toMatchObject({
    result: "hit",
    side: "front",
    zone: "Left",
    points: 5,
  });
  expect(result.back).toMatchObject({
    result: "no-shoot",
    side: "back",
    zone: "Left",
    points: 0,
  });
  expect(result.front.local.x).toBeCloseTo(0.25);
  expect(result.back.local.x).toBeCloseTo(0.25);
  expect(result.old.side).toBe("front");
  expect(result.restored).toBeCloseTo(Math.PI);
  expect(result.parents).toEqual(["image", "back-image"]);
  expect(result.repeated).toBe(true);
  expect(result.repeatedShot).toMatchObject({
    result: "hit",
    side: "back",
    zone: "Left",
    points: 5,
  });
  expect(result.maps.find((m) => m.name === "back-image").rotation).toBeCloseTo(
    Math.PI,
  );
  const backPixel = result.maps.find((m) => m.name === "back-image").pixel;
  expect(backPixel[2]).toBeGreaterThan(backPixel[0] * 2);
});

for (const separate of [false, true])
  test(`Turning cardboard changes scoring during a camera hold (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    await page.goto("/");
    const s = await page.evaluate(async () => {
      const { defaultScenario } = await import("/core/scenario.js");
      const s = defaultScenario();
      s.barriers = [];
      s.cameraMotion = true;
      s.pauseAtSegments = true;
      s.cameraPath = [
        { x: 0, z: 9 },
        { x: 0, z: 8.9 },
      ];
      s.targets = [
        {
          ...s.targets[0],
          id: "turner",
          kind: "shoot",
          asset: "cardboard",
          width: 1.5,
          height: 2.6,
          x: 0,
          z: -4,
          path: [],
          backRole: "no-shoot",
          turn: { enabled: true, angle: 180, hold: 2, duration: 0.3 },
        },
      ];
      return s;
    });
    await page.locator("#importScenario").setInputFiles({
      name: "turner.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
    let display = page;
    if (separate) {
      const pop = page.waitForEvent("popup");
      await page.locator("#openProjector").click();
      display = await pop;
      await expect(page.locator("#notice")).toContainText("Projector ready");
    }
    const surface = display.locator(separate ? "#projectorStage" : "#range");
    const fire = async () => {
      const b = await surface.boundingBox();
      await surface.click({ position: { x: b.width / 2, y: b.height / 2 } });
    };
    await page.locator("#startRun").click();
    await expect(page.locator("#segmentStatus")).toContainText("Holding");
    await page.waitForTimeout(250);
    await fire();
    await expect(page.locator("#statHits")).toHaveText("1");
    await page.waitForTimeout(2300);
    await fire();
    await expect(page.locator("#statNoShoots")).toHaveText("1");
    await page.locator("#stopRun").click();
    await page.locator("#startRun").click();
    await page.waitForTimeout(350);
    await fire();
    await expect(page.locator("#statHits")).toHaveText("1");
    await expect(page.locator("#statNoShoots")).toHaveText("0");
    if (separate) await display.close();
  });

for (const separate of [false, true])
  test(`Sliding steel needs two hits and restores its count on restart (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    await page.goto("/");
    const s = await page.evaluate(async () => {
      const { defaultScenario } = await import("/core/scenario.js");
      const s = defaultScenario();
      s.barriers = [];
      s.targets = [
        {
          ...s.targets[0],
          id: "slider",
          asset: "slide-plate",
          kind: "shoot",
          width: 1,
          height: 2.1,
          x: 0,
          z: -4,
          path: [],
          hitsToFall: 2,
        },
      ];
      return s;
    });
    await page
      .locator("#importScenario")
      .setInputFiles({
        name: "slider.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(s)),
      });
    let display = page;
    if (separate) {
      const pop = page.waitForEvent("popup");
      await page.locator("#openProjector").click();
      display = await pop;
      await expect(page.locator("#notice")).toContainText("Projector ready");
    }
    const surface = display.locator(separate ? "#projectorStage" : "#range");
    const fire = async () => {
      const b = await surface.boundingBox();
      await surface.click({ position: { x: b.width / 2, y: b.height / 2 } });
    };
    for (let run = 0; run < 2; run++) {
      await page.locator("#startRun").click();
      await page.waitForTimeout(300);
      await fire();
      await expect(page.locator("#statHits")).toHaveText("1");
      await page.waitForTimeout(700);
      await fire();
      await expect(page.locator("#statHits")).toHaveText("2");
      await page.waitForTimeout(900);
      await fire();
      await expect(page.locator("#statShots")).toHaveText("3");
      await expect(page.locator("#statHits")).toHaveText("2");
      await page.locator("#stopRun").click();
    }
    if (separate) await display.close();
  });
