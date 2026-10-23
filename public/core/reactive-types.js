export const reactiveAssets = [
  "dueling-tree",
  "texas-star",
  "drop-plate",
  "slide-plate",
  "rubber-dodeca",
  "rubber-hex", // Legacy saved ranges render the corrected dodecahedron.
  "glass-bottle",
  "tin-can",
  "can-stack",
];
export const reactiveDefaults = {
  "dueling-tree": [1.1, 2],
  "texas-star": [2.2, 2.6],
  "drop-plate": [0.45, 0.7],
  "slide-plate": [0.35, 1.7],
  "rubber-dodeca": [0.35, 0.35],
  "rubber-hex": [0.35, 0.35],
  "glass-bottle": [0.12, 0.32],
  "tin-can": [0.16, 0.22],
  "can-stack": [0.16, 0.22],
};
export const isReactive = (t) => reactiveAssets.includes(t.asset);

export const isSteel = (t) =>
  ["dueling-tree", "texas-star", "drop-plate", "slide-plate"].includes(t.asset);
