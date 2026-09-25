import { chroma } from "./detector.js";

// Camera-only video is ambiguous: require a compact, stationary, short flash.
// Source-backed video uses this as an additional guard after source subtraction.
export class VideoPulseFilter {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.previous = null;
    this.pending = [];
    this.rejected = 0;
  }
  patch(frame, x, y, color, radius) {
    const values = [];
    for (let dy = -radius; dy <= radius; dy++)
      for (let dx = -radius; dx <= radius; dx++) {
        const px = Math.max(0, Math.min(this.width - 1, x + dx));
        const py = Math.max(0, Math.min(this.height - 1, y + dy));
        values.push(chroma(frame, (py * this.width + px) * 4, color));
      }
    return values;
  }
  signal(frame, p, color, threshold) {
    const values = this.patch(frame, p.x, p.y, color, p.radius);
    let count = 0,
      sx = 0,
      sy = 0;
    const size = p.radius * 2 + 1;
    for (let i = 0; i < values.length; i++) {
      if (values[i] - p.before[i] < threshold * 0.6) continue;
      count++;
      sx += (i % size) - p.radius;
      sy += Math.floor(i / size) - p.radius;
    }
    return { count, drift: count ? Math.hypot(sx / count, sy / count) : 0 };
  }
  process(
    frame,
    candidates,
    time,
    { color, threshold, maxDuration = 350, image } = {},
  ) {
    maxDuration = Number.isFinite(maxDuration)
      ? Math.max(80, Math.min(1000, maxDuration))
      : 350;
    const previous = this.previous;
    this.previous = new Uint8ClampedArray(frame);
    if (!previous) return [];
    let changed = 0,
      total = 0;
    for (let i = 0; i < frame.length; i += 64) {
      total++;
      // Include luminance changes: a cut need not change the selected hue.
      const delta = Math.max(
        Math.abs(frame[i] - previous[i]),
        Math.abs(frame[i + 1] - previous[i + 1]),
        Math.abs(frame[i + 2] - previous[i + 2]),
      );
      if (delta > Math.max(25, threshold)) changed++;
    }
    if (changed / total > 0.15) {
      this.rejected += Math.max(1, this.pending.length + candidates.length);
      this.pending = [];
      return [];
    }
    const confirmed = [],
      keep = [];
    for (const p of this.pending) {
      const signal = this.signal(frame, p, color, threshold);
      if (
        time - p.time > maxDuration ||
        time - p.lastFrame > 250 ||
        signal.drift > Math.max(2, this.width * 0.006)
      ) {
        this.rejected++;
      } else if (signal.count < 2) {
        confirmed.push({ ...p.hit, time: p.time, image: p.image });
      } else {
        p.lastFrame = time;
        keep.push(p);
      }
    }
    this.pending = keep;
    let snapshot;
    for (const hit of candidates.slice(0, 8)) {
      const x = Math.round(hit.x * (this.width - 1));
      const y = Math.round(hit.y * (this.height - 1));
      const radius = Math.max(4, Math.round(this.width * 0.02));
      if (this.pending.some((p) => Math.hypot(p.x - x, p.y - y) <= radius))
        continue;
      if (this.pending.length >= 8) {
        this.rejected++;
        continue;
      }
      const p = {
        x,
        y,
        radius,
        before: this.patch(previous, x, y, color, radius),
        time,
        lastFrame: time,
        hit,
      };
      const signal = this.signal(frame, p, color, threshold);
      if (signal.count < 2 || signal.drift > Math.max(2, this.width * 0.006)) {
        this.rejected++;
        continue;
      }
      snapshot ??= image?.();
      p.image = snapshot;
      this.pending.push(p);
    }
    return confirmed;
  }
}
