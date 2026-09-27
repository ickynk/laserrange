import { followPulse } from "./pulse-track.js";
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
    this.reasons = {};
    this.candidates = 0;
    this.confirmed = 0;
    this.lastFrame = null;
  }
  reject(reason) {
    this.rejected++;
    this.reasons[reason] = (this.reasons[reason] || 0) + 1;
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
    { color, threshold, maxDuration = 350, profile = "strict", image } = {},
  ) {
    maxDuration = Number.isFinite(maxDuration)
      ? Math.max(80, Math.min(1000, maxDuration))
      : 350;
    const strict = profile === "strict";
    const sensitive = profile === "sensitive";
    const maxGap = strict ? 250 : sensitive ? 700 : 500;
    const motionLimit = Math.max(
      2,
      this.width * (strict ? 0.006 : sensitive ? 0.016 : 0.012),
    );
    this.candidates += candidates.length;
    const previous = this.previous;
    this.previous = new Uint8ClampedArray(frame);
    const gap = this.lastFrame !== null && time - this.lastFrame > maxGap;
    this.lastFrame = time;
    if (!previous) return [];
    if (gap) {
      this.reject("frame gap");
      this.pending = [];
      return [];
    }
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
      if (delta > Math.max(strict ? 25 : 45, threshold)) changed++;
    }
    if (changed / total > (strict ? 0.15 : sensitive ? 0.7 : 0.45)) {
      this.reject("scene change");
      this.pending = [];
      return [];
    }
    const confirmed = [],
      keep = [];
    for (const p of this.pending) {
      const signal = this.signal(frame, p, color, threshold);
      const continuation =
        !strict &&
        followPulse(
          frame,
          p.background,
          p.track,
          this.width,
          this.height,
          color,
          threshold,
          p.radius * 2,
        );
      const traveled =
        continuation && Math.hypot(continuation.x - p.x, continuation.y - p.y);
      // A fading trail can move without becoming another shot. A rigid,
      // equally bright translated object remains ambiguous and is rejected.
      const fadingTrail = continuation && continuation.peak <= p.peak * 0.8;
      if (continuation && (!traveled || traveled <= motionLimit || fadingTrail))
        p.track = continuation;
      const values = this.patch(frame, p.x, p.y, color, p.radius);
      const coreActive = p.core.filter(
        ({ i, peak }) =>
          values[i] - p.before[i] > Math.max(threshold * 0.6, peak * 0.35),
      ).length;
      const ended = strict
        ? signal.count < 2
        : coreActive <= p.core.length * 0.25;
      if (time - p.lastFrame > maxGap) this.reject("frame gap");
      else if (time - p.time > maxDuration) this.reject("pulse too long");
      else if (strict && signal.drift > motionLimit) this.reject("movement");
      else if (
        !strict &&
        continuation &&
        traveled > motionLimit &&
        !fadingTrail
      )
        this.reject("movement");
      else if (!strict && ended && continuation && fadingTrail) {
        p.lastFrame = time;
        keep.push(p);
      } else if (ended) {
        // Reject a bright object which has simply moved beside the original spot.
        if (
          signal.count >= p.core.length * 0.6 &&
          signal.count <= p.core.length * 2 &&
          signal.drift > motionLimit &&
          signal.drift < p.radius
        )
          this.reject("movement");
        else {
          confirmed.push({ ...p.hit, time: p.time, image: p.image });
          this.confirmed++;
        }
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
        this.reject("candidate limit");
        continue;
      }
      const p = {
        x,
        y,
        radius,
        before: this.patch(previous, x, y, color, radius),
        background: previous,
        track: { x, y },
        time,
        lastFrame: time,
        hit,
      };
      const signal = this.signal(frame, p, color, threshold);
      const onset = this.patch(frame, x, y, color, radius);
      const size = radius * 2 + 1;
      const coreRadius = Math.max(2, Math.sqrt(hit.pixels || 4) / 2 + 1);
      p.core = onset.flatMap((value, i) => {
        const near =
          Math.hypot((i % size) - radius, Math.floor(i / size) - radius) <=
          coreRadius;
        const peak = value - p.before[i];
        return near && peak >= threshold * 0.6 ? [{ i, peak }] : [];
      });
      if (p.core.length < 2 || (strict && signal.drift > motionLimit)) {
        this.reject("unstable onset");
        continue;
      }
      p.peak = Math.max(...p.core.map(({ peak }) => peak));
      // Detect a colored object entering from beside the onset: its old pixels
      // fade while similarly colored new pixels appear. Do not reject a pulse
      // merely because there is red/green elsewhere in the video.
      let vacated = 0;
      for (let i = 0; i < onset.length; i++) {
        const distance = Math.hypot(
          (i % size) - radius,
          Math.floor(i / size) - radius,
        );
        if (
          distance > coreRadius &&
          p.before[i] >= threshold &&
          p.before[i] - onset[i] >= Math.max(threshold * 0.6, p.peak * 0.5)
        )
          vacated++;
      }
      if (vacated >= Math.max(2, p.core.length * 0.5)) {
        this.reject("moving background");
        continue;
      }
      snapshot ??= image?.();
      p.image = snapshot;
      this.pending.push(p);
    }
    return confirmed;
  }
}
