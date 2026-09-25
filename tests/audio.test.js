import test from "node:test";
import assert from "node:assert/strict";
import { SessionAudio } from "../public/core/audio.js";
test("Beep honors mute, settings and cancellation during audio permission resume", async () => {
  const original = globalThis.AudioContext;
  let resume,
    starts = [],
    stops = 0,
    frequency,
    volume;
  globalThis.AudioContext = class {
    currentTime = 10;
    destination = {};
    resume() {
      return new Promise((r) => (resume = r));
    }
    createOscillator() {
      const o = {
        frequency: {},
        connect() {},
        disconnect() {},
        start(at) {
          starts.push(at);
          frequency = o.frequency.value;
        },
        stop() {
          stops++;
        },
      };
      return o;
    }
    createGain() {
      return {
        gain: {
          setValueAtTime(v) {
            volume = v;
          },
          exponentialRampToValueAtTime() {},
        },
        connect() {},
        disconnect() {},
      };
    }
  };
  try {
    const audio = new SessionAudio();
    await audio.schedule({ beep: false });
    await audio.schedule({ volume: 0 });
    assert.equal(audio.context, null);
    const cancelled = audio.schedule({}, 1);
    audio.cancel();
    resume();
    await cancelled;
    assert.equal(starts.length, 0);
    const scheduled = audio.schedule(
      { frequency: 700, volume: 0.1, beepDuration: 0.2 },
      2,
    );
    resume();
    await scheduled;
    assert.equal(frequency, 700);
    assert.equal(volume, 0.1);
    assert.ok(starts[0] <= 12 && starts[0] > 11.9);
    audio.cancel();
    assert.equal(stops, 2);
  } finally {
    globalThis.AudioContext = original;
  }
});
