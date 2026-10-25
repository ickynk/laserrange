import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
test("Camera health controls preserve qualification, verify hardware settings and recover stalled frames", async ({
  page,
  context,
}) => {
  test.setTimeout(60000);
  const { server, wss } = createRangeServer({
    adminToken: "camera-health-test",
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const phone = await context.newPage();
  const errors = [];
  phone.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(origin + "/#host=camera-health-test");
    await expect(page.locator("#pairCode")).not.toContainText("—");
    await phone.addInitScript(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 960;
      canvas.height = 540;
      const ctx = canvas.getContext("2d");
      const stream = canvas.captureStream(0),
        track = stream.getVideoTracks()[0];
      const native = track.getSettings.bind(track),
        settings = {
          focusMode: "continuous",
          focusDistance: 2,
          exposureCompensation: 0,
        };
      track.getCapabilities = () => ({
        focusMode: ["continuous", "manual"],
        focusDistance: { min: 0.1, max: 10, step: 0.1 },
        exposureCompensation: { min: -2, max: 2, step: 0.5 },
      });
      track.getSettings = () => ({ ...native(), ...settings });
      track.applyConstraints = async (c) => {
        if (window.rejectSettings) throw Error("Settings rejected");
        Object.assign(settings, c.advanced[0]);
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        value: async () => stream,
      });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", {
        value: async () => [],
      });
      let source = null;
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
      setInterval(() => {
        if (window.freezeCamera) return;
        ctx.fillStyle = "#303030";
        ctx.fillRect(0, 0, 960, 540);
        if (source) ctx.drawImage(source, 0, 0, 960, 540);
        if (window.testPulse) {
          ctx.fillStyle = "#ff1010";
          ctx.fillRect(42, 42, 8, 8);
        }
        track.requestFrame();
      }, 20);
    });
    await phone.goto(
      origin + "/phone#code=" + (await page.locator("#pairCode").textContent()),
    );
    await phone.locator("#connect").click();
    await phone.locator("#startCamera").click();
    await expect(phone.locator("#phoneNotice")).toContainText("Camera running");
    for (const [x, y] of [
      [0.04, 0.07],
      [0.96, 0.07],
      [0.96, 0.93],
      [0.04, 0.93],
    ]) {
      const b = await phone.locator("#alignmentViewport").boundingBox();
      await phone
        .locator("#alignmentViewport")
        .click({ position: { x: b.width * x, y: b.height * y } });
    }
    await expect(phone.locator("#cornerStatus")).toContainText("aligned");
    const corners = await phone.locator("#cornerStatus").textContent();
    await phone.locator("#baseline").click();
    await expect(phone.locator("#phoneNotice")).toContainText(
      "Baseline captured",
      { timeout: 6000 },
    );
    await phone.locator("#threshold").evaluate((el) => {
      el.value = "18";
      el.dispatchEvent(new Event("input"));
    });
    await phone.locator("#test").click();
    for (let i = 0; i < 3; i++) {
      await phone.evaluate(() => (window.testPulse = true));
      await phone.waitForTimeout(500);
      await phone.evaluate(() => (window.testPulse = false));
      await phone.waitForTimeout(500);
    }
    await expect(phone.locator("#arm")).toBeEnabled();
    await phone.locator("#arm").click();
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await page.locator("[data-tab=camera]").click();
    await expect(page.locator("#healthRefresh")).toBeEnabled();
    await page.locator("#healthRefresh").click();
    await expect(page.locator("#cameraControlResult")).toContainText(
      "Phone confirmed",
    );
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await page.locator("#healthPause").click();
    await expect(phone.locator("#arm")).toHaveText("Arm detection");
    await page.locator("#healthResume").click();
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await phone.locator("#cameraHardware > summary").click();
    await phone.locator("#cameraSetting-exposureCompensation").fill("-1");
    await phone.locator("#applyCameraSettings").click();
    await expect(phone.locator("#cameraSettingsResult")).toContainText(
      "Settings confirmed",
    );
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await expect(phone.locator("#cornerStatus")).toHaveText(corners);
    await expect(phone.locator("#testStatus")).toHaveText(
      "3 / 3 pulses detected",
    );
    await phone.evaluate(() => (window.rejectSettings = true));
    await phone.locator("#cameraSetting-exposureCompensation").fill("-1.5");
    await phone.locator("#applyCameraSettings").click();
    await expect(phone.locator("#cameraSettingsResult")).toContainText(
      "Settings rejected",
    );
    await expect(phone.locator("#arm")).toHaveText("Arm detection");
    await page.locator("#healthResume").click();
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await phone.evaluate(() => {
      window.freezeCamera = true;
      document.querySelector("#camera").pause();
    });
    await expect(page.locator("#healthStatus")).toContainText("stalled", {
      timeout: 6000,
    });
    await expect(phone.locator("#arm")).toHaveText("Arm detection");
    await expect(page.locator("#healthMetrics")).toContainText(
      "Camera heartbeat age",
    );
    await phone.evaluate(() => (window.freezeCamera = false));
    await phone.locator("#resumeCameraPreview").click();
    await expect(page.locator("#connection")).toHaveText("Camera calibrated");
    await expect(phone.locator("#cornerStatus")).toHaveText(corners);
    await expect(phone.locator("#testStatus")).toHaveText(
      "3 / 3 pulses detected",
    );
    await page.locator("#startRun").click();
    await expect(page.locator("#healthRefresh")).toBeDisabled();
    await expect(phone.locator("#applyCameraSettings")).toBeDisabled();
    await page.locator("#stopRun").click();
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.screenshot({
      path: "test-results/camera-health-phone.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } catch (e) {
    console.log(
      await phone.locator("#phoneNotice").textContent(),
      await phone.locator("#testStatus").textContent(),
      await phone.locator("#phoneHealthStatus").textContent(),
    );
    throw e;
  } finally {
    await phone.close();
    await page.goto("about:blank");
    for (const ws of wss.clients) ws.terminate();
    await new Promise((r) => server.close(r));
  }
});
test("Camera controls require a running camera before offering settings", async ({
  page,
}) => {
  await page.goto("/phone");
  await page.locator("#cameraHardware > summary").click();
  await expect(page.locator("#cameraSettingsResult")).toContainText(
    "Enable the camera",
  );
  await expect(page.locator("#applyCameraSettings")).toBeDisabled();
});
