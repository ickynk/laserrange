export function solve(A, b) {
  const n = b.length,
    m = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++)
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    if (Math.abs(m[pivot][col]) < 1e-10)
      throw Error(
        "Calibration corners are degenerate. Select all four screen corners.",
      );
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const scale = m[col][col];
    for (let j = col; j <= n; j++) m[col][j] /= scale;
    for (let row = 0; row < n; row++)
      if (row !== col) {
        const k = m[row][col];
        for (let j = col; j <= n; j++) m[row][j] -= k * m[col][j];
      }
  }
  return m.map((row) => row[n]);
}
export function homography(from, to) {
  if (from.length !== 4 || to.length !== 4)
    throw Error("Four corners required");
  const A = [],
    b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i],
      [u, v] = to[i];
    A.push(
      [x, y, 1, 0, 0, 0, -u * x, -u * y],
      [0, 0, 0, x, y, 1, -v * x, -v * y],
    );
    b.push(u, v);
  }
  return [...solve(A, b), 1];
}
export function project(h, x, y) {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}
export const unitCorners = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
];
export function validQuad(corners) {
  if (
    corners.length !== 4 ||
    corners.some((p) => p.length !== 2 || p.some((v) => !Number.isFinite(v)))
  )
    return false;
  let sign = 0,
    area = 0;
  for (let i = 0; i < 4; i++) {
    const a = corners[i],
      b = corners[(i + 1) % 4],
      c = corners[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 0.0001 || (sign && Math.sign(cross) !== sign))
      return false;
    sign = Math.sign(cross);
    area += a[0] * b[1] - a[1] * b[0];
  }
  return Math.abs(area) / 2 > 0.025;
}
export function warpMap(h, width, height, sourceWidth, sourceHeight) {
  const map = new Int32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [u, v] = project(h, x / (width - 1), y / (height - 1));
      const sx = Math.round(u * (sourceWidth - 1)),
        sy = Math.round(v * (sourceHeight - 1));
      map[y * width + x] =
        sx < 0 || sy < 0 || sx >= sourceWidth || sy >= sourceHeight
          ? -1
          : 4 * (sy * sourceWidth + sx);
    }
  return map;
}
export function warp(source, map, out) {
  for (let i = 0; i < map.length; i++) {
    const j = map[i],
      k = i * 4;
    out[k] = j < 0 ? 0 : source[j];
    out[k + 1] = j < 0 ? 0 : source[j + 1];
    out[k + 2] = j < 0 ? 0 : source[j + 2];
    out[k + 3] = 255;
  }
  return out;
}
