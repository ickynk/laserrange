import {
  cameraFields,
  cameraCapabilities,
  applyCameraSettings,
} from "./camera-health.js";
export function installCameraControls({ root, track, blocked, before, after }) {
  root.innerHTML = `<details id="cameraHardware"><summary>Exposure, focus &amp; white balance</summary><p class="hint">Controls depend on this camera/browser. End the range session before changing settings. Hold fire while sensitivity settles afterward. Verify alignment after changing focus.</p><div id="cameraSettingsFields"></div><button id="applyCameraSettings">Apply camera settings</button><button id="readCameraSettings">Read current settings</button><p id="cameraSettingsResult" role="status"></p></details>`;
  const $ = (id) => root.querySelector("#" + id);
  let busy = false,
    currentTrack = null,
    inputs = {};
  function read() {
    currentTrack = track();
    inputs = {};
    $("cameraSettingsFields").replaceChildren();
    const { supported, settings } = cameraCapabilities(currentTrack);
    for (const [key, cap] of Object.entries(supported)) {
      const label = document.createElement("label"),
        input = document.createElement(Array.isArray(cap) ? "select" : "input");
      label.textContent = cameraFields[key].label;
      input.id = "cameraSetting-" + key;
      if (Array.isArray(cap)) {
        input.add(new Option("Leave unchanged", ""));
        for (const mode of cap) input.add(new Option(mode, mode));
      } else {
        input.type = "number";
        input.min = cap.min;
        input.max = cap.max;
        input.step = cap.step;
        input.placeholder = `${cap.min} to ${cap.max}`;
      }
      input.value = settings[key] ?? "";
      inputs[key] = input;
      label.append(input);
      $("cameraSettingsFields").append(label);
    }
    $("cameraSettingsResult").textContent =
      currentTrack?.readyState !== "live"
        ? "Enable the camera to discover its available settings."
        : !Object.keys(inputs).length
          ? "This browser does not expose exposure/focus controls. Use existing sensitivity controls and adjust room/projector lighting."
          : "Current values read from the camera. Unsupported settings are omitted.";
    tick();
  }
  async function apply() {
    if (busy || blocked()) return;
    const active = track(),
      { settings } = cameraCapabilities(active),
      patch = {};
    for (const [key, input] of Object.entries(inputs)) {
      if (!input.value || input.disabled) continue;
      const value = cameraFields[key].mode ? input.value : Number(input.value);
      if (value !== settings[key]) patch[key] = value;
    }
    if (!Object.keys(patch).length) {
      $("cameraSettingsResult").textContent =
        "No camera setting changes selected.";
      return;
    }
    busy = true;
    before();
    tick();
    $("cameraSettingsResult").textContent = "Applying settings · hold fire…";
    try {
      await applyCameraSettings(active, patch);
      if (track() !== active)
        throw Error("Camera changed; read settings again.");
      read();
      after(true);
      $("cameraSettingsResult").textContent =
        "Settings confirmed. Sensitivity is settling; verify alignment before firing.";
    } catch (e) {
      after(false);
      $("cameraSettingsResult").textContent =
        e.message +
        " Detection was paused. Check settings before explicitly resuming.";
    } finally {
      busy = false;
      tick();
    }
  }
  function tick() {
    const off = busy || blocked() || track()?.readyState !== "live";
    $("applyCameraSettings").disabled = off || !Object.keys(inputs).length;
    $("readCameraSettings").disabled = busy;
    for (const [key, input] of Object.entries(inputs)) {
      const required = cameraFields[key].requires;
      input.disabled =
        off ||
        !!(
          required &&
          (inputs[required]?.value ||
            cameraCapabilities(track()).settings[required]) !== "manual"
        );
    }
  }
  $("applyCameraSettings").onclick = apply;
  $("readCameraSettings").onclick = read;
  root.addEventListener("change", tick);
  read();
  return {
    refresh: read,
    tick,
    get busy() {
      return busy;
    },
  };
}
