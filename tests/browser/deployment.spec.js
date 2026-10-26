import { test, expect } from "@playwright/test";
import { createRangeServer } from "../../server.js";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { once } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

test("Home HTTPS gateway routes operator, secure QR pairing, reconnect and camera events to an HTTP backend", async ({
  browser,
}) => {
  const dir = mkdtempSync(join(tmpdir(), "range-gateway-"));
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
  let backendPort;
  const connections = new Set();
  const gateway = https.createServer(
    {
      key: readFileSync(join(dir, "key.pem")),
      cert: readFileSync(join(dir, "cert.pem")),
    },
    (req, res) => {
      const upstream = http.request(
        {
          hostname: "127.0.0.1",
          port: backendPort,
          method: req.method,
          path: req.url,
          headers: req.headers,
        },
        (r) => {
          res.writeHead(r.statusCode, r.headers);
          r.pipe(res);
        },
      );
      upstream.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(upstream);
    },
  );
  gateway.on("upgrade", (req, socket, head) => {
    const upstream = net.connect(backendPort, "127.0.0.1", () => {
      upstream.write(
        `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(
          req.headers,
        )
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n")}\r\n\r\n`,
      );
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    connections.add(upstream);
    connections.add(socket);
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
    socket.on("close", () => {
      upstream.destroy();
      connections.delete(socket);
    });
    upstream.on("close", () => connections.delete(upstream));
  });
  gateway.listen(0, "127.0.0.1");
  await once(gateway, "listening");
  const origin = `https://127.0.0.1:${gateway.address().port}`;
  const { server, wss } = createRangeServer({
    adminToken: "gateway-test",
    publicOrigin: origin,
    requirePhoneToken: true,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  backendPort = server.address().port;
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const host = await context.newPage(),
    phone = await context.newPage();
  try {
    await host.goto(origin + "/#host=gateway-test");
    await host.locator("[data-tab=camera]").click();
    await expect(host.locator("#pairingHelp")).toContainText(
      "six-digit code alone is disabled",
    );
    await expect
      .poll(() => host.locator("#qr").evaluate((img) => img.naturalWidth))
      .toBeGreaterThan(0);
    const link = await host.locator("#phoneLink").getAttribute("href");
    expect(new URL(link).origin).toBe(origin);
    expect(link).toMatch(/&key=[a-f0-9]{48}$/);
    expect(link).not.toContain("gateway-test");
    await phone.addInitScript(() => {
      const Native = window.WebSocket;
      window.WebSocket = class extends Native {
        constructor(...args) {
          super(...args);
          window.pairSocket = this;
        }
      };
    });
    await phone.goto(link);
    await expect(phone.locator("#phoneNotice")).toContainText(
      "Secure phone link loaded",
    );
    expect(new URL(phone.url()).hash).toBe("");
    await phone.locator("#connect").click();
    await expect(host.locator("#connection")).toHaveText(
      "Camera connected · detection not armed",
    );
    for (const ws of wss.clients) ws.terminate();
    await expect(phone.locator("#phoneNotice")).toContainText(
      /Connected|restored/i,
      { timeout: 10000 },
    );
    await expect(host.locator("#connection")).toHaveText(
      "Camera connected · detection not armed",
    );
    await phone.evaluate(() =>
      window.pairSocket.send(JSON.stringify({ type: "ready", ready: true })),
    );
    await expect(host.locator("#connection")).toHaveText("Camera calibrated");
    await phone.evaluate(() =>
      window.pairSocket.send(
        JSON.stringify({
          type: "camera-health",
          trackState: "live",
          visible: true,
          frameAgeMs: 20,
          sourceFPS: 60,
        }),
      ),
    );
    await expect(host.locator("#healthMetrics")).toContainText(
      "Camera heartbeat age",
    );
  } finally {
    await context.close();
    for (const ws of wss.clients) ws.terminate();
    for (const socket of connections) socket.destroy();
    await Promise.all([
      new Promise((r) => server.close(r)),
      new Promise((r) => gateway.close(r)),
    ]);
    rmSync(dir, { recursive: true, force: true });
  }
});
