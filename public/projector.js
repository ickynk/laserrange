import { RangeScene } from "./range.js";
import { defaultScenario, validateScenario } from "./core/scenario.js";
import { applyZero, outsideScreen } from "./core/zero.js";
import { drawCalibration, drawZero } from "./core/pattern.js";
import { joinOperator } from "./core/projection-link.js";
const $ = (id) => document.getElementById(id);
const range = new RangeScene($("display"));
let scenario = defaultScenario(),
  mode = "3d",
  running = false,
  calibrating = false,
  zeroPattern = false,
  shotZero = null,
  elapsed = 0,
  started = 0,
  runId = null,
  demo = true,
  latency = 100,
  shooter = "",
  offset = 0,
  history = [],
  lastFrame = 0,
  player = null,
  mediaURL = null,
  mediaKey = null,
  generation = 0,
  ready = false,
  offline = false;
const now = () => Date.now() + offset;
range.setScenario(scenario);
const ref = document.createElement("canvas");
ref.width = 480;
ref.height = 270;
const ctx = ref.getContext("2d");
function fail(message) {
  $("projectorError").hidden = false;
  $("projectorError").textContent = message;
  send({ type: "error", message, ready });
}
function clearError() {
  $("projectorError").hidden = true;
}
function pause() {
  $("media").pause();
  player?.pauseVideo?.();
}
function stop() {
  const wasRunning = running;
  running = false;
  $("countdownDisplay").hidden = true;
  pause();
  updateInput();
  if (wasRunning) send({ type: "ended", runId, elapsed });
}
function lost() {
  offline = true;
  ready = false;
  stop();
  fail(
    "Operator disconnected. Close this window and reopen the projector from the operator screen.",
  );
}
let mediaStarted = false;
let send = () => {};
send = joinOperator(
  (m) =>
    handle(m).catch((e) => {
      if (m.type === "configure") ready = false;
      stop();
      fail(
        `${e.message} For blocked playback, click Enter fullscreen in the projector window, then retry.`,
      );
    }),
  lost,
);
function updateInput() {
  $("projectorInput").hidden = !(running && demo && !calibrating);
  $("youtubeDisplay").inert = running && demo;
}
let ytAPI;
function loadAPI() {
  return (ytAPI ||= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve();
    window.onYouTubeIframeAPIReady = resolve;
    const s = document.createElement("script");
    s.src = "https://www.youtube.com/iframe_api";
    s.onerror = () =>
      reject(Error("YouTube API could not load on the projector."));
    document.head.append(s);
  }));
}
function waitMedia(video) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () =>
        finish(
          Error("Video loading timed out. Select a browser-supported video."),
        ),
      15000,
    );
    const success = () => finish(),
      error = () =>
        finish(Error("The projector could not play this video codec."));
    function finish(err) {
      clearTimeout(timer);
      video.removeEventListener("loadedmetadata", success);
      video.removeEventListener("error", error);
      err ? reject(err) : resolve();
    }
    video.addEventListener("loadedmetadata", success);
    video.addEventListener("error", error);
  });
}
async function configure(m) {
  const g = ++generation;
  ready = false;
  stop();
  clearError();
  scenario = validateScenario(m.scenario);
  offset = m.offset || 0;
  range.setScenario(scenario, m.roles || {});
  history = [];
  elapsed = 0;
  mode = m.mode;
  if (!["3d", "upload", "youtube"].includes(mode))
    throw Error("Invalid projector mode.");
  $("display").hidden = mode !== "3d";
  $("media").hidden = mode !== "upload";
  $("youtubeDisplay").hidden = mode !== "youtube";
  pause();
  if (mode === "upload" && mediaKey !== m.mediaKey) {
    if (!(m.file instanceof Blob))
      throw Error("Select a video file on the operator screen.");
    if (mediaURL) URL.revokeObjectURL(mediaURL);
    mediaURL = URL.createObjectURL(m.file);
    const loaded = waitMedia($("media"));
    $("media").src = mediaURL;
    await loaded;
    mediaKey = m.mediaKey;
  }
  if (mode === "youtube" && mediaKey !== m.mediaKey) {
    if (!/^[\w-]{11}$/.test(m.youtubeId || ""))
      throw Error("Select a valid YouTube video.");
    await loadAPI();
    if (g !== generation) return;
    player?.destroy();
    $("youtubeDisplay").replaceChildren(
      Object.assign(document.createElement("div"), { id: "projectorYT" }),
    );
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("YouTube player did not become ready.")),
        15000,
      );
      player = new window.YT.Player("projectorYT", {
        videoId: m.youtubeId,
        playerVars: { playsinline: 1, rel: 0, origin: location.origin },
        events: {
          onReady: () => {
            clearTimeout(timer);
            resolve();
          },
          onError: () => {
            clearTimeout(timer);
            reject(Error("YouTube embedding failed on the projector."));
          },
        },
      });
    });
    mediaKey = m.mediaKey;
  }
  if (g !== generation || offline) return;
  calibrating = !!m.calibrating;
  zeroPattern = m.zero === true;
  $("pattern").hidden = !calibrating;
  if (calibrating) (zeroPattern ? drawZero : drawCalibration)($("pattern"));
  $("impacts").replaceChildren();
  ready = true;
  updateInput();
  send({ type: "ready", mode });
}
async function play() {
  if (mode === "upload") await $("media").play();
  else if (mode === "youtube") player?.playVideo?.();
}
async function handle(m) {
  if (offline) return;
  switch (m.type) {
    case "configure":
      return configure(m);
    case "scene":
      if (!running) {
        scenario = validateScenario(m.scenario);
        range.setScenario(scenario);
        history = [];
        elapsed = 0;
      }
      break;
    case "clock":
      offset = m.offset || 0;
      break;
    case "calibration":
      stop();
      calibrating = !!m.active;
      zeroPattern = m.zero === true;
      $("pattern").hidden = !calibrating;
      if (calibrating) (zeroPattern ? drawZero : drawCalibration)($("pattern"));
      history = [];
      updateInput();
      break;
    case "start":
      if (!ready || calibrating)
        throw Error(
          "Projector is not ready. Finish loading and calibration first.",
        );
      clearError();
      scenario = validateScenario(m.scenario);
      range.setScenario(scenario, m.roles);
      started = m.started;
      runId = m.runId;
      demo = m.demo;
      latency = m.latency;
      shooter = m.shooter;
      shotZero = m.zeroOffset || null;
      history = [];
      elapsed = 0;
      running = true;
      mediaStarted = false;
      pause();
      $("impacts").replaceChildren();
      updateInput();
      if (mode === "upload") $("media").currentTime = 0;
      if (mode === "youtube") player?.seekTo?.(0, true);
      if (now() >= started) {
        mediaStarted = true;
        await play();
      }
      send({ type: "started", runId });
      break;
    case "stop":
      stop();
      break;
    case "shot":
      if (m.runId === runId) record(m.shot, m.demo);
      break;
    case "toggle-play":
      if (
        mode === "upload"
          ? !$("media").paused
          : player?.getPlayerState?.() === 1
      )
        pause();
      else await play();
      break;
    case "seek": {
      const t = Number(m.time);
      if (Number.isFinite(t) && t >= 0) {
        if (mode === "upload" && Number.isFinite($("media").duration))
          $("media").currentTime = Math.min(t, $("media").duration);
        if (mode === "youtube") player?.seekTo?.(t, true);
      }
      break;
    }
  }
}
function record(m, isDemo = false) {
  if (
    !running ||
    demo !== isDemo ||
    calibrating ||
    !Number.isFinite(m.x) ||
    !Number.isFinite(m.y) ||
    m.x < 0 ||
    m.x > 1 ||
    m.y < 0 ||
    m.y > 1
  )
    return;
  if (!isDemo) m = applyZero(m, shotZero);
  const capture = m.time - (isDemo ? 0 : latency),
    time = (capture - started) / 1000;
  if (!Number.isFinite(time) || time < 0 || time > scenario.duration) return;
  const h = history.reduce(
    (best, f) =>
      Math.abs(f.time - capture) < Math.abs((best?.time ?? Infinity) - capture)
        ? f
        : best,
    null,
  );
  let score = { result: "review", target: null };
  if (
    mode === "3d" &&
    h &&
    Math.abs(h.time - capture) < 200 &&
    m.confidence === "high"
  )
    score = range.score(m.x, m.y, h.elapsed);
  if (outsideScreen(m)) score = { result: "miss", target: null };
  const shot = {
    ...m,
    ...score,
    time,
    shooter,
    demo: isDemo,
    image: mode === "youtube" ? m.image : h?.image || m.image,
  };
  if (score.impact) range.addImpact(score.impact);
  else {
    const dot = document.createElement("span");
    dot.className = "shotMarker";
    dot.style.left = `${m.x * 100}%`;
    dot.style.top = `${m.y * 100}%`;
    $("impacts").append(dot);
  }
  send({ type: "scored-shot", runId, shot });
}
$("projectorInput").onpointerdown = (e) => {
  e.preventDefault();
  if (e.button !== 0 || !e.isPrimary) return;
  const r = $("projectorStage").getBoundingClientRect();
  record(
    {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
      time: now(),
      confidence: "high",
    },
    true,
  );
};
$("projectorInput").oncontextmenu = (e) => e.preventDefault();
$("enterFullscreen").onclick = async () => {
  try {
    await document.documentElement.requestFullscreen();
  } catch (e) {
    fail(e.message);
  }
};
let size = "";
new ResizeObserver(() => {
  const w = $("projectorStage").clientWidth,
    h = $("projectorStage").clientHeight,
    next = `${w}x${h}`;
  range.resize(w, h);
  history = [];
  if (size && size !== next) {
    send({ type: "geometry-changed", width: w, height: h });
  }
  size = next;
}).observe($("projectorStage"));
function hideSetup() {
  $("projectorSetup").hidden =
    running || calibrating || !!document.fullscreenElement;
}
function animate(t) {
  requestAnimationFrame(animate);
  hideSetup();
  if (offline) return;
  const remaining = running ? Math.max(0, started - now()) : 0;
  $("countdownDisplay").hidden = !remaining;
  if (remaining)
    $("countdownDisplay").textContent = String(Math.ceil(remaining / 1000));
  if (running && !mediaStarted && !remaining) {
    mediaStarted = true;
    play().catch((e) => {
      stop();
      fail(e.message);
    });
  }
  if (running)
    elapsed = Math.max(
      0,
      Math.min((now() - started) / 1000, scenario.duration),
    );
  if (mode === "3d" && !calibrating) range.render(elapsed);
  if (running && elapsed >= scenario.duration) {
    elapsed = Math.max(0, scenario.duration - 0.001);
    stop();
  }
  if (t - lastFrame < 90) return;
  lastFrame = t;
  send({
    type: "tick",
    runId,
    elapsed,
    mode,
    playing:
      mode === "upload" ? !$("media").paused : player?.getPlayerState?.() === 1,
    videoTime:
      mode === "upload"
        ? $("media").currentTime
        : player?.getCurrentTime?.() || 0,
  });
  let drawable = calibrating
    ? $("pattern")
    : mode === "3d"
      ? $("display")
      : mode === "upload" && $("media").readyState >= 2
        ? $("media")
        : null;
  if (!drawable || !ready) return;
  if (
    drawable instanceof HTMLCanvasElement &&
    (!drawable.width || !drawable.height)
  )
    return;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, 480, 270);
  if (mode === "upload" && !calibrating) {
    const f = Math.min(480 / drawable.videoWidth, 270 / drawable.videoHeight),
      w = drawable.videoWidth * f,
      h = drawable.videoHeight * f;
    ctx.drawImage(drawable, (480 - w) / 2, (270 - h) / 2, w, h);
  } else ctx.drawImage(drawable, 0, 0, 480, 270);
  const frame = {
    type: "reference",
    time: now(),
    elapsed,
    image: ref.toDataURL("image/jpeg", 0.75),
  };
  history.push(frame);
  if (history.length > 35) history.shift();
  send(frame);
}
requestAnimationFrame(animate);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stop();
    send({ type: "suspended" });
  } else send({ type: "resumed" });
});
