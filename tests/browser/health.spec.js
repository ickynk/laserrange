import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import { WebSocket } from "ws";
import { once } from "node:events";
import { defaultScenario } from "../../public/core/scenario.js";
async function fixture(page, separate = false) {
  const { server, wss } = createRangeServer({ adminToken: "health-test" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${origin}/#host=health-test`);
  await expect(page.locator("#pairCode")).not.toContainText("—");
  const scenario = {
    ...defaultScenario(),
    duration: 120,
    cameraMotion: true,
    pauseAtSegments: true,
    cameraSpeed: 1,
    cameraPath: [
      { x: 0, z: 8 },
      { x: 0, z: 7.9 },
      { x: 0, z: 7.8 },
    ],
    session: { ammoEnabled: true, magazineSize: 5, shotAudio: false },
  };
  await page
    .locator("#importScenario")
    .setInputFiles({
      name: "health.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(scenario)),
    });
  let display = page;
  if (separate) {
    const pop = page.waitForEvent("popup");
    await page.locator("#openProjector").click();
    display = await pop;
    await expect(page.locator("#notice")).toContainText("Projector ready");
  }
  const phone = new WebSocket(origin.replace("http", "ws"));
  await once(phone, "open");
  const send = (m) => phone.send(JSON.stringify(m));
  let runId = null;
  const joined = new Promise((r) =>
    phone.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.type === "joined") r();
      if (m.type === "voice-state") runId = m.runId;
    }),
  );
  send({
    type: "join",
    role: "phone",
    code: await page.locator("#pairCode").textContent(),
  });
  await joined;
  send({ type: "ready", ready: true });
  let live = true;
  const telemetry = {
    type: "telemetry",
    fps: 30,
    referenceAge: 60,
    tests: 3,
    detections: 0,
    width: 1920,
    height: 1080,
    color: "red",
    threshold: 18,
    alignment: { method: "auto", rms: 1.2, checkError: 2.1 },
    brightPercent: 2,
    darkPercent: 4,
    reasons: { movement: 2 },
    candidates: 5,
    confirmed: 3,
  };
  const timer = setInterval(() => {
    if (live && phone.readyState === 1) send(telemetry);
  }, 200);
  await page.locator("[data-tab=camera]").click();
  await expect(page.locator("#healthStatus")).toContainText("Live telemetry");
  await page.locator("#hardwareTests > summary").click();
  return {
    get runId() {
      return runId;
    },
    display,
    send,
    telemetry,
    setLive: (v) => (live = v),
    async close() {
      clearInterval(timer);
      if (separate) await display.close();
      await page.goto("about:blank");
      for (const ws of wss.clients) ws.terminate();
      await new Promise((r) => server.close(r));
    },
  };
}
const reports = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("laser-range.hardware.v1") || "[]"),
  );
for (const separate of [false, true])
  test(`Placement board uses calibrated frame without scored shots (${separate ? "projector" : "single"})`, async ({
    page,
  }) => {
    const f = await fixture(page, separate);
    try {
      await expect(page.locator("#healthMetrics")).toContainText("1.2 / 2.1");
      await page.locator("#beginHardwareTest").click();
      await expect(
        f.display.locator(separate ? "#pattern" : "#calibration"),
      ).toBeVisible();
      await page.waitForTimeout(1700);
      for (let i = 0; i < 5; i++)
        f.send({
          type: "shot",
          x: 0.16,
          y: 0.15,
          time: Date.now(),
          confidence: "high",
        });
      await expect(page.locator("#testProgress")).toContainText("5 detections");
      await page.locator("#nextTestPoint").click();
      await page.waitForTimeout(1700);
      for (let i = 0; i < 5; i++)
        f.send({
          type: "shot",
          x: 0.5,
          y: 0.15,
          time: Date.now(),
          confidence: "high",
        });
      await expect(page.locator("#testProgress")).toContainText("5 detections");
      await expect(page.locator("#statShots")).toHaveText("0");
      await page.locator("#finishHardwareTest").click();
      await expect(
        f.display.locator(separate ? "#pattern" : "#calibration"),
      ).toBeHidden();
      const r = (await reports(page))[0];
      expect(r.status).toBe("Incomplete");
      expect(r.grid[0].samples).toBe(5);
      expect(r.grid[0].rawErrorWidth).toBeCloseTo(1);
      expect(r.grid[1].rawErrorWidth).toBeCloseTo(0);
    } finally {
      await f.close();
    }
  });
test("Live pulse count, idle timer and interrupted telemetry retain bounded browser results", async ({
  page,
}) => {
  test.setTimeout(40000);
  const f = await fixture(page);
  try {
    await page.locator("#testKind").selectOption("pulses");
    await page.locator("#testExpected").fill("3");
    await page.locator("#beginHardwareTest").click();
    await expect(page.locator("#testProgress")).toContainText("Start a live");
    await page.locator("#startRun").click();
    await page.locator("#beginHardwareTest").click();
    await page.waitForTimeout(1700);
    f.send({
      type: "shot",
      x: 0.1,
      y: 0.1,
      time: Date.now(),
      confidence: "high",
    });
    f.send({
      type: "shot",
      x: 0.2,
      y: 0.2,
      time: Date.now(),
      confidence: "review",
    });
    await expect(page.locator("#testProgress")).toContainText(
      "2 detector events",
    );
    await page.locator("#finishHardwareTest").click();
    let r = (await reports(page))[0];
    expect(r.deficit).toBe(1);
    expect(r.high).toBe(1);
    expect(r.review).toBe(1);
    await page.locator("#testKind").selectOption("idle");
    await page.locator("#testSeconds").fill("10");
    await page.locator("#beginHardwareTest").click();
    await page.waitForTimeout(1700);
    f.send({
      type: "shot",
      x: 0.2,
      y: 0.2,
      time: Date.now(),
      confidence: "review",
    });
    await expect(page.locator("#testProgress")).toContainText("Completed", {
      timeout: 12000,
    });
    r = (await reports(page))[0];
    expect(r.events).toBe(1);
    expect(r.measurementSeconds).toBeGreaterThanOrEqual(10);
    await page.locator("#beginHardwareTest").click();
    f.setLive(false);
    await expect(page.locator("#testProgress")).toContainText("Interrupted", {
      timeout: 6000,
    });
    expect((await reports(page))[0].status).toBe("Interrupted");
    await expect(page.locator("#healthStatus")).toContainText("stale");
    await page.reload();
    await page.locator("[data-tab=camera]").click();
    await page.locator("#hardwareTests > summary").click();
    expect((await reports(page)).length).toBe(3);
  } finally {
    await f.close();
  }
});
test("Guided voice sequence records executed commands separately from missed spoken attempts", async ({
  page,
}) => {
  const f = await fixture(page, true);
  try {
    await page.locator("#startRun").click();
    await page.waitForTimeout(300);
    await expect.poll(() => f.runId).not.toBeNull();
    await page.locator("#testKind").selectOption("voice");
    await page.locator("#beginHardwareTest").click();
    await page.waitForTimeout(1600);
    await page.locator("#unheardVoice").click();
    for (const [i, command] of ["moving", "cover", "retrograde"].entries()) {
      f.send({
        type: "voice-command",
        command,
        id: "test-" + i,
        runId: f.runId,
        time: Date.now(),
      });
      if (i < 2) await page.waitForTimeout(1200);
    }
    await expect(page.locator("#testProgress")).toContainText("Completed");
    const r = (await reports(page))[0];
    expect(r.voiceSteps).toBe(3);
    expect(r.unheard).toBe(1);
    expect(r.voices.map((v) => v.command)).toEqual([
      "moving",
      "cover",
      "retrograde",
    ]);
    await expect(page.locator("#statShots")).toHaveText("0");
  } finally {
    await f.close();
  }
});
