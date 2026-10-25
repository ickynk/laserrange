const modes = ["continuous", "manual", "single-shot", "none"];
export const cameraFields = {
  focusMode: { label: "Focus mode", mode: true },
  focusDistance: { label: "Focus distance · m", requires: "focusMode" },
  exposureMode: { label: "Exposure mode", mode: true },
  exposureTime: {
    label: "Exposure time · 100 µs units",
    requires: "exposureMode",
  },
  iso: { label: "ISO", requires: "exposureMode" },
  exposureCompensation: { label: "Exposure compensation · EV" },
  whiteBalanceMode: { label: "White balance mode", mode: true },
  colorTemperature: {
    label: "Color temperature · K",
    requires: "whiteBalanceMode",
  },
};
export function cameraCapabilities(track) {
  let caps = {},
    settings = {};
  try {
    caps = track?.getCapabilities?.() || {};
    settings = track?.getSettings?.() || {};
  } catch {}
  const supported = {};
  for (const [key, field] of Object.entries(cameraFields)) {
    const c = caps[key];
    if (field.mode && Array.isArray(c)) {
      const values = c.filter((v) => modes.includes(v));
      if (values.length) supported[key] = values;
    } else if (
      !field.mode &&
      c &&
      Number.isFinite(c.min) &&
      Number.isFinite(c.max) &&
      c.max > c.min
    ) {
      supported[key] = {
        min: c.min,
        max: c.max,
        step: Number.isFinite(c.step) && c.step > 0 ? c.step : "any",
      };
    }
  }
  return { supported, settings };
}
export async function applyCameraSettings(track, patch) {
  if (track?.readyState !== "live" || !track.applyConstraints)
    throw Error("Enable the camera first.");
  const { supported } = cameraCapabilities(track);
  if (!Object.keys(patch).length)
    throw Error("No supported setting changes selected.");
  for (const [key, value] of Object.entries(patch)) {
    const cap = supported[key];
    if (
      !cap ||
      (Array.isArray(cap)
        ? !cap.includes(value)
        : !Number.isFinite(value) || value < cap.min || value > cap.max)
    )
      throw Error("Unsupported camera setting: " + key);
  }
  await track.applyConstraints({ advanced: [patch] });
  if (track.readyState !== "live")
    throw Error("Camera stopped while applying settings.");
  const settings = track.getSettings?.() || {};
  const unverified = Object.keys(patch).filter((key) => {
    const tolerance =
      typeof supported[key]?.step === "number" ? supported[key].step / 2 : 1e-6;
    return typeof patch[key] === "number"
      ? !Number.isFinite(settings[key]) ||
          Math.abs(settings[key] - patch[key]) > tolerance
      : settings[key] !== patch[key];
  });
  if (unverified.length)
    throw Error(
      "Browser did not confirm " +
        unverified.join(", ") +
        ". Check camera settings before resuming.",
    );
  return settings;
}
export function sanitizeCameraHealth(m) {
  const num = (v, min, max) =>
    typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
      ? v
      : null;
  const settings = {};
  for (const key of Object.keys(cameraFields)) {
    if (cameraFields[key].mode)
      settings[key] = modes.includes(m.settings?.[key])
        ? m.settings[key]
        : null;
    else settings[key] = num(m.settings?.[key], -1000000, 1e9);
  }
  return {
    trackState: ["live", "ended", "none"].includes(m.trackState)
      ? m.trackState
      : "none",
    muted: m.muted === true,
    visible: m.visible === true,
    awake: m.awake === true,
    frameAgeMs: num(m.frameAgeMs, 0, 60000),
    sourceFPS: num(m.sourceFPS, 0, 240),
    settings,
  };
}
export function cameraAdvisory(m) {
  if (!m) return null;
  if (!m.visible)
    return "Phone page is in the background — bring it to the foreground.";
  if (m.trackState !== "live")
    return "Camera is stopped — enable it on the phone and recheck alignment.";
  if (m.muted) return "Camera feed is interrupted — keep the phone foreground.";
  if (m.frameAgeMs === null || m.frameAgeMs > 2500)
    return "Camera frames are stalled — resume the preview on the phone.";
  return null;
}
