// Preview transforms never change camera capture or calibrated coordinates.
export function alignmentView(viewport, image, { onPoint, onZoom }) {
  let scale = 1,
    x = 0,
    y = 0,
    pan = false,
    gesture = false,
    start = null,
    pinch = null;
  const pointers = new Map();
  function render() {
    const r = viewport.getBoundingClientRect();
    x = Math.max(r.width * (1 - scale), Math.min(0, x));
    y = Math.max(r.height * (1 - scale), Math.min(0, y));
    image.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    onZoom(scale);
  }
  function zoom(next, cx, cy) {
    const r = viewport.getBoundingClientRect();
    cx ??= r.width / 2;
    cy ??= r.height / 2;
    next = Math.max(1, Math.min(6, next));
    x = cx - ((cx - x) * next) / scale;
    y = cy - ((cy - y) * next) / scale;
    scale = next;
    render();
  }
  viewport.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      zoom(
        scale * Math.exp(-e.deltaY * 0.002),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    },
    { passive: false },
  );
  viewport.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    viewport.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 1) {
      start = [e.clientX, e.clientY];
      gesture = false;
    }
    if (pointers.size >= 2) {
      gesture = true;
      pinch = null;
    }
  });
  viewport.addEventListener("pointermove", (e) => {
    if (!pointers.has(e.pointerId)) return;
    const old = pointers.get(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()],
        r = viewport.getBoundingClientRect(),
        d = Math.hypot(a[0] - b[0], a[1] - b[1]),
        cx = (a[0] + b[0]) / 2 - r.left,
        cy = (a[1] + b[1]) / 2 - r.top;
      if (pinch) {
        x += cx - pinch.cx;
        y += cy - pinch.cy;
        zoom((scale * d) / Math.max(1, pinch.d), cx, cy);
      }
      pinch = { d, cx, cy };
      return;
    }
    if (start && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 6)
      gesture = true;
    if (pan || gesture) {
      x += e.clientX - old[0];
      y += e.clientY - old[1];
      render();
    }
  });
  function end(e) {
    if (!pointers.has(e.pointerId)) return;
    if (e.type === "pointerup" && pointers.size === 1 && !gesture && !pan) {
      const r = image.getBoundingClientRect(),
        u = (e.clientX - r.left) / r.width,
        v = (e.clientY - r.top) / r.height;
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) onPoint([u, v]);
    }
    pointers.delete(e.pointerId);
    pinch = null;
    if (!pointers.size) start = null;
  }
  viewport.addEventListener("pointerup", end);
  viewport.addEventListener("pointercancel", end);
  new ResizeObserver(render).observe(viewport);
  render();
  return {
    zoom: (factor) => zoom(scale * factor),
    fit: () => {
      scale = 1;
      x = y = 0;
      render();
    },
    setPan: (value) => {
      pan = value;
      viewport.classList.toggle("panning", value);
    },
  };
}
