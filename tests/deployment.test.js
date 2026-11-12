import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRangeServer } from "../server.js";
import {
  loadDeployment,
  normalizeOrigin,
  persistentAdminToken,
  operatorLink,
} from "../server/deployment.js";
function temporary(t) {
  const dir = mkdtempSync(join(tmpdir(), "range-deploy-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
test("Deployment configuration normalizes origins, applies environment overrides and rejects broken settings", (t) => {
  const root = temporary(t);
  writeFileSync(
    join(root, "range.config.json"),
    JSON.stringify({
      PORT: 9000,
      BIND: "127.0.0.1",
      PUBLIC_ORIGIN: "https://range.example.com/",
      REQUIRE_PHONE_TOKEN: true,
    }),
  );
  const c = loadDeployment(root, { PORT: "9001" });
  assert.equal(c.port, 9001);
  assert.equal(c.bind, "127.0.0.1");
  assert.equal(c.requirePhoneToken, true);
  assert.equal(operatorLink(c, "key"), "https://range.example.com/#host=key");
  assert.equal(
    normalizeOrigin("https://range.example.com:443/"),
    "https://range.example.com",
  );
  for (const url of [
    "ftp://range.test",
    "https://u:p@range.test",
    "https://range.test/path",
    "https://range.test/?x=1",
    "https://range.test/#host=key",
  ])
    assert.throws(() => normalizeOrigin(url));
  for (const env of [
    { PORT: "NaN" },
    { PORT: "0" },
    { PORT: "65536" },
    { TLS_KEY: "key.pem" },
    { REQUIRE_PHONE_TOKEN: "maybe" },
    { ADMIN_TOKEN: "short" },
  ])
    assert.throws(() => loadDeployment(root, env));
});
test("Operator key persists across restarts, uses restricted file permissions and supports explicit rotation", (t) => {
  const root = temporary(t),
    first = persistentAdminToken(root);
  assert.match(first, /^[a-f0-9]{48}$/);
  assert.equal(persistentAdminToken(root), first);
  if (process.platform !== "win32")
    assert.equal(statSync(join(root, "admin-token")).mode & 0o777, 0o600);
  assert.equal(persistentAdminToken(root, "override"), "override");
  assert.equal(readFileSync(join(root, "admin-token"), "utf8"), first);
  rmSync(join(root, "admin-token"));
  assert.notEqual(persistentAdminToken(root), first);
});
test("Portable startup rejects certificates for an old network address and mismatched keys", (t) => {
  const root = temporary(t);
  for (const suffix of ["", "other"])
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        join(root, `key${suffix}.pem`),
        "-out",
        join(root, `cert${suffix}.pem`),
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
      ],
      { stdio: "ignore" },
    );
  const env = {
    TLS_CERT: "cert.pem",
    TLS_KEY: "key.pem",
    PUBLIC_ORIGIN: "https://127.0.0.1:8443",
  };
  assert.ok(loadDeployment(root, env).tls);
  assert.throws(
    () =>
      loadDeployment(root, {
        ...env,
        PUBLIC_ORIGIN: "https://192.168.1.99:8443",
      }),
    /does not cover/,
  );
  assert.throws(
    () => loadDeployment(root, { ...env, TLS_KEY: "keyother.pem" }),
    /do not match/,
  );
});
function receive(ws, type) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off("message", listener);
      reject(Error("Missing " + type));
    }, 2000);
    function listener(raw) {
      const m = JSON.parse(raw);
      if (m.type === type) {
        clearTimeout(timer);
        ws.off("message", listener);
        resolve(m);
      }
    }
    ws.on("message", listener);
  });
}
test("Remote pairing requires a phone-only key, validates public origin and cannot unlock the operator library", async (t) => {
  const { server, wss } = createRangeServer({
    adminToken: "deployment-test",
    publicOrigin: "https://range.example.com/",
    requirePhoneToken: true,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => {
    for (const ws of wss.clients) ws.terminate();
    server.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`,
    wsURL = origin.replace("http", "ws");
  const session = await (
    await fetch(origin + "/api/session", {
      method: "POST",
      headers: { Authorization: "Bearer deployment-test" },
    })
  ).json();
  assert.equal(session.publicOrigin, "https://range.example.com");
  assert.equal(session.requirePhoneToken, true);
  assert.match(session.phoneToken, /^[a-f0-9]{48}$/);
  assert.notEqual(session.phoneToken, session.token);
  async function connect(credentials) {
    const ws = new WebSocket(wsURL, { origin: "https://range.example.com" });
    await once(ws, "open");
    return {
      ws,
      send: () => ws.send(JSON.stringify({ type: "join", ...credentials })),
    };
  }
  const host = await connect({ role: "host", token: session.token });
  let next = receive(host.ws, "joined");
  host.send();
  await next;
  for (const credentials of [
    { role: "phone", code: session.code },
    { role: "phone", code: session.code, phoneToken: "wrong" },
    { role: "host", token: session.phoneToken },
  ]) {
    const bad = await connect(credentials),
      closed = once(bad.ws, "close");
    bad.send();
    assert.equal((await closed)[0], 1008);
  }
  const phone = await connect({
    role: "phone",
    phoneToken: session.phoneToken,
  });
  next = receive(phone.ws, "joined");
  phone.send();
  await next;
  next = receive(host.ws, "shot");
  phone.ws.send(
    JSON.stringify({ type: "shot", x: 0.5, y: 0.4, time: Date.now() }),
  );
  assert.equal((await next).x, 0.5);
  assert.equal(
    (
      await fetch(origin + "/api/library/ranges", {
        headers: { Authorization: `Bearer ${session.phoneToken}` },
      })
    ).status,
    401,
  );
  const evil = new WebSocket(wsURL, { origin: "https://other.example.com" });
  await once(evil, "open");
  assert.equal((await once(evil, "close"))[0], 1008);
});

test("CLI startup and operator-link retrieval reuse the same key and keep private files inaccessible", async (t) => {
  const root = temporary(t);
  const { spawn } = await import("node:child_process");
  const { createServer } = await import("node:net");
  const reserve = createServer();
  reserve.listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((r) => reserve.close(r));
  const env = {
    ...process.env,
    RANGE_CONFIG: join(root, "missing.json"),
    RANGE_DATA_DIR: root,
    PORT: String(port),
    BIND: "127.0.0.1",
    PUBLIC_ORIGIN: "",
    TLS_CERT: "",
    TLS_KEY: "",
    ADMIN_TOKEN: "",
    REQUIRE_PHONE_TOKEN: "false",
  };
  async function start() {
    const child = spawn(process.execPath, ["server.js"], {
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    t.after(() => child.kill());
    const link = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(
        () => reject(Error("CLI startup timeout")),
        5000,
      );
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/Laser Range listening on port \d+\./);
        if (match) {
          clearTimeout(timer);
          assert.ok(!output.includes("#host="));
          assert.ok(
            !output.includes(
              readFileSync(join(root, "admin-token"), "utf8").trim(),
            ),
          );
          resolve(
            execFileSync(process.execPath, ["scripts/host-link.js"], {
              env,
              encoding: "utf8",
            }).trim(),
          );
        }
      });
      child.once("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error("CLI exited before ready: " + code));
      });
    });
    return { child, link };
  }
  let first = await start();
  const origin = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(origin + "/api/health")).status, 200);
  for (const path of [
    "/data/admin-token",
    "/range.config.json",
    "/certs/host-key.pem",
  ])
    assert.equal((await fetch(origin + path)).status, 404);
  const recovered = execFileSync(process.execPath, ["scripts/host-link.js"], {
    env,
    encoding: "utf8",
  }).trim();
  assert.equal(recovered, first.link);
  let closed = once(first.child, "exit");
  first.child.kill("SIGTERM");
  await closed;
  const second = await start();
  assert.equal(second.link, first.link);
  const key = new URLSearchParams(new URL(second.link).hash.slice(1)).get(
    "host",
  );
  assert.equal(
    (
      await fetch(origin + "/api/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}` },
      })
    ).status,
    201,
  );
  closed = once(second.child, "exit");
  second.child.kill("SIGTERM");
  await closed;
});
