export function sanitizeHealth(m) {
  const number = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      ? v
      : null;
  const reasons = {};
  for (const key of [
    "scene change",
    "frame gap",
    "pulse too long",
    "movement",
    "candidate limit",
    "unstable onset",
  ]) {
    const n = number(m.reasons?.[key], 0, 1e9);
    if (n !== null) reasons[key] = n;
  }
  const alignment = ["auto", "manual"].includes(m.alignment?.method)
    ? {
        method: m.alignment.method,
        rms: number(m.alignment.rms, 0, 10000),
        checkError: number(m.alignment.checkError, 0, 10000),
      }
    : null;
  return {
    width: number(m.width, 1, 16000),
    height: number(m.height, 1, 16000),
    color: ["red", "green"].includes(m.color) ? m.color : null,
    threshold: number(m.threshold, 0, 1000),
    brightPercent: number(m.brightPercent, 0, 100),
    darkPercent: number(m.darkPercent, 0, 100),
    candidates: number(m.candidates, 0, 1e9),
    confirmed: number(m.confirmed, 0, 1e9),
    alignment,
    reasons,
  };
}
