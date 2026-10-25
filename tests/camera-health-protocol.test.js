import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRangeServer } from "../server.js";
const receive = (ws, type) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", listen);
      reject(Error("Missing " + type));
    }, 2000);
    function listen(raw) {
      const m = JSON.parse(raw);
      if (m.type === type) {
        clearTimeout(timer);
        ws.off("message", listen);
        resolve(m);
      }
    }
    ws.on("message", listen);
  });
test("Camera recovery protocol validates commands and strips private or unknown fields", async (t) => {
  const { server, wss } = createRangeServer({ adminToken: "voice-only-test" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const ws of wss.clients) ws.terminate();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = await (
    await fetch(origin + "/api/session", {
      method: "POST",
      headers: { Authorization: "Bearer voice-only-test" },
    })
  ).json();
  const host = new WebSocket(origin.replace("http", "ws"));
  await once(host, "open");
  let joined = receive(host, "joined");
  host.send(
    JSON.stringify({ type: "join", role: "host", token: session.token }),
  );
  await joined;
  const phone = new WebSocket(origin.replace("http", "ws"));
  await once(phone, "open");
  joined = receive(phone, "joined");
  phone.send(
    JSON.stringify({ type: "join", role: "phone", code: session.code }),
  );
  await joined;
  const commands = [];
  phone.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "camera-control") commands.push(m);
  });
  const good = {
    type: "camera-control",
    action: "refresh",
    id: "one",
    time: Date.now(),
  };
  for (const bad of [
    { action: "restart" },
    { time: Date.now() - 5000 },
    { id: 99 },
  ])
    host.send(JSON.stringify({ ...good, ...bad }));
  const routed = receive(phone, "camera-control");
  host.send(JSON.stringify({ ...good, privateData: "not forwarded" }));
  assert.deepEqual(await routed, good);
  assert.equal(commands.length, 1);
  const ack = receive(host, "camera-control-result");
  phone.send(
    JSON.stringify({
      type: "camera-control-result",
      id: "one",
      accepted: true,
      message: "Refreshing",
      privateData: "not forwarded",
    }),
  );
  assert.deepEqual(await ack, {
    type: "camera-control-result",
    id: "one",
    accepted: true,
    message: "Refreshing",
  });
  const throttled = receive(host, "camera-control-result");
  host.send(JSON.stringify({ ...good, id: "too-soon", time: Date.now() }));
  const rejection = await throttled;
  assert.equal(rejection.id, "too-soon");
  assert.equal(rejection.accepted, false);
  assert.match(rejection.message, /Wait briefly/);
  assert.equal(commands.length, 1);
  const health = receive(host, "camera-health");
  phone.send(
    JSON.stringify({
      type: "camera-health",
      trackState: "live",
      visible: true,
      frameAgeMs: 10,
      settings: { deviceId: "private", focusMode: "continuous" },
    }),
  );
  const report = await health;
  assert.equal(report.settings.deviceId, undefined);
  assert.equal(report.settings.focusMode, "continuous");
});
