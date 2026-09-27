import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import { defaultScenario } from "../../public/core/scenario.js";
const fakeSpeech = () => {
  window.SpeechRecognition = class {
    constructor() {
      window.recognizer = this;
    }
    start() {
      queueMicrotask(() => this.onstart?.());
    }
    abort() {
      this.onend?.();
    }
  };
  window.say = (text, index = 0, final = true) => {
    const result = [{ transcript: text, confidence: 0.9 }];
    result.isFinal = final;
    const results = Array.from({ length: index + 1 }, () => result);
    window.recognizer.onresult({ resultIndex: index, results });
  };
};
for (const separate of [false, true])
  test(`Phone voice navigation and reload (${separate ? "projector" : "single"})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(40000);
    const { server, wss } = createRangeServer({ adminToken: "voice-test" });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const phone = await context.newPage();
    let display = page;
    try {
      await page.goto(`${origin}/#host=voice-test`);
      await expect(page.locator("#pairCode")).not.toContainText("—");
      const s = {
        ...defaultScenario(),
        cameraMotion: true,
        pauseAtSegments: true,
        cameraSpeed: 1,
        cameraPath: [
          { x: 0, z: 8 },
          { x: 0, z: 7.7 },
          { x: 0, z: 7.4 },
        ],
        session: { ammoEnabled: true, magazineSize: 2, shotAudio: false },
      };
      await page.locator("#importScenario").setInputFiles({
        name: "voice.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(s)),
      });
      await page.locator("#cameraOptions > summary").click();
      if (separate) {
        const popup = page.waitForEvent("popup");
        await page.locator("#openProjector").click();
        display = await popup;
        await expect(page.locator("#notice")).toContainText("Projector ready");
      }
      await phone.addInitScript(fakeSpeech);
      await phone.goto(
        `${origin}/phone#code=${await page.locator("#pairCode").textContent()}`,
      );
      await phone.locator("#connect").click();
      await expect(phone.locator("#phoneNotice")).toContainText("Connected");
      await phone.locator("#voiceOptions > summary").click();
      await phone.locator("#enableVoice").click();
      await expect(phone.locator("#voiceStatus")).toContainText("Listening");
      await page.locator("#startRun").click();
      await expect(page.locator("#segmentStatus")).toContainText(
        "Holding at point 2",
      );
      await expect(phone.locator("#voiceStatus")).toContainText("Listening");
      const surface = display.locator(separate ? "#projectorStage" : "#range");
      await surface.click({ position: { x: 35, y: 35 } });
      await surface.click({ position: { x: 35, y: 35 } });
      await expect(display.locator("#ammoDisplay")).toHaveText("Reload");
      await phone.evaluate(() => window.say("Cover!"));
      await expect(phone.locator("#voiceResult")).toHaveText(
        "Magazine reloaded.",
      );
      await expect(display.locator("#ammoDisplay")).toHaveText("2 / 2");
      await expect(page.locator("#statShots")).toHaveText("2");
      // Same recognition result cannot refill a newly depleted magazine again.
      await surface.click({ position: { x: 35, y: 35 } });
      await phone.waitForTimeout(1250);
      await phone.evaluate(() => window.say("Cover!"));
      await expect(display.locator("#ammoDisplay")).toHaveText("1 / 2");
      await phone.evaluate(() => window.say("Moving", 1));
      await expect(phone.locator("#voiceResult")).toHaveText(
        "Moving to next segment.",
      );
      await expect(page.locator("#segmentStatus")).toContainText(
        "Holding at point 3",
      );
      await phone.waitForTimeout(1250);
      await phone.evaluate(() => window.say("Retrograde", 2));
      await expect(phone.locator("#voiceResult")).toHaveText(
        "Returning to previous segment.",
      );
      await expect(page.locator("#segmentStatus")).toContainText(
        "Holding at point 2",
      );
      await phone.locator("#disableVoice").click();
      await expect(phone.locator("#voiceStatus")).toHaveText(
        "Voice controls off.",
      );
      await phone.waitForTimeout(1250);
      await phone.evaluate(() => window.say("Cover", 3));
      await expect(display.locator("#ammoDisplay")).toHaveText("1 / 2");
      await surface.click({ position: { x: 35, y: 35 } });
      await surface.click({ position: { x: 35, y: 35 } });
      await expect(display.locator("#ammoDisplay")).toHaveText("2 / 2");
      await expect(page.locator("#statShots")).toHaveText("4");
      await page.locator("#stopRun").click();
    } finally {
      if (separate) await display.close();
      await phone.close();
      await page.goto("about:blank");
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => server.close(r));
    }
  });
test("Unsupported recognition is actionable without affecting phone UI", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.SpeechRecognition = undefined;
    window.webkitSpeechRecognition = undefined;
  });
  await page.goto("/phone");
  await page.locator("#voiceOptions > summary").click();
  await expect(page.locator("#enableVoice")).toBeDisabled();
  await expect(page.locator("#voiceStatus")).toContainText("unavailable");
  await expect(page.locator("#startCamera")).toBeEnabled();
});
