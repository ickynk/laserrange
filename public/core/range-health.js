// Measurement-only helpers. None of these values adjust detection/calibration.
export const testPoints = [0.15, 0.5, 0.85].flatMap((y) =>
  [0.15, 0.5, 0.85].map((x) => ({ x, y })),
);
export const voiceSequence = ["moving", "cover", "retrograde"];
const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((a, b) => a - b);
  return s.length % 2
    ? s[(s.length - 1) / 2]
    : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
export function healthStatus(sample, receivedAt, now, state) {
  if (!state.connected) return "Phone disconnected — pair or reconnect.";
  if (!sample || now - receivedAt > 4000)
    return "Telemetry stale — keep the phone foreground and check the connection.";
  if (!state.ready)
    return "Detection not armed — complete calibration and the pulse check.";
  if (state.adjusting) return "Sensitivity settling — hold fire.";
  if (sample.fps < 15)
    return "Low processing FPS — short pulses may be missed.";
  if (state.mode !== "youtube" && sample.referenceAge > 400)
    return "Source frames delayed/unavailable — review moving-target timing.";
  return state.mode === "youtube"
    ? "Live telemetry · YouTube uses camera-only detection."
    : "Live telemetry · accuracy still requires measurement.";
}
export class HardwareTest {
  constructor(kind, { time, expected = 100, seconds = 60, config = {} }) {
    if (!["placement", "pulses", "idle", "voice"].includes(kind))
      throw Error("Unknown test");
    if (
      !Number.isInteger(expected) ||
      expected < 1 ||
      expected > 1000 ||
      !Number.isFinite(seconds) ||
      seconds < 10 ||
      seconds > 600
    )
      throw Error("Use 1–1000 pulses and 10–600 seconds.");
    Object.assign(this, {
      kind,
      started: time,
      expected,
      seconds,
      config,
      point: 0,
      count: 0,
      high: 0,
      review: 0,
      active: true,
      voiceStep: 0,
      unheard: 0,
    });
    this.readyAt = time + 1500;
    this.samples = testPoints.map(() => []);
    this.fps = [];
    this.references = [];
    this.voices = [];
    this.pending = new Map();
  }
  shot(raw, corrected, time) {
    if (
      !this.active ||
      time < this.readyAt ||
      raw.time < this.readyAt ||
      this.kind === "voice"
    )
      return false;
    this.count++;
    if (raw.confidence === "high") this.high++;
    else this.review++;
    if (this.kind === "placement" && this.samples[this.point].length < 100)
      this.samples[this.point].push({
        raw: { x: raw.x, y: raw.y },
        corrected: { x: corrected.x, y: corrected.y },
      });
    return true;
  }
  next(time) {
    if (this.point >= 8) return false;
    this.point++;
    this.readyAt = time + 1500;
    return true;
  }
  telemetry(m) {
    if (this.active && this.fps.length < 700) {
      this.fps.push(m.fps);
      if (m.referenceAge < 9999) this.references.push(m.referenceAge);
    }
  }
  voice(m) {
    if (this.active && this.kind === "voice" && this.pending.size < 100)
      this.pending.set(m.id, m);
  }
  voiceResult(id, result, time) {
    const request = this.pending.get(id);
    if (!this.active || !request) return;
    this.pending.delete(id);
    this.voices.push({
      command: request.command,
      accepted: !!result.accepted,
      message: result.message,
      deliveryMs: Math.max(0, time - request.time),
    });
    if (result.accepted && request.command === voiceSequence[this.voiceStep])
      this.voiceStep++;
  }
  finish(time, reason = "") {
    this.active = false;
    const duration = Math.max(0, (time - this.readyAt) / 1000);
    const grid = this.samples.map((samples, i) => {
      const target = testPoints[i];
      const values = (key) =>
        samples.map(
          (s) =>
            Math.hypot(s[key].x - target.x, ((s[key].y - target.y) * 9) / 16) *
            100,
        );
      return {
        point: i + 1,
        samples: samples.length,
        dxPercent: median(samples.map((s) => (s.corrected.x - target.x) * 100)),
        dyPercent: median(samples.map((s) => (s.corrected.y - target.y) * 100)),
        rawErrorWidth: median(values("raw")),
        correctedErrorWidth: median(values("corrected")),
      };
    });
    return {
      kind: this.kind,
      at: new Date(time).toISOString(),
      status: reason
        ? "Interrupted"
        : (this.kind === "placement" && grid.some((p) => p.samples < 5)) ||
            (this.kind === "idle" && duration < this.seconds) ||
            (this.kind === "voice" && this.voiceStep < 3)
          ? "Incomplete"
          : "Completed",
      reason,
      config: this.config,
      elapsedSeconds: Math.max(0, (time - this.started) / 1000),
      measurementSeconds: duration,
      expected: this.expected,
      events: this.count,
      high: this.high,
      review: this.review,
      deficit: Math.max(0, this.expected - this.count),
      surplus: Math.max(0, this.count - this.expected),
      eventsPerMinute: duration ? (this.count * 60) / duration : null,
      grid,
      medianFPS: median(this.fps),
      medianReferenceMs: median(this.references),
      voices: this.voices,
      voiceSteps: this.voiceStep,
      unheard: this.unheard,
    };
  }
}
export function drawTestPoint(canvas, point) {
  canvas.width = 960;
  canvas.height = 540;
  const c = canvas.getContext("2d");
  c.fillStyle = "#969696";
  c.fillRect(0, 0, 960, 540);
  c.textAlign = "center";
  c.fillStyle = "#111";
  c.font = "bold 20px sans-serif";
  c.fillText(`PLACEMENT TEST · POINT ${point + 1} OF 9`, 480, 28);
  c.font = "16px sans-serif";
  c.fillText(
    "Place actual laser strikes on the highlighted crosshair. Advance on the operator.",
    480,
    522,
  );
  testPoints.forEach((p, i) => {
    const x = p.x * 960,
      y = p.y * 540;
    c.strokeStyle = i === point ? "#111" : "#737373";
    c.lineWidth = i === point ? 3 : 1;
    c.beginPath();
    c.moveTo(x - 14, y);
    c.lineTo(x + 14, y);
    c.moveTo(x, y - 14);
    c.lineTo(x, y + 14);
    c.stroke();
    if (i === point) {
      c.beginPath();
      c.arc(x, y, 22, 0, Math.PI * 2);
      c.stroke();
    }
  });
}
