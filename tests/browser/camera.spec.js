import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { createRangeServer } from "../../server.js";

for (const separate of [false, true])
  test(`Paired synthetic camera flow (${separate ? "projector" : "single window"})`, async ({
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
      if (separate) {
        await page.setViewportSize({ width: 1000, height: 800 });
        await expect(page.locator("#connection")).toHaveText(
          "Camera calibrated",
        );
        await expect(phone.locator("#arm")).toHaveText("Detection armed");
      }
      await phone.locator("#hidePattern").click();
      await expect(
        (projector || page).locator(separate ? "#pattern" : "#calibration"),
      ).toBeHidden();
      // A calibrated phone must select live input without a hidden demo toggle.
      await expect(page.locator("#demo")).not.toBeChecked();
      await expect(phone.locator("#phoneNotice")).toContainText(
        "sensitivity updated",
      );
      await expect(page.locator("#connection")).toHaveText("Camera calibrated");
      await page.locator("#startRun").click();
      await phone.waitForTimeout(400);
      await pulse();
      await expect(page.locator("#statShots")).toHaveText("1");
      await expect(page.locator("#statMisses")).toHaveText("1");
      const aligned = await phone.locator("#cornerStatus").textContent();
      await (projector || page).setViewportSize({ width: 1000, height: 650 });
      await expect(phone.locator("#phoneNotice")).toContainText(
        "Adjusting sensitivity",
      );
      await expect(phone.locator("#phoneNotice")).toContainText(
        "sensitivity updated",
      );
      await expect(phone.locator("#arm")).toHaveText("Detection armed");
      await expect(phone.locator("#cornerStatus")).toHaveText(aligned);
      await expect(phone.locator("#testStatus")).toHaveText(
        "3 / 3 pulses detected",
      );
      await pulse();
      await expect(page.locator("#statShots")).toHaveText("2");
      // A second session reuses alignment and the pulse check.
      await page.locator("#stopRun").click();
      await page.locator("#startRun").click();
      await phone.waitForTimeout(400);
      await pulse();
      await expect(page.locator("#statShots")).toHaveText("1");
      await page.locator("#stopRun").click();
      await page.locator("[data-tab=video]").click();
      await page
        .locator("#videoFile")
        .setInputFiles("tests/fixtures/projector.webm");
      await expect(phone.locator("#phoneNotice")).toContainText(
        "Adjusting sensitivity",
      );
      await expect(phone.locator("#phoneNotice")).toContainText(
        "sensitivity updated",
      );
      await page.locator("#backTo3d").click();
      // Wait for the new mode's automatic refresh, not the previous notice.
      await phone.waitForTimeout(1500);
      await expect(page.locator("#connection")).toHaveText("Camera calibrated");
      await expect(phone.locator("#cornerStatus")).toHaveText(aligned);
      await expect(phone.locator("#testStatus")).toHaveText(
        "3 / 3 pulses detected",
      );
      await page.locator("#startRun").click();
      await phone.waitForTimeout(400);
      await pulse();
      await expect(page.locator("#statShots")).toHaveText("1");
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
      console.log(
        "Pulse status:",
        await phone.locator("#testStatus").textContent(),
        await phone.locator("#cameraTelemetry").textContent(),
      );
      await phone.screenshot({
        path: "test-results/phone-debug.png",
        fullPage: true,
      });
      throw error;
    } finally {
      await projector?.close();
      await phone.close();
      await page.goto("about:blank");
      for (const ws of wss.clients) ws.terminate();
      await new Promise((resolve) => server.close(resolve));
    }
  });
