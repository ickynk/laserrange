import { libraryRequest } from "./server/library.js";
import http from "node:http";
import https from "node:https";
import { readFileSync, createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { WebSocketServer, WebSocket } from "ws";
import QRCode from "qrcode";

const root = dirname(fileURLToPath(import.meta.url));
const json = (res, status, data) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
};
const equal = (a, b) =>
  typeof a === "string" &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const send = (ws, obj) => {
  if (
    ws?.readyState === WebSocket.OPEN &&
    ws.bufferedAmount <
      (["reference", "telemetry"].includes(obj.type) ? 150_000 : 2_000_000)
  )
    ws.send(JSON.stringify(obj));
};
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
};

export function createRangeServer({
  adminToken = randomBytes(24).toString("hex"),
  tls,
  publicOrigin,
  dataDir = resolve(root, "data"),
} = {}) {
  const sessions = new Map();
  const failed = new Map();
  const handler = async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=()");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' https://www.youtube.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self' ws: wss:; frame-src https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'none'",
    );
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/library/")) {
      if (
        !equal(req.headers.authorization?.replace(/^Bearer /, ""), adminToken)
      )
        return json(res, 401, {
          error:
            "Unlock the host with the link printed in the terminal to access saved items.",
        });
      return libraryRequest(req, res, url, dataDir, json);
    }
    if (url.pathname === "/api/health") return json(res, 200, { ok: true });
    if (url.pathname === "/api/session" && req.method === "POST") {
      if (
        !equal(req.headers.authorization?.replace(/^Bearer /, ""), adminToken)
      )
        return json(res, 401, {
          error: "Open the host link printed in the server terminal.",
        });
      if (sessions.size >= 20)
        return json(res, 429, {
          error: "Too many sessions; restart the host server.",
        });
      const id = randomBytes(16).toString("hex");
      let code;
      do {
        code = String(randomInt(100000, 1000000));
      } while ([...sessions.values()].some((s) => s.code === code));
      const token = randomBytes(24).toString("hex");
      sessions.set(id, {
        id,
        code,
        token,
        created: Date.now(),
        host: null,
        phone: null,
        ready: false,
      });
      return json(res, 201, {
        id,
        code,
        token,
        publicOrigin: publicOrigin || null,
      });
    }
    if (url.pathname === "/api/qr") {
      const value = url.searchParams.get("value") || "";
      if (value.length > 2048 || !/^https?:\/\//.test(value))
        return json(res, 400, { error: "Invalid pairing URL" });
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      return res.end(await QRCode.toString(value, { type: "svg" }));
    }
    if (req.method !== "GET")
      return json(res, 405, { error: "Method not allowed" });
    let base = resolve(root, "public");
    let relative = url.pathname;
    if (relative.startsWith("/vendor/three/")) {
      base = resolve(root, "node_modules/three");
      relative = relative.slice("/vendor/three".length);
    }
    if (relative === "/") relative = "/index.html";
    if (relative === "/phone") relative = "/phone.html";
    let file;
    try {
      file = resolve(base, "." + decodeURIComponent(relative));
    } catch {
      return json(res, 400, { error: "Invalid path" });
    }
    if (!file.startsWith(base + sep))
      return json(res, 403, { error: "Forbidden" });
    try {
      const s = await stat(file);
      if (!s.isFile()) throw Error();
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Content-Length": s.size,
      });
      createReadStream(file).pipe(res);
    } catch {
      json(res, 404, { error: "Not found" });
    }
  };
  const server = tls
    ? https.createServer(tls, handler)
    : http.createServer(handler);
  const wss = new WebSocketServer({ server, maxPayload: 400_000 });
  wss.on("connection", (ws, req) => {
    const expectedOrigin =
      publicOrigin || `${tls ? "https" : "http"}://${req.headers.host}`;
    if (req.headers.origin && req.headers.origin !== expectedOrigin) {
      ws.close(1008, "Origin mismatch");
      return;
    }
    let session,
      role,
      tokens = 200,
      windowStart = Date.now();
    const deadline = setTimeout(() => {
      if (!session) ws.close(1008, "Pairing timeout");
    }, 10000);
    ws.on("message", (raw) => {
      const time = Date.now();
      tokens = Math.min(200, tokens + (time - windowStart) * 0.05);
      windowStart = time;
      if (--tokens < 0) return ws.close(1008, "Rate limit");
      let m;
      try {
        m = JSON.parse(raw);
      } catch {
        return ws.close(1008, "Invalid JSON");
      }
      if (!m || typeof m !== "object") return;
      if (!session) {
        if (m.type !== "join") return;
        if (m.role === "host")
          session = [...sessions.values()].find((s) => equal(m.token, s.token));
        else {
          const ip = req.socket.remoteAddress;
          const f = failed.get(ip) || { count: 0, until: Date.now() + 60000 };
          if (Date.now() > f.until) {
            f.count = 0;
            f.until = Date.now() + 60000;
          }
          if (++f.count > 8) {
            failed.set(ip, f);
            return ws.close(1008, "Too many pairing attempts; wait one minute");
          }
          failed.set(ip, f);
          session = [...sessions.values()].find(
            (s) =>
              s.code === m.code &&
              (s.host ||
                (s.detachedAt && Date.now() - s.detachedAt < 120000)) &&
              Date.now() - s.created < 8 * 3600000,
          );
          if (session) failed.delete(ip);
        }
        if (!session) return ws.close(1008, "Invalid pairing credentials");
        role = m.role === "host" ? "host" : "phone";
        const clientId =
          typeof m.clientId === "string" && m.clientId.length <= 100
            ? m.clientId
            : null;
        const sameClient = clientId && session[role + "Id"] === clientId;
        if (session[role] && session[role] !== ws && !sameClient) {
          session = null;
          return ws.close(1008, "This role is already connected");
        }
        const previous = session[role];
        session[role] = ws;
        session[role + "Id"] = clientId;
        if (role === "host") session.detachedAt = null;
        if (previous && previous !== ws)
          previous.close(4001, "Connection replaced");
        clearTimeout(deadline);
        send(ws, {
          type: "joined",
          role,
          hostOnline: !!session.host,
          serverTime: Date.now(),
        });
        if (role === "host") send(session.phone, { type: "host-online" });
        send(session.host, {
          type: "phone-status",
          connected: !!session.phone,
          ready: session.ready,
          sameClient: !!sameClient,
        });
        return;
      }
      if (session[role] !== ws) return;
      if (m.type === "ping" && Number.isFinite(m.clientTime))
        return send(ws, {
          type: "pong",
          clientTime: m.clientTime,
          serverTime: Date.now(),
        });
      if (role === "host") {
        if (
          ["reference", "mode", "pattern", "reset", "zero-status"].includes(
            m.type,
          )
        ) {
          if (
            m.type === "reference" &&
            (typeof m.image !== "string" ||
              !m.image.startsWith("data:image/jpeg;base64,") ||
              m.image.length > 300000 ||
              !Number.isFinite(m.time))
          )
            return;
          send(session.phone, m);
        }
      } else {
        if (
          m.type === "zero-request" &&
          ["start", "apply", "cancel", "clear"].includes(m.action)
        )
          send(session.host, { type: "zero-request", action: m.action });
        if (m.type === "alignment-changed")
          send(session.host, { type: "alignment-changed" });
        if (m.type === "calibration-request" && typeof m.active === "boolean")
          send(session.host, { type: "calibration-request", active: m.active });
        if (m.type === "sensitivity")
          send(session.host, {
            type: "sensitivity",
            active: m.active === true,
          });
        if (m.type === "ready") {
          session.ready = m.ready === true;
          send(session.host, {
            type: "phone-status",
            connected: true,
            ready: session.ready,
          });
        }
        if (
          m.type === "shot" &&
          Number.isFinite(m.x) &&
          Number.isFinite(m.y) &&
          m.x >= 0 &&
          m.x <= 1 &&
          m.y >= 0 &&
          m.y <= 1 &&
          Number.isFinite(m.time) &&
          Math.abs(Date.now() - m.time) < 5000
        ) {
          send(session.host, {
            type: "shot",
            x: m.x,
            y: m.y,
            time: m.time,
            confidence:
              m.confidence === "high" && session.ready ? "high" : "review",
            image:
              typeof m.image === "string" &&
              /^data:image\/jpeg;base64,/.test(m.image) &&
              m.image.length < 300000
                ? m.image
                : null,
          });
        }
        if (m.type === "telemetry")
          send(session.host, {
            type: "telemetry",
            fps: Number(m.fps) || 0,
            referenceAge: Number(m.referenceAge) || 0,
            tests: Number(m.tests) || 0,
            detections: Number(m.detections) || 0,
            adapting: m.adapting === true,
          });
      }
    });
    ws.on("close", () => {
      clearTimeout(deadline);
      if (session?.[role] !== ws) return;
      session[role] = null;
      session.ready = false;
      if (role === "phone")
        send(session.host, {
          type: "phone-status",
          connected: false,
          ready: false,
          reconnecting: true,
        });
      else {
        send(session.phone, { type: "host-offline" });
        session.detachedAt = Date.now();
      }
    });
    ws.on("error", () => {});
  });
  const clean = setInterval(() => {
    for (const [id, s] of sessions)
      if (!s.host && Date.now() - (s.detachedAt || s.created) > 120000) {
        s.phone?.close(1008, "Pairing expired; reconnect to the host");
        sessions.delete(id);
      }
    for (const [ip, f] of failed) if (Date.now() > f.until) failed.delete(ip);
  }, 60000);
  clean.unref();
  server.on("close", () => {
    clearInterval(clean);
    wss.close();
  });
  return { server, adminToken, wss };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = Number(process.env.PORT || 8443);
  const tls =
    process.env.TLS_CERT && process.env.TLS_KEY
      ? {
          cert: readFileSync(process.env.TLS_CERT),
          key: readFileSync(process.env.TLS_KEY),
        }
      : undefined;
  const { server, adminToken } = createRangeServer({
    tls,
    publicOrigin: process.env.PUBLIC_ORIGIN,
    dataDir: process.env.RANGE_DATA_DIR || resolve(root, "data"),
  });
  server.listen(port, process.env.BIND || "0.0.0.0", () => {
    console.log(
      `Laser Range: ${process.env.PUBLIC_ORIGIN || `${tls ? "https" : "http"}://localhost:${port}`}/#host=${adminToken}`,
    );
    if (!tls && !process.env.PUBLIC_ORIGIN?.startsWith("https://"))
      console.log(
        "Desktop demo works now. Phones require trusted HTTPS: see docs/SETUP.md.",
      );
  });
}
