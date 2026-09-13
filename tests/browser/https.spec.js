import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("HTTPS pairing can be unlocked from a plain URL, survives reload, and recovers a stale key", async ({
  browser,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "laser-range-tls-"));
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      join(dir, "key.pem"),
      "-out",
      join(dir, "cert.pem"),
      "-days",
      "1",
      "-subj",
      "/CN=localhost",
    ],
    { stdio: "ignore" },
  );
  const { server, wss } = createRangeServer({
    adminToken: "https-regression-key",
    tls: {
      key: readFileSync(join(dir, "key.pem")),
      cert: readFileSync(join(dir, "cert.pem")),
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `https://127.0.0.1:${server.address().port}`;
  // This test-only certificate is self-signed. Production phone setup still requires trusted TLS.
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  try {
    await page.goto(origin);
    await page.locator("[data-tab=camera]").click();
    await expect(page.locator("#hostAccess")).toBeVisible();
    await page
      .locator("#hostCredential")
      .fill(`${origin}/#host=https-regression-key`);
    await page.locator("#unlockHost").click();
    await expect(page.locator("#hostAccess")).toBeHidden();
    await expect
      .poll(() => page.locator("#qr").evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0);
    await expect(page.locator("#phoneLink")).toHaveAttribute(
      "href",
      new RegExp("^https://"),
    );
    await page.reload();
    await expect(page.locator("#pairCode")).toHaveText(/^\d{6}$/);
    await page.evaluate(() =>
      sessionStorage.setItem("laser-range.host-key", "expired-key"),
    );
    await page.reload();
    await page.locator("[data-tab=camera]").click();
    await expect(page.locator("#hostAccess")).toBeVisible();
    await page.locator("#hostCredential").fill("https-regression-key");
    await page.locator("#unlockHost").click();
    await expect(page.locator("#hostAccess")).toBeHidden();
    await expect
      .poll(() => page.locator("#qr").evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0);
  } finally {
    await context.close();
    for (const ws of wss.clients) ws.terminate();
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
});
