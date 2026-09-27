import test from "node:test";
import assert from "node:assert/strict";
import {
  parseVoiceCommand,
  applyRangeCommand,
} from "../public/core/range-command.js";
import { Magazine } from "../public/core/magazine.js";
import { SegmentClock } from "../public/core/segment-clock.js";
import { defaultScenario } from "../public/core/scenario.js";
import { VoiceControl } from "../public/core/voice-control.js";
test("Voice commands match whole final words and reuse magazine/held-segment semantics", () => {
  assert.equal(parseVoiceCommand(" Cover! "), "cover");
  assert.equal(parseVoiceCommand("RETROGRADE."), "retrograde");
  for (const text of [
    "we are moving",
    "cover me",
    "moving cover",
    "uncover",
    "remove",
  ])
    assert.equal(parseVoiceCommand(text), null);
  const magazine = new Magazine({ ammoEnabled: true, magazineSize: 3 });
  magazine.trigger();
  const timeline = new SegmentClock(
    {
      ...defaultScenario(),
      cameraMotion: true,
      pauseAtSegments: true,
      cameraSpeed: 1,
      cameraPath: [
        { x: 0, z: 2 },
        { x: 0, z: 1 },
        { x: 0, z: 0 },
      ],
    },
    0,
  );
  assert.equal(
    applyRangeCommand("moving", { magazine, timeline, time: 500 }).accepted,
    undefined,
  );
  assert.equal(
    applyRangeCommand("cover", { magazine, timeline, time: 500 }).magazine
      .remaining,
    3,
  );
  assert.equal(
    applyRangeCommand("moving", { magazine, timeline, time: 1200 }).accepted,
    true,
  );
  assert.equal(
    applyRangeCommand("retrograde", { magazine, timeline, time: 1500 })
      .accepted,
    undefined,
  );
  assert.equal(
    applyRangeCommand("retrograde", { magazine, timeline, time: 2300 })
      .accepted,
    true,
  );
  magazine.trigger();
  magazine.trigger();
  magazine.trigger();
  assert.equal(magazine.trigger().fired, false); // original dry trigger still refills
});
test("Speech lifecycle ignores interim/duplicate/stale-run results and stops on denial", () => {
  let latest,
    run = 1,
    calls = [],
    status = "";
  class Fake {
    constructor() {
      latest = this;
    }
    start() {
      this.onstart();
    }
    abort() {
      this.onend?.();
    }
  }
  const voice = new VoiceControl({
    Recognition: Fake,
    available: () => true,
    runId: () => run,
    command: (...args) => calls.push(args),
    status: (s) => (status = s),
  });
  voice.start();
  const result = [{ transcript: "Cover!" }];
  result.isFinal = false;
  latest.onresult({ resultIndex: 0, results: [result] });
  assert.equal(calls.length, 0);
  result.isFinal = true;
  latest.onresult({ resultIndex: 0, results: [result] });
  latest.onresult({ resultIndex: 0, results: [result] });
  assert.deepEqual(calls, [["cover", 1]]);
  run = 2;
  latest.onresult({ resultIndex: 1, results: [result, result] });
  assert.equal(calls.length, 1);
  latest.onerror({ error: "not-allowed" });
  assert.equal(voice.enabled, false);
  assert.match(status, /permission denied/);
  latest.onresult({ resultIndex: 2, results: [result, result, result] });
  assert.equal(calls.length, 1);
});
