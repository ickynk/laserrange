import test from "node:test";
import assert from "node:assert/strict";
import { LaserDetector } from "../public/core/detector.js";
import { VideoPulseFilter } from "../public/core/video-filter.js";
const w = 160,
  h = 100;
function frame(color = "red", x = null, value = 100, background = 20) {
  const f = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < f.length; i += 4)
    f.set([background, background, background, 255], i);
  if (x !== null)
    for (let y = 40; y < 43; y++)
      for (let dx = 0; dx < 3; dx++)
        f[(y * w + x + dx) * 4 + (color === "red" ? 0 : 1)] = value;
  return f;
}
const hit = { x: 61 / (w - 1), y: 41 / (h - 1), confidence: "review" };
test("Video filter confirms short red/green pulses with original time and frame", () => {
  for (const color of ["red", "green"]) {
    const filter = new VideoPulseFilter(w, h),
      options = { color, threshold: 15, image: () => "onset-frame" };
    filter.process(frame(), [], 0, options);
    assert.deepEqual(filter.process(frame(color, 60), [hit], 100, options), []);
    assert.deepEqual(filter.process(frame(color, 60), [], 160, options), []);
    const result = filter.process(frame(), [], 220, options);
    assert.equal(result.length, 1);
    assert.equal(result[0].time, 100);
    assert.equal(result[0].image, "onset-frame");
    assert.equal(result[0].confidence, "review");
    assert.deepEqual(filter.process(frame(), [], 250, options), []);
  }
});
test("Video filter rejects persistent/moving red highlights, scene cuts, and frame gaps", () => {
  for (const mode of ["persistent", "moving", "cut", "gap"]) {
    const filter = new VideoPulseFilter(w, h),
      options = { color: "red", threshold: 15 };
    filter.process(frame(), [], 0, options);
    filter.process(frame("red", 60), [hit], 100, options);
    let output = [];
    if (mode === "persistent") {
      for (const t of [200, 300, 400, 500])
        output.push(...filter.process(frame("red", 60), [], t, options));
    } else if (mode === "moving")
      output.push(...filter.process(frame("red", 64), [], 150, options));
    else if (mode === "cut")
      output.push(
        ...filter.process(frame("red", null, 100, 120), [], 150, options),
      );
    else output.push(...filter.process(frame(), [], 400, options));
    output.push(...filter.process(frame(), [], 550, options));
    assert.equal(output.length, 0, mode);
    assert.ok(filter.rejected > 0, mode);
  }
});
test("Manual low threshold survives moving-background adaptation and detects a dim pulse", () => {
  for (const color of ["red", "green"]) {
    const detector = new LaserDetector(w, h);
    detector.color = color;
    detector.adapt(
      Array.from({ length: 10 }, (_, i) => frame(color, i * 5)),
      12,
    );
    assert.equal(detector.threshold, 12);
    const blank = frame();
    detector.detect(blank, blank, 0);
    assert.equal(detector.detect(frame(color, 60, 55), blank, 150).length, 1);
  }
});
test("Chroma fit explains tinted, amplified source reds without erasing an added laser", () => {
  const ref = frame(),
    camera = frame();
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const c = x % 80;
      ref[i] += c;
      camera[i] += c * 2 + 10;
    }
  const detector = new LaserDetector(w, h);
  detector.threshold = 15;
  detector.photometric(camera, ref);
  assert.ok(Math.abs(detector.gain - 2) < 0.01);
  assert.ok(Math.abs(detector.offset - 10) < 0.01);
  detector.detect(frame(), ref, 0);
  assert.equal(detector.detect(camera, ref, 150).length, 0);
  const pulse = new Uint8ClampedArray(camera);
  for (let y = 40; y < 43; y++)
    for (let x = 60; x < 63; x++) pulse[(y * w + x) * 4] += 55;
  detector.photometric(pulse, ref);
  assert.equal(detector.detect(pulse, ref, 300).length, 1);
});

test("Maximum video pulse setting can accommodate a longer device flash", () => {
  for (const maxDuration of [350, 700]) {
    const filter = new VideoPulseFilter(w, h);
    const options = { color: "red", threshold: 15, maxDuration };
    filter.process(frame(), [], 0, options);
    filter.process(frame("red", 60), [hit], 100, options);
    for (const time of [200, 300, 400, 500])
      assert.equal(
        filter.process(frame("red", 60), [], time, options).length,
        0,
      );
    assert.equal(
      filter.process(frame(), [], 600, options).length,
      maxDuration === 700 ? 1 : 0,
    );
  }
});
