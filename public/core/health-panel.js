import { HardwareTest, healthStatus, voiceSequence } from "./range-health.js";
export function installHealthPanel({ root, state, placement, zero, clock }) {
  root.innerHTML = `<details id="healthPanel" open><summary>Range Health &amp; hardware tests</summary>
 <p id="healthStatus" role="status">No telemetry yet.</p><dl id="healthMetrics"></dl>
 <p class="hint">Alignment fit is from the last calibration, not live camera-movement tracking. Brightness depends on projected content. This panel never changes calibration or sensitivity.</p>
 <details id="hardwareTests"><summary>Guided hardware tests</summary>
 <label>Test setup / phone / laser / lighting<input id="testSetup" maxlength="160" placeholder="iPhone · red TitanX · dim room" /></label>
 <label>Test<select id="testKind"><option value="placement">1 · Screen placement (9 points)</option><option value="pulses">2 · Pulse count</option><option value="idle">3 · No-fire false events</option><option value="voice">4 · Voice commands</option></select></label>
 <label>Reported pulse count · confirm before Finish<input id="testExpected" type="number" value="100" min="1" max="1000" /></label>
 <label>Observation time · seconds<input id="testSeconds" type="number" value="60" min="10" max="600" /></label>
 <p id="testInstructions" class="hint"></p>
 <button id="beginHardwareTest">Begin test</button><button id="finishHardwareTest" disabled>Finish test</button>
 <button id="nextTestPoint" hidden>Next point</button><button id="unheardVoice" hidden>Command was not heard</button>
 <p id="testProgress" role="status"></p>
 <p class="hint">Placement is separate from scored sessions. Other tests observe a live session: normal scoring, ammo and controls continue. Do not use laser menu buttons during pulse/no-fire tests; all live detector events are counted, including review events and dry triggers.</p>
 <div id="testResults" aria-live="polite"></div><button id="clearTestResults">Clear test history</button>
 <p class="hint">Latest 12 results stay in this host browser. No images, audio or recordings are saved.</p>
 </details></details>`;
  const $ = (id) => root.querySelector("#" + id);
  let latest = null,
    receivedAt = 0,
    test = null,
    records = [];
  try {
    const saved = JSON.parse(
      localStorage.getItem("laser-range.hardware.v1") || "[]",
    );
    if (Array.isArray(saved))
      records = saved
        .filter(
          (r) =>
            r &&
            typeof r.kind === "string" &&
            Array.isArray(r.grid) &&
            Array.isArray(r.voices),
        )
        .slice(0, 12);
  } catch {}
  const hints = {
    placement:
      "End the session first. Aim the actual laser strike at each displayed crosshair; collect at least 5 detections per point, then select Next point. Aiming error contributes to these measurements. No calibration changes are applied.",
    pulses:
      "Start a live camera session, then begin here. After the settling interval, emit exactly the declared number of spaced pulses and finish. Confirm the reported pulse count before Finish if you fired a different number. Count mismatch alone cannot distinguish missed pulses from extra detections.",
    idle: "Start the live scene/video and then begin here. Set session duration longer than the observation time (or use segment holds). Emit NO laser pulses for the full observation time. Every detector event is a false event for this test, including review-only events.",
    voice:
      "Start a live segmented course with a magazine counter. Enable voice on the phone. At a held endpoint say Moving, then Cover, then Retrograde. Verify the visible action. Mark any unheard attempt manually; delivery timing excludes speech-recognition delay.",
  };
  function instructions() {
    $("testInstructions").textContent = hints[$("testKind").value];
  }
  $("testKind").onchange = instructions;
  instructions();
  const fmt = (v) => (Number.isFinite(v) ? v.toFixed(1) : "—");
  function results() {
    const node = $("testResults");
    node.replaceChildren();
    for (const r of records) {
      const card = document.createElement("details"),
        summary = document.createElement("summary"),
        body = document.createElement("p");
      summary.textContent = `${r.kind} · ${r.status} · ${r.at}`;
      card.append(summary);
      let text = `${r.config?.setup || "Unnamed setup"} · ${r.config?.mode || ""} · ${r.config?.scenario || ""}. ${r.reason || ""} Processing FPS median ${fmt(r.medianFPS)}; reference age median ${fmt(r.medianReferenceMs)} ms. `;
      if (r.kind === "pulses")
        text += `${r.events} detector events / ${r.expected} reported pulses. Deficit ${r.deficit}, surplus ${r.surplus}. ${r.high} high-confidence, ${r.review} review. This is count agreement, not measured recall; extras can hide misses.`;
      if (r.kind === "idle")
        text += `${r.events} false events in ${fmt(r.measurementSeconds)} measured seconds (${fmt(r.eventsPerMinute)}/minute); ${r.high} high-confidence, ${r.review} review. Assumes no laser was fired.`;
      if (r.kind === "voice")
        text += `${r.voiceSteps}/3 expected actions confirmed; ${r.unheard} manually reported unheard attempts. ${(r.voices || []).map((v) => `${v.command}: ${v.message} (${Math.round(v.deliveryMs)} ms command delivery/execution)`).join(" ")}`;
      if (r.kind === "placement")
        text +=
          "Signed offsets are % screen width/height; radial errors are % screen width on the 16:9 frame. Aim the actual laser strike at each crosshair; this is not an independent optical ground truth.";
      body.textContent = text;
      card.append(body);
      if (r.kind === "placement") {
        const table = document.createElement("table");
        const header = document.createElement("tr");
        for (const v of [
          "Point",
          "n",
          "ΔX %",
          "ΔY %",
          "Raw error %W",
          "Zero-corrected %W",
        ]) {
          const cell = document.createElement("th");
          cell.textContent = v;
          header.append(cell);
        }
        table.append(header);
        for (const p of r.grid || []) {
          const row = document.createElement("tr");
          for (const v of [
            p.point,
            p.samples,
            fmt(p.dxPercent),
            fmt(p.dyPercent),
            fmt(p.rawErrorWidth),
            fmt(p.correctedErrorWidth),
          ]) {
            const cell = document.createElement("td");
            cell.textContent = v;
            row.append(cell);
          }
          table.append(row);
        }
        const wrap = document.createElement("div");
        wrap.className = "healthTable";
        wrap.append(table);
        card.append(wrap);
      }
      node.append(card);
    }
  }
  function finish(reason = "", restore = true) {
    if (!test?.active) return;
    const previous = test;
    test = null;
    const report = previous.finish(clock(), reason);
    if (previous.kind === "placement" && restore) placement(null);
    records.unshift(report);
    records = records.slice(0, 12);
    let storageWarning = "";
    try {
      localStorage.setItem("laser-range.hardware.v1", JSON.stringify(records));
    } catch {
      storageWarning =
        " Browser storage is unavailable; this result will not survive a reload.";
    }
    $("testProgress").textContent =
      `${report.status}. Results below.${storageWarning}`;
    results();
    controls();
  }
  function controls() {
    const active = !!test?.active;
    for (const id of [
      "testKind",
      "testSeconds",
      "testSetup",
      "beginHardwareTest",
    ])
      $(id).disabled = active;
    $("testExpected").disabled = active && test.kind !== "pulses";
    $("finishHardwareTest").disabled = !active;
    $("nextTestPoint").hidden = !active || test.kind !== "placement";
    $("unheardVoice").hidden = !active || test.kind !== "voice";
  }
  $("beginHardwareTest").onclick = () => {
    const s = state(),
      kind = $("testKind").value;
    if (
      !s.connected ||
      !s.ready ||
      s.adjusting ||
      !latest ||
      clock() - receivedAt > 4000
    )
      return ($("testProgress").textContent =
        "Pair, calibrate and arm the phone; wait for fresh telemetry and stable sensitivity.");
    if (s.calibrating)
      return ($("testProgress").textContent = "Return from calibration first.");
    if (kind === "placement" && s.running)
      return ($("testProgress").textContent =
        "End the current session before the placement test.");
    if (kind !== "placement" && (!s.running || s.demo || s.countdown))
      return ($("testProgress").textContent =
        "Start a live camera session and wait for the countdown first.");
    if (kind === "voice" && (!s.segmented || !s.ammo))
      return ($("testProgress").textContent =
        "Enable camera segment pauses and the magazine counter for the voice test.");
    try {
      test = new HardwareTest(kind, {
        time: clock(),
        expected: Number($("testExpected").value),
        seconds: Number($("testSeconds").value),
        config: {
          ...s.config,
          setup: $("testSetup").value,
          mode: s.mode,
          scenario: s.scenario,
          health: latest,
        },
      });
    } catch (e) {
      return ($("testProgress").textContent = e.message);
    }
    if (kind === "placement") placement(0);
    controls();
    tick();
  };
  $("finishHardwareTest").onclick = () => {
    if (test?.kind === "pulses") {
      const count = Number($("testExpected").value);
      if (!Number.isInteger(count) || count < 1 || count > 1000)
        return ($("testProgress").textContent =
          "Enter the actual pulse count (1–1000) before finishing.");
      test.expected = count;
    }
    finish();
  };
  $("nextTestPoint").onclick = () => {
    if (!test || test.kind !== "placement") return;
    if (test.samples[test.point].length < 5)
      return ($("testProgress").textContent =
        "Collect at least 5 detections at this point before advancing.");
    if (test.next(clock())) placement(test.point);
    else finish();
  };
  $("unheardVoice").onclick = () => {
    if (test?.kind === "voice") test.unheard++;
  };
  $("clearTestResults").onclick = () => {
    if (test?.active) return;
    records = [];
    try {
      localStorage.removeItem("laser-range.hardware.v1");
    } catch {}
    results();
  };
  function tick() {
    const s = state(),
      now = clock();
    $("healthStatus").textContent = healthStatus(latest, receivedAt, now, s);
    const rows = latest
      ? [
          ["Telemetry age", `${fmt((now - receivedAt) / 1000)} sec`],
          ["Processing FPS", fmt(latest.fps)],
          [
            "Reference age",
            s.mode === "youtube" && !s.calibrating
              ? "Not applicable · camera-only"
              : latest.referenceAge >= 9999
                ? "Unavailable"
                : `${fmt(latest.referenceAge)} ms`,
          ],
          [
            "Live detections / pulse check",
            `${latest.detections} / ${latest.tests}`,
          ],
          [
            "Continuation / fragment candidates suppressed",
            `${latest.suppressed ?? 0}`,
          ],
          ["Camera frame", `${latest.width || "—"} × ${latest.height || "—"}`],
          [
            "Laser / threshold",
            `${latest.color || "—"} / ${fmt(latest.threshold)}`,
          ],
          [
            "Near-white / dark pixels",
            `${fmt(latest.brightPercent)}% / ${fmt(latest.darkPercent)}%`,
          ],
          ["Last alignment", latest.alignment?.method || "Not measured"],
          [
            "Last fit / independent check",
            `${fmt(latest.alignment?.rms)} / ${fmt(latest.alignment?.checkError)} camera px`,
          ],
          [
            "Video candidates / accepted",
            `${latest.candidates ?? 0} / ${latest.confirmed ?? 0}`,
          ],
          [
            "Video rejections",
            Object.entries(latest.reasons || {})
              .map(([k, v]) => `${k}: ${v}`)
              .join(", ") || "None reported",
          ],
        ]
      : [];
    $("healthMetrics").replaceChildren();
    for (const [label, value] of rows) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = value;
      $("healthMetrics").append(dt, dd);
    }
    if (!test?.active) return;
    if (!s.connected || !s.ready || now - receivedAt > 4000)
      return finish(
        "Camera readiness or telemetry interrupted. Repeat the test.",
      );
    if (
      test.kind !== "placement" &&
      (!s.running || s.adjusting || s.calibrating)
    )
      return finish(
        "Session stopped or sensitivity/calibration changed. Repeat the test.",
      );
    if (test.kind === "placement" && s.adjusting) {
      test.readyAt = Math.max(test.readyAt, now + 500);
      $("testProgress").textContent = "Sensitivity settling · hold fire.";
      return;
    }
    if (now < test.readyAt) {
      $("testProgress").textContent = "Settling · hold fire briefly.";
      return;
    }
    const elapsed = (now - test.readyAt) / 1000;
    if (test.kind === "placement")
      $("testProgress").textContent =
        `Point ${test.point + 1}/9 · ${test.samples[test.point].length} detections. Place actual strikes on the crosshair, then Next point.`;
    else if (test.kind === "voice") {
      $("testProgress").textContent =
        `Say ${voiceSequence[test.voiceStep] || "complete"} · ${test.voiceStep}/3 confirmed · ${test.unheard} unheard attempts.`;
      if (test.voiceStep === 3) finish();
    } else {
      $("testProgress").textContent =
        `${test.count} detector events · ${elapsed.toFixed(0)} measured seconds${test.kind === "idle" ? ` / ${test.seconds} · DO NOT FIRE` : ` · emit exactly ${test.expected} pulses, then Finish`}`;
      if (test.kind === "idle" && elapsed >= test.seconds) finish();
    }
  }
  const timer = setInterval(tick, 500);
  window.addEventListener(
    "pagehide",
    () => {
      clearInterval(timer);
      finish("Operator page closed or reloaded during test.");
    },
    {
      once: true,
    },
  );
  results();
  tick();
  return {
    telemetry(m) {
      latest = m;
      receivedAt = clock();
      test?.telemetry(m);
      tick();
    },
    shot(m) {
      if (!test?.active) return false;
      const s = state();
      if (!s.adjusting) test.shot(m, zero(m, test.config.zero), clock());
      return test.kind === "placement";
    },
    voice(m) {
      test?.voice(m);
    },
    voiceResult(id, r) {
      test?.voiceResult(id, r, clock());
    },
    interrupt(reason, restore = true) {
      finish(reason, restore);
    },
    get placementActive() {
      return test?.kind === "placement";
    },
  };
}
