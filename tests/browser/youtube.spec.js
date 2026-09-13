import { test, expect } from "@playwright/test";

test("YouTube demo clicks reach shot capture instead of the cross-origin player; controls return after stopping", async ({
  page,
}) => {
  await page.route("https://www.youtube.com/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<html><body style="margin:0"><button id="native" style="width:100vw;height:100vh" onclick="parent.postMessage('fixture-native-click','*')">Player controls</button></body></html>`,
    }),
  );
  await page.addInitScript(() => {
    window.fixture = { nativeClicks: 0, state: 2 };
    window.addEventListener("message", (e) => {
      if (
        e.origin === "https://www.youtube.com" &&
        e.data === "fixture-native-click"
      ) {
        window.fixture.nativeClicks++;
        window.fixture.state = 2;
      }
    });
    window.YT = {
      Player: class {
        constructor(id) {
          this.iframe = document.createElement("iframe");
          this.iframe.src = "https://www.youtube.com/embed/abcdefghijk";
          document.getElementById(id).replaceWith(this.iframe);
        }
        playVideo() {
          window.fixture.state = 1;
        }
        pauseVideo() {
          window.fixture.state = 2;
        }
        getPlayerState() {
          return window.fixture.state;
        }
        getCurrentTime() {
          return 5;
        }
        destroy() {
          this.iframe.remove();
        }
      },
    };
  });
  await page.goto("/");
  await page.locator("[data-tab=video]").click();
  await page
    .locator("#youtubeUrl")
    .fill("https://www.youtube.com/watch?v=abcdefghijk");
  await page.locator("#loadYoutube").click();
  await page.frameLocator("#youtube iframe").locator("#native").click();
  await expect
    .poll(() => page.evaluate(() => window.fixture.nativeClicks))
    .toBe(1);
  await page.locator("#startRun").click();
  await expect(page.locator("#videoShotInput")).toBeVisible();
  await page.locator("#videoShotInput").click({ position: { x: 120, y: 90 } });
  await page.locator("#videoShotInput").click({ position: { x: 230, y: 140 } });
  await expect(page.locator("#statShots")).toHaveText("2");
  await expect(page.locator(".shotMarker")).toHaveCount(2);
  await expect
    .poll(() => page.evaluate(() => window.fixture))
    .toEqual({ nativeClicks: 1, state: 1 });
  await page.locator("#videoShotInput").click({ button: "right" });
  await expect(page.locator("#statShots")).toHaveText("2");
  await page.locator("#playVideo").click();
  await expect.poll(() => page.evaluate(() => window.fixture.state)).toBe(2);
  await expect(page.locator("#statShots")).toHaveText("2");
  await page.locator("#playVideo").click();
  await expect.poll(() => page.evaluate(() => window.fixture.state)).toBe(1);
  await page.locator("#stopRun").click();
  await expect(page.locator("#videoShotInput")).toBeHidden();
  await page.frameLocator("#youtube iframe").locator("#native").click();
  await expect
    .poll(() => page.evaluate(() => window.fixture.nativeClicks))
    .toBe(2);
  await page.locator("#startRun").click();
  await expect(page.locator(".shotMarker")).toHaveCount(0);
  await page.locator("#backTo3d").click();
  await expect(page.locator("#videoShotInput")).toBeHidden();
});
