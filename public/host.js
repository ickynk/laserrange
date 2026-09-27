import { installHealthPanel } from "./core/health-panel.js";
import { drawTestPoint } from "./core/range-health.js";
import { applyRangeCommand } from "./core/range-command.js";
import { Magazine, showMagazine } from "./core/magazine.js";
import { SegmentClock } from "./core/segment-clock.js";
import { openTargetCrop } from "./core/image-crop.js";
import { installSavedLibrary } from "./core/saved-library.js";
import { ShotAudio } from "./core/shot-audio.js";
import { SessionAudio } from "./core/audio.js";
import { ProjectionLink } from "./core/projection-link.js";
import { calculateZero, applyZero, outsideScreen } from "./core/zero.js";
import { drawCalibration, drawZero } from "./core/pattern.js";
import { RangeScene } from "./range.js";
import { Channel } from "./core/channel.js";
import {
  defaultScenario,
  validateScenario,
  summarize,
  compareSessions,
} from "./core/scenario.js";
const $ = (id) => document.getElementById(id),
  notice = (message) => ($("notice").textContent = message);
let scenario = defaultScenario(),
  range,
  channel,
  session,
  selected = "alpha",
  drawing = null,
  dragging = null,
  pendingCameraFocus = null,
  mode = "3d",
  running = false,
  started = 0,
  shots = [],
  history = [],
  phoneReady = false,
  phoneAdjusting = false,
  phoneConnected = false,
  calibrating = false,
  videoURL = null,
  youtubePlayer = null,
  lastFrame = 0,
  lastRender = 0;
let currentTime = 0,
  runShooter = "Nick",
  runLatency = 100,
  runDemo = true,
  sessionsSelect,
  lastArchivedStart = null;
const pastSessions = [];
let timeline = null,
  remoteNav = null,
  simulatorBusy = false;
const sessionAudio = new SessionAudio();
const shotAudio = new ShotAudio(
  (message) => ($("audioStatus").textContent = message),
);
let magazine = new Magazine();
// A real operator gesture unlocks sound for subsequent camera/laser triggers.
document.addEventListener("pointerdown", () => shotAudio.unlock(), {
  once: true,
});
$("previewShot").onclick = async () => {
  if (running) return;
  shotAudio.unlock();
  if (shotAudio.context) {
    try {
      await shotAudio.context.resume();
    } catch {
      return;
    }
  }
  shotAudio.play("shot", scenario.session);
};
function ammunitionFeedback(state) {
  showMagazine($("ammoDisplay"), state, running && !calibrating);
  shotAudio.play(state.fired ? "shot" : "click", scenario.session);
}
let selectedZone = 0,
  runScenarioKey = "",
  runScenarioName = "",
  runMode = "3d",
  mediaStarted = false;
const shooterZeros = new Map();
let zeroSession = null,
  diagnosticPoint = null,
  zeroPattern = false,
  runZero = null;
let projection,
  uploadedFile = null,
  mediaKey = "3d",
  remoteElapsed = 0;
try {
  range = new RangeScene($("range"));
  range.setScenario(scenario);
} catch (e) {
  notice(`WebGL could not start: ${e.message}`);
  throw e;
}
const reference = document.createElement("canvas");
reference.width = 480;
reference.height = 270;
const refctx = reference.getContext("2d", { willReadFrequently: true });
const now = () => channel?.now() ?? Date.now();
const health = installHealthPanel({
  root: $("rangeHealth"),
  clock: now,
  state: () => ({
    connected: phoneConnected,
    ready: phoneReady,
    adjusting: phoneAdjusting,
    mode,
    running,
    demo: runDemo,
    countdown: running && now() < started,
    calibrating,
    scenario: scenario.name,
    segmented: !!timeline?.enabled,
    ammo: magazine.enabled,
    config: {
      latencyMs: runLatency,
      zero: running ? runZero : shooterZeros.get(zeroShooter()) || null,
      shooter: running ? runShooter : zeroShooter(),
    },
  }),
  zero: (m, offset) => applyZero(m, offset),
  placement: (point) => {
    diagnosticPoint = point;
    calibrating = point !== null;
    zeroPattern = false;
    $("calibration").hidden = !calibrating;
    $("stopCalibration").hidden = !calibrating;
    if (calibrating) calibrationPattern();
    projection?.send({
      type: "calibration",
      active: calibrating,
      diagnosticPoint: point,
    });
    channel?.send({ type: "pattern", active: calibrating });
  },
});
const stamp = (seconds) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(2).padStart(5, "0")}`;
const object = () =>
  [...scenario.targets, ...scenario.barriers].find((t) => t.id === selected);
function rebuild() {
  range.setScenario(scenario);
  range.editor = $("viewToggle").textContent === "Perspective view";
  $("scenarioName").value = scenario.name;
  $("duration").value = scenario.duration;
  $("cameraSpeed").value = scenario.cameraSpeed ?? 0.6;
  $("cameraHeading").value = scenario.cameraHeading ?? 0;
  $("cameraHeadingMode").value = scenario.cameraHeadingMode ?? "fixed";
  const settings = scenario.session || {};
  $("countdownSeconds").value = settings.countdown ?? 0;
  $("beepEnabled").checked = settings.beep ?? true;
  $("beepFrequency").value = settings.frequency ?? 880;
  $("beepDuration").value = settings.beepDuration ?? 0.12;
  $("beepVolume").value = settings.volume ?? 0.08;
  $("shotAudio").checked = settings.shotAudio ?? true;
  $("shotVolume").value = settings.shotVolume ?? 0.3;
  $("ammoEnabled").checked = settings.ammoEnabled ?? false;
  $("magazineSize").value = settings.magazineSize ?? 15;
  $("cameraMotion").checked = scenario.cameraMotion;
  $("pauseAtSegments").checked = scenario.pauseAtSegments ?? false;
  for (const key of ["cameraHeight", "cameraFov", "cameraFocusBlend"])
    $(key).value =
      scenario[key] ??
      { cameraHeight: 1.65, cameraFov: 55, cameraFocusBlend: 1 }[key];
  refreshSegments();
  $("sceneTitle").textContent = scenario.name;
  const select = $("objects");
  select.replaceChildren();
  for (const t of [...scenario.targets, ...scenario.barriers]) {
    const opt = new Option(`${t.id} · ${t.kind || "barrier"}`, t.id);
    select.add(opt);
  }
  if (!object()) selected = select.options[0]?.value;
  select.value = selected;
  properties();
  projection?.send({ type: "scene", scenario });
  if (phoneReady) channel?.send({ type: "reset", preserveAlignment: true });
}
function properties() {
  const t = object();
  $("properties").hidden = !t;
  if (!t) return;
  for (const [id, key] of [
    ["objX", "x"],
    ["objZ", "z"],
    ["objWidth", "width"],
    ["objHeight", "height"],
  ])
    $(id).value = t[key];
  $("targetProperties").hidden = !t.kind;
  $("barrierProperties").hidden = !!t.kind;
  if (!t.kind) {
    $("objLength").value = t.depth;
    $("barrierAsset").value = t.asset ?? "block";
    $("barrierRotation").value = t.rotation ?? 0;
  } else {
    $("targetRotation").value = t.rotation ?? 0;
    $("removeTargetImage").disabled = !t.image;
    $("targetAsset").value = t.asset ?? "silhouette";
    $("targetEasing").value = t.easing ?? "linear";
    $("repeatEvery").value = t.repeatEvery ?? 0;
    $("visibleFor").value = t.visibleFor ?? (t.repeatEvery || 1);
    zoneProperties();
  }
  if (t.kind)
    for (const key of ["kind", "start", "end", "speed"]) $(key).value = t[key];
}
function zoneProperties() {
  const zones = object()?.zones || [];
  selectedZone = Math.max(0, Math.min(selectedZone, zones.length - 1));
  $("zones").replaceChildren(
    ...zones.map(
      (z, i) => new Option(`${i + 1}. ${z.name} · ${z.points} pts`, String(i)),
    ),
  );
  $("zones").value = String(selectedZone);
  const z = zones[selectedZone];
  $("zoneProperties").hidden = !z;
  if (z)
    for (const [id, key] of [
      ["zoneName", "name"],
      ["zoneShape", "shape"],
      ["zoneX", "x"],
      ["zoneY", "y"],
      ["zoneWidth", "width"],
      ["zoneHeight", "height"],
      ["zonePoints", "points"],
    ])
      $(id).value = z[key];
}
$("zones").onchange = () => {
  selectedZone = Number($("zones").value);
  zoneProperties();
};
$("addZone").onclick = () =>
  edit(() => {
    const t = object();
    t.zones ||= [];
    t.zones.unshift({
      name: `Zone ${t.zones.length + 1}`,
      shape: "ellipse",
      x: 0.5,
      y: 0.5,
      width: 0.3,
      height: 0.35,
      points: 5,
    });
    selectedZone = 0;
  });
$("deleteZone").onclick = () =>
  edit(() => object().zones?.splice(selectedZone, 1));
$("zoneUp").onclick = () =>
  edit(() => {
    const zs = object().zones;
    if (zs?.[selectedZone]) zs.unshift(...zs.splice(selectedZone, 1));
    selectedZone = 0;
  });
for (const [id, key] of [
  ["zoneName", "name"],
  ["zoneShape", "shape"],
  ["zoneX", "x"],
  ["zoneY", "y"],
  ["zoneWidth", "width"],
  ["zoneHeight", "height"],
  ["zonePoints", "points"],
])
  $(id).onchange = () =>
    edit(() => {
      object().zones[selectedZone][key] = ["name", "shape"].includes(key)
        ? $(id).value
        : Number($(id).value);
    });
for (const [id, key] of [
  ["targetAsset", "asset"],
  ["targetRotation", "rotation"],
  ["targetEasing", "easing"],
  ["repeatEvery", "repeatEvery"],
  ["visibleFor", "visibleFor"],
  ["barrierRotation", "rotation"],
])
  $(id).onchange = () =>
    edit(() => {
      object()[key] = ["asset", "easing"].includes(key)
        ? $(id).value
        : Number($(id).value);
      if (key === "asset" && object().kind && object().asset === "mannequin") {
        object().width = 0.75;
        object().height = 1.8;
      }
      if (key === "repeatEvery" && object().repeatEvery > 0)
        object().visibleFor = Math.min(
          object().visibleFor ?? 1,
          object().repeatEvery,
        );
    });
$("barrierAsset").onchange = () =>
  edit(() => {
    const asset = $("barrierAsset").value;
    const dimensions = {
      block: [2, 1.3, 0.6],
      car: [1.9, 1.5, 4.4],
      pillar: [0.7, 3, 0.7],
      fence: [4, 2, 0.2],
      window: [3, 2.6, 0.3],
      highway: [3, 1, 0.7],
      wall: [4, 2.6, 0.25],
      door: [2, 2.6, 0.3],
      drum: [0.6, 0.9, 0.6],
      ports: [1.8, 1.8, 0.15],
    }[asset];
    Object.assign(object(), {
      asset,
      width: dimensions[0],
      height: dimensions[1],
      depth: dimensions[2],
    });
  });
for (const key of [
  "cameraSpeed",
  "cameraHeading",
  "cameraHeadingMode",
  "cameraHeight",
  "cameraFov",
  "cameraFocusBlend",
])
  $(key).onchange = () =>
    edit(() => {
      scenario[key] =
        key === "cameraHeadingMode" ? $(key).value : Number($(key).value);
    });
for (const [id, key] of [
  ["countdownSeconds", "countdown"],
  ["beepEnabled", "beep"],
  ["beepFrequency", "frequency"],
  ["beepDuration", "beepDuration"],
  ["beepVolume", "volume"],
  ["shotAudio", "shotAudio"],
  ["shotVolume", "shotVolume"],
  ["ammoEnabled", "ammoEnabled"],
  ["magazineSize", "magazineSize"],
])
  $(id).onchange = () =>
    edit(() => {
      scenario.session ||= {};
      scenario.session[key] = ["beep", "shotAudio", "ammoEnabled"].includes(key)
        ? $(id).checked
        : Number($(id).value);
    });
$("previewBeep").onclick = () => {
  if (!running) sessionAudio.schedule(scenario.session);
};
function edit(fn) {
  if (running) return notice("End the session before editing.");
  try {
    const before = structuredClone(scenario);
    fn();
    try {
      validateScenario(scenario);
    } catch (e) {
      scenario = before;
      throw e;
    }
    rebuild();
  } catch (e) {
    notice(e.message);
    rebuild();
  }
}
for (const tab of document.querySelectorAll("[data-tab]"))
  tab.onclick = () => {
    document
      .querySelectorAll("[data-tab]")
      .forEach((b) => b.classList.toggle("active", b === tab));
    for (const name of ["range", "camera", "video"])
      $(`tab-${name}`).hidden = name !== tab.dataset.tab;
  };
$("scenarioName").onchange = () =>
  edit(() => (scenario.name = $("scenarioName").value));
$("duration").onchange = () =>
  edit(() => {
    scenario.duration = Number($("duration").value);
    for (const t of scenario.targets) {
      t.start = Math.min(t.start, scenario.duration);
      t.end = Math.min(t.end, scenario.duration);
    }
  });
$("objects").onchange = () => {
  selected = $("objects").value;
  properties();
};
for (const [id, key] of [
  ["objX", "x"],
  ["objZ", "z"],
  ["objWidth", "width"],
  ["objHeight", "height"],
  ["objLength", "depth"],
  ["kind", "kind"],
  ["start", "start"],
  ["end", "end"],
  ["speed", "speed"],
])
  $(id).onchange = () =>
    edit(
      () =>
        (object()[key] = key === "kind" ? $(id).value : Number($(id).value)),
    );
$("addTarget").onclick = () =>
  edit(() => {
    selected = `target-${crypto.randomUUID().slice(0, 6)}`;
    scenario.targets.push({
      id: selected,
      x: 0,
      z: -5,
      width: 1.3,
      height: 2,
      kind: "shoot",
      start: 0,
      end: scenario.duration,
      path: [],
      speed: 1,
    });
  });
$("addBarrier").onclick = () =>
  edit(() => {
    selected = `barrier-${crypto.randomUUID().slice(0, 6)}`;
    scenario.barriers.push({
      id: selected,
      x: 0,
      z: -3,
      width: 2,
      height: 1.3,
      depth: 0.6,
    });
  });
$("deleteObject").onclick = () =>
  edit(() => {
    scenario.targets = scenario.targets.filter((t) => t.id !== selected);
    scenario.barriers = scenario.barriers.filter((t) => t.id !== selected);
  });
$("pauseAtSegments").onchange = () =>
  edit(() => (scenario.pauseAtSegments = $("pauseAtSegments").checked));
function stepSegment(direction) {
  if (!running) return;
  if (projection?.connected)
    projection.send({ type: "segment", runId: started, direction });
  else timeline?.step(direction, now());
}
$("previousSegment").onclick = () => stepSegment(-1);
$("nextSegment").onclick = () => stepSegment(1);
$("cameraMotion").onchange = () =>
  edit(() => (scenario.cameraMotion = $("cameraMotion").checked));
function setDrawing(kind) {
  if (running) return;
  drawing = drawing === kind ? null : kind;
  pendingCameraFocus = null;
  range.editor = true;
  $("viewLabel").textContent = "OVERHEAD / DRAG TO PLACE";
  $("viewToggle").textContent = "Perspective view";
  $("editorHint").textContent = drawing
    ? `Click floor points for the ${kind} path. Press Escape to finish.`
    : "Drag objects to reposition them.";
  $("stage").classList.toggle("drawing", !!drawing);
  if (drawing === "camera") cameraDrawHint();
  projectionView();
}
function cameraDrawHint() {
  $("editorHint").textContent =
    pendingCameraFocus !== null
      ? "Click the focal point for the completed segment. Escape finishes."
      : scenario.cameraPath.length
        ? "Click the next movement node, then its focal point. Escape finishes."
        : "Click the camera start position, then the next movement node and its focal point.";
}
$("targetPath").onclick = () => setDrawing("target");
$("cameraPath").onclick = () => setDrawing("camera");
$("clearPath").onclick = () => edit(() => (object().path = []));
$("clearCameraPath").onclick = () =>
  edit(() => {
    pendingCameraFocus = null;
    scenario.cameraPath = [];
    scenario.cameraSegments = [];
  });
function refreshSegments() {
  const select = $("cameraSegment"),
    old = select.value;
  select.replaceChildren();
  for (let i = 0; i < scenario.cameraPath.length - 1; i++)
    select.add(
      new Option(`Segment ${i + 1}: point ${i + 1} → ${i + 2}`, String(i)),
    );
  if ([...select.options].some((o) => o.value === old)) select.value = old;
  $("pickFocus").disabled = !select.options.length;
  $("clearFocus").disabled = !select.options.length;
  const focus = scenario.cameraSegments?.[Number(select.value)]?.focus;
  $("focusHeight").value = focus?.y ?? 1.4;
  $("focusSummary").textContent = focus
    ? `Focus: x ${focus.x.toFixed(2)}, z ${focus.z.toFixed(2)}`
    : "No focus point: uses camera heading. Select a segment and click focus point.";
}
$("cameraSegment").onchange = refreshSegments;
$("pickFocus").onclick = () => {
  setDrawing("focus");
  $("editorHint").textContent =
    "Click the floor below the focus point for this camera segment. Set focus height in the controls.";
};
$("clearFocus").onclick = () =>
  edit(() => {
    const item = scenario.cameraSegments?.[Number($("cameraSegment").value)];
    if (item) delete item.focus;
  });
$("focusHeight").onchange = () =>
  edit(() => {
    const focus =
      scenario.cameraSegments?.[Number($("cameraSegment").value)]?.focus;
    if (focus) focus.y = Number($("focusHeight").value);
  });
$("targetImage").onchange = (e) => {
  const file = e.target.files[0],
    id = selected,
    t = object();
  e.target.value = "";
  if (!file || !t?.kind || running) return;
  openTargetCrop(
    file,
    t.width / t.height,
    (image) =>
      edit(() => {
        const target = scenario.targets.find((t) => t.id === id);
        if (!target) throw Error("Target was removed.");
        target.image = image;
        target.asset = "cardboard";
      }),
    notice,
  );
};
$("removeTargetImage").onclick = () => edit(() => delete object().image);
$("viewToggle").onclick = () => {
  if (running) return notice("End the session to edit.");
  range.editor = !range.editor;
  $("viewToggle").textContent = range.editor
    ? "Perspective view"
    : "Overhead editor";
  $("viewLabel").textContent = range.editor
    ? "OVERHEAD / DRAG TO PLACE"
    : "PERSPECTIVE / LIVE PREVIEW";
  drawing = null;
  $("stage").classList.remove("drawing");
  projectionView();
  if (phoneConnected && !projection?.connected)
    channel?.send({ type: "reset", preserveAlignment: true });
};
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    drawing = null;
    $("stage").classList.remove("drawing");
    $("editorHint").textContent = "Drag objects to reposition them.";
  }
});
const point = (e) => {
  const r = $("stage").getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width,
    y: (e.clientY - r.top) / r.height,
  };
};
$("range").onpointerdown = (e) => {
  if (mode !== "3d" || calibrating) return;
  const p = point(e);
  if (running) {
    if (runDemo) recordShot({ ...p, time: now(), confidence: "high" }, true);
    return;
  }
  if (!range.editor) return;
  const floor = range.floorPoint(p.x, p.y);
  if (drawing) {
    if (!floor) return;
    edit(() => {
      if (drawing === "focus") {
        const i = Number($("cameraSegment").value);
        scenario.cameraSegments ||= [];
        while (scenario.cameraSegments.length <= i)
          scenario.cameraSegments.push({});
        scenario.cameraSegments[i].focus = {
          ...floor,
          y: Number($("focusHeight").value),
        };
        drawing = null;
        $("stage").classList.remove("drawing");
        $("editorHint").textContent =
          "Focus set. Select another segment to change its focus.";
      } else if (drawing === "camera") {
        if (pendingCameraFocus !== null) {
          scenario.cameraSegments ||= [];
          while (scenario.cameraSegments.length <= pendingCameraFocus)
            scenario.cameraSegments.push({});
          scenario.cameraSegments[pendingCameraFocus].focus = {
            ...floor,
            y: Number($("focusHeight").value),
          };
          pendingCameraFocus = null;
        } else {
          scenario.cameraPath.push(floor);
          if (scenario.cameraPath.length > 1)
            pendingCameraFocus = scenario.cameraPath.length - 2;
        }
        cameraDrawHint();
      } else if (object()?.kind) object().path.push(floor);
    });
    if (drawing === "camera" && scenario.cameraPath.length > 1) {
      $("cameraSegment").value = String(scenario.cameraPath.length - 2);
      refreshSegments();
    }
    return;
  }
  const id = range.pick(p.x, p.y);
  if (id) {
    selected = id;
    dragging = id;
    $("objects").value = id;
    properties();
    $("range").setPointerCapture(e.pointerId);
  }
};
$("range").onpointermove = (e) => {
  if (!dragging || running) return;
  const p = point(e),
    floor = range.floorPoint(p.x, p.y),
    o = object();
  if (!floor || !o) return;
  if (floor.x < -50 || floor.x > 50 || floor.z < -50 || floor.z > 20) return;
  const dx = floor.x - o.x,
    dz = floor.z - o.z;
  o.x = floor.x;
  o.z = floor.z;
  if (o.path) o.path = o.path.map((p) => ({ x: p.x + dx, z: p.z + dz }));
  rebuild();
};
$("range").onpointerup = () => (dragging = null);
$("range").onpointercancel = () => (dragging = null);
$("save").onclick = () => {
  try {
    localStorage.setItem(
      "laser-range.scenario.v1",
      JSON.stringify(validateScenario(scenario)),
    );
    notice("Scenario saved in this browser.");
  } catch (e) {
    notice(e.message);
  }
};
$("load").onclick = () =>
  edit(() => {
    const saved = localStorage.getItem("laser-range.scenario.v1");
    if (!saved) throw Error("No saved scenario yet.");
    scenario = validateScenario(JSON.parse(saved));
  });
$("exportScenario").onclick = () => {
  try {
    const blob = new Blob(
      [JSON.stringify(validateScenario(scenario), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `${scenario.name.replace(/[^a-z0-9_-]/gi, "-") || "scenario"}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (e) {
    notice(e.message);
  }
};
$("importScenario").onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  if (f.size > 10_000_000) return notice("Scenario exceeds 10 MB.");
  try {
    const s = validateScenario(JSON.parse(await f.text()));
    edit(() => (scenario = s));
  } catch (error) {
    notice(error.message);
  }
  e.target.value = "";
};
function setMode(next) {
  health.interrupt("Display mode changed during test.");
  if (running) stopRun();
  mode = next;
  updateShotInput();
  history = [];
  $("movie").pause();
  $("movie").hidden = next !== "upload";
  $("youtube").hidden = next !== "youtube";
  $("range").hidden = next !== "3d";
  $("stageCaption").hidden = next !== "3d";
  if (next !== "youtube") youtubePlayer?.pauseVideo?.();
  channel?.send({ type: "mode", mode });
  // A different file can keep the same mode but needs a fresh background.
  if (phoneReady) channel?.send({ type: "reset", preserveAlignment: true });
}
$("backTo3d").onclick = () => {
  setMode("3d");
  configureProjection();
};
$("videoFile").onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  setMode("upload");
  if (videoURL) URL.revokeObjectURL(videoURL);
  videoURL = URL.createObjectURL(file);
  $("movie").src = videoURL;
  uploadedFile = file;
  mediaKey = crypto.randomUUID();
  configureProjection();
  notice(
    "Video loaded. Start a session, then use Play / pause as needed. Shots are manually scored.",
  );
};
$("movie").onerror = () =>
  notice("This browser cannot play the selected video. Try an H.264 MP4 file.");
function youtubeId(value) {
  try {
    const u = new URL(value);
    if (u.hostname === "youtu.be")
      return u.pathname.slice(1).match(/^[\w-]{11}$/)?.[0];
    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)
    )
      return (u.searchParams.get("v") || u.pathname.split("/").at(-1)).match(
        /^[\w-]{11}$/,
      )?.[0];
  } catch {}
  return null;
}
let youtubeAPI;
function loadYoutubeAPI() {
  return (youtubeAPI ||= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () =>
      reject(
        Error("YouTube API could not load. Check your internet connection."),
      );
    document.head.append(s);
  }));
}
$("loadYoutube").onclick = async () => {
  const id = youtubeId($("youtubeUrl").value);
  if (!id) return notice("Enter a valid YouTube video URL.");
  if (running) stopRun();
  try {
    await loadYoutubeAPI();
    youtubePlayer?.destroy();
    $("youtube").replaceChildren(
      Object.assign(document.createElement("div"), { id: "youtubePlayer" }),
    );
    setMode("youtube");
    youtubePlayer = new window.YT.Player("youtubePlayer", {
      videoId: id,
      playerVars: { playsinline: 1, rel: 0 },
      events: {
        onError: () =>
          notice(
            "YouTube could not embed this video. Try another link or a local file.",
          ),
      },
    });
    mediaKey = crypto.randomUUID();
    configureProjection();
    notice(
      "YouTube mode: start a demo session to click shots. Use Play / pause video to control playback; native player controls return after End session. Shots require manual scoring.",
    );
  } catch (e) {
    notice(e.message);
  }
};
$("playVideo").onclick = () => {
  if (projection?.connected) {
    projection.send({ type: "toggle-play" });
    return;
  }
  if (mode === "upload") {
    if ($("movie").paused)
      $("movie")
        .play()
        .catch((e) => notice(e.message));
    else $("movie").pause();
  }
  if (mode === "youtube") {
    if (youtubePlayer?.getPlayerState?.() === 1) youtubePlayer.pauseVideo();
    else youtubePlayer?.playVideo?.();
  }
};
function updateShotInput() {
  const active = running && runDemo && mode === "youtube";
  $("videoShotInput").hidden = !active;
  // Iframe events never bubble to the host. Capture them on a sibling surface
  // while a demo is running, and restore native player controls afterwards.
  $("youtube").inert = active;
}
$("videoShotInput").addEventListener("pointerdown", (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (
    e.button !== 0 ||
    !e.isPrimary ||
    !running ||
    !runDemo ||
    mode !== "youtube"
  )
    return;
  recordShot(
    {
      ...point(e),
      time: now(),
      confidence: "review",
      videoTime: youtubePlayer?.getCurrentTime?.(),
    },
    true,
  );
});
$("videoShotInput").addEventListener("contextmenu", (e) => e.preventDefault());
$("stage").addEventListener("pointerdown", (e) => {
  if (
    running &&
    runDemo &&
    mode === "upload" &&
    e.target === $("movie") &&
    e.button === 0
  )
    recordShot({ ...point(e), time: now(), confidence: "review" }, true);
});
function calibrationPattern() {
  if (diagnosticPoint !== null)
    return drawTestPoint($("calibration"), diagnosticPoint);
  (zeroPattern ? drawZero : drawCalibration)($("calibration"));
}
$("calibrate").onclick = () => {
  diagnosticPoint = null;
  health.interrupt("Calibration opened during test.", false);
  cancelZero();
  zeroPattern = false;
  if (running) stopRun();
  calibrating = true;
  $("calibration").hidden = false;
  $("stopCalibration").hidden = false;
  calibrationPattern();
  projection?.send({ type: "calibration", active: true });
  channel?.send({ type: "pattern", active: true });
};
$("stopCalibration").onclick = () => {
  health.interrupt("Placement display closed before finishing.");
  cancelZero();
  zeroPattern = false;
  calibrating = false;
  $("calibration").hidden = true;
  $("stopCalibration").hidden = true;
  projection?.send({ type: "calibration", active: false });
  channel?.send({ type: "pattern", active: false });
};
function zeroShooter() {
  return $("shooter").value.trim() || "Shooter";
}
function offsetText(value) {
  return `${Math.abs(value.x * 100).toFixed(2)}% ${value.x < 0 ? "left" : "right"}, ${Math.abs(value.y * 100).toFixed(2)}% ${value.y < 0 ? "up" : "down"}`;
}
function updateZeroStatus(message) {
  const name = zeroShooter(),
    applied = shooterZeros.get(name);
  if (!message) {
    if (zeroSession?.candidate)
      message = `${name}: five shots collected. Proposed correction: ${offsetText(zeroSession.candidate)}. Apply only if the laser strikes landed on the center mark.`;
    else if (zeroSession)
      message = `${name}: ${zeroSession.samples.length}/5 shots. ${now() < zeroSession.readyAt || phoneAdjusting ? "Hold fire while sensitivity settles." : "Place each actual laser strike on the center crosshair."}`;
    else
      message = `${name}: ${applied ? "screen zero applied — " + offsetText(applied) : "no screen zero applied"}.`;
  }
  $("zeroStatus").textContent = message;
  $("applyZero").disabled = !zeroSession?.candidate;
  $("cancelZero").disabled = !zeroSession;
  channel?.send({
    type: "zero-status",
    message,
    active: !!zeroSession,
    canApply: !!zeroSession?.candidate,
  });
}
function endZeroTarget() {
  if (!zeroPattern) return;
  zeroPattern = false;
  calibrating = false;
  $("calibration").hidden = true;
  $("stopCalibration").hidden = true;
  projection?.send({ type: "calibration", active: false });
  channel?.send({ type: "pattern", active: false });
}
function cancelZero(message) {
  if (zeroSession) clearTimeout(zeroSession.timer);
  zeroSession = null;
  endZeroTarget();
  updateZeroStatus(message);
}
function clearAllZeros() {
  shooterZeros.clear();
  cancelZero();
}
function zeroAction(action) {
  if (health.placementActive)
    return notice("Finish the placement test before changing screen zero.");
  if (action === "cancel") return cancelZero();
  if (running)
    return updateZeroStatus(
      "End the range session before changing screen zero.",
    );
  if (action === "clear") {
    shooterZeros.delete(zeroShooter());
    return cancelZero();
  }
  if (action === "apply") {
    if (
      !zeroSession?.candidate ||
      zeroSession.shooter !== zeroShooter() ||
      !phoneReady
    )
      return updateZeroStatus(
        "Collect a valid five-shot group with detection armed first.",
      );
    shooterZeros.set(zeroSession.shooter, zeroSession.candidate);
    return cancelZero();
  }
  if (action !== "start") return;
  if (!phoneReady || phoneAdjusting)
    return updateZeroStatus(
      "Align, complete the pulse check, arm detection and wait for sensitivity to settle first.",
    );
  if (projection?.opening || (projection?.connected && !projection.ready))
    return updateZeroStatus("Wait for the projector to finish loading first.");
  cancelZero();
  zeroSession = {
    shooter: zeroShooter(),
    samples: [],
    candidate: null,
    lastTime: -Infinity,
    readyAt: now() + 1500,
  };
  zeroPattern = true;
  calibrating = true;
  history = [];
  $("calibration").hidden = false;
  $("stopCalibration").hidden = false;
  calibrationPattern();
  projection?.send({ type: "calibration", active: true, zero: true });
  channel?.send({ type: "pattern", active: true });
  zeroSession.timer = setTimeout(() => {
    if (zeroSession) updateZeroStatus();
  }, 1600);
  updateZeroStatus();
}
function collectZero(shot) {
  const session = zeroSession;
  if (!session || session.candidate) return;
  if (phoneAdjusting || now() < session.readyAt || shot.time < session.readyAt)
    return;
  if (shot.confidence !== "high")
    return updateZeroStatus(
      "Uncertain detection ignored. Keep the phone steady and wait for fresh reference frames.",
    );
  if (shot.time - session.lastTime < 300) return;
  if (Math.abs(shot.x - 0.5) > 0.08 || Math.abs(shot.y - 0.5) > 0.08)
    return updateZeroStatus(
      "Off-center pulse ignored. Place the actual laser strike on the center crosshair.",
    );
  session.lastTime = shot.time;
  session.samples.push({ x: shot.x, y: shot.y });
  if (session.samples.length === 5) {
    try {
      session.candidate = calculateZero(session.samples);
    } catch (error) {
      return cancelZero(
        `${error.message} No changes were applied to the shooter zero.`,
      );
    }
  }
  updateZeroStatus();
}
for (const action of ["start", "apply", "cancel", "clear"])
  $(action + "Zero").onclick = () => zeroAction(action);
$("shooter").addEventListener("input", () => cancelZero());
updateZeroStatus();

$("fullscreen").onclick = async () => {
  if (projection?.connected) {
    projection.window.focus();
    return notice(
      "Use Enter fullscreen in the projector window before calibration.",
    );
  }
  range.editor = false;
  $("viewLabel").textContent = "PERSPECTIVE / LIVE PREVIEW";
  $("viewToggle").textContent = "Overhead editor";
  try {
    await $("stage").requestFullscreen();
  } catch (e) {
    notice(e.message);
  }
};
$("exitProjector").onclick = () => document.exitFullscreen();
document.addEventListener("fullscreenchange", () => {
  $("exitProjector").hidden = !document.fullscreenElement;
  if (phoneConnected && !projection?.connected) {
    channel?.send({ type: "reset", preserveAlignment: true });
    notice(
      "Display updated. Fixed screen alignment retained; sensitivity adjusts automatically. Reset corners if the projected frame moved.",
    );
  }
});
let previousSize = "";
const observer = new ResizeObserver(() => {
  const size = `${$("stage").clientWidth}x${$("stage").clientHeight}`;
  if (
    previousSize &&
    size !== previousSize &&
    phoneConnected &&
    !projection?.connected
  ) {
    channel?.send({ type: "reset", preserveAlignment: true });
    notice(
      "Display updated. Alignment retained; sensitivity adjusts automatically. Reset corners if the projected frame moved.",
    );
  }
  previousSize = size;
  range.resize($("stage").clientWidth, $("stage").clientHeight);
  history = [];
});
observer.observe($("stage"));
function updateStats() {
  const s = summarize(shots);
  for (const [id, key] of [
    ["statShots", "shots"],
    ["statHits", "hits"],
    ["statMisses", "misses"],
    ["statNoShoots", "noShoots"],
  ])
    $(id).textContent = s[key];
  $("statPoints").textContent = s.points;
  renderComparison();
  $("statAccuracy").textContent = s.shots ? `${s.accuracy}%` : "—";
  $("reviewSummary").textContent =
    `${runShooter} · ${s.pending} pending review${s.first !== null ? ` · first ${s.first.toFixed(2)}s` : ""}${s.splits.length ? ` · last split ${s.splits.at(-1).toFixed(2)}s` : ""}`;
}
let reviewIndex = -1;
function showSnapshot(shot) {
  reviewIndex = shots.indexOf(shot);
  $("reviewPosition").textContent = `${reviewIndex + 1} / ${shots.length}`;
  $("previousShot").disabled = reviewIndex <= 0;
  $("nextShot").disabled = reviewIndex >= shots.length - 1;
  $("snapshotImage").hidden = !shot.image;
  $("snapshotPoint").hidden = !shot.image;
  $("snapshotImage").src = shot.image || "";
  $("snapshotPoint").style.left = `${shot.x * 100}%`;
  $("snapshotPoint").style.top = `${shot.y * 100}%`;
  $("snapshotTitle").textContent =
    `${shot.shooter} · ${shot.time.toFixed(2)}s · ${shot.result}`;
  if (!$("snapshotDialog").open) $("snapshotDialog").showModal();
}
const moveReview = (delta) => {
  const next = reviewIndex + delta;
  if (next >= 0 && next < shots.length) showSnapshot(shots[next]);
};
$("previousShot").onclick = () => moveReview(-1);
$("nextShot").onclick = () => moveReview(1);
window.addEventListener("keydown", (e) => {
  if (!$("snapshotDialog").open) return;
  if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) return;
  if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
    e.preventDefault();
    moveReview(e.key === "ArrowLeft" ? -1 : 1);
  }
});
$("snapshotImage").onclick = (e) => {
  const r = e.target.getBoundingClientRect();
  moveReview(e.clientX < r.left + r.width / 2 ? -1 : 1);
};
$("closeSnapshot").onclick = () => $("snapshotDialog").close();
function addShotRow(shot) {
  const row = document.createElement("div");
  row.className = "shotRow";
  const num = document.createElement("span");
  num.textContent = String(shots.length).padStart(2, "0");
  const detail = document.createElement("span");
  detail.className = "shotDetail";
  detail.textContent = `${shot.time.toFixed(2)}s · ${shot.target || "screen"}${shot.zone ? ` · ${shot.zone} · ${shot.points} pts` : ""} · ${shot.demo ? "demo" : shot.confidence === "high" ? "detected" : "uncertain"}`;
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Score shot ${shots.length}`);
  for (const value of ["review", "hit", "miss", "no-shoot"])
    select.add(new Option(value, value));
  select.value = shot.result;
  select.onchange = () => {
    shot.result = select.value;
    updateStats();
  };
  const preview = document.createElement("button");
  preview.textContent = "View frame";
  preview.disabled = !shot.image;
  preview.onclick = () => showSnapshot(shot);
  row.append(num, detail, select, preview);
  $("shots").prepend(row);
}
function recordShot(m, demo = false) {
  if (projection?.connected && !calibrating) {
    projection.send({ type: "shot", runId: started, shot: m, demo });
    return;
  }
  if (!running) return;
  if (demo !== runDemo) {
    if (!demo)
      notice(
        "Camera pulse received, but this session uses mouse demo input. End it, uncheck Demo, and start a live session.",
      );
    return;
  }
  if (!demo) m = applyZero(m, runZero);
  const capture = m.time - (demo ? 0 : runLatency);
  if (capture < started) return;
  const elapsed = (capture - started) / 1000;
  if (!timeline?.enabled && elapsed > scenario.duration) return;
  const trigger = magazine.trigger();
  ammunitionFeedback(trigger);
  if (!trigger.fired) return;
  const h = history.reduce(
    (best, f) =>
      Math.abs(f.time - capture) < Math.abs((best?.time ?? Infinity) - capture)
        ? f
        : best,
    null,
  );
  const synced = h && Math.abs(h.time - capture) < 200;
  let score = { result: "review", target: null };
  if (mode === "3d" && synced && m.confidence === "high")
    score = range.score(m.x, m.y, h.elapsed);
  if (outsideScreen(m)) score = { result: "miss", target: null };
  const shot = {
    ...m,
    ...score,
    time: elapsed,
    shooter: runShooter,
    demo,
    image: mode === "youtube" ? m.image : h?.image || m.image,
  };
  acceptShot(shot);
}
function acceptShot(shot) {
  shots.push(shot);
  if (shots.length > 500) {
    shots.shift();
    $("shots").lastChild?.remove();
  }
  addShotRow(shot);
  updateStats();
  const marker = document.createElement("span");
  marker.className = "shotMarker";
  marker.style.left = `${shot.x * 100}%`;
  marker.style.top = `${shot.y * 100}%`;
  $("shotOverlay").append(marker);
  if (mode === "3d" && shot.impact) {
    range.addImpact(shot.impact);
    marker.remove();
  }
}
function sendVoiceState() {
  channel?.send({ type: "voice-state", runId: running ? started : null });
}
function voiceResult(id, result) {
  health.voiceResult(id, result);
  channel?.send({ type: "voice-result", id, message: result.message });
  if (result.magazine) showMagazine($("ammoDisplay"), result.magazine, running);
}
function handleVoice(m) {
  health.voice(m);
  if (
    !phoneConnected ||
    !running ||
    calibrating ||
    zeroSession ||
    m.runId !== started ||
    now() < started ||
    now() - m.time > 2000
  )
    return voiceResult(m.id, {
      message:
        "Voice command ignored: start an active session after calibration/countdown.",
    });
  if (projection?.connected)
    projection.send({
      type: "voice-command",
      runId: started,
      id: m.id,
      command: m.command,
      time: m.time,
    });
  else
    voiceResult(
      m.id,
      applyRangeCommand(m.command, { magazine, timeline, time: now() }),
    );
}
function startRun() {
  if (running) return;
  if (projection?.opening || (projection?.connected && !projection.ready))
    return notice("Wait for the projector to finish loading before starting.");
  if (calibrating) return notice("Return to the range after calibration.");
  if (!$("demo").checked && phoneAdjusting)
    return notice(
      "Camera is adjusting sensitivity automatically. Hold fire and start when Camera calibrated returns.",
    );
  if (!$("demo").checked && !phoneReady)
    return notice("Pair and calibrate the phone before a live session.");
  try {
    validateScenario(scenario);
  } catch (e) {
    return notice(e.message);
  }
  running = true;
  started = now() + (scenario.session?.countdown || 0) * 1000;
  sendVoiceState();
  timeline = new SegmentClock(scenario, started, mode);
  magazine = new Magazine(scenario.session);
  showMagazine($("ammoDisplay"), magazine.state(), true);
  shotAudio.unlock();
  remoteNav = null;
  mediaStarted = false;
  $("movie").pause();
  youtubePlayer?.pauseVideo?.();
  runScenarioKey = JSON.stringify([scenario, mode === "3d" ? null : mediaKey]);
  runScenarioName = scenario.name;
  runMode = mode;
  sessionAudio.schedule(scenario.session, scenario.session?.countdown || 0);
  sessionsSelect.value = "current";
  shots = [];
  $("shotOverlay").replaceChildren();
  history = [];
  runShooter = $("shooter").value.trim() || "Shooter";
  runZero = shooterZeros.get(runShooter) || null;
  runLatency = Math.max(0, Math.min(1000, Number($("latency").value) || 0));
  runDemo = $("demo").checked;
  updateShotInput();
  $("shots").replaceChildren();
  range.editor = false;
  $("viewLabel").textContent = "PERSPECTIVE / LIVE PREVIEW";
  $("viewToggle").textContent = "Overhead editor";
  drawing = null;
  $("stage").classList.remove("drawing");
  const roles = {};
  for (const t of scenario.targets)
    roles[t.id] =
      t.kind === "random"
        ? crypto.getRandomValues(new Uint8Array(1))[0] < 128
          ? "shoot"
          : "no-shoot"
        : t.kind;
  range.setScenario(scenario, roles);
  projectionView();
  if (projection?.connected)
    projection.send({
      type: "start",
      scenario,
      roles,
      started,
      runId: started,
      demo: runDemo,
      latency: runLatency,
      shooter: runShooter,
      zeroOffset: runZero,
    });
  $("startRun").disabled = true;
  $("stopRun").disabled = false;
  $("demo").disabled = true;
  channel?.send({ type: "mode", mode });
  beginRunMedia();
  updateStats();
  notice(
    `${runShooter}: ${runDemo ? "demo" : "live camera"} session running. ${mode !== "3d" ? "Score each shot manually in session review." : ""}`,
  );
}
function beginRunMedia() {
  if (!running || mediaStarted || now() < started) return;
  mediaStarted = true;
  if (projection?.connected) return;
  if (mode === "upload") {
    $("movie").currentTime = 0;
    $("movie")
      .play()
      .catch((e) => notice(e.message));
  }
  if (mode === "youtube") youtubePlayer?.playVideo?.();
}
function stopRun() {
  if (!health.placementActive)
    health.interrupt("Session ended before test was finished.");
  const wasRunning = running;
  const startedScoring = running && now() >= started;
  running = false;
  sendVoiceState();
  sessionAudio.cancel();
  shotAudio.cancel();
  $("ammoDisplay").hidden = true;
  $("countdownDisplay").hidden = true;
  if (wasRunning) projection?.send({ type: "stop" });
  updateShotInput();
  $("startRun").disabled = false;
  $("stopRun").disabled = true;
  $("demo").disabled = false;
  $("movie").pause();
  youtubePlayer?.pauseVideo?.();
  notice(
    `Session ended. Review ${shots.length} shots below. Select another shooter to run again.`,
  );
  if (startedScoring) archiveSession();
}
$("startRun").onclick = startRun;
$("stopRun").onclick = stopRun;
function animate(t) {
  requestAnimationFrame(animate);
  beginRunMedia();
  const remaining = running ? Math.max(0, started - now()) : 0;
  $("countdownDisplay").hidden = !remaining;
  if (remaining)
    $("countdownDisplay").textContent = String(Math.ceil(remaining / 1000));
  currentTime = projection?.connected
    ? remoteElapsed
    : running
      ? timeline.time(now())
      : currentTime;
  if (!projection?.connected || range.editor) range.render(currentTime);
  if (running) {
    $("clock").textContent = stamp(Math.min(currentTime, scenario.duration));
    if (!timeline?.enabled && currentTime >= scenario.duration) stopRun();
  }
  const nav = projection?.connected ? remoteNav : timeline?.state(now());
  $("previousSegment").disabled = !running || !nav?.previous;
  $("nextSegment").disabled = !running || !nav?.next;
  $("segmentStatus").textContent =
    running && nav?.enabled
      ? nav.held
        ? `Holding at point ${nav.point + 1} / ${nav.total + 1}`
        : "Moving to endpoint…"
      : "";
  if (running && timeline?.enabled)
    $("clock").textContent = stamp(Math.max(0, (now() - started) / 1000));
  lastRender = t;
  if (projection?.connected) return;
  if (t - lastFrame < 90) return;
  lastFrame = t;
  let drawable = null;
  if (calibrating) drawable = $("calibration");
  else if (mode === "3d") drawable = $("range");
  else if (mode === "upload" && $("movie").readyState >= 2)
    drawable = $("movie");
  if (!drawable) return;
  if (
    drawable instanceof HTMLCanvasElement &&
    (!drawable.width || !drawable.height)
  )
    return;
  refctx.fillStyle = "black";
  refctx.fillRect(0, 0, 480, 270);
  if (mode === "upload" && !calibrating) {
    const f = Math.min(480 / drawable.videoWidth, 270 / drawable.videoHeight),
      w = drawable.videoWidth * f,
      h = drawable.videoHeight * f;
    refctx.drawImage(drawable, (480 - w) / 2, (270 - h) / 2, w, h);
  } else refctx.drawImage(drawable, 0, 0, 480, 270);
  const image = reference.toDataURL("image/jpeg", 0.75),
    frame = { type: "reference", time: now(), elapsed: currentTime, image };
  history.push(frame);
  if (history.length > 35) history.shift();
  if (phoneConnected) channel?.send(frame);
}
requestAnimationFrame(animate);
rebuild();
async function updatePairLink() {
  if (!session) return;
  try {
    const origin = new URL($("phoneOrigin").value);
    if (!["http:", "https:"].includes(origin.protocol)) throw Error();
    const link = `${origin.origin}/phone#code=${session.code}`;
    $("phoneLink").href = link;
    $("phoneLink").textContent = link;
    $("qr").src = `/api/qr?value=${encodeURIComponent(link)}`;
    $("qr").hidden = false;
  } catch {
    notice("Enter a full host origin such as https://192.168.1.20:8443");
  }
}
$("pairLink").onclick = updatePairLink;
const hostKey = "laser-range.host-key";
function hostAccess(message) {
  $("hostAccess").hidden = false;
  $("hostAccessStatus").textContent = message;
  $("qr").hidden = true;
  $("pairCode").textContent = "— — — — — —";
  $("phoneLink").removeAttribute("href");
  notice(message);
}
$("unlockHost").onclick = () => {
  const value = $("hostCredential").value.trim();
  let token = value;
  try {
    token = new URLSearchParams(new URL(value).hash.slice(1)).get("host") || "";
  } catch {}
  $("hostCredential").value = "";
  if (!token)
    return hostAccess(
      "Paste the current host link printed by npm start, including #host=….",
    );
  connectHost(token);
};
$("qr").onerror = () =>
  notice(
    "QR image could not load. Use the pairing link or six-digit code below it.",
  );
async function connectHost(explicitToken) {
  let saved;
  try {
    saved = sessionStorage.getItem(hostKey);
  } catch {}
  const token =
    explicitToken ||
    new URLSearchParams(location.hash.slice(1)).get("host") ||
    saved;
  if (!token)
    return hostAccess(
      "Phone pairing needs the current host link from your server terminal. Paste it in Camera → Host link or access key. HTTPS uses separate browser storage from HTTP.",
    );
  historyReplace();
  try {
    const response = await fetch("/api/session", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        try {
          sessionStorage.removeItem(hostKey);
        } catch {}
      }
      throw Error(data.error);
    }
    try {
      sessionStorage.setItem(hostKey, token);
    } catch {}
    $("hostAccess").hidden = true;
    session = data;
    $("pairCode").textContent = data.code;
    $("phoneOrigin").value = data.publicOrigin || location.origin;
    await updatePairLink();
    channel = new Channel({ role: "host", token: data.token });
    channel
      .on("joined", (m) => {
        sendVoiceState();
        notice(
          m.reconnected
            ? "Connection restored. Camera alignment retained; wait for sensitivity to settle, then start a new session."
            : "Host ready. Open Camera to pair a phone, or start a demo.",
        );
        channel.send({ type: "mode", mode });
        channel.send({ type: "pattern", active: calibrating });
      })
      .on("reconnecting", () => {
        health.interrupt("Network connection interrupted.");
        phoneReady = false;
        phoneConnected = false;
        cancelZero();
        if (running && !runDemo) stopRun();
        $("connection").textContent = "Network interrupted · reconnecting";
        notice(
          "Reconnecting automatically. Alignment and shooter corrections retained. Shots during the interruption cannot be recorded.",
        );
      })
      .on("phone-status", (m) => {
        const newlyConnected = m.connected && !phoneConnected;
        const newlyArmed = m.ready && !phoneReady;
        phoneConnected = m.connected;
        if (newlyConnected) sendVoiceState();
        phoneReady = m.ready;
        if (!m.ready) {
          phoneAdjusting = false;
          cancelZero();
        }
        if ((!m.connected && !m.reconnecting) || m.sameClient === false)
          clearAllZeros();
        updateZeroStatus();
        if (newlyArmed) {
          if (running && runDemo) stopRun();
          $("demo").checked = false;
          notice(
            "Camera calibrated. Live camera input selected; start a session to record laser shots.",
          );
        }
        $("connection").textContent = m.ready
          ? "Camera calibrated"
          : m.connected
            ? "Camera connected · detection not armed"
            : m.reconnecting
              ? "Camera reconnecting · alignment retained"
              : "Waiting for camera";
        $("statusDot").style.background = m.ready ? "#89d9de" : "#f2bb70";
        if (newlyConnected && !m.ready) {
          channel.send({ type: "mode", mode });
          channel.send({ type: "pattern", active: calibrating });
        }
        if (!m.ready && running && !runDemo) stopRun();
        sendControlState();
      })
      .on("voice-command", handleVoice)
      .on("alignment-changed", () => {
        health.interrupt("Screen alignment changed during test.");
        clearAllZeros();
      })
      .on("zero-request", (m) => zeroAction(m.action))
      .on("calibration-request", (m) => {
        $(m.active ? "calibrate" : "stopCalibration").click();
      })
      .on("sensitivity", (m) => {
        phoneAdjusting = m.active;
        sendControlState();
        if (zeroSession) updateZeroStatus();
        if (phoneReady)
          $("connection").textContent = m.active
            ? "Camera adjusting · hold fire"
            : "Camera calibrated";
      })
      .on("shot", (m) => {
        if (health.shot(m)) return;
        zeroSession ? collectZero(m) : recordShot(m);
      })
      .on("telemetry", (m) => {
        $("telemetry").textContent =
          `${m.fps.toFixed(0)} fps · reference age ${Math.round(m.referenceAge)} ms · ${m.tests} test pulses · ${m.detections || 0} live detections${m.adapting ? " · adjusting sensitivity — hold fire" : ""}`;
        health.telemetry(m);
      })
      .on("closed", (reason) => {
        clearAllZeros();
        phoneReady = false;
        phoneConnected = false;
        if (running && !runDemo) stopRun();
        session = null;
        hostAccess(
          `${reason}. Paste the current terminal host link in Camera to reconnect.`,
        );
      })
      .on("fault", notice);
  } catch (e) {
    hostAccess(
      `${e.message} If the server restarted or HTTPS was enabled, use its newly printed host link.`,
    );
  }
}
function historyReplace() {
  window.history.replaceState(null, "", location.pathname);
}
connectHost();
document.addEventListener("visibilitychange", () => {
  if (document.hidden && running && !projection?.connected) stopRun();
});

// Controls remain reachable while the projector owns the fullscreen display.
const projectorControls = document.createElement("div");
projectorControls.className = "projectorControls";
for (const [label, action] of [
  ["Start", startRun],
  ["End", stopRun],
  ["Play / pause", () => $("playVideo").click()],
  ["Calibrate", () => $("calibrate").click()],
  ["Range", () => $("stopCalibration").click()],
]) {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = action;
  projectorControls.append(b);
}
$("stage").append(projectorControls);
sessionsSelect = document.createElement("select");
sessionsSelect.id = "pastSessions";
sessionsSelect.setAttribute("aria-label", "Previous shooter sessions");
sessionsSelect.add(new Option("Current session", "current"));
$("reviewSummary").parentElement.append(sessionsSelect);
function renderComparison() {
  const body = $("comparisonBody");
  if (!body) return;
  body.replaceChildren();
  const sets = new Map();
  for (const entry of pastSessions)
    if (!sets.has(entry.scenarioKey))
      sets.set(entry.scenarioKey, sets.size + 1);
  for (const g of compareSessions(pastSessions)) {
    const entry = pastSessions.find(
      (s) =>
        s.shooter === g.shooter &&
        s.scenarioName === g.scenario &&
        s.mode === g.mode &&
        s.demo === g.demo,
    );
    const row = document.createElement("tr");
    const fmt = (n) => (n === null ? "—" : `${n.toFixed(2)}s`);
    for (const value of [
      g.shooter,
      `${g.scenario} / ${sets.get(g.scenarioKey || entry?.scenarioKey)}`,
      `${g.mode} · ${g.demo ? "demo" : "camera"}`,
      g.runs,
      g.shots,
      g.hits,
      g.misses,
      g.noShoots,
      g.pending,
      `${g.accuracy}%`,
      g.points,
      g.bestPoints,
      fmt(g.averageFirst),
      fmt(g.averageSplit),
      Object.entries(g.zones)
        .map(([zone, n]) => `${zone}: ${n}`)
        .join(", ") || "—",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    body.append(row);
  }
}
$("clearComparisons").onclick = () => {
  if (running) return notice("End the session before clearing history.");
  pastSessions.length = 0;
  sessionsSelect.replaceChildren(new Option("Current session", "current"));
  renderComparison();
};
function archiveSession() {
  if (started && lastArchivedStart !== started) {
    lastArchivedStart = started;
    pastSessions.unshift({
      id: String(started),
      shooter: runShooter,
      shots,
      scenarioKey: runScenarioKey,
      scenarioName: runScenarioName,
      mode: runMode,
      demo: runDemo,
    });
    if (pastSessions.length > 50) pastSessions.pop();
    for (const old of pastSessions.slice(5))
      for (const shot of old.shots) delete shot.image;
    renderComparison();
    sessionsSelect.replaceChildren(new Option("Current session", "current"));
    for (const s of pastSessions)
      sessionsSelect.add(
        new Option(
          `${s.shooter} · ${s.shots.length} shots · ${new Date(Number(s.id)).toLocaleTimeString()}`,
          s.id,
        ),
      );
  }
}
sessionsSelect.onchange = () => {
  if (running) {
    sessionsSelect.value = "current";
    return notice("End the session before reviewing past runs.");
  }
  const s =
    sessionsSelect.value === "current"
      ? pastSessions[0]
      : pastSessions.find((s) => s.id === sessionsSelect.value);
  if (!s) return;
  shots = s.shots;
  runShooter = s.shooter;
  $("shots").replaceChildren();
  shots.forEach((s, i) => {
    addShotRow(s);
    $("shots").firstChild.firstChild.textContent = String(i + 1).padStart(
      2,
      "0",
    );
  });
  updateStats();
};

function invalidateProjection(message) {
  health.interrupt(message);
  clearAllZeros();
  phoneReady = false;
  channel?.send({ type: "reset" });
  if (running) stopRun();
  notice(message);
}
function projectionView() {
  const active = !!projection?.connected;
  $("closeProjector").hidden = !active;
  $("openProjector").textContent = active
    ? "Focus projector"
    : "Open projector window";
  $("remotePreview").hidden =
    !active || mode === "youtube" || (mode === "3d" && range.editor);
  $("remoteVideoNotice").hidden = !active || mode !== "youtube";
  $("viewToggle").disabled = false;
  if (active) {
    $("movie").pause();
    youtubePlayer?.pauseVideo?.();
  }
}
function configureProjection() {
  if (!projection?.connected) return;
  projection.ready = false;
  projectionView();
  projection.send({
    type: "configure",
    scenario,
    mode,
    file: mode === "upload" ? uploadedFile : null,
    mediaKey,
    youtubeId: youtubeId($("youtubeUrl").value),
    calibrating,
    zero: zeroPattern,
    diagnosticPoint,
    offset: channel?.offset || 0,
  });
}
async function simulatorAction(m) {
  if (simulatorBusy || calibrating || zeroSession) return;
  if (
    m.input === "laser" &&
    (!phoneReady || phoneAdjusting || $("demo").checked)
  )
    return;
  if (m.input === "demo" && !$("demo").checked) return;
  if (m.action === "start") return startRun();
  if (m.action === "restart") {
    if (running) stopRun();
    return startRun();
  }
  if (m.action === "end") return stopRun();
  if (m.action === "previous" || m.action === "next")
    return stepSegment(m.action === "next" ? 1 : -1);
  if (m.action !== "ranges" && !/^load:[0-9a-f-]{36}$/.test(m.action)) return;
  simulatorBusy = true;
  try {
    if (running) stopRun();
    const id = m.action.startsWith("load:") ? m.action.slice(5) : "";
    const response = await fetch("/api/library/ranges" + (id ? "/" + id : ""), {
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem(hostKey) || ""}`,
      },
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    if (!id)
      projection.send({
        type: "range-list",
        items: data.items.map((i) => ({ id: i.id, name: i.name })),
      });
    else {
      const next = validateScenario(data.scenario);
      setMode("3d");
      edit(() => (scenario = next));
      configureProjection();
      notice(`Loaded ${data.name}. Use Start when ready.`);
    }
  } catch (e) {
    notice(e.message);
    projection?.send({ type: "range-list", items: [], error: e.message });
  } finally {
    simulatorBusy = false;
  }
}
function onProjectionMessage(m) {
  if (m.type === "voice-result" && running && m.runId === started)
    voiceResult(m.id, m.result);
  if (m.type === "simulator-action") simulatorAction(m);
  if (m.type === "connected") {
    invalidateProjection(
      "Projector connected. Move it to the projector display, enter fullscreen, then calibrate the phone.",
    );
    configureProjection();
  }
  if (m.type === "ready") {
    projection.ready = true;
    sendControlState();
    notice(
      phoneReady
        ? "Projector ready. Camera alignment retained."
        : "Projector ready. Calibrate its image before starting a live camera session.",
    );
  }
  if (m.type === "reference") {
    remoteElapsed = m.elapsed;
    $("remotePreview").src = m.image;
    if (phoneConnected) channel?.send(m);
  }
  if (m.type === "tick") {
    remoteNav = m.nav;
    remoteElapsed = m.elapsed;
    if (running)
      $("clock").textContent = stamp(
        timeline?.enabled
          ? Math.max(0, (now() - started) / 1000)
          : Math.min(m.elapsed, scenario.duration),
      );
    $("playbackStatus").textContent =
      m.mode === "3d"
        ? ""
        : `${m.playing ? "Playing" : "Paused"} · ${Number(m.videoTime).toFixed(1)} sec · projector`;
  }
  if (m.type === "ammunition" && running && m.runId === started)
    ammunitionFeedback(m.state);
  if (m.type === "scored-shot" && running && m.runId === started)
    acceptShot(m.shot);
  if (m.type === "ended" && running && m.runId === started) stopRun();
  if (m.type === "suspended" || m.type === "stalled") {
    if (running) stopRun();
    notice(
      "Projector paused or delayed. Camera alignment retained; restore the display before starting a new session.",
    );
  }
  if (m.type === "resumed" || m.type === "recovered")
    channel?.send({ type: "reset", preserveAlignment: true });
  if (m.type === "geometry-changed") {
    if (m.reason) invalidateProjection(m.reason);
    else {
      channel?.send({ type: "reset", preserveAlignment: true });
      notice(
        "Projector updated. Fixed screen alignment retained; sensitivity adjusts automatically. Reset corners if the projected frame moved.",
      );
    }
  }
  if (m.type === "projector-offline")
    projection.disconnect("Projector closed. Reopen it and recalibrate.");
  if (m.type === "error") {
    projection.ready = m.ready === true;
    invalidateProjection(m.message);
  }
}
projection = new ProjectionLink(onProjectionMessage, (message) => {
  projectionView();
  history = [];
  invalidateProjection(message);
});
$("openProjector").onclick = () => {
  if (running) return notice("End the session before opening the projector.");
  if (!projection.open())
    notice(
      "Allow popups for this host, then click Open projector window again.",
    );
};
$("closeProjector").onclick = () =>
  projection.disconnect(
    "Using the single-window display. Recalibrate this view before a live session.",
  );
$("remotePreview").onpointerdown = (e) => {
  if (!running || !runDemo || e.button !== 0) return;
  recordShot({ ...point(e), time: now(), confidence: "high" }, true);
};
$("seekVideo").onclick = () => {
  const time = Number($("seekTime").value);
  if (!Number.isFinite(time) || time < 0) return;
  if (projection.connected) return projection.send({ type: "seek", time });
  if (mode === "upload" && Number.isFinite($("movie").duration))
    $("movie").currentTime = Math.min(time, $("movie").duration);
  if (mode === "youtube") youtubePlayer?.seekTo?.(time, true);
};
function sendControlState() {
  projection?.send({
    type: "control-state",
    laser: phoneReady && !phoneAdjusting && !$("demo").checked,
    zero: shooterZeros.get($("shooter").value.trim() || "Shooter") || null,
  });
}
$("demo").addEventListener("change", sendControlState);
$("shooter").addEventListener("change", sendControlState);
setInterval(() => {
  projection.send({ type: "clock", offset: channel?.offset || 0 });
  sendControlState();
}, 3000);

installSavedLibrary({
  getScenario: () => validateScenario(scenario),
  loadScenario: (s) => edit(() => (scenario = validateScenario(s))),
  getToken: () => sessionStorage.getItem(hostKey),
  notice,
  isRunning: () => running,
});
