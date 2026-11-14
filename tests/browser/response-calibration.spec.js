import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { createRangeServer } from "../../server.js";

for (const separate of [false, true])
  test(`Guided response calibration (${separate ? "projector" : "single window"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(150000);
    const { server, wss } = createRangeServer({
      adminToken: "browser-test-only",
    });
    const peers = new Map();
    wss.on("connection", (ws) =>
      ws.on("message", (raw) => {
        const m = JSON.parse(raw);
        if (m.type === "join") peers.set(m.role, ws);
      }),
    );
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    const phone = await context.newPage();
    let projector;
    const errors = [];
    phone.on("pageerror", (e) => errors.push(e.message));
    try {
      await page.goto(`${origin}/#host=browser-test-only`);
      await expect(page.locator("#pairCode")).not.toContainText("—");
      const code = await page.locator("#pairCode").textContent();
      if (separate) {
        const popup = page.waitForEvent("popup");
        await page.locator("#openProjector").click();
        projector = await popup;
        await expect(page.locator("#notice")).toContainText("Projector ready");
      }
      await page.locator("[data-tab=camera]").click();

      await phone.addInitScript(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 960;
        canvas.height = 540;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        let source = null;
        // Explicit frame requests keep the synthetic source deterministic in headless Chromium.
        const stream = canvas.captureStream(0);
        const track = stream.getVideoTracks()[0];
        window.testPulse = false;
        const NativeWebSocket = window.WebSocket;
        window.WebSocket = class extends NativeWebSocket {
          constructor(...args) {
            super(...args);
            this.addEventListener("message", async (e) => {
              const m = JSON.parse(e.data);
              if (m.type === "reference") {
                const image = new Image();
                image.src = m.image;
                await image.decode();
                source = image;
              }
            });
          }
        };
        Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
          value: async () => stream,
        });
        Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
          value: async () => [],
        });
        setInterval(() => {
          ctx.fillStyle = "#202020";
          ctx.fillRect(0, 0, 960, 540);
          if (source) ctx.drawImage(source, 0, 0, 960, 540);
          if (window.testPulse) {
            ctx.fillStyle = "#ff1010";
            const point = window.pulsePosition || [42, 42];
            ctx.fillRect(point[0], point[1], 8, 8);
          }
          track.requestFrame();
        }, 20);
      });
      await phone.goto(`${origin}/phone#code=${code}`);
      await phone.locator("#connect").click();
      await expect(phone.locator("#phoneNotice")).toContainText("Connected");
      await phone.locator("#startCamera").click();
      await expect(phone.locator("#phoneNotice")).toContainText(
        "Camera running",
      );
      await phone.locator("#showPattern").click();
      await expect(
        (projector || page).locator(separate ? "#pattern" : "#calibration"),
      ).toBeVisible();
      await expect(phone.locator("#alignmentStatus")).toContainText(
        "Automatically aligned",
      );
      await expect(phone.locator("#cornerStatus")).toContainText("aligned");
      await phone.locator("#responseStart").click();
      if (!separate) {
        await expect(phone.locator("#responseStatus")).toContainText(
          "dark: fire exactly 3",
          { timeout: 30000 },
        );
        await phone.evaluate(() => (window.testPulse = true));
        await phone.waitForTimeout(400);
        await phone.evaluate(() => (window.testPulse = false));
        await phone.waitForTimeout(650);
        await phone.locator("#responseConfirm").click();
        await expect(phone.locator("#responseStatus")).toContainText(
          "NOT qualified",
        );
        await expect(phone.locator("#arm")).toBeDisabled();
        await phone.locator("#responseStart").click();
      }
      for (const background of ["dark", "gray", "bright"]) {
        await expect(phone.locator("#responseStatus")).toContainText(
          `${background}: fire exactly 3`,
          { timeout: 30000 },
        );
        for (let i = 0; i < 3; i++) {
          await phone.evaluate(() => (window.testPulse = true));
          await phone.waitForTimeout(400);
          await phone.evaluate(() => (window.testPulse = false));
          await phone.waitForTimeout(650);
        }
        await expect(phone.locator("#responseStatus")).toContainText(
          "detected 3/3",
        );
        await phone.locator("#responseConfirm").click();
      }
      await expect(phone.locator("#responseStatus")).toContainText(
        "Calibration complete",
        { timeout: 8000 },
      );
      await expect(phone.locator("#arm")).toBeEnabled();
      await phone.locator("#arm").click();
      await expect(page.locator("#connection")).toHaveText("Camera calibrated");
      await phone.locator("#hidePattern").click();
      await expect(phone.locator("#arm")).toHaveText("Detection armed");
      await phone.locator("#responseStart").click();
      await phone.locator("#responseCancel").click();
      await expect(phone.locator("#responseStatus")).toContainText("Cancelled");
      await expect(phone.locator("#arm")).toBeDisabled();
      expect(errors).toEqual([]);
    } finally {
      await projector?.close();
      await phone.close();
      await page.goto("about:blank");
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  });
