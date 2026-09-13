import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { createRangeServer } from "../../server.js";

test("Paired synthetic camera aligns, calibrates, arms, sends a laser pulse, and resets on backgrounding", async ({
  page,
  context,
}) => {
  const { server, wss } = createRangeServer({
    adminToken: "browser-test-only",
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  const phone = await context.newPage();
  const errors = [];
  phone.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(`${origin}/#host=browser-test-only`);
    await expect(page.locator("#pairCode")).not.toContainText("—");
    const code = await page.locator("#pairCode").textContent();
    await page.locator("[data-tab=camera]").click();
    await page.locator("#calibrate").click();
    await phone.addInitScript(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext("2d");
      let source = null;
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
        value: async () => canvas.captureStream(30),
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
          ctx.fillRect(42, 42, 8, 8);
        }
      }, 20);
    });
    await phone.goto(`${origin}/phone#code=${code}`);
    await phone.locator("#connect").click();
    await expect(phone.locator("#phoneNotice")).toContainText("Connected");
    await phone.locator("#startCamera").click();
    await expect(phone.locator("#phoneNotice")).toContainText("Camera running");
    await phone.waitForTimeout(600);
    await phone.locator("#autoCorners").click();
    await expect(phone.locator("#cornerStatus")).toContainText("aligned");
    await phone.locator("#baseline").click();
    await expect(phone.locator("#phoneNotice")).toContainText(
      "Baseline captured",
      { timeout: 6000 },
    );
    await phone.locator("#test").click();
    async function pulse() {
      await phone.evaluate(() => (window.testPulse = true));
      await phone.waitForTimeout(180);
      await phone.evaluate(() => (window.testPulse = false));
      await phone.waitForTimeout(250);
    }
    for (let i = 0; i < 3; i++) await pulse();
    await expect(phone.locator("#arm")).toBeEnabled();
    await phone.locator("#arm").click();
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await page.locator("#stopCalibration").click();
    await page.locator("#demo").uncheck();
    await page.locator("#startRun").click();
    await phone.waitForTimeout(400);
    await pulse();
    await expect(page.locator("#statShots")).toHaveText("1");
    await expect(page.locator("#statMisses")).toHaveText("1");
    await phone.evaluate(() => {
      Object.defineProperty(document, "hidden", {
        configurable: true,
        value: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.locator("#stopRun")).toBeDisabled();
    expect(errors).toEqual([]);
  } catch (error) {
    console.log(
      "Phone status:",
      await phone.locator("#phoneNotice").textContent(),
    );
    console.log("Host status:", await page.locator("#notice").textContent());
    await phone.screenshot({
      path: "test-results/phone-debug.png",
      fullPage: true,
    });
    throw error;
  } finally {
    await phone.close();
    await page.goto("about:blank");
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
  }
});
