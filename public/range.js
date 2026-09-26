import { cameraPose } from "./core/camera-path.js";
import * as THREE from "/vendor/three/build/three.module.js";
import {
  targetPosition,
  pathPosition,
  targetActive,
  zoneScore,
} from "./core/scenario.js";

import { barrierModel, targetModel } from "./core/assets.js";
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
    const sun = new THREE.DirectionalLight(0xffefd9, 3);
    sun.position.set(-5, 12, 9);
    this.scene.add(sun);
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
    this.impacts = [];
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
    this.clearImpacts();
    this.scenario = s;
    this.roles = roles;
    for (const m of this.meshes) {
      m.traverse((child) => {
        child.geometry?.dispose();
        child.material?.map?.dispose();
        child.material?.dispose();
      });
    }
    this.group.clear();
    this.meshes = [];
    for (const t of s.targets) {
      const kind = roles[t.id] || (t.kind === "random" ? "shoot" : t.kind);
      const m = targetModel(t, kind);
      m.userData = { id: t.id, type: "target", target: t, kind };
      this.group.add(m);
      this.meshes.push(m);
    }
    for (const b of s.barriers) {
      const m = barrierModel(b);
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
    for (const [i, segment] of (this.scenario.cameraSegments || []).entries()) {
      if (!segment.focus || !this.scenario.cameraPath[i + 1]) continue;
      const a = this.scenario.cameraPath[i],
        b = this.scenario.cameraPath[i + 1],
        f = segment.focus;
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3((a.x + b.x) / 2, 0.08, (a.z + b.z) / 2),
        new THREE.Vector3(f.x, 0.08, f.z),
      ]);
      this.pathGroup.add(
        new THREE.Line(
          geo,
          new THREE.LineDashedMaterial({
            color: 0xffdc91,
            dashSize: 0.25,
            gapSize: 0.15,
          }),
        ),
      );
      this.pathGroup.children.at(-1).computeLineDistances();
      const marker = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.23, 24),
        new THREE.MeshBasicMaterial({
          color: 0xffdc91,
          side: THREE.DoubleSide,
        }),
      );
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(f.x, 0.1, f.z);
      this.pathGroup.add(marker);
    }
  }
  setTime(time) {
    this.time = time;
    for (const m of this.meshes)
      if (m.userData.type === "target") {
        const t = m.userData.target,
          p = targetPosition(t, time);
        m.position.set(p.x, t.height / 2, p.z);
        m.rotation.y = ((t.rotation || 0) * Math.PI) / 180;
        m.visible = this.editor || targetActive(t, time);
      }
    const pose = cameraPose(this.scenario, time);
    this.camera.position.set(pose.x, pose.y, pose.z);
    if (this.camera.fov !== pose.fov) {
      this.camera.fov = pose.fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(
      pose.x + Math.sin(pose.yaw) * Math.cos(pose.pitch) * 20,
      pose.y + Math.sin(pose.pitch) * 20,
      pose.z - Math.cos(pose.yaw) * Math.cos(pose.pitch) * 20,
    );
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
    const hit = this.raycaster.intersectObjects(
      this.meshes.filter((m) => m.visible),
      true,
    )[0];
    let root = hit?.object;
    while (root && !root.userData.id) root = root.parent;
    return root?.userData.id;
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
      true,
    )[0];
    let root = hit?.object;
    while (root && !root.userData.id) root = root.parent;
    let result = { result: "miss", target: null };
    if (root?.userData.type === "target") {
      const u = root.userData;
      const local = root.worldToLocal(hit.point.clone());
      result = {
        result: u.kind === "shoot" ? "hit" : "no-shoot",
        target: u.id,
        local: {
          x: local.x / u.target.width + 0.5,
          y: 0.5 - local.y / u.target.height,
        },
      };
      const zone = zoneScore(u.target, result.local);
      Object.assign(result, zone, {
        points: u.kind === "shoot" ? zone.points : 0,
      });
    } else if (hit) result.target = root?.userData.id || "barrier";
    if (hit) {
      result.impact = {
        objectId: root.userData.id,
        partId: hit.object.name,
        point: hit.object.worldToLocal(hit.point.clone()).toArray(),
        normal: hit.face.normal.toArray(),
      };
    }
    this.setTime(previous);
    return result;
  }
  clearImpacts() {
    for (const mark of this.impacts || []) {
      mark.removeFromParent();
      mark.traverse((child) => {
        child.geometry?.dispose();
        child.material?.dispose();
      });
    }
    this.impacts = [];
  }
  addImpact(impact) {
    const root = this.meshes.find((m) => m.userData.id === impact.objectId);
    const target = impact.partId ? root?.getObjectByName(impact.partId) : root;
    if (!target) return;
    const mark = new THREE.Group();
    const normal = new THREE.Vector3(...impact.normal).normalize();
    mark.position.fromArray(impact.point).addScaledVector(normal, 0.002);
    mark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    for (const [radius, color, z] of [
      [0.035, 0xe8d8b9, 0],
      [0.022, 0x10151c, 0.001],
    ]) {
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 16),
        new THREE.MeshBasicMaterial({
          color,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        }),
      );
      dot.raycast = () => {};
      dot.position.z = z;
      mark.add(dot);
    }
    target.add(mark);
    this.impacts.push(mark);
  }
}
