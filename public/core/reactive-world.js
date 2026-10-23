import { targetActive } from "./scenario.js";
import * as C from "cannon-es";
import { isReactive } from "./reactive-types.js";
import { dodecaFaces, dodecaVertices } from "./dodecahedron.js";
const DT = 1 / 120;
const v = (x = 0, y = 0, z = 0) => new C.Vec3(x, y, z);
// SI-scale rigid bodies plus one-degree-of-freedom steel mechanisms. Shot
// impulses are configurable simulation input, not measured firearm ballistics.
export class ReactiveWorld {
  constructor(scenario) {
    this.scenario = scenario;
    this.parts = [];
    this.joints = [];
    this.events = [];
    this.tick = 0;
    this.eventIndex = 0;
    this.world = new C.World({ gravity: v(0, -9.81, 0), allowSleep: false });
    this.world.solver.iterations = 16;
    this.world.defaultContactMaterial.friction = 0.45;
    this.world.defaultContactMaterial.restitution = 0.12;
    this.surfaceMaterial = new C.Material("range-surfaces");
    this.rubberMaterial = new C.Material("reactive-rubber");
    this.world.addContactMaterial(
      new C.ContactMaterial(this.surfaceMaterial, this.rubberMaterial, {
        friction: 0.65,
        restitution: 0.6,
      }),
    );
    this.world.addContactMaterial(
      new C.ContactMaterial(this.rubberMaterial, this.rubberMaterial, {
        friction: 0.65,
        restitution: 0.6,
      }),
    );
    const floor = new C.Body({
      mass: 0,
      shape: new C.Plane(),
      material: this.surfaceMaterial,
    });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(floor);
    for (const b of scenario.barriers) {
      const add = (w, h, d, x, y, z) => {
        const a = ((b.rotation || 0) * Math.PI) / 180,
          body = new C.Body({
            mass: 0,
            material: this.surfaceMaterial,
            shape: new C.Box(v(w / 2, h / 2, d / 2)),
          });
        body.position.set(
          b.x + x * Math.cos(a) + z * Math.sin(a),
          y,
          b.z - x * Math.sin(a) + z * Math.cos(a),
        );
        body.quaternion.setFromEuler(0, a, 0);
        this.world.addBody(body);
      };
      if (["window", "door", "ports"].includes(b.asset)) {
        const w = b.width,
          h = b.height,
          d = b.depth;
        add(w * 0.2, h, d, -w * 0.4, h / 2, 0);
        add(w * 0.2, h, d, w * 0.4, h / 2, 0);
        add(w * 0.6, h * 0.2, d, 0, h * 0.9, 0);
        if (b.asset !== "door") add(w * 0.6, h * 0.35, d, 0, h * 0.175, 0);
      } else add(b.width, b.height, b.depth, 0, b.height / 2, 0);
    }
    for (const t of scenario.targets.filter(isReactive)) this.build(t);
    this.placeJoints();
    this.checkpoints = [this.snapshot()];
  }
  part(
    t,
    name,
    shape,
    size,
    pos,
    {
      mass = 0,
      active = true,
      score = true,
      rotation = null,
      material = "steel",
    } = {},
  ) {
    let collision;
    if (shape === "dodeca")
      collision = new C.ConvexPolyhedron({
        vertices: dodecaVertices(size).map((p) => v(...p)),
        faces: dodecaFaces.map((f) => [...f]),
      });
    else if (
      shape === "cylinder" ||
      shape === "can" ||
      shape === "bottle" ||
      shape === "hex"
    )
      collision = new C.Cylinder(
        size[0] / 2,
        size[0] / 2,
        size[1],
        shape === "hex" ? 6 : 16,
      );
    else collision = new C.Box(v(size[0] / 2, size[1] / 2, size[2] / 2));
    const body = new C.Body({
      mass,
      shape: collision,
      material: this.surfaceMaterial,
      linearDamping: 0.12,
      angularDamping: 0.18,
    });
    body.position.copy(pos);
    if (rotation) body.quaternion.copy(rotation);
    if (material === "rubber") {
      body.material = this.rubberMaterial;
      body.angularDamping = 0.32;
    }
    const p = {
      key: `${t.id}/${name}`,
      targetId: t.id,
      name,
      shape,
      size,
      body,
      mass,
      hits: 0,
      active,
      score,
      material,
    };
    if (!active) {
      body.type = C.Body.KINEMATIC;
      body.collisionFilterMask = 0;
    }
    this.parts.push(p);
    this.world.addBody(body);
    return p;
  }
  build(t) {
    const yaw = ((t.rotation || 0) * Math.PI) / 180,
      q = new C.Quaternion().setFromEuler(0, yaw, 0),
      e = t.elevation || 0;
    const at = (x, y, z = 0) => q.vmult(v(x, y, z)).vadd(v(t.x, e, t.z));
    const staticBox = (name, size, x, y, z = 0) =>
      this.part(t, name, "box", size, at(x, y, z), {
        rotation: q,
        score: false,
        material: "frame",
      });
    if (
      ["dueling-tree", "texas-star", "drop-plate", "slide-plate"].includes(
        t.asset,
      )
    ) {
      staticBox("base", [t.width * 0.7, 0.08, 0.65], 0, 0.04);
      if (t.asset !== "drop-plate")
        staticBox("post", [0.09, t.height, 0.09], 0, t.height / 2, -0.15);
    }
    if (t.asset === "dueling-tree") {
      const arm = t.width * 0.34,
        r = Math.min(t.width * 0.13, t.height * 0.13 * 0.42);
      for (let i = 0; i < 6; i++) {
        const part = this.part(
          t,
          `paddle-${i}`,
          "box",
          [r * 2, r * 2, 0.045],
          at(0, 0),
          { rotation: q, mass: 2, material: "plate" },
        );
        part.body.type = C.Body.KINEMATIC;
        this.joints.push({
          kind: "tree",
          t,
          q,
          origin: at(0, t.height * (0.22 + i * 0.13)),
          angle: i % 2 ? Math.PI : 0,
          omega: 0,
          arm,
          parts: [part],
          rest: i % 2 ? Math.PI : 0,
        });
      }
    } else if (t.asset === "texas-star") {
      const radius = t.width * 0.38,
        center = at(0, t.height * 0.55);
      const rotor = this.part(
        t,
        "rotor",
        "box",
        [t.width * 0.08, t.width * 0.08, 0.12],
        center,
        { score: false, material: "frame" },
      );
      const plates = [];
      for (let i = 0; i < 5; i++) {
        const plate = this.part(
          t,
          `plate-${i}`,
          "box",
          [t.width * 0.19, t.width * 0.19, 0.045],
          center,
          { mass: 2, material: "plate" },
        );
        plate.body.type = C.Body.KINEMATIC;
        plates.push(plate);
      }
      this.joints.push({
        kind: "star",
        t,
        q,
        origin: center,
        angle: 0.12,
        omega: 0,
        arm: radius,
        parts: plates,
        rotor,
        attached: [true, true, true, true, true],
      });
    } else if (t.asset === "drop-plate") {
      const plate = this.part(
        t,
        "plate",
        "box",
        [t.width, t.height, 0.045],
        at(0, t.height / 2),
        { mass: 3, material: "plate" },
      );
      plate.body.type = C.Body.KINEMATIC;
      this.joints.push({
        kind: "drop",
        t,
        q,
        origin: at(0, 0.08),
        angle: 0,
        omega: 0,
        arm: t.height / 2,
        parts: [plate],
        released: false,
      });
    } else if (t.asset === "slide-plate") {
      const plate = this.part(
        t,
        "plate",
        "box",
        [t.width, t.width, 0.045],
        at(0, t.height - t.width / 2, 0.08),
        { mass: 3, rotation: q, material: "plate" },
      );
      plate.body.type = C.Body.KINEMATIC;
      this.joints.push({
        kind: "slide",
        t,
        q,
        origin: plate.body.position.clone(),
        parts: [plate],
        released: false,
        distance: 0,
        speed: 0,
        travel: t.height - t.width - 0.08,
      });
    } else if (["rubber-hex", "rubber-dodeca"].includes(t.asset)) {
      this.part(
        t,
        "dodeca",
        "dodeca",
        [t.width, t.height, t.width],
        at(0, t.height / 2),
        { mass: 0.45, rotation: q, material: "rubber" },
      );
    } else if (t.asset === "glass-bottle") {
      this.part(
        t,
        "bottle",
        "bottle",
        [t.width, t.height, t.width],
        at(0, t.height / 2),
        { mass: 0.25, rotation: q, material: "glass" },
      );
      for (let i = 0; i < 8; i++)
        this.part(
          t,
          `shard-${i}`,
          "shard",
          [t.width * 0.32, t.height * 0.22, t.width * 0.25],
          at(0, t.height / 2),
          { mass: 0.025, active: false, score: false, material: "glass" },
        );
    } else {
      const rows = t.asset === "can-stack" ? (t.stackRows ?? 3) : 1;
      let index = 0;
      for (let row = 0; row < rows; row++)
        for (let n = 0; n < rows - row; n++)
          this.part(
            t,
            `can-${index++}`,
            "can",
            [t.width, t.height, t.width],
            at(
              (n - (rows - row - 1) / 2) * t.width * 1.04,
              t.height * (row + 0.5) + 0.002 * row,
            ),
            { mass: 0.12, rotation: q, material: "can" },
          );
    }
  }
  placeJoints() {
    for (const j of this.joints) {
      if (j.kind === "slide") {
        const body = j.parts[0].body;
        body.position.copy(j.origin.vadd(v(0, -j.distance, 0)));
        body.quaternion.copy(j.q);
        body.velocity.setZero();
        body.angularVelocity.setZero();
        body.aabbNeedsUpdate = true;
      } else if (j.kind === "star") {
        j.rotor.body.quaternion.copy(
          j.q.mult(new C.Quaternion().setFromAxisAngle(v(0, 0, 1), -j.angle)),
        );
        j.parts.forEach((p, i) => {
          if (!j.attached[i]) return;
          const a = j.angle + (i * Math.PI * 2) / 5;
          p.body.position.copy(
            j.q
              .vmult(v(Math.sin(a) * j.arm, Math.cos(a) * j.arm, 0))
              .vadd(j.origin),
          );
          p.body.quaternion.copy(j.q);
          p.body.velocity.setZero();
          p.body.angularVelocity.setZero();
          p.body.aabbNeedsUpdate = true;
        });
      } else {
        const p = j.parts[0],
          a = j.angle;
        const local =
          j.kind === "tree"
            ? v(Math.cos(a) * j.arm, 0, -Math.sin(a) * j.arm)
            : v(0, Math.cos(a) * j.arm, -Math.sin(a) * j.arm);
        p.body.position.copy(j.q.vmult(local).vadd(j.origin));
        p.body.quaternion.copy(
          j.q.mult(
            new C.Quaternion().setFromAxisAngle(
              j.kind === "tree" ? v(0, 1, 0) : v(-1, 0, 0),
              a,
            ),
          ),
        );
        p.body.velocity.setZero();
        p.body.angularVelocity.setZero();
        p.body.aabbNeedsUpdate = true;
      }
    }
  }
  step() {
    this.tick++;
    while (
      this.eventIndex < this.events.length &&
      this.events[this.eventIndex].tick <= this.tick
    )
      this.apply(this.events[this.eventIndex++]);
    for (const j of this.joints) {
      if (!targetActive(j.t, this.tick * DT)) continue;
      if (j.kind === "star") {
        const torque = j.attached.reduce(
          (sum, on, i) =>
            sum +
            (on
              ? 2 * 9.81 * j.arm * Math.sin(j.angle + (i * 2 * Math.PI) / 5)
              : 0),
          0,
        );
        const inertia =
          0.6 + j.attached.filter(Boolean).length * 2 * j.arm * j.arm;
        j.omega += (torque / inertia - j.omega * 0.22) * DT;
        j.angle += j.omega * DT;
      } else if (j.kind === "tree") {
        // Over-center hinge with two stable stops and dissipative rebound.
        j.omega += (-3 * Math.sin(2 * j.angle) - j.omega * 0.65) * DT;
        j.angle += j.omega * DT;
        if (j.angle < 0) {
          j.angle = 0;
          j.omega = Math.abs(j.omega) * 0.12;
        }
        if (j.angle > Math.PI) {
          j.angle = Math.PI;
          j.omega = -Math.abs(j.omega) * 0.12;
        }
      } else if (j.kind === "slide") {
        if (j.released && j.distance < j.travel) {
          j.speed += 9.81 * DT;
          j.distance = Math.min(j.travel, j.distance + j.speed * DT);
          if (j.distance === j.travel) j.speed = 0;
        }
      } else if (j.released) {
        j.omega +=
          ((9.81 / j.arm) * Math.sin(j.angle + 0.03) - j.omega * 0.6) * DT;
        j.angle += j.omega * DT;
        if (j.angle > Math.PI / 2) {
          j.angle = Math.PI / 2;
          j.omega = -Math.abs(j.omega) * 0.12;
        }
      }
    }
    this.placeJoints();
    for (const p of this.parts) {
      const t = this.scenario.targets.find((t) => t.id === p.targetId);
      const visible = p.active && targetActive(t, this.tick * DT);
      p.body.collisionFilterMask = visible ? -1 : 0;
      if (p.mass) {
        const j = this.joints.find((j) => j.parts.includes(p));
        const constrained =
          j && (j.kind !== "star" || j.attached[j.parts.indexOf(p)]);
        p.body.type =
          visible && !constrained ? C.Body.DYNAMIC : C.Body.KINEMATIC;
        if (!visible) {
          p.body.velocity.setZero();
          p.body.angularVelocity.setZero();
        }
      }
    }
    this.world.step(DT);
    if (this.tick % 30 === 0) {
      this.checkpoints = this.checkpoints.filter((s) => s.tick !== this.tick);
      this.checkpoints.push(this.snapshot());
      this.checkpoints.sort((a, b) => a.tick - b.tick);
      if (this.checkpoints.length > 241) this.checkpoints.splice(1, 1);
    }
  }
  canScore(p) {
    if (!p?.active || !p.score) return false;
    const j = this.joints.find((j) => j.parts.includes(p));
    if (j?.kind === "star") return j.attached[j.parts.indexOf(p)];
    if (["drop", "slide"].includes(j?.kind)) return !j.released;
    return true;
  }
  apply(event) {
    const p = this.parts.find((p) => p.key === event.key);
    if (!this.canScore(p)) return;
    const t = this.scenario.targets.find((t) => t.id === p.targetId),
      strength = t.impactStrength ?? 1;
    const j = this.joints.find((j) => j.parts.includes(p));
    if (j) {
      p.hits++;
      if (p.hits < (t.hitsToFall ?? 1)) return;
    }
    if (j?.kind === "slide") {
      j.released = true;
      return;
    }
    if (j?.kind === "tree") {
      p.hits = 0;
      j.omega += (j.angle < Math.PI / 2 ? 1 : -1) * 7 * strength;
      return;
    }
    if (j?.kind === "drop") {
      if (!j.released) {
        j.released = true;
        j.omega = 2.8 * strength;
      }
      return;
    }
    if (j?.kind === "star") {
      const i = j.parts.indexOf(p);
      if (!j.attached[i]) return;
      j.attached[i] = false;
      p.body.type = C.Body.DYNAMIC;
      const a = j.angle + (i * Math.PI * 2) / 5;
      p.body.velocity.copy(
        j.q.vmult(
          v(Math.cos(a) * j.arm * j.omega, -Math.sin(a) * j.arm * j.omega, 0),
        ),
      );
    }
    const direction = v(...event.direction),
      point = v(...event.point);
    if (p.shape === "bottle") {
      p.active = false;
      p.body.collisionFilterMask = 0;
      p.body.type = C.Body.KINEMATIC;
      p.body.velocity.setZero();
      this.parts
        .filter((s) => s.targetId === p.targetId && s.shape === "shard")
        .forEach((s, i) => {
          s.active = true;
          s.body.type = C.Body.DYNAMIC;
          s.body.collisionFilterMask = -1;
          s.body.position.copy(
            p.body.position.vadd(
              v(
                ((i % 2) - 0.5) * t.width * 0.5,
                ((i >> 1) - 1.5) * t.height * 0.22,
                0,
              ),
            ),
          );
          s.body.velocity.copy(
            direction
              .scale(strength * 2)
              .vadd(
                v(
                  Math.cos(i * 2.4) * 1.2,
                  1.4 + Math.sin(i) * 0.4,
                  Math.sin(i * 2.4) * 1.2,
                ),
              ),
          );
          s.body.angularVelocity.set(i - 3, 3 - i * 0.5, 2);
          s.body.aabbNeedsUpdate = true;
        });
      return;
    }
    const impulse = direction.scale(
      (p.shape === "can" ? 0.35 : p.shape === "dodeca" ? 0.9 : 1.3) * strength,
    );
    if (p.shape === "dodeca") impulse.y += 0.45 * strength;
    p.body.applyImpulse(impulse, point.vsub(p.body.position));
  }
  impact(event) {
    const tick = Math.max(1, Math.round(event.time / DT));
    const end = this.tick;
    this.events.push({ ...event, tick });
    this.events.sort((a, b) => a.tick - b.tick);
    this.checkpoints = this.checkpoints.filter((s) => s.tick < tick);
    this.restore(this.checkpoints.at(-1) || this.initial);
    this.seek(Math.max(end, tick) * DT);
  }
  snapshot() {
    const s = {
      tick: this.tick,
      eventIndex: this.eventIndex,
      joints: this.joints.map((j) => ({
        angle: j.angle,
        omega: j.omega,
        released: j.released,
        distance: j.distance,
        speed: j.speed,
        attached: j.attached?.slice(),
      })),
      bodies: this.parts.map((p) => ({
        active: p.active,
        hits: p.hits,
        type: p.body.type,
        mask: p.body.collisionFilterMask,
        p: p.body.position.toArray(),
        q: p.body.quaternion.toArray(),
        v: p.body.velocity.toArray(),
        w: p.body.angularVelocity.toArray(),
      })),
    };
    if (!this.initial) this.initial = s;
    return s;
  }
  restore(s) {
    this.tick = s.tick;
    this.eventIndex = s.eventIndex;
    this.world.time = s.tick * DT;
    this.world.stepnumber = s.tick;
    this.joints.forEach((j, i) =>
      Object.assign(j, s.joints[i], {
        attached: s.joints[i].attached?.slice(),
      }),
    );
    this.parts.forEach((p, i) => {
      const b = p.body,
        a = s.bodies[i];
      p.active = a.active;
      p.hits = a.hits;
      b.type = a.type;
      b.collisionFilterMask = a.mask;
      b.position.set(...a.p);
      b.quaternion.set(...a.q);
      b.velocity.set(...a.v);
      b.angularVelocity.set(...a.w);
      b.previousPosition.copy(b.position);
      b.interpolatedPosition.copy(b.position);
      b.previousQuaternion.copy(b.quaternion);
      b.interpolatedQuaternion.copy(b.quaternion);
      b.force.setZero();
      b.torque.setZero();
      b.aabbNeedsUpdate = true;
    });
    this.world.broadphase.dirty = true;
  }
  seek(time) {
    const target = Math.max(0, Math.round(time / DT));
    if (target < this.tick) {
      const s =
        this.checkpoints.findLast((s) => s.tick <= target) || this.initial;
      this.restore(s);
    }
    while (this.tick < target) this.step();
  }
}
