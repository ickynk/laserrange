import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, X509Certificate, createPrivateKey } from "node:crypto";
import { networkInterfaces } from "node:os";

export function normalizeOrigin(value) {
  if (!value) return undefined;
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "PUBLIC_ORIGIN must be an http(s) origin without a path, credentials, query or fragment.",
    );
  return url.origin;
}
export function lanAddresses() {
  return Object.entries(networkInterfaces()).flatMap(([name, rows]) =>
    rows
      .filter((r) => r.family === "IPv4" && !r.internal)
      .map((r) => ({ name, address: r.address })),
  );
}
export function loadDeployment(root, env = process.env) {
  const path = resolve(root, env.RANGE_CONFIG || "range.config.json");
  const saved = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const get = (key, fallback) => env[key] ?? saved[key] ?? fallback;
  const port = Number(get("PORT", 8443));
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw Error("PORT must be 1–65535.");
  const publicOrigin = normalizeOrigin(get("PUBLIC_ORIGIN", ""));
  const cert = get("TLS_CERT", ""),
    key = get("TLS_KEY", "");
  if (!!cert !== !!key) throw Error("Set both TLS_CERT and TLS_KEY.");
  const tls = cert
    ? {
        cert: readFileSync(resolve(root, cert)),
        key: readFileSync(resolve(root, key)),
      }
    : undefined;
  if (tls) {
    const certificate = new X509Certificate(tls.cert);
    if (!certificate.checkPrivateKey(createPrivateKey(tls.key)))
      throw Error("TLS certificate and private key do not match.");
    if (
      Date.parse(certificate.validTo) <= Date.now() ||
      Date.parse(certificate.validFrom) > Date.now()
    )
      throw Error(
        "TLS certificate is expired or not yet valid; run setup again.",
      );
    if (publicOrigin) {
      const hostname = new URL(publicOrigin).hostname.replace(/^\[|\]$/g, "");
      const matches =
        hostname.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(hostname)
          ? certificate.checkIP(hostname)
          : certificate.checkHost(hostname);
      if (!matches)
        throw Error(
          "TLS certificate does not cover PUBLIC_ORIGIN; run setup again for this address.",
        );
    }
  }
  if (tls && publicOrigin && !publicOrigin.startsWith("https://"))
    throw Error("A TLS server requires an HTTPS PUBLIC_ORIGIN.");
  const pairing = String(get("REQUIRE_PHONE_TOKEN", "false"));
  if (!["true", "false"].includes(pairing))
    throw Error("REQUIRE_PHONE_TOKEN must be true or false.");
  if (pairing === "true" && !publicOrigin?.startsWith("https://"))
    throw Error("Key-required deployment needs an HTTPS PUBLIC_ORIGIN.");
  const adminToken = get("ADMIN_TOKEN", "");
  if (adminToken && !/^[A-Za-z0-9_-]{32,128}$/.test(adminToken))
    throw Error(
      "ADMIN_TOKEN must contain 32–128 URL-safe letters, digits, underscores or hyphens.",
    );
  return {
    port,
    bind: get("BIND", "0.0.0.0"),
    publicOrigin,
    tls,
    adminToken,
    requirePhoneToken: pairing === "true",
    dataDir: resolve(root, get("RANGE_DATA_DIR", "data")),
  };
}
export function persistentAdminToken(dataDir, supplied) {
  if (supplied) return supplied;
  mkdirSync(dataDir, { recursive: true });
  const path = resolve(dataDir, "admin-token");
  try {
    writeFileSync(path, randomBytes(24).toString("hex"), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
  }
  const token = readFileSync(path, "utf8").trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token))
    throw Error(
      "Invalid data/admin-token. Restore it or remove it while stopped to generate a new operator key.",
    );
  return token;
}
export function operatorLink(config, token) {
  return `${config.publicOrigin || `${config.tls ? "https" : "http"}://localhost:${config.port}`}/#host=${token}`;
}
