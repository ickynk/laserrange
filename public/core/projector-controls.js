export const CONTROL_TOP = 0.86;
// Neutral colors avoid deliberately adding laser-colored UI to the camera image.
export class ProjectorControls {
  constructor(canvas, clock, action) {
    this.canvas = canvas;
    this.clock = clock;
    this.action = action;
    this.items = [];
    this.page = 0;
    this.menu = false;
    this.status = "";
    this.buttons = [];
    this.lastAction = -Infinity;
    this.changedAt = -Infinity;
    canvas.width = 1440;
    canvas.height = 810;
  }
  draw(state) {
    const c = this.canvas.getContext("2d"),
      w = this.canvas.width,
      h = this.canvas.height,
      y = h * CONTROL_TOP;
    const buttons = this.menu
      ? [
          { label: "Back", id: "back" },
          ...this.items
            .slice(this.page * 3, this.page * 3 + 3)
            .map((i) => ({ label: i.name, id: "load:" + i.id })),
          { label: "‹ Page", id: "page-back", disabled: this.page === 0 },
          {
            label: "Page ›",
            id: "page-next",
            disabled: (this.page + 1) * 3 >= this.items.length,
          },
        ]
      : [
          {
            label: "Start",
            id: "start",
            disabled: state.running || !state.ready,
          },
          { label: "Restart", id: "restart", disabled: !state.ready },
          { label: "Ranges", id: "ranges", disabled: !state.ready },
          {
            label: "‹ Previous",
            id: "previous",
            disabled: !state.running || !state.nav?.previous,
          },
          {
            label: "Next ›",
            id: "next",
            disabled: !state.running || !state.nav?.next,
          },
          { label: "End", id: "end", disabled: !state.running },
        ];
    const signature = JSON.stringify([buttons, state.visible]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.changedAt = this.clock();
    }
    this.buttons = state.visible ? buttons : [];
    const renderKey = signature + String(state.label) + this.status;
    if (renderKey === this.renderKey) return;
    this.renderKey = renderKey;
    c.clearRect(0, 0, w, h);
    if (!state.visible) {
      this.buttons = [];
      return;
    }
    c.fillStyle = "#101418";
    c.fillRect(0, y, w, h - y);
    c.fillStyle = "#cbd1d5";
    c.font = "18px sans-serif";
    c.textAlign = "center";
    c.fillText(
      this.menu
        ? this.status || "Select a saved range"
        : state.label || "Projector controls · laser or click",
      w / 2,
      y + 23,
    );
    buttons.forEach((b, i) => {
      const x = (i * w) / buttons.length + 7,
        bw = w / buttons.length - 14;
      c.fillStyle = b.disabled ? "#1d2227" : "#343c44";
      c.fillRect(x, y + 35, bw, h - y - 43);
      c.strokeStyle = "#78838b";
      if (!b.disabled) c.strokeRect(x, y + 35, bw, h - y - 43);
      c.fillStyle = b.disabled ? "#667078" : "#f1f1eb";
      c.font = "bold 23px sans-serif";
      let label = b.label;
      while (c.measureText(label).width > bw - 16 && label.length > 3)
        label = label.slice(0, -2) + "…";
      c.fillText(label, x + bw / 2, y + 80);
    });
  }
  hit(x, y, time = this.clock(), input = "laser") {
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < CONTROL_TOP ||
      y > 1 ||
      !this.buttons.length
    )
      return false;
    // Entire strip consumes strikes, including gaps and disabled buttons.
    const now = this.clock();
    if (
      !Number.isFinite(time) ||
      time < this.changedAt ||
      now - time > 1800 ||
      time > now + 250 ||
      now - this.lastAction < 900
    )
      return true;
    if (y < CONTROL_TOP + 35 / 810 || y > 1 - 8 / 810) return true;
    const b =
      this.buttons[
        Math.min(this.buttons.length - 1, Math.floor(x * this.buttons.length))
      ];
    if (!b || b.disabled) return true;
    this.lastAction = now;
    if (b.id === "back") this.menu = false;
    else if (b.id === "page-next") this.page++;
    else if (b.id === "page-back") this.page--;
    else if (b.id === "ranges") {
      this.menu = true;
      this.page = 0;
      this.items = [];
      this.status = "Loading saved ranges…";
      this.action("ranges", input);
    } else this.action(b.id, input);
    return true;
  }
  setItems(items, error = "") {
    this.items = items;
    this.page = 0;
    this.status =
      error ||
      (!items.length
        ? "No saved ranges. Save one on the operator."
        : "Select a saved range");
  }
}
