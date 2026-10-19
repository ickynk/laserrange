import * as THREE from "/vendor/three/build/three.module.js";
export function reactiveModel(t, physics, kind = "shoot") {
  const root = new THREE.Group();
  const colors = {
    frame: 0x34434d,
    plate: 0xdbe4e6,
    steel: 0x9aafb5,
    rubber: 0x526e7b,
    glass: 0x6f9493,
    can: 0x9eaeb7,
  };
  for (const p of physics.parts.filter((p) => p.targetId === t.id)) {
    const [w, h, d] = p.size;
    const group = new THREE.Group();
    group.name = p.name;
    group.userData.reactivePart = p.key;
    const material = new THREE.MeshStandardMaterial({
      color: colors[p.material],
      roughness:
        p.material === "glass" ? 0.18 : p.material === "rubber" ? 0.95 : 0.48,
      metalness: ["can", "plate", "steel"].includes(p.material) ? 0.65 : 0.08,
    });
    const add = (geo, mat = material) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    if (p.material === "plate") {
      const mesh = add(new THREE.CylinderGeometry(w / 2, w / 2, 0.045, 32));
      mesh.rotation.x = Math.PI / 2;
      if (t.asset === "drop-plate") {
        mesh.geometry.dispose();
        mesh.geometry = new THREE.BoxGeometry(w, h, 0.045);
        mesh.rotation.x = 0;
      }
      const ring = add(
        new THREE.TorusGeometry(w * 0.37, 0.006, 6, 32),
        new THREE.MeshStandardMaterial({ color: 0x586b75, roughness: 0.7 }),
      );
      ring.position.z = 0.025;
      if (t.asset === "dueling-tree") {
        const arm = t.width * 0.34;
        const rod = add(
          new THREE.BoxGeometry(arm, 0.035, 0.035),
          new THREE.MeshStandardMaterial({ color: colors.frame }),
        );
        rod.position.x = -arm / 2;
        rod.userData.reactiveSupport = true;
      }
    } else if (p.shape === "can") {
      add(new THREE.CylinderGeometry(w / 2, w / 2, h, 24));
      for (const y of [-0.46, -0.28, 0, 0.28, 0.46]) {
        const ring = add(new THREE.TorusGeometry(w * 0.505, 0.004, 5, 24));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = h * y;
      }
      const lid = add(
        new THREE.CylinderGeometry(w * 0.44, w * 0.44, 0.003, 24),
        new THREE.MeshStandardMaterial({
          color: 0x586874,
          metalness: 0.7,
          roughness: 0.4,
        }),
      );
      lid.position.y = h / 2 + 0.002;
    } else if (p.shape === "bottle") {
      const profile = [
        [0.32, 0],
        [0.48, 0.04],
        [0.5, 0.6],
        [0.44, 0.69],
        [0.2, 0.8],
        [0.19, 0.95],
        [0.24, 0.96],
        [0.24, 1],
      ];
      add(
        new THREE.LatheGeometry(
          profile.map(([r, y]) => new THREE.Vector2(w * r, h * (y - 0.5))),
          24,
        ),
      );
      const label = add(
        new THREE.CylinderGeometry(w * 0.505, w * 0.505, h * 0.23, 24, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xbac5c2, roughness: 1 }),
      );
      label.position.y = -h * 0.06;
    } else if (p.shape === "hex") {
      const shape = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        i
          ? shape.lineTo((Math.cos(a) * w) / 2, (Math.sin(a) * w) / 2)
          : shape.moveTo(w / 2, 0);
      }
      shape.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, w * 0.2, 0, Math.PI * 2, true);
      shape.holes.push(hole);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: h,
        bevelEnabled: true,
        bevelSize: 0.01,
        bevelThickness: 0.01,
        bevelSegments: 2,
        steps: 1,
      });
      geo.translate(0, 0, -h / 2);
      geo.rotateX(Math.PI / 2);
      add(geo);
    } else if (p.shape === "shard") {
      const geo = new THREE.TetrahedronGeometry(1);
      geo.scale(w, h, d);
      add(geo);
    } else add(new THREE.BoxGeometry(w, h, d));
    if (p.name === "rotor")
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5,
          r = t.width * 0.38;
        const arm = add(new THREE.BoxGeometry(0.045, r, 0.04));
        arm.position.set((Math.sin(a) * r) / 2, (Math.cos(a) * r) / 2, 0);
        arm.rotation.z = -a;
      }
    if (p.score && kind === "no-shoot") {
      for (const a of [-Math.PI / 4, Math.PI / 4]) {
        const cross = add(
          new THREE.BoxGeometry(w * 0.55, Math.min(w, h) * 0.07, 0.006),
          new THREE.MeshBasicMaterial({ color: 0x17252d }),
        );
        cross.position.z = d / 2 + 0.012;
        cross.rotation.z = a;
      }
    }
    group.traverse((m) => {
      if (m.isMesh) {
        m.name = p.name;
        m.userData.reactivePart = p.key;
        if (p.shape === "shard") m.raycast = () => {};
      }
    });
    root.add(group);
  }
  return root;
}
export function syncReactive(root, physics) {
  for (const child of root.children) {
    const p = physics.parts.find((p) => p.key === child.userData.reactivePart);
    if (!p) continue;
    child.position.copy(p.body.position);
    child.quaternion.copy(p.body.quaternion);
    child.visible = p.active;
  }
}
