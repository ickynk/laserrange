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
test("Paired voice protocol rejects unknown/stale/malformed commands and strips non-command data", async (t) => {
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
  host.on("message", (raw) => {
    const m = JSON.parse(raw);
    if (m.type === "voice-command") commands.push(m);
  });
  const good = {
    type: "voice-command",
    command: "cover",
    id: "one",
    time: Date.now(),
    runId: 123,
  };
  for (const bad of [
    { command: "start" },
    { time: Date.now() - 5000 },
    { id: 99 },
    { runId: "old" },
  ])
    phone.send(JSON.stringify({ ...good, ...bad }));
  const incoming = receive(host, "voice-command");
  phone.send(
    JSON.stringify({
      ...good,
      audio: "not-forwarded",
      transcript: "not-forwarded",
    }),
  );
  const routed = await incoming;
  assert.deepEqual(routed, good);
  assert.equal(commands.length, 1);
  const state = receive(phone, "voice-state");
  host.send(JSON.stringify({ type: "voice-state", runId: 123 }));
  assert.equal((await state).runId, 123);
});
