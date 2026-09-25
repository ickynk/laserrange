import { test, expect } from "@playwright/test";
test("Manual preview zoom, drag and pinch preserve image coordinates and do not place accidental corners", async ({
  page,
}) => {
  await page.goto("/phone");
  await page.evaluate(async () => {
    const { alignmentView } = await import("/core/alignment-view.js");
    const v = document.createElement("div");
    v.id = "testViewport";
    v.style.cssText =
      "position:fixed;left:0;top:0;width:400px;height:300px;overflow:hidden;z-index:9999;touch-action:none";
    const i = document.createElement("div");
    i.id = "testImage";
    i.style.cssText =
      "width:400px;height:300px;transform-origin:0 0;background:#888";
    v.append(i);
    document.body.append(v);
    window.points = [];
    window.preview = alignmentView(v, i, {
      onPoint: (p) => window.points.push(p),
      onZoom: (s) => (window.scale = s),
    });
    window.preview.zoom(2);
  });
  await page.mouse.click(100, 75);
  expect(await page.evaluate(() => window.points[0])).toEqual([0.375, 0.375]);
  await page.mouse.move(180, 120);
  await page.mouse.down();
  await page.mouse.move(250, 170, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => window.points.length)).toBe(1);
  await page.evaluate(() => window.preview.setPan(true));
  await page.mouse.click(100, 75);
  expect(await page.evaluate(() => window.points.length)).toBe(1);
  await page.evaluate(() => {
    window.preview.setPan(false);
    const v = document.getElementById("testViewport");
    // Dispatch touch pointers without browser pointer capture for this gesture test.
    v.setPointerCapture = () => {};
    const event = (type, id, x, y) =>
      v.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          pointerType: "touch",
          button: 0,
          clientX: x,
          clientY: y,
          bubbles: true,
        }),
      );
    event("pointerdown", 10, 100, 100);
    event("pointerdown", 11, 200, 100);
    event("pointermove", 11, 210, 100);
    event("pointermove", 11, 260, 100);
    event("pointerup", 10, 100, 100);
    event("pointerup", 11, 260, 100);
  });
  expect(await page.evaluate(() => window.points.length)).toBe(1);
  expect(await page.evaluate(() => window.scale)).toBeGreaterThan(2);
  await page.evaluate(() => window.preview.fit());
  await page.mouse.click(100, 75);
  expect(await page.evaluate(() => window.points.at(-1))).toEqual([0.25, 0.25]);
});

test("Failed automatic alignment offers usable manual corners, zoom controls and undo on a phone viewport", async ({
  page,
}) => {
  const { createRangeServer } = await import("../../server.js");
  const { once } = await import("node:events");
  const { server, wss } = createRangeServer({ adminToken: "alignment-test" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const host = await page.context().newPage();
  try {
    await host.goto(`${origin}/#host=alignment-test`);
    await expect(host.locator("#pairCode")).not.toContainText("—");
    const code = await host.locator("#pairCode").textContent();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => {
      const c = document.createElement("canvas");
      c.width = 640;
      c.height = 360;
      const x = c.getContext("2d");
      setInterval(() => {
        x.fillStyle = "#333";
        x.fillRect(0, 0, 640, 360);
      }, 30);
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => c.captureStream(30),
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        value: async () => [],
      });
    });
    await page.goto(`${origin}/phone#code=${code}`);
    await page.locator("#connect").click();
    await expect(page.locator("#phoneNotice")).toContainText("Connected");
    await page.locator("#showPattern").click();
    await expect(page.locator("#alignmentStatus")).toContainText(
      "Enable the camera",
    );
    await page.locator("#startCamera").click();
    await expect(page.locator("#alignmentStatus")).toContainText(
      "Automatic alignment could not",
      { timeout: 12000 },
    );
    await page.locator("#resetCorners").click();
    await page.locator("#zoomIn").click();
    await expect(page.locator("#zoomLevel")).toHaveText("1.4×");
    await page.locator("#fitImage").click();
    const image = page.locator("#alignmentImage");
    async function corner(u, v) {
      await image.scrollIntoViewIfNeeded();
      const r = await image.boundingBox();
      await image.click({ position: { x: r.width * u, y: r.height * v } });
    }
    await corner(0.04, 0.07);
    await corner(0.96, 0.07);
    await corner(0.96, 0.93);
    await corner(0.04, 0.93);
    await expect(page.locator("#cornerStatus")).toContainText(
      "4 / 4 anchors · aligned",
    );
    await page.locator("#undoCorner").click();
    await expect(page.locator("#cornerStatus")).toHaveText("3 / 4 anchors");
    await corner(0.04, 0.93);
    await expect(page.locator("#alignmentStatus")).toContainText(
      "Manually aligned",
    );
    await page.locator("#hidePattern").click();
    await expect(host.locator("#calibration")).toBeHidden();
  } finally {
    await host.close();
    await page.goto("about:blank");
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
