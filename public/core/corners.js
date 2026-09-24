import { homography, project, unitCorners, validQuad } from "./geometry.js";
export const markerCenters = [
  [0.035, 0.035],
  [0.965, 0.035],
  [0.965, 0.965],
  [0.035, 0.965],
];
// Cyan rings with dark centers are distinguished from ordinary cyan objects.
// Ambiguous or clipped patterns deliberately fall back to manual alignment.
export function detectCorners(data, w, h) {
  const mask = new Uint8Array(w * h),
    groups = [];
  const cyan = (i) =>
    data[i + 1] > 85 &&
    data[i + 2] > 85 &&
    Math.min(data[i + 1], data[i + 2]) - data[i] > 40;
  for (let p = 0; p < mask.length; p++) mask[p] = cyan(p * 4) ? 1 : 0;
  for (let p = 0; p < mask.length; p++)
    if (mask[p]) {
      const stack = [p];
      mask[p] = 0;
      let n = 0,
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
        n++;
        sx += x;
        sy += y;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const z of [q - 1, q + 1, q - w, q + w])
          if (
            z >= 0 &&
            z < mask.length &&
            mask[z] &&
            Math.abs((z % w) - x) <= 1
          ) {
            mask[z] = 0;
            stack.push(z);
          }
      }
      const bw = maxX - minX + 1,
        bh = maxY - minY + 1,
        fill = n / (bw * bh),
        cx = sx / n,
        cy = sy / n;
      if (
        n < 12 ||
        n > w * h * 0.015 ||
        bw < 5 ||
        bh < 5 ||
        bw / bh < 0.3 ||
        bw / bh > 3.3 ||
        fill < 0.22 ||
        fill > 0.92
      )
        continue;
      const i = (Math.round(cy) * w + Math.round(cx)) * 4;
      if (cyan(i) || Math.max(data[i], data[i + 1], data[i + 2]) > 150)
        continue;
      groups.push([cx / (w - 1), cy / (h - 1)]);
    }
  if (groups.length !== 4)
    throw Error("Could not identify exactly four corner rings.");
  groups.sort((a, b) => a[1] - b[1]);
  const ordered = [
    ...groups.slice(0, 2).sort((a, b) => a[0] - b[0]),
    ...groups.slice(2).sort((a, b) => b[0] - a[0]),
  ];
  if (!validQuad(ordered))
    throw Error("Corner pattern is too small or distorted.");
  const transform = homography(markerCenters, ordered),
    corners = unitCorners.map(([x, y]) => project(transform, x, y));
  if (
    !validQuad(corners) ||
    corners.some((p) => p.some((v) => v < -0.005 || v > 1.005))
  )
    throw Error("The entire projected frame must be visible.");
  return corners.map((p) => p.map((v) => Math.max(0, Math.min(1, v))));
}
