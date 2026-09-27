// Follow foreground relative to the frame before onset. A continuing pulse may
// move, fade, or briefly flicker; its first impact remains the shot location.
export function followPulse(
  frame,
  before,
  track,
  width,
  height,
  color,
  threshold,
  radius,
  { reference = null, gain = 1, offset = 0 } = {},
) {
  const selected = color === "green" ? 1 : 0;
  const chroma = (data, i) =>
    data[i + selected] - Math.max(data[i + (selected ? 0 : 1)], data[i + 2]);
  const x0 = Math.max(0, Math.floor(track.x - radius)),
    x1 = Math.min(width - 1, Math.ceil(track.x + radius)),
    y0 = Math.max(0, Math.floor(track.y - radius)),
    y1 = Math.min(height - 1, Math.ceil(track.y + radius));
  const sw = x1 - x0 + 1,
    sh = y1 - y0 + 1;
  const mask = new Uint8Array(sw * sh);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = (y * width + x) * 4;
      if (
        frame[i + selected] >= 40 &&
        chroma(frame, i) >= threshold * 0.5 &&
        chroma(frame, i) - chroma(before, i) >= threshold * 0.4
      ) {
        if (reference) {
          let expected = -255;
          for (let dy = -2; dy <= 2; dy++)
            for (let dx = -2; dx <= 2; dx++) {
              const rx = Math.max(0, Math.min(width - 1, x + dx));
              const ry = Math.max(0, Math.min(height - 1, y + dy));
              expected = Math.max(
                expected,
                chroma(reference, (ry * width + rx) * 4),
              );
            }
          if (chroma(frame, i) - (gain * expected + offset) < threshold * 0.4)
            continue;
        }
        mask[(y - y0) * sw + x - x0] = 1;
      }
    }
  let best = null;
  for (let p = 0; p < mask.length; p++)
    if (mask[p]) {
      const queue = [p];
      mask[p] = 0;
      let n = 0,
        sx = 0,
        sy = 0,
        peak = 0,
        minX = width,
        maxX = 0,
        minY = height,
        maxY = 0;
      while (queue.length) {
        const q = queue.pop(),
          x = q % sw,
          y = Math.floor(q / sw);
        const ax = x + x0,
          ay = y + y0,
          i = (ay * width + ax) * 4;
        n++;
        sx += ax;
        sy += ay;
        peak = Math.max(peak, chroma(frame, i) - chroma(before, i));
        minX = Math.min(minX, ax);
        maxX = Math.max(maxX, ax);
        minY = Math.min(minY, ay);
        maxY = Math.max(maxY, ay);
        for (const v of [q - 1, q + 1, q - sw, q + sw])
          if (
            v >= 0 &&
            v < mask.length &&
            mask[v] &&
            Math.abs((v % sw) - x) <= 1
          ) {
            mask[v] = 0;
            queue.push(v);
          }
      }
      const x = sx / n,
        y = sy / n,
        distance = Math.hypot(x - track.x, y - track.y);
      if (
        n >= 2 &&
        n <= Math.max(50, width * height * 0.0015) &&
        maxX - minX + 1 <= width * 0.04 &&
        maxY - minY + 1 <= height * 0.06 &&
        distance <= radius &&
        (!best || distance < best.distance)
      )
        best = { x, y, peak, pixels: n, distance };
    }
  return best;
}
