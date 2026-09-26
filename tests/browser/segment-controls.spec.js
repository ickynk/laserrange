import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import { defaultScenario } from "../../public/core/scenario.js";
import { WebSocket } from "ws";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const scene = () => ({
  ...defaultScenario(),
  duration: 3,
  targets: defaultScenario().targets.map((t) => ({ ...t, start: 0, end: 3 })),
  cameraMotion: true,
  pauseAtSegments: true,
  cameraSpeed: 1,
  cameraPath: [
    { x: 0, z: 8 },
    { x: 0, z: 7 },
    { x: 0, z: 6 },
  ],
});
async function importScene(page, s) {
  await page
    .locator("#importScenario")
    .setInputFiles({
      name: "steps.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(s)),
    });
}
async function projector(page) {
  const p = page.waitForEvent("popup");
  await page.locator("#openProjector").click();
  const display = await p;
  await expect(page.locator("#notice")).toContainText("Projector ready");
  return display;
}
test("Segment holds and manual progression work in the operator view past session duration", async ({
  page,
}) => {
  await page.goto("/");
  await importScene(page, scene());
  await page.locator("#startRun").click();
  await expect(page.locator("#segmentStatus")).toContainText(
    "Holding at point 2",
  );
  await page.waitForTimeout(2400);
  await expect(page.locator("#stopRun")).toBeEnabled();
  await page.locator("#range").click({ position: { x: 30, y: 30 } });
  await expect(page.locator("#statShots")).toHaveText("1");
  await page.locator("#nextSegment").click();
  await expect(page.locator("#segmentStatus")).toContainText(
    "Holding at point 3",
  );
  await expect(page.locator("#nextSegment")).toBeDisabled();
  await page.locator("#previousSegment").click();
  await expect(page.locator("#segmentStatus")).toContainText(
    "Holding at point 2",
  );
  await page.locator("#stopRun").click();
});
test("Idle laser Start, segment controls, restart and saved range menu are excluded from shots", async ({
  page,
}) => {
  test.setTimeout(45000);
  const dir = await mkdtemp(join(tmpdir(), "laser-control-")),
    { server } = createRangeServer({
      adminToken: "controls-test",
      dataDir: dir,
    });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let phone, display;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await fetch(origin + "/api/library/ranges", {
      method: "POST",
      headers: {
        Authorization: "Bearer controls-test",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: "Saved alternate",
        scenario: { ...scene(), name: "Alternate range" },
      }),
    });
    await page.goto(origin + "/#host=controls-test");
    await importScene(page, scene());
    display = await projector(page);
    display.on("pageerror", (e) => errors.push(e.message));
    const code = await page.locator("#pairCode").textContent();
    phone = new WebSocket(origin.replace("http", "ws"));
    await once(phone, "open");
    phone.send(JSON.stringify({ type: "join", role: "phone", code }));
    await once(phone, "message");
    phone.send(JSON.stringify({ type: "ready", ready: true }));
    await expect(page.locator("#demo")).not.toBeChecked();
    await page.waitForTimeout(1200);
    const pulse = (x, y = 0.95) =>
      phone.send(
        JSON.stringify({
          type: "shot",
          x,
          y,
          time: Date.now(),
          confidence: "high",
        }),
      );
    pulse(1 / 12);
    await expect(page.locator("#stopRun")).toBeEnabled();
    await expect(page.locator("#segmentStatus")).toContainText(
      "Holding at point 2",
    );
    await expect(page.locator("#statShots")).toHaveText("0");
    await page.waitForTimeout(2300);
    pulse(0.02, 0.02);
    await expect(page.locator("#statShots")).toHaveText("1");
    pulse(4.5 / 6);
    await expect(page.locator("#segmentStatus")).toContainText(
      "Holding at point 3",
    );
    await expect(page.locator("#statShots")).toHaveText("1");
    await page.waitForTimeout(1000);
    pulse(3.5 / 6);
    await expect(page.locator("#segmentStatus")).toContainText(
      "Holding at point 2",
    );
    await page.waitForTimeout(1000);
    pulse(1.5 / 6);
    await expect(page.locator("#statShots")).toHaveText("0");
    await expect(page.locator("#stopRun")).toBeEnabled();
    await page.waitForTimeout(1200);
    pulse(2.5 / 6);
    await expect(page.locator("#stopRun")).toBeDisabled();
    await page.waitForTimeout(1200);
    // One saved item: Back, range, page-back, page-next.
    pulse(1.5 / 4);
    await expect(page.locator("#sceneTitle")).toHaveText("Alternate range");
    await expect(page.locator("#statShots")).toHaveText("0");
    await page.waitForTimeout(1200);
    const r = await display.locator("#simulatorInput").boundingBox();
    await display
      .locator("#simulatorInput")
      .click({ position: { x: r.width / 12, y: r.height * 0.7 } });
    await expect(page.locator("#stopRun")).toBeEnabled();
    expect(errors).toEqual([]);
  } finally {
    phone?.close();
    if (display && !display.isClosed()) await display.close();
    await page.goto("about:blank");
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
