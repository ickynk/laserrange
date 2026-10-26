import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  lanAddresses,
  normalizeOrigin,
  loadDeployment,
} from "../server/deployment.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rl = createInterface({ input: stdin, output: stdout });
const ask = async (question, fallback = "") =>
  (
    await rl.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)
  ).trim() || fallback;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0)
    throw Error(
      `${command} failed. Install mkcert first, then rerun setup. See docs/DEPLOYMENT.md.`,
    );
}
try {
  console.log(
    "Laser Range setup\n1. Portable LAN with trusted HTTPS\n2. Home server behind an existing HTTPS proxy/tunnel\n3. Computer-only demo",
  );
  const mode = await ask("Choose mode", "1");
  if (!["1", "2", "3"].includes(mode)) throw Error("Choose 1, 2 or 3.");
  const path = resolve(root, "range.config.json");
  if (
    existsSync(path) &&
    (
      await ask("Replace the saved deployment configuration? yes/no", "no")
    ).toLowerCase() !== "yes"
  ) {
    console.log("Existing configuration kept.");
  } else {
    const config = {
      PORT: 8443,
      BIND: "0.0.0.0",
      RANGE_DATA_DIR: "data",
      REQUIRE_PHONE_TOKEN: false,
    };
    if (mode === "1") {
      const addresses = lanAddresses();
      console.log(
        "Detected network addresses:\n" +
          addresses.map((r) => `  ${r.address} (${r.name})`).join("\n"),
      );
      const address = await ask(
        "Phone-reachable IPv4 address",
        addresses[0]?.address || "",
      );
      if (
        !/^\d{1,3}(\.\d{1,3}){3}$/.test(address) ||
        address.split(".").some((n) => Number(n) > 255) ||
        address.startsWith("127.") ||
        address === "0.0.0.0"
      )
        throw Error("Enter the host computer LAN IPv4 address.");
      config.PUBLIC_ORIGIN = normalizeOrigin(`https://${address}:8443`);
      config.TLS_CERT = "certs/host.pem";
      config.TLS_KEY = "certs/host-key.pem";
      if (
        (
          await ask(
            "Generate/update certificates with installed mkcert? yes/no",
            "yes",
          )
        ).toLowerCase() === "yes"
      ) {
        run("mkcert", ["-install"]);
        mkdirSync(resolve(root, "certs"), { recursive: true });
        run("mkcert", [
          "-cert-file",
          config.TLS_CERT,
          "-key-file",
          config.TLS_KEY,
          "localhost",
          "127.0.0.1",
          address,
        ]);
        console.log(
          "Install ONLY rootCA.pem on the phone; on iPhone also enable full certificate trust. Never share rootCA-key.pem. CA folder:",
        );
        run("mkcert", ["-CAROOT"]);
      }
      if (
        !existsSync(resolve(root, config.TLS_CERT)) ||
        !existsSync(resolve(root, config.TLS_KEY))
      )
        throw Error(
          "Certificate files are missing. See docs/DEPLOYMENT.md and rerun setup.",
        );
    } else if (mode === "2") {
      config.PUBLIC_ORIGIN = normalizeOrigin(
        await ask("Public HTTPS origin, e.g. https://range.example.com"),
      );
      if (!config.PUBLIC_ORIGIN?.startsWith("https://"))
        throw Error("Remote access requires an HTTPS origin.");
      config.BIND = "127.0.0.1";
      config.REQUIRE_PHONE_TOKEN = true;
      console.log(
        "Point your HTTPS proxy/tunnel at http://127.0.0.1:8443 with WebSocket support. Use the public URL on both devices.",
      );
    } else config.BIND = "127.0.0.1";
    // Validate before replacing an existing configuration (including certificate coverage).
    const temporary = resolve(root, "range.config.pending.json");
    try {
      writeFileSync(temporary, JSON.stringify(config, null, 2) + "\n", {
        mode: 0o600,
      });
      loadDeployment(root, { RANGE_CONFIG: temporary });
      writeFileSync(path, readFileSync(temporary), { mode: 0o600 });
    } finally {
      const { rmSync } = await import("node:fs");
      rmSync(temporary, { force: true });
    }
    console.log(
      "Saved. Run npm start or use the Start Laser Range launcher. Keep its window open.",
    );
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  rl.close();
}
