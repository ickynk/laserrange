import { test, expect } from "@playwright/test";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRangeServer } from "../../server.js";
for (const separate of [false, true])
  test(`Five-shot zero routes, corrects once and isolates shooters (${separate ? "projector" : "single window"})`, async ({
    page,
  }) => {
    const { server, wss } = createRangeServer({ adminToken: "zero-test" });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    let phone, popup;
    try {
      await page.goto(`${origin}/#host=zero-test`);
      await expect(page.locator("#pairCode")).not.toContainText("—");
      if (separate) {
        const p = page.waitForEvent("popup");
        await page.locator("#openProjector").click();
        popup = await p;
        await expect(page.locator("#notice")).toContainText("Projector ready");
      }
      const scenario = await page.evaluate(async () => {
        const { defaultScenario } = await import("/core/scenario.js");
        const s = defaultScenario();
        s.targets = [];
        s.barriers = [];
        return s;
      });
      await page
        .locator("#importScenario")
        .setInputFiles({
          name: "empty.json",
          mimeType: "application/json",
          buffer: Buffer.from(JSON.stringify(scenario)),
        });
      await page.locator("#shooter").fill("Alice");
      phone = new WebSocket(origin.replace("http", "ws"), { origin });
      await once(phone, "open");
      const send = (m) => phone.send(JSON.stringify(m));
      send({
        type: "join",
        role: "phone",
        code: await page.locator("#pairCode").textContent(),
      });
      await once(phone, "message");
      send({ type: "ready", ready: true });
      await expect(page.locator("#connection")).toHaveText("Camera calibrated");
      await page.locator("[data-tab=camera]").click();
      send({ type: "zero-request", action: "start" });
      await expect(page.locator("#zeroStatus")).toContainText("0/5");
      await expect(
        (popup || page).locator(separate ? "#pattern" : "#calibration"),
      ).toBeVisible();
      await page.waitForTimeout(1700);
      for (let i = 0; i < 5; i++) {
        send({
          type: "shot",
          x: 0.5,
          y: 0.48,
          time: Date.now(),
          confidence: "high",
        });
        await page.waitForTimeout(350);
      }
      await expect(page.locator("#applyZero")).toBeEnabled();
      await expect(page.locator("#zeroStatus")).toContainText("2.00% down");
      await expect(page.locator("#statShots")).toHaveText("0");
      send({ type: "zero-request", action: "apply" });
      await expect(page.locator("#zeroStatus")).toContainText(
        "screen zero applied",
      );
      await expect(
        (popup || page).locator(separate ? "#pattern" : "#calibration"),
      ).toBeHidden();
      async function runShot(y, expected) {
        await page.locator("#startRun").click();
        await page.waitForTimeout(300);
        send({ type: "shot", x: 0.5, y, time: Date.now(), confidence: "high" });
        await expect(page.locator("#statShots")).toHaveText("1");
        const marker = page.locator("#shotOverlay .shotMarker");
        await expect(marker).toHaveCount(1);
        expect(
          await marker.evaluate((el) => parseFloat(el.style.top)),
        ).toBeCloseTo(expected * 100, 5);
        if (popup)
          expect(
            await popup
              .locator("#impacts .shotMarker")
              .evaluate((el) => parseFloat(el.style.top)),
          ).toBeCloseTo(expected * 100, 5);
        await page.locator("#stopRun").click();
      }
      await runShot(0.48, 0.5);
      await page.locator("[data-tab=range]").click();
      await page.locator("#shooter").fill("Bob");
      await expect(page.locator("#zeroStatus")).toContainText("no screen zero");
      await runShot(0.48, 0.48);
      await page.locator("#shooter").fill("Alice");
      await expect(page.locator("#zeroStatus")).toContainText(
        "screen zero applied",
      );
      // A cancelled attempt leaves the previous correction intact.
      send({ type: "zero-request", action: "start" });
      await expect(page.locator("#zeroStatus")).toContainText("0/5");
      send({ type: "zero-request", action: "cancel" });
      await expect(page.locator("#zeroStatus")).toContainText(
        "screen zero applied",
      );
      await runShot(0.995, 1.015); // counted as a miss, never silently dropped/clamped
      send({ type: "alignment-changed" });
      await expect(page.locator("#zeroStatus")).toContainText("no screen zero");
      await runShot(0.48, 0.48);
    } finally {
      phone?.terminate();
      await popup?.close();
      await page.goto("about:blank");
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => server.close(r));
    }
  });
