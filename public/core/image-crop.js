export function openTargetCrop(file, aspect, onApply, onError) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 12000000)
    return onError("Choose a JPEG, PNG or WebP image under 12 MB.");
  const dialog = document.getElementById("cropDialog"),
    canvas = document.getElementById("cropCanvas"),
    ctx = canvas.getContext("2d"),
    zoom = document.getElementById("cropZoom");
  const img = new Image(),
    url = URL.createObjectURL(file);
  let scale = 1,
    x = 0,
    y = 0,
    drag = null;
  const draw = () => {
    const w = img.width * scale,
      h = img.height * scale;
    x = Math.max(canvas.width - w, Math.min(0, x));
    y = Math.max(canvas.height - h, Math.min(0, y));
    ctx.fillStyle = "#ad9270";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, x, y, w, h);
  };
  img.onload = () => {
    URL.revokeObjectURL(url);
    if (img.width * img.height > 40000000)
      return onError("Image is too large; resize below 40 megapixels.");
    canvas.width = Math.round(768 * Math.min(1, aspect));
    canvas.height = Math.round(768 / Math.max(1, aspect));
    const base = Math.max(canvas.width / img.width, canvas.height / img.height);
    scale = base;
    x = (canvas.width - img.width * scale) / 2;
    y = (canvas.height - img.height * scale) / 2;
    zoom.value = 1;
    draw();
    dialog.showModal();
    zoom.oninput = () => {
      const old = scale;
      scale = base * Number(zoom.value);
      x = canvas.width / 2 - ((canvas.width / 2 - x) * scale) / old;
      y = canvas.height / 2 - ((canvas.height / 2 - y) * scale) / old;
      draw();
    };
    canvas.onpointerdown = (e) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    canvas.onpointermove = (e) => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      x += ((e.clientX - drag.x) * canvas.width) / r.width;
      y += ((e.clientY - drag.y) * canvas.height) / r.height;
      drag = { x: e.clientX, y: e.clientY };
      draw();
    };
    canvas.onpointerup = canvas.onpointercancel = () => (drag = null);
    document.getElementById("applyCrop").onclick = () => {
      let result = canvas.toDataURL("image/jpeg", 0.88);
      if (result.length > 400000) result = canvas.toDataURL("image/jpeg", 0.65);
      if (result.length > 400000)
        return onError("Image is too detailed; use a smaller source.");
      onApply(result);
      dialog.close();
    };
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    onError("The image could not be decoded.");
  };
  img.src = url;
  document.getElementById("cancelCrop").onclick = () => dialog.close();
}
