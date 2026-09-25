import {
  boardWidth,
  boardHeight,
  boardMarkers,
  manualAnchors,
  drawMarker,
} from "./calibration-board.js";
export function drawCalibration(c) {
  c.width = boardWidth;
  c.height = boardHeight;
  const x = c.getContext("2d");
  x.fillStyle = "#b0b0b0";
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = "white";
  x.lineWidth = 4;
  x.strokeRect(2, 2, c.width - 4, c.height - 4);
  for (const marker of boardMarkers) drawMarker(x, marker);
  // Manual anchors are separate from code centers and have known screen coordinates.
  manualAnchors.forEach(([u, v], i) => {
    const px = u * c.width,
      py = v * c.height;
    x.fillStyle = "white";
    x.fillRect(px - 19, py - 19, 38, 38);
    x.strokeStyle = "black";
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(px - 14, py);
    x.lineTo(px + 14, py);
    x.moveTo(px, py - 14);
    x.lineTo(px, py + 14);
    x.stroke();
    x.fillStyle = "black";
    x.font = "bold 22px sans-serif";
    x.textAlign = u < 0.5 ? "left" : "right";
    x.fillText(String(i + 1), px + (u < 0.5 ? 26 : -26), py + 8);
  });
  x.textAlign = "center";
  x.fillStyle = "black";
  x.font = "bold 22px sans-serif";
  x.fillText("AUTO ALIGNMENT — KEEP ALL 5 CODES VISIBLE", 480, 48);
  x.font = "18px sans-serif";
  x.fillText("Manual: tap the centers of crosshairs 1 → 2 → 3 → 4", 480, 503);
  x.font = "16px sans-serif";
  x.fillText("CENTER CHECK", 480, 348);
}

export function drawZero(c) {
  c.width = 960;
  c.height = 540;
  const x = c.getContext("2d");
  x.fillStyle = "#b0b0b0";
  x.fillRect(0, 0, 960, 540);
  x.strokeStyle = "#111";
  x.lineWidth = 2;
  x.beginPath();
  x.arc(480, 270, 18, 0, Math.PI * 2);
  x.moveTo(449, 270);
  x.lineTo(511, 270);
  x.moveTo(480, 239);
  x.lineTo(480, 301);
  x.stroke();
  x.fillStyle = "#111";
  x.textAlign = "center";
  x.font = "bold 26px sans-serif";
  x.fillText("FIVE-SHOT SCREEN ZERO", 480, 70);
  x.font = "20px sans-serif";
  x.fillText(
    "Place five separate LASER STRIKES on the center crosshair",
    480,
    440,
  );
  x.font = "17px sans-serif";
  x.fillText(
    "Check the laser itself lands on the mark; review the result on your phone",
    480,
    478,
  );
}
