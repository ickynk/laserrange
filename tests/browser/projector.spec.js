import { test, expect } from "@playwright/test";

async function openProjector(page) {
  const popupPromise = page.waitForEvent("popup");
  await page.locator("#openProjector").click();
  const popup = await popupPromise;
  await popup.waitForLoadState();
  await expect(page.locator("#notice")).toContainText("Projector ready");
  return popup;
}
test("Projector owns scoring and frames; operator layout changes do not alter its geometry; closing stops the run", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  // One stationary target directly ahead makes the expected hit unambiguous.
  const scenario = await page.evaluate(async () => {
    const { defaultScenario } = await import("/core/scenario.js");
    const s = defaultScenario();
    s.targets = [{ ...s.targets[0], id: "center", x: 0, z: -7, path: [] }];
    s.barriers = [];
    return s;
  });
  await page
    .locator("#importScenario")
    .setInputFiles({
      name: "center.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scenario)),
    });
  const popup = await openProjector(page);
  popup.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator("#remotePreview")).toBeVisible();
  await expect(popup.locator("#projectorStage")).toBeVisible();
  const initialSize = await popup.locator("#projectorStage").boundingBox();
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.locator("[data-tab=camera]").click();
  expect(await popup.locator("#projectorStage").boundingBox()).toEqual(
    initialSize,
  );
  await page.locator("#calibrate").click();
  await expect(popup.locator("#pattern")).toBeVisible();
  await page.locator("#stopCalibration").click();
  await expect(popup.locator("#pattern")).toBeHidden();
  await page.locator("#startRun").click();
  await expect(popup.locator("#projectorInput")).toBeVisible();
  await popup.waitForTimeout(300);
  const point = await popup.evaluate(async () => {
    const THREE = await import("/vendor/three/build/three.module.js");
    const rect = document
      .getElementById("projectorStage")
      .getBoundingClientRect();
    const camera = new THREE.PerspectiveCamera(
      55,
      rect.width / rect.height,
      0.1,
      150,
    );
    camera.position.set(0, 1.65, 8);
    camera.lookAt(0, 1.4, -12);
    camera.updateMatrixWorld();
    const p = new THREE.Vector3(0, 1, -7).project(camera);
    return {
      x: ((p.x + 1) / 2) * rect.width,
      y: ((1 - p.y) / 2) * rect.height,
    };
  });
  await popup.locator("#projectorInput").click({ position: point });
  await expect(page.locator("#statHits")).toHaveText("1");
  await expect(page.locator("#statShots")).toHaveText("1");
  // The operator preview is an exact normalized image from the projector.
  await page.locator("#remotePreview").click({ position: { x: 15, y: 15 } });
  await expect(page.locator("#statMisses")).toHaveText("1");
  await popup.close();
  await expect(page.locator("#stopRun")).toBeDisabled();
  await expect(page.locator("#remotePreview")).toBeHidden();
  await expect(page.locator("#notice")).toContainText("Projector closed");
  expect(errors).toEqual([]);
});

test("Projector YouTube controls and demo shots are operated from the separate controller", async ({
  page,
  context,
}) => {
  await context.route("https://www.youtube.com/embed/**", (r) =>
    r.fulfill({
      contentType: "text/html",
      body: "<html><body>Video fixture</body></html>",
    }),
  );
  await context.addInitScript(() => {
    window.fixture = { state: 2, time: 0 };
    window.YT = {
      Player: class {
        constructor(id, options) {
          this.el = document.createElement("iframe");
          this.el.src = "https://www.youtube.com/embed/abcdefghijk";
          document.getElementById(id).replaceWith(this.el);
          setTimeout(() => options.events?.onReady?.(), 0);
        }
        playVideo() {
          window.fixture.state = 1;
        }
        pauseVideo() {
          window.fixture.state = 2;
        }
        getPlayerState() {
          return window.fixture.state;
        }
        getCurrentTime() {
          return window.fixture.time;
        }
        seekTo(t) {
          window.fixture.time = t;
        }
        destroy() {
          this.el.remove();
        }
      },
    };
  });
  await page.goto("/");
  await page.locator("[data-tab=video]").click();
  await page.locator("#youtubeUrl").fill("https://youtu.be/abcdefghijk");
  await page.locator("#loadYoutube").click();
  const popup = await openProjector(page);
  await page.locator("#startRun").click();
  await expect.poll(() => popup.evaluate(() => window.fixture.state)).toBe(1);
  expect(await page.evaluate(() => window.fixture.state)).toBe(2);
  await popup
    .locator("#projectorInput")
    .click({ position: { x: 200, y: 200 } });
  await expect(page.locator("#statShots")).toHaveText("1");
  await page.locator("#playVideo").click();
  await expect.poll(() => popup.evaluate(() => window.fixture.state)).toBe(2);
  await page.locator("#seekTime").fill("12");
  await page.locator("#seekVideo").click();
  await expect.poll(() => popup.evaluate(() => window.fixture.time)).toBe(12);
  await page.locator("#stopRun").click();
  await expect(popup.locator("#projectorInput")).toBeHidden();
  await page.locator("#closeProjector").click();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("Uploaded video is transferred to the projector, controlled from the operator, and supplies review frames", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("[data-tab=video]").click();
  await page
    .locator("#videoFile")
    .setInputFiles("tests/fixtures/projector.webm");
  const popup = await openProjector(page);
  await expect
    .poll(() => popup.locator("#media").evaluate((v) => v.readyState))
    .toBeGreaterThanOrEqual(2);
  await page.locator("#startRun").click();
  await expect
    .poll(() => popup.locator("#media").evaluate((v) => !v.paused))
    .toBe(true);
  expect(await page.locator("#movie").evaluate((v) => v.paused)).toBe(true);
  await popup.waitForTimeout(250);
  await popup.locator("#projectorInput").click({ position: { x: 80, y: 80 } });
  await expect(page.locator("#statShots")).toHaveText("1");
  await expect(page.getByRole("button", { name: "View frame" })).toBeEnabled();
  await page.locator("#playVideo").click();
  await expect
    .poll(() => popup.locator("#media").evaluate((v) => v.paused))
    .toBe(true);
  await page.locator("#seekTime").fill("2");
  await page.locator("#seekVideo").click();
  await expect
    .poll(() => popup.locator("#media").evaluate((v) => v.currentTime))
    .toBeCloseTo(2, 1);
  await page.locator("#stopRun").click();
  await page.getByRole("button", { name: "View frame" }).click();
  await expect(page.locator("#snapshotDialog")).toBeVisible();
  await page.locator("#closeSnapshot").click();
  await page.locator("#closeProjector").click();
  await expect.poll(() => popup.isClosed()).toBe(true);
});

test("Operator can edit a moving scenario while the projector stays in perspective", async ({
  page,
}) => {
  await page.goto("/");
  const popup = await openProjector(page);
  await page.locator("#viewToggle").click();
  await expect(page.locator("#remotePreview")).toBeHidden();
  await page.locator("#addTarget").click();
  await page.locator("#targetPath").click();
  await page.locator("#range").click({ position: { x: 250, y: 150 } });
  await page.locator("#range").click({ position: { x: 400, y: 180 } });
  await page.keyboard.press("Escape");
  await expect(popup.locator("#display")).toBeVisible();
  await page.locator("#startRun").click();
  await expect(page.locator("#remotePreview")).toBeVisible();
  await expect(popup.locator("#projectorInput")).toBeVisible();
  await popup.locator("#projectorInput").click({ position: { x: 10, y: 10 } });
  await expect(page.locator("#statShots")).toHaveText("1");
  await page.locator("#stopRun").click();
  await page.locator("#startRun").click();
  await expect(popup.locator("#impacts .shotMarker")).toHaveCount(0);
  await page.locator("#closeProjector").click();
});
