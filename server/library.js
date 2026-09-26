import {
  mkdir,
  readdir,
  readFile,
  writeFile,
  rename,
  unlink,
} from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateScenario } from "../public/core/scenario.js";
export function videoLink(value) {
  const u = new URL(value);
  if (!["https:", "http:"].includes(u.protocol))
    throw Error("Use a YouTube link.");
  const id =
    u.hostname === "youtu.be"
      ? u.pathname.slice(1)
      : ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
        ? u.searchParams.get("v") || u.pathname.split("/").at(-1)
        : "";
  if (!/^[\w-]{11}$/.test(id)) throw Error("Use a valid YouTube video link.");
  return `https://www.youtube.com/watch?v=${id}`;
}
export async function libraryRequest(req, res, url, root, json) {
  try {
    const match = url.pathname.match(
      /^\/api\/library\/(ranges|videos)(?:\/([0-9a-f-]{36}))?$/,
    );
    if (!match) return json(res, 404, { error: "Unknown library path." });
    const [, kind, id] = match,
      dir = join(root, kind);
    await mkdir(dir, { recursive: true });
    if (req.method === "GET") {
      if (id)
        return json(
          res,
          200,
          JSON.parse(await readFile(join(dir, id + ".json"), "utf8")),
        );
      const items = [];
      for (const file of (await readdir(dir)).filter((f) =>
        /^[0-9a-f-]{36}\.json$/.test(f),
      )) {
        try {
          const entry = JSON.parse(await readFile(join(dir, file), "utf8"));
          items.push({
            id: file.slice(0, -5),
            name: entry.name,
            updated: entry.updated,
          });
        } catch {}
      }
      return json(res, 200, {
        items: items.sort((a, b) => b.updated.localeCompare(a.updated)),
      });
    }
    if (req.method === "DELETE" && id) {
      await unlink(join(dir, id + ".json"));
      return json(res, 200, { ok: true });
    }
    if (req.method !== "POST" || id)
      return json(res, 405, { error: "Method not allowed." });
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 10000000) {
        json(res, 413, { error: "Range exceeds 10 MB." });
        return;
      }
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const name = String(body.name || "").trim();
    if (!name || name.length > 100)
      throw Error("Enter a name up to 100 characters.");
    const entry = {
      name,
      updated: new Date().toISOString(),
      ...(kind === "ranges"
        ? { scenario: validateScenario(body.scenario) }
        : { url: videoLink(body.url) }),
    };
    const key = randomUUID(),
      file = join(dir, key + ".json"),
      temp = file + ".tmp";
    try {
      await writeFile(temp, JSON.stringify(entry, null, 2), { flag: "wx" });
      await rename(temp, file);
    } finally {
      await unlink(temp).catch(() => {});
    }
    return json(res, 201, { id: key, ...entry });
  } catch (e) {
    return json(res, e.code === "ENOENT" ? 404 : 400, {
      error: e.code === "ENOENT" ? "Saved item not found." : e.message,
    });
  }
}
