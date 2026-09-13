import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRangeServer } from "../server.js";
const receive = (ws, type, predicate = () => true) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.off("message", listen);
      reject(Error(`Timed out: ${type}`));
    }, 2000);
    const listen = (raw) => {
      const m = JSON.parse(raw);
      if (m.type === type && predicate(m)) {
        clearTimeout(timeout);
        ws.off("message", listen);
        resolve(m);
      }
    };
    ws.on("message", listen);
  });
test("Authenticated pairing routes reference frames and shots, isolates sessions, and revokes readiness on disconnect", async (t) => {
  const { server, wss } = createRangeServer({ adminToken: "test-secret" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const ws of wss.clients) ws.terminate();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`,
    wsURL = origin.replace("http", "ws");
  assert.equal(
    (await fetch(`${origin}/api/session`, { method: "POST" })).status,
    401,
  );
  assert.equal(
    (
      await fetch(`${origin}/api/session`, {
        method: "POST",
        headers: { Authorization: "Bearer ééééééééééé" },
      })
    ).status,
    401,
  );
  const r = await fetch(`${origin}/api/session`, {
    method: "POST",
    headers: { Authorization: "Bearer test-secret" },
  });
  assert.equal(r.status, 201);
  const s = await r.json();
  assert.match(s.code, /^\d{6}$/);
  const host = new WebSocket(wsURL, { origin });
  await once(host, "open");
  let next = receive(host, "joined");
  host.send(JSON.stringify({ type: "join", role: "host", token: s.token }));
  await next;
  const phone = new WebSocket(wsURL, { origin });
  await once(phone, "open");
  next = receive(phone, "joined");
  phone.send(JSON.stringify({ type: "join", role: "phone", code: s.code }));
  await next;
  next = receive(host, "phone-status", (m) => m.ready);
  phone.send(JSON.stringify({ type: "ready", ready: true }));
  assert.equal((await next).ready, true);
  next = receive(phone, "reference");
  host.send(
    JSON.stringify({
      type: "reference",
      time: Date.now(),
      image: "data:image/jpeg;base64,AA==",
    }),
  );
  assert.match((await next).image, /^data:/);
  next = receive(host, "shot");
  phone.send(
    JSON.stringify({
      type: "shot",
      x: 0.3,
      y: 0.4,
      time: Date.now(),
      confidence: "high",
    }),
  );
  assert.equal((await next).x, 0.3);
  const evil = new WebSocket(wsURL, { origin: "https://other.example" });
  await once(evil, "open");
  const [closeCode] = await once(evil, "close");
  assert.equal(closeCode, 1008);
  next = receive(host, "phone-status");
  phone.close();
  assert.equal((await next).ready, false);
  assert.equal((await fetch(`${origin}/server.js`)).status, 404);
  assert.match(await (await fetch(origin)).text(), /LASER RANGE/);
});
