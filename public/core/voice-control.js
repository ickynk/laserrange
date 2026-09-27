import { parseVoiceCommand } from "./range-command.js";
export class VoiceControl {
  constructor({
    Recognition,
    available,
    runId,
    command,
    status,
    fast = () => false,
  }) {
    Object.assign(this, {
      Recognition,
      available,
      runId,
      command,
      status,
      fast,
    });
    this.enabled = false;
    this.lastCommand = -Infinity;
    this.shortEnds = 0;
  }
  start() {
    if (!this.Recognition)
      return this.status(
        "Voice recognition is unavailable in this browser. Use the laser or operator controls.",
        false,
      );
    if (!this.available())
      return this.status(
        "Connect the phone and keep this page visible before enabling voice.",
        false,
      );
    this.enabled = true;
    this.shortEnds = 0;
    this.listen();
  }
  listen() {
    clearTimeout(this.retry);
    if (!this.enabled || !this.available())
      return this.stop("Voice stopped. Reconnect and enable voice again.");
    let r;
    try {
      r = this.recognition = new this.Recognition();
    } catch {
      return this.stop(
        "Speech recognition could not initialize. Use the existing controls.",
      );
    }
    const run = this.runId(),
      seen = new Set();
    const current = () => this.enabled && this.recognition === r;
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = this.fast();
    r.maxAlternatives = 1;
    this.status("Starting microphone…", true);
    const began = Date.now();
    let speechEnded = null;
    r.onspeechstart = () => {
      speechEnded = null;
    };
    r.onspeechend = () => {
      speechEnded = Date.now();
    };
    r.onstart = () => {
      if (current()) {
        clearTimeout(this.deadline);
        this.status("Listening · Moving / Cover / Retrograde", true);
      }
    };
    let tentative = null;
    const cancelTentative = () => {
      clearTimeout(this.tentativeTimer);
      tentative = null;
    };
    const emit = (command, index) => {
      const now = Date.now();
      if (
        !current() ||
        !this.available() ||
        run !== this.runId() ||
        seen.has(index) ||
        (speechEnded && now - speechEnded > 3000) ||
        now - this.lastCommand < 1200
      )
        return;
      seen.add(index);
      this.lastCommand = now;
      this.shortEnds = 0;
      this.command(command, run);
    };
    r.onresult = (e) => {
      if (!current() || !this.available() || run !== this.runId()) return;
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (seen.has(i)) continue;
        const command = parseVoiceCommand(result[0].transcript);
        if (result.isFinal) {
          cancelTentative();
          if (command) emit(command, i);
          seen.add(i);
          break;
        }
        if (!this.fast() || !command) {
          cancelTentative();
          continue;
        }
        if (tentative?.index === i && tentative.command === command) continue;
        cancelTentative();
        tentative = { index: i, command };
        // Opt-in: act on an exact preliminary command unchanged for 250 ms.
        // A final revision cannot undo it, so keep final-only as the default.
        this.tentativeTimer = setTimeout(() => {
          if (this.fast()) emit(command, i);
          tentative = null;
        }, 250);
      }
    };
    r.onerror = (e) => {
      if (!current() || e.error === "no-speech") return;
      this.stop(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "Microphone or speech permission denied. Allow it in browser settings, then enable voice again."
          : `Voice stopped (${e.error || "recognition error"}). Check microphone/network and enable voice again.`,
      );
    };
    r.onend = () => {
      if (!current()) return;
      cancelTentative();
      clearTimeout(this.deadline);
      if (Date.now() - began < 1500) this.shortEnds++;
      else this.shortEnds = 0;
      if (this.shortEnds >= 5)
        return this.stop(
          "Voice service keeps stopping. Enable voice again or use the existing controls.",
        );
      this.status("Microphone restarting…", true);
      this.retry = setTimeout(() => this.listen(), 600);
    };
    this.deadline = setTimeout(() => {
      if (current())
        this.stop(
          "Microphone did not start. Check permission and enable voice again.",
        );
    }, 10000);
    try {
      r.start();
    } catch {
      this.stop("Microphone could not start. Enable voice again.");
    }
  }
  resetRun() {
    if (!this.enabled) return;
    clearTimeout(this.tentativeTimer);
    const old = this.recognition;
    this.recognition = null;
    clearTimeout(this.deadline);
    clearTimeout(this.retry);
    try {
      old?.abort();
    } catch {}
    this.status("Microphone restarting for new session…", true);
    this.retry = setTimeout(() => this.listen(), 600);
  }
  stop(message = "Voice controls off.") {
    this.enabled = false;
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    clearTimeout(this.tentativeTimer);
    const old = this.recognition;
    this.recognition = null;
    try {
      old?.abort();
    } catch {}
    this.status(message, false);
  }
}
