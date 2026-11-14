import { chroma } from "./detector.js";
export const responseSteps = [
  "chart-low",
  "chart-mid",
  "chart-high",
  "dark",
  "gray",
  "bright",
];
export function drawResponse(canvas, step) {
  if (!responseSteps.includes(step)) return;
  canvas.width = 960;
  canvas.height = 540;
  const c = canvas.getContext("2d");
  if (step.startsWith("chart")) {
    const level = { "chart-low": 0.25, "chart-mid": 0.55, "chart-high": 1 }[
      step
    ];
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 16; col++) {
        const v = Math.round((255 * level * col) / 15);
        const rgb =
          row === 3 ? [v, v, v] : [0, 0, 0].map((_, i) => (i === row ? v : 0));
        c.fillStyle = `rgb(${rgb.join(",")})`;
        c.fillRect(col * 60, row * 135, 60, 135);
      }
  } else {
    c.fillStyle = { dark: "#202020", gray: "#808080", bright: "#d0d0d0" }[step];
    c.fillRect(0, 0, 960, 540);
    c.strokeStyle = step === "dark" ? "#aaa" : "#333";
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(465, 270);
    c.lineTo(495, 270);
    c.moveTo(480, 255);
    c.lineTo(480, 285);
    c.stroke();
  }
}
export function measureResponse(frames, color) {
  if (frames.length < 12)
    throw Error(
      "Too few camera frames. Keep the phone foregrounded and retry.",
    );
  const noise = [],
    means = [];
  let clipped = 0,
    samples = 0;
  for (let f = 0; f < frames.length; f++) {
    let sum = 0,
      n = 0;
    for (let i = 0; i < frames[f].length; i += 64) {
      const a = frames[f];
      sum += (a[i] + a[i + 1] + a[i + 2]) / 3;
      n++;
      if (Math.max(a[i], a[i + 1], a[i + 2]) >= 250) clipped++;
      samples++;
      if (f)
        noise.push(
          Math.abs(chroma(a, i, color) - chroma(frames[f - 1], i, color)),
        );
    }
    means.push(sum / n);
  }
  noise.sort((a, b) => a - b);
  const drift = Math.max(...means) - Math.min(...means);
  if (drift > 8)
    throw Error(
      "Camera brightness is still changing. Let exposure settle, or adjust camera exposure, then retry.",
    );
  return {
    noise: noise[Math.floor(noise.length * 0.999)] || 0,
    clipped: clipped / samples,
    brightness: means.at(-1),
    drift,
  };
}
export function responseThreshold(measurements) {
  if (!measurements.length) throw Error("No response measurements.");
  // Temporal gate uses 0.6 × threshold; account for that rather than adding a
  // large fixed sensitivity penalty. Never include transitions between steps.
  return Math.max(
    5,
    Math.min(
      180,
      Math.ceil((Math.max(...measurements.map((m) => m.noise)) + 3) / 0.6),
    ),
  );
}

export function lowerExposure(cap, current) {
  if (
    !cap ||
    !Number.isFinite(current) ||
    !Number.isFinite(cap.min) ||
    !Number.isFinite(cap.max) ||
    current <= cap.min
  )
    return null;
  const step = typeof cap.step === "number" && cap.step > 0 ? cap.step : 0.5;
  const decrement = Math.ceil(0.5 / step) * step;
  return Math.max(cap.min, current - decrement);
}
