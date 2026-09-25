import { AR } from "../vendor/aruco/aruco.js";
export const boardWidth = 960,
  boardHeight = 540,
  markerSize = 96;
export const dictionaryName = "ARUCO_MIP_36h12";
const dictionary = new AR.Dictionary(dictionaryName);
export const manualAnchors = [
  [0.04, 0.07],
  [0.96, 0.07],
  [0.96, 0.93],
  [0.04, 0.93],
];
export const boardMarkers = [
  { id: 17, x: 115, y: 108 },
  { id: 42, x: 845, y: 108 },
  { id: 93, x: 845, y: 432 },
  { id: 128, x: 115, y: 432 },
  { id: 199, x: 480, y: 270 },
].map((m) => ({ ...m, bits: dictionary.codeList[m.id] }));
export function markerQuad(marker) {
  const { x, y } = marker,
    s = markerSize / 2;
  return [
    [x - s, y - s],
    [x + s, y - s],
    [x + s, y + s],
    [x - s, y + s],
  ].map(([u, v]) => [u / boardWidth, v / boardHeight]);
}
export function drawMarker(ctx, marker) {
  const cell = markerSize / 8,
    x = marker.x - markerSize / 2,
    y = marker.y - markerSize / 2;
  ctx.fillStyle = "white";
  ctx.fillRect(
    x - cell,
    y - cell,
    markerSize + 2 * cell,
    markerSize + 2 * cell,
  );
  ctx.fillStyle = "black";
  ctx.fillRect(x, y, markerSize, markerSize);
  ctx.fillStyle = "white";
  for (let row = 0; row < 6; row++)
    for (let col = 0; col < 6; col++)
      if (marker.bits[row * 6 + col] === "1")
        ctx.fillRect(x + (col + 1) * cell, y + (row + 1) * cell, cell, cell);
}
