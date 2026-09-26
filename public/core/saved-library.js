export function installSavedLibrary({
  getScenario,
  loadScenario,
  getToken,
  notice,
  isRunning,
}) {
  const $ = (id) => document.getElementById(id);
  async function api(kind, id = "", options = {}) {
    const response = await fetch(`/api/library/${kind}${id ? "/" + id : ""}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${getToken() || ""}`,
        "Content-Type": "application/json",
      },
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    return data;
  }
  for (const [kind, prefix] of [
    ["ranges", "range"],
    ["videos", "video"],
  ]) {
    const select = $(prefix + "Library"),
      name = $(prefix + "LibraryName");
    const refresh = async () => {
      const { items } = await api(kind);
      select.replaceChildren(
        ...items.map(
          (i) =>
            new Option(
              i.name + " · " + new Date(i.updated).toLocaleString(),
              i.id,
            ),
        ),
      );
      if (!items.length) select.add(new Option("No saved items", ""));
    };
    const action = (fn) => async () => {
      try {
        await fn();
      } catch (e) {
        notice(e.message);
      }
    };
    select.closest("details").addEventListener("toggle", () => {
      if (select.closest("details").open)
        refresh().catch((e) => notice(e.message));
    });
    $("refresh" + (kind === "ranges" ? "Range" : "Video") + "Library").onclick =
      action(refresh);
    $("save" + (kind === "ranges" ? "Range" : "Video") + "Library").onclick =
      action(async () => {
        const s = getScenario();
        const data =
          kind === "ranges"
            ? { name: name.value.trim() || s.name, scenario: s }
            : { name: name.value.trim(), url: $("youtubeUrl").value };
        const saved = await api(kind, "", {
          method: "POST",
          body: JSON.stringify(data),
        });
        await refresh();
        select.value = saved.id;
        notice(`Saved ${saved.name} to the host ${kind} folder.`);
      });
    $("load" + (kind === "ranges" ? "Range" : "Video") + "Library").onclick =
      action(async () => {
        if (isRunning()) throw Error("End the session before loading.");
        if (!select.value) throw Error("Select a saved item first.");
        const item = await api(kind, select.value);
        if (kind === "ranges") loadScenario(item.scenario);
        else {
          $("youtubeUrl").value = item.url;
          $("loadYoutube").click();
        }
        name.value = item.name;
      });
    $("delete" + (kind === "ranges" ? "Range" : "Video") + "Library").onclick =
      action(async () => {
        if (!select.value) throw Error("Select a saved item first.");
        await api(kind, select.value, { method: "DELETE" });
        await refresh();
        notice("Saved item deleted.");
      });
  }
}
