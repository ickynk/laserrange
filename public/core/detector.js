// Pure image-processing core. RGB values are 0–255; coordinates are normalized.
export function chroma(data, i, color) {
  return color === "green"
    ? data[i + 1] - Math.max(data[i], data[i + 2])
    : data[i] - Math.max(data[i + 1], data[i + 2]);
}
export class LaserDetector {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.threshold = 55;
    this.brightness = 40;
    this.color = "red";
    this.reset();
  }
  reset() {
    this.previous = null;
    this.lastShot = -Infinity;
    this.background = null;
    this.gain = 1;
    this.offset = 0;
  }
  calibrate(frames, color = "red") {
    if (frames.length < 10)
      throw Error("Not enough baseline frames. Keep the camera running.");
    this.color = color;
    const values = [];
    for (let f = 1; f < frames.length; f++)
      for (let i = 0; i < frames[f].length; i += 32)
        values.push(
          Math.abs(
            chroma(frames[f], i, color) - chroma(frames[f - 1], i, color),
          ),
        );
    values.sort((a, b) => a - b);
    this.threshold = Math.max(
      15,
      Math.min(160, (values[Math.floor(values.length * 0.999)] || 0) + 12),
    );
    this.previous = null;
    return this.threshold;
  }
  // Keep automatically measured sensitivity within the threshold proven by
  // the user's pulse check. Motion must not make a validated laser invisible.
  adapt(frames, validatedThreshold) {
    if (frames.length < 10) throw Error("Not enough adaptation frames.");
    // Scene motion is not sensor noise. Keep the user's qualified threshold.
    this.threshold = validatedThreshold;
    this.previous = new Uint8ClampedArray(frames.at(-1));
    return this.threshold;
  }
  // Robust chroma fit compensates projector/camera color gain and ambient tint.
  // Sparse laser pixels and clipped highlights must not drive the fit.
  photometric(camera, reference) {
    const samples = [];
    for (let i = 0; i < camera.length; i += 256)
      samples.push([
        chroma(reference, i, this.color),
        chroma(camera, i, this.color),
      ]);
    const fit = (points) => {
      const n = points.length;
      if (!n) return;
      const mx = points.reduce((sum, p) => sum + p[0], 0) / n;
      const my = points.reduce((sum, p) => sum + p[1], 0) / n;
      let variance = 0,
        covariance = 0;
      for (const [x, y] of points) {
        variance += (x - mx) ** 2;
        covariance += (x - mx) * (y - my);
      }
      const gain =
        variance / n > 25
          ? Math.max(0.25, Math.min(4, covariance / variance))
          : 1;
      return { gain, offset: my - gain * mx };
    };
    let response = fit(samples);
    if (!response) return;
    const residuals = samples
      .map(([x, y]) => Math.abs(y - response.gain * x - response.offset))
      .sort((a, b) => a - b);
    const limit = Math.max(5, residuals[Math.floor(residuals.length * 0.8)]);
    response =
      fit(
        samples.filter(
          ([x, y]) =>
            Math.abs(y - response.gain * x - response.offset) <= limit,
        ),
      ) || response;
    this.gain = response.gain;
    this.offset = response.offset;
  }
  detect(frame, reference, time, { temporalOnly = false } = {}) {
    const { width: w, height: h } = this;
    if (!this.previous) {
      this.previous = new Uint8ClampedArray(frame);
      return [];
    }
    const mask = new Uint8Array(w * h),
      selected = this.color === "red" ? 0 : 1;
    for (let y = 2; y < h - 2; y++)
      for (let x = 2; x < w - 2; x++) {
        const p = y * w + x,
          i = p * 4,
          c = chroma(frame, i, this.color);
        if (frame[i + selected] < this.brightness || c < this.threshold)
          continue;
        const rise = c - chroma(this.previous, i, this.color);
        if (rise < this.threshold * 0.6) continue;
        if (reference && !temporalOnly) {
          let expected = -255;
          // Registration tolerance: projected highlights near the pixel count as explained.
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++)
              expected = Math.max(
                expected,
                chroma(reference, ((y + dy) * w + x + dx) * 4, this.color),
              );
          if (c - (this.gain * expected + this.offset) < this.threshold)
            continue;
        }
        mask[p] = 1;
      }
    this.previous.set(frame);
    const components = [];
    for (let p = 0; p < mask.length; p++)
      if (mask[p]) {
        const stack = [p];
        mask[p] = 0;
        let count = 0,
          sx = 0,
          sy = 0,
          minX = w,
          maxX = 0,
          minY = h,
          maxY = 0;
        while (stack.length) {
          const q = stack.pop(),
            x = q % w,
            y = Math.floor(q / w);
          count++;
          sx += x;
          sy += y;
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
          minY = Math.min(minY, y);
          maxY = Math.max(maxY, y);
          for (const n of [q - 1, q + 1, q - w, q + w])
            if (
              n >= 0 &&
              n < mask.length &&
              mask[n] &&
              Math.abs((n % w) - x) <= 1
            ) {
              mask[n] = 0;
              stack.push(n);
            }
        }
        const bw = maxX - minX + 1,
          bh = maxY - minY + 1;
        if (
          count >= 2 &&
          count <= Math.max(50, w * h * 0.0015) &&
          bw <= w * 0.04 &&
          bh <= h * 0.06 &&
          count / (bw * bh) > 0.25
        )
          components.push({
            x: sx / count / (w - 1),
            y: sy / count / (h - 1),
            pixels: count,
          });
      }
    if (time - this.lastShot < 100) return [];
    // Ambiguous simultaneous blobs stay review-only; never arbitrarily choose a shooter.
    if (components.length) {
      this.lastShot = time;
      return components.map((p) => ({
        ...p,
        confidence:
          !temporalOnly && reference && components.length === 1
            ? "high"
            : "review",
      }));
    }
    return [];
  }
}
export function chooseReference(camera, history, time, maxAge = 400) {
  let best = null,
    bestError = Infinity;
  for (const ref of history) {
    if (Math.abs(time - ref.time) > maxAge) continue;
    let error = 0,
      n = 0;
    // Grayscale comparison limits influence of the laser chroma itself.
    for (let i = 0; i < camera.length; i += 128) {
      error += Math.abs(
        camera[i] +
          camera[i + 1] +
          camera[i + 2] -
          (ref.data[i] + ref.data[i + 1] + ref.data[i + 2]),
      );
      n++;
    }
    if (n && error / n < bestError) {
      bestError = error / n;
      best = ref;
    }
  }
  return best;
}
