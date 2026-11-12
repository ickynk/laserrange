import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createRangeServer } from "../server.js";

test("QR generation authenticates the operator session and keeps pairing secrets out of request URLs", async (t) => {
  const { server, wss } = createRangeServer({ adminToken: "privacy-test-key" });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const socket of wss.clients) socket.terminate();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const session = await (
    await fetch(origin + "/api/session", {
      method: "POST",
      headers: { Authorization: "Bearer privacy-test-key" },
    })
  ).json();
  const phoneLink = `${origin}/phone#code=${session.code}&key=${session.phoneToken}`;
  const request = (token) => ({
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: phoneLink,
  });
  assert.equal((await fetch(origin + "/api/qr")).status, 405);
  assert.equal((await fetch(origin + "/api/qr", request("wrong"))).status, 401);
  assert.equal(
    (await fetch(origin + "/api/qr", request(session.phoneToken))).status,
    401,
  );
  const response = await fetch(origin + "/api/qr", request(session.token));
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /image\/svg\+xml/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(await response.text(), /<svg/);
  assert.equal(
    (
      await fetch(origin + "/api/qr", {
        ...request(session.token),
        body: "x".repeat(5000),
      })
    ).status,
    413,
  );
  for (const body of [
    "javascript:alert(1)",
    "https://user:password@example.com/",
  ])
    assert.equal(
      (await fetch(origin + "/api/qr", { ...request(session.token), body }))
        .status,
      400,
    );
});
