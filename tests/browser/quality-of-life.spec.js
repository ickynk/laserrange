import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
async function saved(page) {
  await page.locator("#save").click();
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.scenario.v1")),
  );
}
test("Editor fits viewport and alternates destination/focus clicks with saved focus schema", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("/");
  expect(
    await page.locator(".controls").evaluate((e) => e.clientHeight),
  ).toBeLessThanOrEqual(720);
  await expect(page.locator("#cameraPath")).toBeHidden();
  await page.locator("#cameraOptions > summary").click();
  await page.locator("#clearCameraPath").click();
  await page.locator("#cameraPath").click();
  const canvas = page.locator("#range");
  await canvas.click({ position: { x: 220, y: 180 } }); // start
  await expect(page.locator("#editorHint")).toContainText("next movement node");
  await canvas.click({ position: { x: 260, y: 180 } }); // destination
  await expect(page.locator("#editorHint")).toContainText(
    "focal point for the completed",
  );
  await canvas.click({ position: { x: 280, y: 150 } }); // focus
  await expect(page.locator("#editorHint")).toContainText("next movement node");
  await canvas.click({ position: { x: 300, y: 180 } }); // destination
  await canvas.click({ position: { x: 320, y: 150 } }); // focus
  await page.keyboard.press("Escape");
  const s = await saved(page);
  expect(s.cameraPath).toHaveLength(3);
  expect(s.cameraSegments).toHaveLength(2);
  expect(
    s.cameraSegments.every(
      (s) => Number.isFinite(s.focus.x) && s.focus.y === 1.4,
    ),
  ).toBe(true);
  await page.locator("#load").click();
  expect((await saved(page)).cameraSegments).toEqual(s.cameraSegments);
});
for (const separate of [false, true])
  test(`Magazine and shot audio (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    await page.addInitScript(() => {
      window.played = [];
      const native = AudioContext.prototype.createBufferSource;
      AudioContext.prototype.createBufferSource = function (...args) {
        const node = native.apply(this, args),
          start = node.start;
        node.start = function (...args) {
          window.played.push(this.buffer.duration);
          return start.apply(this, args);
        };
        return node;
      };
    });
    await page.goto("/");
    await page.locator("#sessionOptions > summary").click();
    await page.locator("#ammoEnabled").check();
    await page.locator("#magazineSize").fill("2");
    await page.locator("#magazineSize").blur();
    await page.locator("#previewShot").click();
    await expect(page.locator("#audioStatus")).toContainText("ready");
    await page.evaluate(() => (window.played = []));
    let display = page;
    if (separate) {
      const popup = page.waitForEvent("popup");
      await page.locator("#openProjector").click();
      display = await popup;
      await expect(page.locator("#notice")).toContainText("Projector ready");
    }
    await page.locator("#startRun").click();
    await page.waitForTimeout(300);
    const surface = display.locator(separate ? "#projectorStage" : "#range");
    const fire = () => surface.click({ position: { x: 35, y: 35 } });
    await fire();
    await fire();
    await expect(page.locator("#statShots")).toHaveText("2");
    await expect(display.locator("#ammoDisplay")).toHaveText("Reload");
    await fire();
    await expect(page.locator("#statShots")).toHaveText("2");
    await expect(display.locator("#ammoDisplay")).toHaveText("2 / 2");
    await expect
      .poll(() =>
        page.evaluate(() => window.played.map((x) => Math.round(x * 100))),
      )
      .toEqual([70, 70, 9]);
    await fire();
    await expect(page.locator("#statShots")).toHaveText("3");
    await page.locator("#stopRun").click();
    await expect(display.locator("#ammoDisplay")).toBeHidden();
    await page.locator("#shotAudio").uncheck();
    await page.locator("#startRun").click();
    await page.waitForTimeout(300);
    await expect(display.locator("#ammoDisplay")).toHaveText("2 / 2");
    await fire();
    await expect(page.locator("#statShots")).toHaveText("1");
    expect(await page.evaluate(() => window.played.length)).toBe(4);
    await page.locator("#stopRun").click();
    if (separate) await display.close();
  });
test("QR pairing link and rate-limit cooldown recover without refresh or manual code", async ({
  page,
  context,
}) => {
  test.setTimeout(30000);
  const { server, wss } = createRangeServer({
    adminToken: "pairing-regression",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const phone = await context.newPage();
  try {
    await page.goto(
      `http://127.0.0.1:${server.address().port}/#host=pairing-regression`,
    );
    await expect(page.locator("#pairCode")).not.toContainText("—");
    const code = await page.locator("#pairCode").textContent();
    expect(new URL(page.url()).hash).toBe("");
    await expect(page.locator("#qr")).toHaveAttribute("src", /^blob:/);
    const url = await page.locator("#phoneLink").getAttribute("href");
    const qrRequest = page.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/qr",
    );
    await page.locator("[data-tab=camera]").click();
    await page.locator("#pairLink").click();
    const generated = await qrRequest;
    expect(generated.method()).toBe("POST");
    expect(new URL(generated.url()).search).toBe("");
    expect(generated.postData()).toBe(url);
    await expect
      .poll(() => page.locator("#qr").evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0);
    await phone.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.testSocket = this;
        }
      };
    });
    await phone.goto(url);
    await expect(phone.locator("#code")).toHaveValue(code);
    await phone.locator("#connect").click();
    await expect(page.locator("#connection")).toHaveText(
      "Camera connected · detection not armed",
    );
    await phone.evaluate(() => {
      for (let i = 0; i < 260; i++)
        window.testSocket.send(
          JSON.stringify({ type: "ping", clientTime: Date.now() }),
        );
    });
    await expect(phone.locator("#phoneNotice")).toContainText("Reconnecting");
    await expect(phone.locator("#phoneNotice")).toContainText("Connected.", {
      timeout: 10000,
    });
    await expect(page.locator("#pairCode")).toHaveText(code);
    await expect(page.locator("#connection")).toHaveText(
      "Camera connected · detection not armed",
    );
  } finally {
    await phone.close();
    await page.goto("about:blank");
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => server.close(r));
  }
});
