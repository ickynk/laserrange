import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
function run(command, args, shell = false) {
  const child = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell,
  });
  if (child.error || child.status !== 0) {
    console.error(
      child.error?.message || "Startup stopped. Review the message above.",
    );
    process.exit(child.status || 1);
  }
}
if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error("Install Node.js 22 or newer, then reopen this launcher.");
  process.exit(1);
}
if (!existsSync(resolve(root, "node_modules/ws/package.json"))) {
  console.log("Installing dependencies (internet required on first use)…");
  run(
    process.platform === "win32" ? "npm.cmd" : "npm",
    ["ci"],
    process.platform === "win32",
  );
}
if (!existsSync(resolve(root, "range.config.json")))
  run(process.execPath, ["scripts/setup.js"]);
run(process.execPath, ["scripts/host-link.js"]);
run(process.execPath, ["server.js"]);
