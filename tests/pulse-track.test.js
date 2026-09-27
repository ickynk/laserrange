import test from "node:test";
import assert from "node:assert/strict";
import { LaserDetector, chooseReference } from "../public/core/detector.js";
import { VideoPulseFilter } from "../public/core/video-filter.js";
import { calculateZero } from "../public/core/zero.js";
const w = 160,
  h = 100;
function frame(x = null, y = 40, value = 220, color = "red") {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < data.length; i += 4) data.set([20, 20, 20, 255], i);
  if (x !== null)
    for (let dy = 0; dy < 3; dy++)
      for (let dx = 0; dx < 3; dx++)
        data[((y + dy) * w + x + dx) * 4 + (color === "red" ? 0 : 1)] = value;
  return data;
}
test("Moving red/green emissions lasting beyond cooldown produce one initial impact each, including five-shot zero", () => {
  for (const color of ["red", "green"])
    for (const source of [true, false]) {
      const d = new LaserDetector(w, h);
      d.color = color;
      d.threshold = 37;
      const blank = frame();
      const events = [];
      d.detect(blank, source ? blank : null, 0);
      for (let shot = 0; shot < 5; shot++) {
        const start = 50 + shot * 450;
        for (let f = 0; f < 12; f++) {
          const time = start + f * 16;
          events.push(
            ...d.detect(
              frame(
                78 + Math.floor(f / 2),
                48 - Math.floor(f / 3),
                220 - f * 8,
                color,
              ),
              source ? blank : null,
              time,
            ),
          );
        }
        d.detect(blank, source ? blank : null, start + 200);
        d.detect(blank, source ? blank : null, start + 220);
        d.detect(blank, source ? blank : null, start + 240);
      }
      assert.equal(events.length, 5, `${color}/${source}`);
      for (const p of events) {
        assert.equal(p.x, 79 / (w - 1));
        assert.equal(p.y, 49 / (h - 1));
      }
      const zero = calculateZero(events);
      assert.ok(Math.abs(zero.x - (0.5 - 79 / (w - 1))) < 1e-9);
    }
});
test("Rapid distinct pulses survive, one-frame flicker does not retrigger, reset releases tracks", () => {
  const d = new LaserDetector(w, h);
  d.threshold = 37;
  const blank = frame();
  d.detect(blank, blank, 0);
  assert.equal(d.detect(frame(60), blank, 20).length, 1);
  d.detect(blank, blank, 36);
  assert.equal(d.detect(frame(62), blank, 52).length, 0);
  d.detect(blank, blank, 68);
  d.detect(blank, blank, 84);
  d.detect(blank, blank, 104);
  assert.equal(d.detect(frame(62), blank, 120).length, 1);
  d.reset();
  d.detect(blank, blank, 130);
  assert.equal(d.detect(frame(62), blank, 150).length, 1);
});
test("Video follows a fading moving pulse and preserves original time, frame and position", () => {
  for (const color of ["red", "green"]) {
    const d = new LaserDetector(w, h);
    d.threshold = 37;
    d.color = color;
    const filter = new VideoPulseFilter(w, h);
    const options = {
      color,
      threshold: 37,
      maxDuration: 600,
      profile: "balanced",
      image: () => "first-impact",
    };
    const blank = frame(),
      out = [];
    for (let f = 0; f < 18; f++) {
      const time = f * 20;
      const data =
        f < 2 || f >= 13
          ? blank
          : frame(
              60 + Math.floor((f - 2) / 2),
              40 - Math.floor((f - 2) / 4),
              220 - (f - 2) * 10,
              color,
            );
      const hits = d.detect(data, null, time, { temporalOnly: true });
      out.push(...filter.process(data, hits, time, options));
    }
    assert.equal(out.length, 1, color);
    assert.equal(out[0].time, 40);
    assert.equal(out[0].x, 61 / (w - 1));
    assert.equal(out[0].image, "first-impact");
  }
});
test("Video rejects a colored object entering from nearby and does not start candidates across frame gaps", () => {
  const f = new VideoPulseFilter(w, h),
    opts = { color: "red", threshold: 37, profile: "balanced" };
  f.process(frame(56), [], 0, opts);
  const hit = { x: 61 / (w - 1), y: 41 / (h - 1), pixels: 9 };
  f.process(frame(60), [hit], 20, opts);
  assert.equal(f.process(frame(), [], 40, opts).length, 0);
  assert.equal(f.reasons["moving background"], 1);
  f.process(frame(60), [hit], 1000, opts);
  assert.equal(f.process(frame(), [], 1020, opts).length, 0);
  assert.ok(f.reasons["frame gap"]);
});

test("A fragmented spot is one event but separated simultaneous spots stay review-only", () => {
  const d = new LaserDetector(w, h),
    blank = frame();
  d.threshold = 37;
  d.detect(blank, blank, 0);
  const split = frame(60);
  // Separate two-pixel island immediately to the right of the main spot.
  for (let y = 40; y < 42; y++) split[(y * w + 64) * 4] = 180;
  const one = d.detect(split, blank, 20);
  assert.equal(one.length, 2); // centers beyond the 2.4px grouping radius stay distinct
  assert.ok(one.every((p) => p.confidence === "review"));
  const wide = 480,
    high = 270,
    b = new Uint8ClampedArray(wide * high * 4);
  for (let i = 0; i < b.length; i += 4) b.set([20, 20, 20, 255], i);
  const f = new Uint8ClampedArray(b);
  for (const x of [200, 201, 205, 206])
    for (let y = 100; y < 103; y++) f[(y * wide + x) * 4] = 220;
  const detector = new LaserDetector(wide, high);
  detector.detect(b, b, 0);
  const merged = detector.detect(f, b, 20);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].pixels, 12);
  assert.equal(merged[0].confidence, "review");
  assert.ok(Math.abs(merged[0].x - 200.5 / 479) < 1e-9);
});

test("Equal reference matches prefer newest; better image matches still beat freshness", () => {
  const blank = frame();
  assert.equal(
    chooseReference(
      blank,
      [
        { time: 100, data: blank },
        { time: 390, data: blank },
      ],
      400,
    ).time,
    390,
  );
  // Alter every sample, so the newer frame is a worse visual match.
  const changed = new Uint8ClampedArray(blank).fill(200);
  assert.equal(
    chooseReference(
      blank,
      [
        { time: 100, data: blank },
        { time: 390, data: changed },
      ],
      400,
    ).time,
    100,
  );
});

test("Source-explained impact feedback cannot hold a track lit and suppress the next pulse", () => {
  const d = new LaserDetector(w, h);
  d.threshold = 12;
  const blank = frame(),
    mark = frame(60, 40, 55),
    laser = frame(60);
  d.detect(blank, blank, 0);
  assert.equal(d.detect(laser, blank, 20).length, 1);
  for (const t of [40, 60, 80]) assert.equal(d.detect(mark, mark, t).length, 0);
  assert.equal(d.detect(laser, mark, 100).length, 1);
});
