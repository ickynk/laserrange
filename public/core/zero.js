// Screen-coordinate correction only; never changes camera alignment or device settings.
export function calculateZero(samples) {
  if (
    samples.length !== 5 ||
    samples.some((p) => ![p.x, p.y].every(Number.isFinite))
  )
    throw Error("Five valid shots required.");
  const mean = {
    x: samples.reduce((s, p) => s + p.x, 0) / 5,
    y: samples.reduce((s, p) => s + p.y, 0) / 5,
  };
  const spread = Math.max(
    ...samples.map((p) => Math.hypot(p.x - mean.x, p.y - mean.y)),
  );
  if (spread > 0.02)
    throw Error(
      "Group is too spread out. Retry five strikes on the center mark.",
    );
  const correction = { x: 0.5 - mean.x, y: 0.5 - mean.y };
  if (Math.abs(correction.x) > 0.05 || Math.abs(correction.y) > 0.05)
    throw Error(
      "Offset exceeds 5% of the screen. Recheck alignment before zeroing.",
    );
  return { ...correction, spread };
}
export function applyZero(shot, zero) {
  if (!zero) return shot;
  return {
    ...shot,
    rawX: shot.x,
    rawY: shot.y,
    x: shot.x + zero.x,
    y: shot.y + zero.y,
    zero: { x: zero.x, y: zero.y },
  };
}
export function outsideScreen(shot) {
  return shot.x < 0 || shot.x > 1 || shot.y < 0 || shot.y > 1;
}
