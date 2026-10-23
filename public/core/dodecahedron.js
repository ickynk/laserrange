// Regular dodecahedron: 20 vertices and 12 outward-wound pentagonal faces.
// Shared coordinates keep the visible surface and collision hull identical.
const phi = (1 + Math.sqrt(5)) / 2,
  r = 1 / phi;
const vertices = [
  [-1, -1, -1],
  [-1, -1, 1],
  [-1, 1, -1],
  [-1, 1, 1],
  [1, -1, -1],
  [1, -1, 1],
  [1, 1, -1],
  [1, 1, 1],
  [0, -r, -phi],
  [0, -r, phi],
  [0, r, -phi],
  [0, r, phi],
  [-r, -phi, 0],
  [-r, phi, 0],
  [r, -phi, 0],
  [r, phi, 0],
  [-phi, 0, -r],
  [phi, 0, -r],
  [-phi, 0, r],
  [phi, 0, r],
];
export const dodecaFaces = [
  [3, 11, 7, 15, 13],
  [7, 19, 17, 6, 15],
  [17, 4, 8, 10, 6],
  [8, 0, 16, 2, 10],
  [0, 12, 1, 18, 16],
  [6, 10, 2, 13, 15],
  [2, 16, 18, 3, 13],
  [18, 1, 9, 11, 3],
  [4, 14, 12, 0, 8],
  [11, 9, 5, 19, 7],
  [19, 5, 14, 4, 17],
  [1, 12, 14, 5, 9],
];
export const dodecaVertices = (size) =>
  vertices.map((p) => p.map((n, i) => (n * size[i]) / (2 * phi)));
