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
  const profile = (points, depth, material) => {
    const shape = new THREE.Shape();
    points.forEach(([z, y], i) =>
      i ? shape.lineTo(z, y) : shape.moveTo(z, y),
    );
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 3,
      steps: 1,
    });
    geo.translate(0, 0, -depth / 2);
    geo.rotateY(-Math.PI / 2);
    return add(geo, material, 0, 0, 0);
  };
  switch (b.asset) {
    case "car":
      profile(
        [
          [-0.47, -0.28],
          [0.47, -0.28],
          [0.48, -0.04],
          [0.29, 0.04],
          [-0.32, 0.04],
          [-0.48, -0.02],
        ],
        0.9,
        paint,
      );
      profile(
        [
          [-0.29, 0.04],
          [-0.18, 0.36],
          [0.13, 0.36],
          [0.29, 0.04],
        ],
        0.74,
        glass,
      );
      box(0.78, 0.045, 0.31, 0, 0.38, -0.025, paint);
      box(0.8, 0.035, 0.19, 0, 0.065, 0.365, paint);
      // Door seams, sills, pillars, handles, mirrors and grille.
      for (const x of [-0.46, 0.46]) {
        box(0.025, 0.045, 0.78, x, -0.235, 0, steel);
        for (const z of [-0.17, 0.18]) {
          box(0.012, 0.23, 0.008, x, -0.075, z, dark);
          box(0.018, 0.018, 0.055, x, -0.012, z - 0.035, steel);
        }
        box(0.025, 0.32, 0.022, x * 0.82, 0.2, -0.03, paint);
        box(0.12, 0.055, 0.07, x * 1.07, 0.09, 0.21, paint);
      }
      box(0.45, 0.08, 0.015, 0, -0.1, 0.497, dark);
      for (let x = -0.2; x <= 0.2; x += 0.055)
        box(0.012, 0.075, 0.019, x, -0.1, 0.5, steel);
      box(0.23, 0.065, 0.012, 0, -0.22, 0.505, steel);
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
    case "wall":
      box(1, 1, 1, 0, 0, 0);
      for (const z of [-0.51, 0.51]) {
        for (let row = 1; row < 8; row++)
          box(1, 0.007, 0.018, 0, row / 8 - 0.5, z, dark);
        for (let row = 0; row < 8; row++)
          for (let col = 0; col < 5; col++)
            box(
              0.004,
              0.12,
              0.018,
              (col + (row % 2) * 0.5) / 5 - 0.5,
              row / 8 - 0.4375,
              z,
              dark,
            );
      }
      box(1.04, 0.035, 1.05, 0, 0.49, 0, steel);
      break;
    case "door": {
      box(0.17, 1, 1, -0.415, 0, 0);
      box(0.17, 1, 1, 0.415, 0, 0);
      box(0.66, 0.15, 1, 0, 0.425, 0);
      for (const x of [-0.325, 0.325])
        box(0.025, 0.85, 1.08, x, -0.075, 0, steel);
      box(0.68, 0.035, 1.08, 0, 0.34, 0, steel);
      // Open leaf projects behind the frame; the doorway is a true aperture.
      box(0.045, 0.83, 2.2, -0.29, -0.085, -1.1, paint);
      for (const y of [-0.3, 0.2])
        box(0.06, 0.06, 0.12, -0.29, y, -0.05, steel);
      box(0.065, 0.025, 0.18, -0.25, -0.03, -1.95, steel);
      break;
    }
    case "drum":
      add(new THREE.CylinderGeometry(0.47, 0.47, 0.96, 48), paint, 0, 0, 0);
      for (const y of [-0.47, -0.27, 0.27, 0.47]) {
        const ring = add(
          new THREE.TorusGeometry(0.475, 0.018, 10, 48),
          steel,
          0,
          y,
          0,
        );
        ring.rotation.x = Math.PI / 2;
      }
      add(
        new THREE.CylinderGeometry(0.46, 0.46, 0.025, 48),
        steel,
        0,
        0.485,
        0,
      );
      add(
        new THREE.CylinderGeometry(0.065, 0.065, 0.035, 20),
        dark,
        0.21,
        0.5,
        0.11,
      );
      break;
    case "ports":
      // Alternating open shooting ports between solid plywood rails.
      for (const x of [-0.47, 0.47]) box(0.06, 1, 1, x, 0, 0, paint);
      for (const y of [-0.46, -0.12, 0.22, 0.46])
        box(0.88, 0.07, 0.35, 0, y, 0, paint);
      for (const [x, y] of [
        [-0.24, -0.29],
        [0.24, 0.05],
        [-0.24, 0.34],
      ])
        box(0.4, 0.26, 0.35, x, y, 0, paint);
      for (const x of [-0.47, 0.47]) box(0.15, 0.035, 4, x, -0.48, 0, steel);
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
  if (t.asset === "mannequin") return mannequinModel(t, kind);
  if (t.asset === "cardboard" && t.image) return imageBacker(t);
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
  return g;
}

function mannequinModel(t, kind) {
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({
    color: 0xb49a79,
    roughness: 0.72,
  });
  const joint = new THREE.MeshStandardMaterial({
    color: 0x554f49,
    roughness: 0.8,
  });
  const face = new THREE.MeshStandardMaterial({
    color: 0xd1b795,
    roughness: 0.8,
  });
  const part = (name, x, y, z, sx, sy, sz, material = body) => {
    const geo = new THREE.SphereGeometry(1, 32, 24);
    geo.scale(sx * t.width, sy * t.height, sz * t.width);
    geo.translate(x * t.width, y * t.height, z * t.width);
    const m = new THREE.Mesh(geo, material);
    m.name = name;
    g.add(m);
    return m;
  };
  part("torso", 0, 0.08, 0, 0.27, 0.205, 0.16);
  part("pelvis", 0, -0.13, 0, 0.22, 0.1, 0.135);
  part("neck", 0, 0.3, 0, 0.075, 0.045, 0.075, joint);
  part("head", 0, 0.39, 0, 0.125, 0.105, 0.12, face);
  part("nose", 0, 0.395, 0.115, 0.027, 0.022, 0.045, face);
  for (const sign of [-1, 1]) {
    part("shoulder" + sign, sign * 0.285, 0.2, 0, 0.105, 0.07, 0.11);
    part("upper-arm" + sign, sign * 0.34, 0.08, 0, 0.085, 0.125, 0.085);
    part("elbow" + sign, sign * 0.365, -0.03, 0.015, 0.07, 0.04, 0.07, joint);
    if (kind === "no-shoot") {
      part("forearm" + sign, sign * 0.41, 0.08, 0.06, 0.065, 0.13, 0.065);
      part("hand" + sign, sign * 0.43, 0.22, 0.06, 0.065, 0.06, 0.045, face);
    } else {
      part("forearm" + sign, sign * 0.36, -0.13, 0.08, 0.065, 0.11, 0.065);
      part("hand" + sign, sign * 0.35, -0.235, 0.1, 0.065, 0.05, 0.045, face);
    }
    part("thigh" + sign, sign * 0.12, -0.255, 0, 0.105, 0.135, 0.105);
    part("knee" + sign, sign * 0.13, -0.36, 0.015, 0.08, 0.04, 0.08, joint);
    part("shin" + sign, sign * 0.135, -0.42, 0, 0.07, 0.075, 0.07);
    part("foot" + sign, sign * 0.135, -0.475, 0.06, 0.085, 0.025, 0.14, joint);
    part("eye" + sign, sign * 0.044, 0.416, 0.108, 0.016, 0.008, 0.015, joint);
  }
  if (kind === "shoot") {
    const geo = new THREE.BoxGeometry(
      t.width * 0.06,
      t.height * 0.025,
      t.width * 0.23,
    );
    geo.translate(t.width * 0.35, -t.height * 0.23, t.width * 0.21);
    const prop = new THREE.Mesh(geo, joint);
    prop.name = "prop";
    g.add(prop);
  }
  return g;
}
function imageBacker(t) {
  const g = new THREE.Group(),
    canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 768;
  const c = canvas.getContext("2d");
  c.fillStyle = "#ad9270";
  c.fillRect(0, 0, 512, 768);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const backing = new THREE.Mesh(
    new THREE.BoxGeometry(t.width, t.height, 0.06),
    new THREE.MeshStandardMaterial({ color: 0xad9270, roughness: 0.95 }),
  );
  backing.name = "backer";
  g.add(backing);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(t.width, t.height),
    new THREE.MeshStandardMaterial({ map, roughness: 0.9 }),
  );
  face.position.z = 0.031;
  face.name = "image";
  g.add(face);
  let disposed = false;
  map.addEventListener("dispose", () => (disposed = true));
  const image = new Image();
  image.onload = () => {
    if (disposed) return;
    c.drawImage(image, 0, 0, 512, 768);
    for (const z of [...(t.zones || [])].reverse()) {
      c.strokeStyle = "#fff2ce";
      c.lineWidth = 3;
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
    }
    map.needsUpdate = true;
  };
  image.src = t.image;
  return g;
}
