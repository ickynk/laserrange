// Original synthesized effects: sharp transient, low report and short reflections.
// No third-party recordings or network/media downloads are needed.
export class ShotAudio {
  constructor(status = () => {}) {
    this.status = status;
    this.nodes = new Set();
    this.buffers = new Map();
  }
  unlock() {
    try {
      this.context ||= new AudioContext();
      this.context
        .resume()
        .then(() =>
          this.status(
            this.context.state === "running"
              ? "Shot audio ready · operator speakers"
              : "Click Preview gunshot to enable audio.",
          ),
        )
        .catch(() => this.status("Click Preview gunshot to enable audio."));
    } catch {
      this.status("Audio unavailable in this browser.");
    }
  }
  buffer(kind) {
    if (this.buffers.has(kind)) return this.buffers.get(kind);
    const ctx = this.context,
      dry = kind === "click",
      duration = dry ? 0.09 : 0.7;
    const b = ctx.createBuffer(
        1,
        Math.ceil(ctx.sampleRate * duration),
        ctx.sampleRate,
      ),
      data = b.getChannelData(0);
    let low = 0;
    for (let i = 0; i < data.length; i++) {
      const t = i / ctx.sampleRate,
        n = Math.random() * 2 - 1;
      low += 0.12 * (n - low);
      if (dry) {
        data[i] =
          0.6 * n * Math.exp(-t * 350) +
          0.25 * Math.sin(t * 2 * Math.PI * 1900) * Math.exp(-t * 130);
      } else {
        const crack = n * Math.exp(-t * 180);
        const report =
          0.65 *
          Math.sin(2 * Math.PI * (95 * t - 45 * t * t)) *
          Math.exp(-t * 27);
        const tail = low * 0.65 * Math.exp(-t * 9);
        const reflection =
          t > 0.035 ? 0.22 * n * Math.exp(-(t - 0.035) * 70) : 0;
        data[i] = Math.tanh(1.8 * (crack + report + tail + reflection)) * 0.8;
      }
    }
    this.buffers.set(kind, b);
    return b;
  }
  play(kind, settings = {}) {
    if (settings.shotAudio === false || settings.shotVolume === 0) return false;
    // Never queue old reports behind an unresolved browser audio permission.
    if (this.context?.state !== "running") {
      this.status(
        "Shot audio blocked: click Preview gunshot once on the operator.",
      );
      return false;
    }
    const ctx = this.context,
      source = ctx.createBufferSource(),
      gain = ctx.createGain();
    source.buffer = this.buffer(kind);
    gain.gain.value = Math.max(0, Math.min(1, settings.shotVolume ?? 0.3));
    source.connect(gain);
    gain.connect(ctx.destination);
    this.nodes.add(source);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.nodes.delete(source);
    };
    source.start();
    return true;
  }
  cancel() {
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {}
    }
    this.nodes.clear();
  }
}
