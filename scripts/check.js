import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (["node_modules", ".git"].includes(e.name)) continue;
    const path = join(dir, e.name);
    if (e.isDirectory()) walk(path);
    else if (path.endsWith(".js")) {
      const r = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (r.status) process.exit(r.status);
    }
  }
}
walk(".");
console.log("JavaScript syntax checks passed.");
