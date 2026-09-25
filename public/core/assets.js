import * as THREE from "/vendor/three/build/three.module.js";
// Original procedural assets: no remote model downloads or third-party licenses.
export function barrierModel(b) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({
    color: 0x596b78,
    roughness: 0.45,
    metalness: 0.35,
  });
  const concrete = new THREE.MeshStandardMaterial({
    color: 0xa59f91,
    roughness: 0.98,
  });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x171e24,
    roughness: 0.8,
  });
  const steel = new THREE.MeshStandardMaterial({
    color: 0x889195,
    metalness: 0.7,
    roughness: 0.4,
  });
  const glass = new THREE.MeshStandardMaterial({
    color: 0x7599aa,
    metalness: 0.6,
    roughness: 0.15,
  });
  const add = (geometry, material, x, y, z) => {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.name = `part-${g.children.length}`;
    g.add(m);
    return m;
  };
  const box = (w, h, d, x, y, z, m = concrete) =>
    add(new THREE.BoxGeometry(w, h, d), m, x, y, z);
  switch (b.asset) {
    case "car":
      box(0.94, 0.34, 0.94, 0, -0.12, 0, paint);
      box(0.79, 0.32, 0.45, 0, 0.2, -0.02, glass);
      box(0.82, 0.04, 0.45, 0, 0.38, -0.02, paint);
      for (const x of [-0.48, 0.48])
        for (const z of [-0.3, 0.3]) {
          const wheel = add(
            new THREE.CylinderGeometry(0.14, 0.14, 0.09, 20),
            dark,
            x,
            -0.3,
            z,
          );
          wheel.rotation.z = Math.PI / 2;
          wheel.scale.z = b.height / b.depth;
          const hub = add(
            new THREE.CylinderGeometry(0.075, 0.075, 0.095, 16),
            steel,
            x,
            -0.3,
            z,
          );
          hub.rotation.z = Math.PI / 2;
          hub.scale.z = b.height / b.depth;
        }
      for (const z of [-0.48, 0.48]) {
        box(0.95, 0.07, 0.04, 0, -0.2, z, steel);
        for (const x of [-0.31, 0.31])
          box(
            0.18,
            0.09,
            0.02,
            x,
            -0.02,
            z,
            new THREE.MeshStandardMaterial({ color: 0xe5d5a4 }),
          );
      }
      for (const x of [-0.405, 0.405]) box(0.035, 0.32, 0.04, x, 0.2, 0, paint);
      break;
    case "pillar":
      add(new THREE.CylinderGeometry(0.42, 0.46, 0.9, 32), concrete, 0, 0, 0);
      box(1, 0.08, 1, 0, -0.46, 0);
      box(1, 0.08, 1, 0, 0.46, 0);
      break;
    case "fence":
      for (const x of [-0.47, 0.47]) box(0.06, 1, 0.12, x, 0, 0, steel);
      for (const y of [-0.35, 0.35]) box(1, 0.035, 0.05, 0, y, 0, steel);
      for (let x = -0.4; x <= 0.4; x += 0.1)
        box(0.025, 0.9, 0.035, x, 0, 0, steel);
      break;
    case "window":
      // Actual aperture: only wall/frame geometry occludes the view.
      box(0.15, 1, 1, -0.425, 0, 0);
      box(0.15, 1, 1, 0.425, 0, 0);
      box(0.7, 0.2, 1, 0, -0.4, 0);
      box(0.7, 0.15, 1, 0, 0.425, 0);
      box(0.76, 0.035, 1.1, 0, -0.28, 0, steel);
      break;
    case "highway": {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, -0.5);
      shape.lineTo(0.5, -0.5);
      shape.lineTo(0.32, -0.22);
      shape.lineTo(0.16, 0.5);
      shape.lineTo(-0.16, 0.5);
      shape.lineTo(-0.32, -0.22);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: 1,
        bevelEnabled: false,
      });
      geo.translate(0, 0, -0.5);
      geo.rotateY(Math.PI / 2);
      add(geo, concrete, 0, 0, 0);
      for (const x of [-0.33, 0.33])
        box(
          0.06,
          0.12,
          0.34,
          x,
          0.32,
          0,
          new THREE.MeshStandardMaterial({ color: 0xc9b785 }),
        );
      break;
    }
    default:
      box(1, 1, 1, 0, 0, 0);
  }
  const scale = new THREE.Matrix4().makeScale(b.width, b.height, b.depth);
  for (const child of g.children) {
    child.updateMatrix();
    child.geometry.applyMatrix4(scale.clone().multiply(child.matrix));
    child.position.set(0, 0, 0);
    child.rotation.set(0, 0, 0);
    child.scale.set(1, 1, 1);
  }
  g.rotation.y = ((b.rotation || 0) * Math.PI) / 180;
  return g;
}
export function targetModel(t, kind) {
  const g = new THREE.Group(),
    canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const c = canvas.getContext("2d");
  c.fillStyle = t.asset === "bullseye" ? "#e6dfcb" : "#ad9270";
  c.fillRect(0, 0, 512, 768);
  if (t.asset === "bullseye") {
    for (let r = 210; r >= 25; r -= 25) {
      c.fillStyle = r % 50 < 25 ? "#293038" : "#e6dfcb";
      c.beginPath();
      c.arc(256, 350, r, 0, Math.PI * 2);
      c.fill();
    }
  } else {
    const gradient = c.createLinearGradient(110, 0, 400, 0);
    gradient.addColorStop(0, "#26333d");
    gradient.addColorStop(0.5, t.asset === "cardboard" ? "#876f52" : "#59636a");
    gradient.addColorStop(1, "#26333d");
    c.fillStyle = gradient;
    c.beginPath();
    c.ellipse(256, 134, 66, 84, 0, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.moveTo(192, 205);
    c.lineTo(120, 264);
    c.lineTo(92, 480);
    c.lineTo(150, 500);
    c.lineTo(177, 347);
    c.lineTo(174, 706);
    c.lineTo(239, 706);
    c.lineTo(256, 500);
    c.lineTo(273, 706);
    c.lineTo(338, 706);
    c.lineTo(335, 347);
    c.lineTo(362, 500);
    c.lineTo(420, 480);
    c.lineTo(392, 264);
    c.lineTo(320, 205);
    c.closePath();
    c.fill();
    c.strokeStyle = "#899097";
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(256, 225);
    c.lineTo(256, 460);
    c.moveTo(178, 457);
    c.lineTo(337, 457);
    c.stroke();
    c.fillStyle = "#d4c6af";
    if (kind === "shoot") {
      c.fillRect(297, 350, 105, 19);
      c.fillRect(333, 361, 21, 50);
      c.fillStyle = "#273139";
      c.fillRect(318, 374, 12, 13);
    } else {
      for (const px of [80, 394]) {
        c.fillRect(px, 205, 34, 58);
        for (let i = 0; i < 4; i++)
          c.fillRect(px + i * 9, 178 - (i % 2) * 9, 7, 42);
      }
    }
    // Distinct neutral props/labels do not rely on red or green hues.
  }
  c.fillStyle = "#eee7d6";
  c.font = "bold 27px sans-serif";
  c.textAlign = "center";
  c.fillText(kind === "shoot" ? "SHOOT" : "NO SHOOT", 256, 746);
  for (const z of [...(t.zones || [])].reverse()) {
    c.strokeStyle = "#f4ead5";
    c.lineWidth = 3;
    c.setLineDash([9, 6]);
    c.beginPath();
    if (z.shape === "ellipse")
      c.ellipse(
        z.x * 512,
        z.y * 768,
        z.width * 256,
        z.height * 384,
        0,
        0,
        Math.PI * 2,
      );
    else
      c.rect(
        (z.x - z.width / 2) * 512,
        (z.y - z.height / 2) * 768,
        z.width * 512,
        z.height * 768,
      );
    c.stroke();
    c.setLineDash([]);
    c.font = "18px sans-serif";
    c.fillStyle = "#fff5dd";
    c.fillText(
      `${z.name} (${z.points})`,
      z.x * 512,
      (z.y - z.height / 2) * 768 + 22,
    );
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.Mesh(
    new THREE.BoxGeometry(t.width, t.height, 0.08),
    new THREE.MeshStandardMaterial({ map, roughness: 0.92 }),
  );
  face.name = "face";
  g.add(face);
  if (t.asset === "mannequin") {
    // Sculpted shoulder/head relief on the illustrated training mannequin board.
    const material = new THREE.MeshStandardMaterial({
      color: 0x69727a,
      roughness: 0.85,
    });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), material);
    head.scale.set(t.width * 0.13, t.height * 0.105, 0.1);
    head.position.set(0, t.height * 0.326, 0.045);
    head.name = "head";
    head.updateMatrix();
    head.geometry.applyMatrix4(head.matrix);
    head.position.set(0, 0, 0);
    head.scale.set(1, 1, 1);
    g.add(head);
  }
  return g;
}
