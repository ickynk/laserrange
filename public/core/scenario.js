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
  if (
    !finite(s.cameraHeight ?? 1.65, 0.3, 3) ||
    !finite(s.cameraFov ?? 55, 25, 100) ||
    !finite(s.cameraFocusBlend ?? 1, 0, 5)
  )
    throw Error("Invalid camera POV settings.");
  if (
    s.cameraSegments !== undefined &&
    (!Array.isArray(s.cameraSegments) ||
      s.cameraSegments.length > Math.max(0, s.cameraPath.length - 1))
  )
    throw Error("Invalid camera segments.");
  for (const segment of s.cameraSegments || [])
    if (
      !segment ||
      typeof segment !== "object" ||
      Array.isArray(segment) ||
      (segment.focus !== undefined &&
        (!point(segment.focus) || !finite(segment.focus.y ?? 1.4, 0, 10)))
    )
      throw Error("Invalid camera focus point.");
  let imageBytes = 0;
  for (const t of s.targets) {
    if (!finite(t.rotation ?? 0, -180, 180))
      throw Error("Invalid target rotation.");
    if (t.image !== undefined) {
      if (
        typeof t.image !== "string" ||
        !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          t.image,
        ) ||
        t.image.length > 400000
      )
        throw Error("Invalid target image (maximum 400 KB).");
      imageBytes += t.image.length;
    }
  }
  if (imageBytes > 8000000) throw Error("Target images exceed 8 MB per range.");
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
  if (
    !finite(s.cameraSpeed ?? 0.6, 0.1, 15) ||
    !finite(s.cameraHeading ?? 0, -180, 180) ||
    !["fixed", "path"].includes(s.cameraHeadingMode ?? "fixed")
  )
    throw Error("Invalid camera movement settings.");
  for (const t of s.targets) {
    if (
      !targetAssets.includes(t.asset ?? "silhouette") ||
      !["linear", "smooth"].includes(t.easing ?? "linear")
    )
      throw Error("Invalid target asset/easing.");
    if (
      !finite(t.repeatEvery ?? 0, 0, 600) ||
      (t.repeatEvery &&
        !finite(t.visibleFor ?? t.repeatEvery, 0.1, t.repeatEvery))
    )
      throw Error("Repeat visibility must fit within the repeat interval.");
    if (
      t.zones !== undefined &&
      (!Array.isArray(t.zones) || t.zones.length > 12)
    )
      throw Error("At most 12 scoring zones per target.");
    for (const z of t.zones || []) {
      if (
        !z ||
        typeof z.name !== "string" ||
        !z.name.trim() ||
        z.name.length > 30 ||
        !["rectangle", "ellipse"].includes(z.shape) ||
        !finite(z.x, 0, 1) ||
        !finite(z.y, 0, 1) ||
        !finite(z.width, 0.02, 1) ||
        !finite(z.height, 0.02, 1) ||
        z.x - z.width / 2 < -1e-8 ||
        z.x + z.width / 2 > 1 + 1e-8 ||
        z.y - z.height / 2 < -1e-8 ||
        z.y + z.height / 2 > 1 + 1e-8 ||
        !finite(z.points, 0, 100)
      )
        throw Error("Invalid scoring zone: keep it inside the target.");
    }
  }
  for (const b of s.barriers)
    if (
      !barrierAssets.includes(b.asset ?? "block") ||
      !finite(b.rotation ?? 0, -180, 180)
    )
      throw Error("Invalid barrier asset/rotation.");
  if (
    s.session !== undefined &&
    (!s.session || typeof s.session !== "object" || Array.isArray(s.session))
  )
    throw Error("Invalid session settings.");
  const o = s.session || {};
  if (
    !finite(o.countdown ?? 0, 0, 15) ||
    typeof (o.beep ?? true) !== "boolean" ||
    !finite(o.frequency ?? 880, 200, 2000) ||
    !finite(o.volume ?? 0.08, 0, 0.3) ||
    !finite(o.beepDuration ?? 0.12, 0.05, 1)
  )
    throw Error("Invalid countdown/audio settings.");
  return structuredClone(s);
}
export function pathPosition(
  path,
  distance,
  pingPong = true,
  easing = "linear",
) {
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
      let f = d / lengths[i];
      if (easing === "smooth") f = f * f * (3 - 2 * f);
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
    pathPosition(
      t.path,
      Math.max(0, time - t.start) * t.speed,
      true,
      t.easing,
    ) || {
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
    points: confirmed.reduce(
      (sum, s) => sum + (s.result === "hit" ? (s.points ?? 1) : 0),
      0,
    ),
    zones: confirmed
      .filter((s) => s.result === "hit" && s.zone)
      .reduce((out, s) => ({ ...out, [s.zone]: (out[s.zone] || 0) + 1 }), {}),
    accuracy: confirmed.length
      ? Math.round((hits / confirmed.length) * 100)
      : 0,
    first: times[0] ?? null,
    splits: times.slice(1).map((t, i) => t - times[i]),
  };
}

export const barrierAssets = [
  "block",
  "car",
  "pillar",
  "fence",
  "window",
  "highway",
  "wall",
  "door",
  "drum",
  "ports",
];
export const targetAssets = [
  "silhouette",
  "cardboard",
  "bullseye",
  "mannequin",
];
export function targetActive(t, time) {
  if (time < t.start || time >= t.end) return false;
  if (!t.repeatEvery) return true;
  return (time - t.start) % t.repeatEvery < (t.visibleFor ?? t.repeatEvery);
}
export function zoneScore(target, local) {
  for (const z of target.zones || []) {
    const dx = (local.x - z.x) / (z.width / 2),
      dy = (local.y - z.y) / (z.height / 2);
    if (
      z.shape === "ellipse"
        ? dx * dx + dy * dy <= 1
        : Math.abs(dx) <= 1 && Math.abs(dy) <= 1
    )
      return { zone: z.name, points: z.points };
  }
  return { zone: null, points: target.zones?.length ? 0 : 1 };
}
export function compareSessions(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    // Exact scenario/settings and input mode must match for an honest comparison.
    const key = JSON.stringify([s.scenarioKey, s.mode, s.demo, s.shooter]);
    if (!groups.has(key))
      groups.set(key, {
        shooter: s.shooter,
        scenarioKey: s.scenarioKey,
        scenario: s.scenarioName,
        mode: s.mode,
        demo: s.demo,
        runs: 0,
        shots: [],
        summaries: [],
      });
    const g = groups.get(key);
    g.runs++;
    g.shots.push(...s.shots);
    g.summaries.push(summarize(s.shots));
  }
  return [...groups.values()].map((g) => {
    const stats = summarize(g.shots),
      firsts = g.summaries.map((s) => s.first).filter((t) => t !== null);
    const splits = g.summaries.flatMap((s) => s.splits);
    return {
      ...g,
      ...stats,
      averageFirst: firsts.length
        ? firsts.reduce((a, b) => a + b, 0) / firsts.length
        : null,
      averageSplit: splits.length
        ? splits.reduce((a, b) => a + b, 0) / splits.length
        : null,
      bestPoints: Math.max(...g.summaries.map((s) => s.points)),
    };
  });
}
