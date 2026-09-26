// Deterministic by elapsed time: playback, scoring and projector use identical poses.
const smooth = (x) => x * x * (3 - 2 * x);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerpAngle = (a, b, t) =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
export function cameraPose(s, time) {
  const path = s.cameraPath || [],
    height = s.cameraHeight ?? 1.65;
  const lengths = path
    .slice(1)
    .map((p, i) => Math.hypot(p.x - path[i].x, p.z - path[i].z));
  const total = lengths.reduce((a, b) => a + b, 0),
    speed = s.cameraSpeed ?? 0.6;
  let distance = clamp(time * speed, 0, total),
    index = 0,
    start = 0;
  while (index < lengths.length - 1 && distance > start + lengths[index])
    start += lengths[index++];
  const a = path[index],
    b = path[index + 1],
    f = lengths[index] ? clamp((distance - start) / lengths[index], 0, 1) : 0;
  const p =
    s.cameraMotion && a
      ? {
          x: a.x + ((b?.x ?? a.x) - a.x) * f,
          z: a.z + ((b?.z ?? a.z) - a.z) * f,
        }
      : { x: 0, z: 8 };
  const orientation = (i) => {
    const focus = s.cameraSegments?.[i]?.focus;
    if (s.cameraMotion && focus) {
      const dx = focus.x - p.x,
        dz = focus.z - p.z;
      return {
        yaw: Math.atan2(dx, -dz),
        pitch: Math.atan2(
          (focus.y ?? 1.4) - height,
          Math.max(0.01, Math.hypot(dx, dz)),
        ),
      };
    }
    let yaw = ((s.cameraHeading ?? 0) * Math.PI) / 180;
    if (s.cameraMotion && s.cameraHeadingMode === "path") {
      let j = clamp(i, 0, Math.max(0, lengths.length - 1));
      while (j > 0 && !lengths[j]) j--;
      if (lengths[j])
        yaw += Math.atan2(
          path[j + 1].x - path[j].x,
          -(path[j + 1].z - path[j].z),
        );
    }
    return { yaw, pitch: Math.atan2(1.4 - height, 20) };
  };
  let view = orientation(index);
  if (s.cameraMotion && (s.cameraFocusBlend ?? 1) > 0) {
    let boundary = 0;
    for (let i = 0; i < lengths.length - 1; i++) {
      boundary += lengths[i];
      const seconds = (s.cameraFocusBlend ?? 1) * speed;
      // At a held endpoint keep the completed segment's focus; begin the turn
      // only when the shooter advances into the next segment.
      const half = Math.min(seconds / 2, lengths[i] / 2, lengths[i + 1] / 2);
      const begin = s.pauseAtSegments ? boundary : boundary - half;
      const end = s.pauseAtSegments
        ? boundary + Math.min(seconds, lengths[i + 1])
        : boundary + half;
      if (end > begin && distance >= begin && distance <= end) {
        const t = smooth((distance - begin) / (end - begin)),
          u = orientation(i),
          v = orientation(i + 1);
        view = {
          yaw: lerpAngle(u.yaw, v.yaw, t),
          pitch: u.pitch + (v.pitch - u.pitch) * t,
        };
        break;
      }
    }
  }
  return { ...p, y: height, ...view, fov: s.cameraFov ?? 55, segment: index };
}
