import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRangeServer } from "../server.js";
import { defaultScenario } from "../public/core/scenario.js";
test("Host folders require authorization, preserve ranges/images, validate links, and survive restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "range-library-"));
  let server;
  const open = async () => {
    server = createRangeServer({
      adminToken: "test-library",
      dataDir: dir,
    }).server;
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${server.address().port}`;
  };
  let origin = await open();
  const api = (path, method = "GET", body) =>
    fetch(origin + "/api/library/" + path, {
      method,
      headers: {
        Authorization: "Bearer test-library",
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  try {
    assert.equal((await fetch(origin + "/api/library/ranges")).status, 401);
    const s = defaultScenario();
    s.targets[0].image = "data:image/jpeg;base64,AAAA";
    s.targets[0].rotation = 45;
    const saved = await (
      await api("ranges", "POST", { name: "../Friendly range", scenario: s })
    ).json();
    assert.ok(saved.id);
    assert.equal((await (await api("ranges")).json()).items.length, 1);
    assert.deepEqual(
      (await (await api("ranges/" + saved.id)).json()).scenario,
      s,
    );
    assert.equal(
      (await api("videos", "POST", { name: "bad", url: "javascript:alert(1)" }))
        .status,
      400,
    );
    const video = await (
      await api("videos", "POST", {
        name: "Clip",
        url: "https://youtu.be/abcdefghijk",
      })
    ).json();
    assert.equal(video.url, "https://www.youtube.com/watch?v=abcdefghijk");
    await new Promise((r) => server.close(r));
    origin = await open();
    assert.equal((await (await api("ranges")).json()).items.length, 1);
    assert.equal((await api("ranges/" + saved.id, "DELETE")).status, 200);
    assert.equal((await api("ranges/" + saved.id)).status, 404);
    assert.equal(
      (await api("ranges", "POST", { name: "bad", scenario: {} })).status,
      400,
    );
  } finally {
    await new Promise((r) => server.close(r));
    await rm(dir, { recursive: true, force: true });
  }
});
