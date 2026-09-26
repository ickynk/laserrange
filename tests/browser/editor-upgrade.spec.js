import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
test("Custom crop, target rotation, focus segments and saved host folders round-trip", async ({
  page,
}) => {
  const dir = await mkdtemp(join(tmpdir(), "range-browser-")),
    { server } = createRangeServer({ adminToken: "editor-test", dataDir: dir });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(
      `http://127.0.0.1:${server.address().port}/#host=editor-test`,
    );
    await expect(page.locator("#pairCode")).not.toContainText("—");
    const image = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 500;
      c.height = 500;
      const x = c.getContext("2d");
      x.fillStyle = "white";
      x.fillRect(0, 0, 500, 500);
      x.fillStyle = "black";
      x.fillRect(200, 200, 100, 100);
      return c.toDataURL("image/png").split(",")[1];
    });
    await page.locator("#targetImage").setInputFiles({
      name: "target.png",
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    });
    await expect(page.locator("#cropDialog")).toBeVisible();
    await page.locator("#cropZoom").fill("1.5");
    await page.locator("#cropZoom").dispatchEvent("input");
    await page.locator("#applyCrop").click();
    await expect(page.locator("#targetAsset")).toHaveValue("cardboard");
    await page.locator("#targetRotation").fill("60");
    await page.locator("#targetRotation").blur();
    await page.locator("#pickFocus").click();
    await page.locator("#range").click({ position: { x: 200, y: 150 } });
    await expect(page.locator("#focusSummary")).toContainText("Focus:");
    await page.locator("#focusHeight").fill("2");
    await page.locator("#focusHeight").blur();
    await page.locator("#cameraFov").fill("70");
    await page.locator("#cameraFov").blur();
    await page.getByText("Saved ranges · host folder", { exact: true }).click();
    await page.locator("#rangeLibraryName").fill("Custom gallery");
    await page.locator("#saveRangeLibrary").click();
    await expect(page.locator("#notice")).toContainText("Saved Custom gallery");
    await expect(page.locator("#rangeLibrary option")).toHaveCount(1);
    await page.reload();
    await page.getByText("Saved ranges · host folder", { exact: true }).click();
    await expect(page.locator("#rangeLibrary")).not.toHaveValue("");
    await page.locator("#loadRangeLibrary").click();
    await expect(page.locator("#targetRotation")).toHaveValue("60");
    await expect(page.locator("#cameraFov")).toHaveValue("70");
    await expect(page.locator("#focusHeight")).toHaveValue("2");
    await page.locator("#save").click();
    const s = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
    );
    expect(s.targets[0].image).toMatch(/^data:image\/jpeg;base64,/);
    expect(s.cameraSegments[0].focus.y).toBe(2);
    await page.locator("[data-tab=video]").click();
    await page.getByText("Saved video links", { exact: true }).click();
    await page.locator("#youtubeUrl").fill("https://youtu.be/abcdefghijk");
    await page.locator("#videoLibraryName").fill("Favorite");
    await page.locator("#saveVideoLibrary").click();
    await expect(page.locator("#notice")).toContainText("Saved Favorite");
    await expect(page.locator("#videoLibrary option")).toContainText(
      "Favorite",
    );
    expect(errors).toEqual([]);
  } finally {
    await page.goto("about:blank");
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
test("Review navigates by keys and buttons and respects ends", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#startRun").click();
  await page.waitForTimeout(250);
  for (let i = 0; i < 3; i++) {
    await page.locator("#range").click({ position: { x: 30 + i * 30, y: 30 } });
    await page.waitForTimeout(150);
  }
  await page.locator("#stopRun").click();
  await page.getByRole("button", { name: "View frame" }).last().click();
  await expect(page.locator("#reviewPosition")).toHaveText("1 / 3");
  await expect(page.locator("#previousShot")).toBeDisabled();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#reviewPosition")).toHaveText("2 / 3");
  await page.locator("#nextShot").click();
  await expect(page.locator("#reviewPosition")).toHaveText("3 / 3");
  await expect(page.locator("#nextShot")).toBeDisabled();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator("#reviewPosition")).toHaveText("2 / 3");
});
test("Mannequin has full volume with limb gaps; rotated image faces preserve local hit coordinates", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { RangeScene } = await import("/range.js"),
      { defaultScenario } = await import("/core/scenario.js"),
      THREE = await import("/vendor/three/build/three.module.js");
    const r = new RangeScene(document.createElement("canvas")),
      s = defaultScenario();
    s.targets = [
      { ...s.targets[0], x: 0, z: 0, asset: "mannequin", rotation: 90 },
    ];
    s.barriers = [];
    r.resize(960, 540);
    r.setScenario(s);
    r.render(0);
    const m = r.meshes[0],
      bounds = new THREE.Box3().setFromObject(m);
    const count = m.children.length,
      noBoard = !m.getObjectByName("face");
    const ray = new THREE.Raycaster(
      new THREE.Vector3(0, 0.2, 8),
      new THREE.Vector3(0, 0, -1),
    );
    s.targets[0].rotation = 0;
    r.setScenario(s);
    r.render(0);
    const gap = ray.intersectObjects(r.meshes, true).length;
    s.targets[0].asset = "cardboard";
    s.targets[0].rotation = 45;
    r.setScenario(s);
    r.render(0);
    const center = r.meshes[0]
      .localToWorld(new THREE.Vector3(0, 0, 0.041))
      .project(r.camera);
    const hit = r.score((center.x + 1) / 2, (1 - center.y) / 2, 0);
    r.addImpact(hit.impact);
    const attachment = r.impacts[0].parent.name;
    r.renderer.dispose();
    return {
      count,
      noBoard,
      depth: bounds.max.z - bounds.min.z,
      gap,
      hit: hit.result,
      x: hit.local.x,
      attachment,
    };
  });
  expect(result.count).toBeGreaterThan(20);
  expect(result.noBoard).toBe(true);
  expect(result.depth).toBeGreaterThan(0.8);
  expect(result.gap).toBe(0);
  expect(result.hit).toBe("hit");
  expect(result.x).toBeCloseTo(0.5, 2);
  expect(result.attachment).toBe("face");
});

test("Custom target images render and score through the separate projector", async ({
  page,
}) => {
  await page.goto("/");
  const s = await page.evaluate(async () => {
    const { defaultScenario } = await import("/core/scenario.js");
    const s = defaultScenario(),
      c = document.createElement("canvas");
    c.width = 64;
    c.height = 96;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#2348ee";
    ctx.fillRect(0, 0, 64, 96);
    s.targets = [
      {
        ...s.targets[0],
        x: 0,
        z: -7,
        rotation: 25,
        asset: "cardboard",
        image: c.toDataURL("image/jpeg"),
      },
    ];
    s.barriers = [];
    return s;
  });
  await page
    .locator("#importScenario")
    .setInputFiles({
      name: "custom.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
  const popup = page.waitForEvent("popup");
  await page.locator("#openProjector").click();
  const display = await popup;
  await expect(page.locator("#notice")).toContainText("Projector ready");
  await page.locator("#startRun").click();
  await display.waitForTimeout(400);
  const point = await display.evaluate(async () => {
    const THREE = await import("/vendor/three/build/three.module.js");
    const c = document.querySelector("#display"),
      r = c.getBoundingClientRect(),
      cam = new THREE.PerspectiveCamera(55, r.width / r.height, 0.1, 150);
    cam.position.set(0, 1.65, 8);
    cam.lookAt(0, 1.4, -12);
    cam.updateMatrixWorld();
    const p = new THREE.Vector3(0, 1, -7).project(cam);
    const x = (p.x + 1) / 2,
      y = (1 - p.y) / 2;
    return { x: x * r.width, y: y * r.height, u: x, v: y };
  });
  await expect
    .poll(() =>
      display.evaluate(({ u, v }) => {
        const src = document.querySelector("#display"),
          c = document.createElement("canvas");
        c.width = src.width;
        c.height = src.height;
        const ctx = c.getContext("2d");
        ctx.drawImage(src, 0, 0);
        const p = ctx.getImageData(
          Math.floor(u * c.width),
          Math.floor(v * c.height),
          1,
          1,
        ).data;
        return p[2] > p[0] * 1.5;
      }, point),
    )
    .toBe(true);
  await display
    .locator("#projectorInput")
    .click({ position: { x: point.x, y: point.y } });
  await expect(page.locator("#statHits")).toHaveText("1");
  await page.locator("#stopRun").click();
});
