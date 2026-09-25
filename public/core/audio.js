export class SessionAudio {
  constructor() {
    this.context = null;
    this.nodes = [];
  }
  async schedule(settings = {}, delay = 0) {
    this.cancel();
    const generation = this.generation;
    if (settings.beep === false || settings.volume === 0) return;
    const requestedAt = performance.now();
    try {
      this.context ||= new AudioContext();
      await this.context.resume();
      if (generation !== this.generation) return;
      const osc = this.context.createOscillator(),
        gain = this.context.createGain();
      const at =
        this.context.currentTime +
        Math.max(0, delay - (performance.now() - requestedAt) / 1000);
      osc.frequency.value = settings.frequency ?? 880;
      gain.gain.setValueAtTime(settings.volume ?? 0.08, at);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        at + (settings.beepDuration ?? 0.12),
      );
      osc.connect(gain);
      gain.connect(this.context.destination);
      osc.start(at);
      osc.stop(at + (settings.beepDuration ?? 0.12));
      this.nodes.push(osc);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
        this.nodes = this.nodes.filter((n) => n !== osc);
      };
    } catch {
      /* Visual countdown works if the browser blocks audio. */
    }
  }
  cancel() {
    this.generation = (this.generation || 0) + 1;
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {}
    }
    this.nodes = [];
  }
}
