// Reproducible ESM packaging only; upstream detector code is not modified.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
const root = "node_modules/js-aruco2";
const pkg = JSON.parse(readFileSync(`${root}/package.json`));
if (pkg.version !== "2.0.0")
  throw Error("Review upstream changes before updating vendored detector.");
const dest = "public/vendor/aruco";
mkdirSync(dest, { recursive: true });
let cv = readFileSync(`${root}/src/cv.js`, "utf8");
let ar = readFileSync(`${root}/src/aruco.js`, "utf8");
if (
  !cv.includes("this.CV = CV;") ||
  !ar.includes("var CV = this.CV || require('./cv').CV;")
)
  throw Error("Unexpected upstream module format");
cv = cv.replace("this.CV = CV;", "export { CV };");
ar = ar
  .replace(
    "var CV = this.CV || require('./cv').CV;",
    'import { CV } from "./cv.js";',
  )
  .replace("this.AR = AR;", "export { AR };");
writeFileSync(`${dest}/cv.js`, cv);
writeFileSync(`${dest}/aruco.js`, ar);
copyFileSync(`${root}/LICENSE.txt`, `${dest}/LICENSE.txt`);
