export const defaultScenario = () => ({
  version: 1,
  name: "First light",
  duration: 30,
  cameraPath: [
    { x: 0, z: 8 },
    { x: 0, z: 5 },
  ],
  cameraMotion: false,
  targets: [
    {
      id: "alpha",
      x: -3,
      z: -7,
      width: 1.3,
      height: 2,
      kind: "shoot",
      start: 0,
      end: 30,
      path: [],
      speed: 1,
    },
    {
      id: "bravo",
      x: 0,
      z: -10,
      width: 1.3,
      height: 2,
      kind: "random",
      start: 2,
      end: 30,
      path: [
        { x: -2, z: -10 },
        { x: 3, z: -10 },
      ],
      speed: 1.5,
    },
    {
      id: "charlie",
      x: 3,
      z: -6,
      width: 1.3,
      height: 2,
      kind: "no-shoot",
      start: 0,
      end: 30,
      path: [],
      speed: 1,
    },
  ],
  barriers: [
    { id: "cover", x: 1.8, z: -4, width: 1.4, height: 1.2, depth: 0.6 },
  ],
});
const finite = (n, min, max) =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;
const point = (p) => p && finite(p.x, -50, 50) && finite(p.z, -50, 20);
export function validateScenario(s) {
  if (
    !s ||
    s.version !== 1 ||
    typeof s.name !== "string" ||
    s.name.length > 100 ||
    !finite(s.duration, 1, 600)
  )
    throw Error("Invalid scenario name, version, or duration (1–600 seconds).");
  if (
    !Array.isArray(s.targets) ||
    s.targets.length > 100 ||
    !Array.isArray(s.barriers) ||
    s.barriers.length > 100 ||
    !Array.isArray(s.cameraPath) ||
    s.cameraPath.length > 100 ||
    s.cameraPath.some((p) => !point(p)) ||
    typeof s.cameraMotion !== "boolean"
  )
    throw Error("Invalid scenario objects or paths.");
  const ids = new Set();
  for (const t of [...s.targets, ...s.barriers]) {
    if (
      !point(t) ||
      typeof t.id !== "string" ||
      t.id.length > 100 ||
      ids.has(t.id) ||
      !finite(t.width, 0.1, 20) ||
      !finite(t.height, 0.1, 10)
    )
      throw Error("Invalid object geometry or duplicate ID.");
    ids.add(t.id);
  }
  for (const t of s.targets)
    if (
      !["shoot", "no-shoot", "random"].includes(t.kind) ||
      !finite(t.start, 0, s.duration) ||
      !finite(t.end, t.start, s.duration) ||
      !finite(t.speed, 0.1, 15) ||
      !Array.isArray(t.path) ||
      t.path.length > 100 ||
      t.path.some((p) => !point(p))
    )
      throw Error("Invalid target timing, type, speed, or path.");
  for (const b of s.barriers)
    if (!finite(b.depth, 0.1, 10)) throw Error("Invalid barrier depth.");
  return structuredClone(s);
}
export function pathPosition(path, distance, pingPong = true) {
  if (!path.length) return null;
  if (path.length === 1) return { ...path[0] };
  const lengths = path
    .slice(1)
    .map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
  const total = lengths.reduce((a, b) => a + b, 0);
  if (total === 0) return { ...path[0] };
  let d = pingPong
    ? Math.abs(((Math.max(0, distance) + total) % (2 * total)) - total)
    : Math.min(total, Math.max(0, distance));
  for (let i = 0; i < lengths.length; i++) {
    if (d <= lengths[i] && lengths[i] > 0) {
      const f = d / lengths[i];
      return {
        x: path[i].x + (path[i + 1].x - path[i].x) * f,
        z: path[i].z + (path[i + 1].z - path[i].z) * f,
      };
    }
    d -= lengths[i];
  }
  return { ...path.at(-1) };
}
export function targetPosition(t, time) {
  return (
    pathPosition(t.path, Math.max(0, time - t.start) * t.speed) || {
      x: t.x,
      z: t.z,
    }
  );
}
export function summarize(shots) {
  const confirmed = shots.filter((s) => s.result !== "review");
  const hits = confirmed.filter((s) => s.result === "hit").length;
  const misses = confirmed.filter((s) => s.result === "miss").length;
  const noShoots = confirmed.filter((s) => s.result === "no-shoot").length;
  const times = confirmed.map((s) => s.time).sort((a, b) => a - b);
  return {
    shots: shots.length,
    hits,
    misses,
    noShoots,
    pending: shots.length - confirmed.length,
    accuracy: confirmed.length
      ? Math.round((hits / confirmed.length) * 100)
      : 0,
    first: times[0] ?? null,
    splits: times.slice(1).map((t, i) => t - times[i]),
  };
}
