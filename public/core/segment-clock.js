// Scene time can pause/reverse without changing the wall-clock shot timer.
export class SegmentClock {
  constructor(s, started, mode = "3d") {
    this.started = started;
    this.duration = s.duration;
    this.bounds = [0];
    for (let i = 1; i < s.cameraPath.length; i++) {
      const a = s.cameraPath[i - 1],
        b = s.cameraPath[i],
        d = Math.hypot(b.x - a.x, b.z - a.z) / (s.cameraSpeed ?? 0.6);
      if (d > 1e-6) this.bounds.push(this.bounds.at(-1) + d);
    }
    this.enabled =
      mode === "3d" &&
      s.cameraMotion &&
      s.pauseAtSegments === true &&
      this.bounds.length > 1;
    this.events = [
      {
        wall: started,
        from: 0,
        to: this.enabled ? this.bounds[1] : s.duration,
      },
    ];
  }
  time(wall) {
    if (!this.enabled)
      return Math.max(0, Math.min(this.duration, (wall - this.started) / 1000));
    const e = this.events.findLast((e) => e.wall <= wall) || this.events[0];
    const distance = Math.min(
      Math.abs(e.to - e.from),
      Math.max(0, (wall - e.wall) / 1000),
    );
    return e.from + Math.sign(e.to - e.from) * distance;
  }
  state(wall) {
    const time = this.time(wall),
      e = this.events.at(-1),
      held =
        this.enabled && wall >= this.started && Math.abs(time - e.to) < 1e-6;
    return {
      enabled: this.enabled,
      held,
      time,
      point: this.bounds.findIndex((b) => Math.abs(b - time) < 1e-6),
      total: this.bounds.length - 1,
      previous: held && time > 1e-6,
      next: held && time < this.bounds.at(-1) - 1e-6,
    };
  }
  step(direction, wall) {
    const s = this.state(wall);
    if (!s.held || ![-1, 1].includes(direction)) return false;
    const to =
      direction > 0
        ? this.bounds.find((b) => b > s.time + 1e-6)
        : this.bounds.findLast((b) => b < s.time - 1e-6);
    if (to === undefined) return false;
    this.events.push({ wall, from: s.time, to });
    return true;
  }
}
