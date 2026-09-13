import * as THREE from "/vendor/three/build/three.module.js";
import { targetPosition, pathPosition } from "./core/scenario.js";

function targetTexture(kind) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 384;
  const x = c.getContext("2d");
  x.fillStyle = "#d5c3a3";
  x.fillRect(0, 0, 256, 384);
  x.fillStyle = "#273747";
  x.beginPath();
  x.arc(128, 69, 37, 0, Math.PI * 2);
  x.fill();
  x.beginPath();
  x.moveTo(67, 117);
  x.lineTo(189, 117);
  x.lineTo(211, 190);
  x.lineTo(186, 359);
  x.lineTo(70, 359);
  x.lineTo(45, 190);
  x.closePath();
  x.fill();
  x.strokeStyle = "#708291";
  x.lineWidth = 2;
  x.strokeRect(94, 154, 68, 110);
  x.fillStyle = "#f6e3c1";
  if (kind === "shoot") {
    // Explicit stylized prop for an armed target, without relying on laser-colored cues.
    x.fillRect(133, 164, 79, 18);
    x.fillRect(165, 177, 16, 35);
    x.fillStyle = "#d5c3a3";
    x.fillRect(151, 184, 8, 9);
  } else {
    for (const dx of [28, 202]) {
      x.fillRect(dx, 110, 23, 39);
      for (let i = 0; i < 4; i++)
        x.fillRect(dx + i * 6, 90 - (i % 2) * 6, 4, 29);
    }
  }
  x.fillStyle = "#273747";
  x.font = "bold 15px sans-serif";
  x.textAlign = "center";
  x.fillText(kind === "shoot" ? "ARMED" : "UNARMED", 128, 378);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
export class RangeScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#121b27");
    this.scene.fog = new THREE.Fog("#121b27", 22, 65);
    this.camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 150);
    this.overhead = new THREE.OrthographicCamera(-12, 12, 10, -10, 0.1, 100);
    this.overhead.position.set(0, 40, -4);
    this.overhead.up.set(0, 0, -1);
    this.overhead.lookAt(0, 0, -4);
    this.scene.add(new THREE.HemisphereLight(0xdcecff, 0x746042, 3));
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({ color: 0x26303b, roughness: 1 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.01;
    this.scene.add(floor);
    this.scene.add(new THREE.GridHelper(80, 40, 0x526172, 0x354352));
    const back = new THREE.Mesh(
      new THREE.BoxGeometry(30, 9, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x253141 }),
    );
    back.position.set(0, 4.5, -22);
    this.scene.add(back);
    for (let x = -12; x <= 12; x += 4) {
      const post = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 7, 0.1),
        new THREE.MeshBasicMaterial({ color: 0x52606c }),
      );
      post.position.set(x, 3.5, -21.7);
      this.scene.add(post);
    }
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.pathGroup = new THREE.Group();
    this.scene.add(this.pathGroup);
    this.textures = {
      shoot: targetTexture("shoot"),
      "no-shoot": targetTexture("no-shoot"),
    };
    this.meshes = [];
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.editor = false;
    this.time = 0;
  }
  resize(width, height) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.overhead.left = (-12 * width) / height;
    this.overhead.right = (12 * width) / height;
    this.overhead.top = 12;
    this.overhead.bottom = -12;
    this.overhead.updateProjectionMatrix();
  }
  setScenario(s, roles = {}) {
    this.scenario = s;
    this.roles = roles;
    for (const m of this.meshes) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.group.clear();
    this.meshes = [];
    for (const t of s.targets) {
      const kind = roles[t.id] || (t.kind === "random" ? "shoot" : t.kind);
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(t.width, t.height, 0.12),
        new THREE.MeshStandardMaterial({
          map: this.textures[kind],
          roughness: 0.9,
        }),
      );
      m.userData = { id: t.id, type: "target", target: t, kind };
      this.group.add(m);
      this.meshes.push(m);
    }
    for (const b of s.barriers) {
      const m = new THREE.Mesh(
        new THREE.BoxGeometry(b.width, b.height, b.depth),
        new THREE.MeshStandardMaterial({ color: 0x626970, roughness: 1 }),
      );
      m.position.set(b.x, b.height / 2, b.z);
      m.userData = { id: b.id, type: "barrier" };
      this.group.add(m);
      this.meshes.push(m);
    }
    this.drawPaths();
    this.setTime(0);
  }
  drawPaths() {
    for (const m of this.pathGroup.children) {
      m.geometry.dispose();
      m.material.dispose();
    }
    this.pathGroup.clear();
    for (const [path, color] of [
      ...this.scenario.targets.map((t) => [t.path, 0xf2bb70]),
      [this.scenario.cameraPath, 0x89d9de],
    ])
      if (path.length > 1) {
        const g = new THREE.BufferGeometry().setFromPoints(
          path.map((p) => new THREE.Vector3(p.x, 0.05, p.z)),
        );
        this.pathGroup.add(
          new THREE.Line(g, new THREE.LineBasicMaterial({ color })),
        );
      }
  }
  setTime(time) {
    this.time = time;
    for (const m of this.meshes)
      if (m.userData.type === "target") {
        const t = m.userData.target,
          p = targetPosition(t, time);
        m.position.set(p.x, t.height / 2, p.z);
        m.visible = this.editor || (time >= t.start && time < t.end);
      }
    const p = this.scenario.cameraMotion
      ? pathPosition(this.scenario.cameraPath, time * 0.6, false)
      : null;
    this.camera.position.set(p?.x ?? 0, 1.65, p?.z ?? 8);
    this.camera.lookAt(p?.x ?? 0, 1.4, (p?.z ?? 8) - 20);
    this.camera.updateMatrixWorld();
    this.scene.updateMatrixWorld(true);
    this.pathGroup.visible = this.editor;
  }
  render(time) {
    this.setTime(time);
    this.renderer.render(this.scene, this.editor ? this.overhead : this.camera);
  }
  pick(x, y) {
    this.raycaster.setFromCamera(
      new THREE.Vector2(x * 2 - 1, 1 - y * 2),
      this.editor ? this.overhead : this.camera,
    );
    return this.raycaster.intersectObjects(
      this.meshes.filter((m) => m.visible),
    )[0]?.object.userData.id;
  }
  floorPoint(x, y) {
    this.raycaster.setFromCamera(
      new THREE.Vector2(x * 2 - 1, 1 - y * 2),
      this.overhead,
    );
    const v = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, v)
      ? { x: Math.round(v.x * 4) / 4, z: Math.round(v.z * 4) / 4 }
      : null;
  }
  score(x, y, time) {
    const previous = this.time;
    this.setTime(time);
    this.raycaster.setFromCamera(
      new THREE.Vector2(x * 2 - 1, 1 - y * 2),
      this.camera,
    );
    const hit = this.raycaster.intersectObjects(
      this.meshes.filter((m) => m.visible),
    )[0];
    let result = { result: "miss", target: null };
    if (hit?.object.userData.type === "target") {
      const u = hit.object.userData;
      const local = hit.object.worldToLocal(hit.point.clone());
      result = {
        result: u.kind === "shoot" ? "hit" : "no-shoot",
        target: u.id,
        local: {
          x: local.x / u.target.width + 0.5,
          y: 0.5 - local.y / u.target.height,
        },
      };
    } else if (hit) result.target = "barrier";
    this.setTime(previous);
    return result;
  }
}
