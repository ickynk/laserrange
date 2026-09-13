export function drawCalibration(c) {
  c.width = 960;
  c.height = 540;
  const x = c.getContext("2d");
  x.fillStyle = "#202020";
  x.fillRect(0, 0, 960, 540);
  x.strokeStyle = "#aaa";
  x.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    x.beginPath();
    x.moveTo(i * 120, 0);
    x.lineTo(i * 120, 540);
    x.stroke();
  }
  for (let i = 0; i <= 4; i++) {
    x.beginPath();
    x.moveTo(0, i * 135);
    x.lineTo(960, i * 135);
    x.stroke();
  }
  x.strokeStyle = "white";
  x.lineWidth = 6;
  x.strokeRect(3, 3, 954, 534);
  x.fillStyle = "white";
  x.textAlign = "center";
  x.font = "bold 24px sans-serif";
  x.fillText("ALIGN → BASELINE → THREE TEST PULSES", 480, 246);
  x.font = "17px sans-serif";
  x.fillText("Keep phone and projector fixed", 480, 281);
  for (const [px, py] of [
    [0.035, 0.035],
    [0.965, 0.035],
    [0.965, 0.965],
    [0.035, 0.965],
  ]) {
    x.fillStyle = "#00ffff";
    x.fillRect(px * 960 - 10, py * 540 - 10, 20, 20);
  }
}
