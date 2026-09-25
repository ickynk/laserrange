// Same-origin, opener-bound MessagePort. No camera/admin secrets leave the operator.
export class ProjectionLink {
  constructor(onMessage, onLost) {
    this.onMessage = onMessage;
    this.onLost = onLost;
    this.connected = false;
    this.opening = false;
    this.ready = false;
    window.addEventListener("message", (e) => {
      if (
        e.origin !== location.origin ||
        e.source !== this.window ||
        e.data?.type !== "projector-hello" ||
        e.data.nonce !== this.nonce ||
        this.connected
      )
        return;
      const channel = new MessageChannel();
      this.port = channel.port1;
      this.port.onmessage = (event) => {
        this.lastSeen = Date.now();
        if (this.stalled) {
          this.stalled = false;
          this.onMessage({ type: "recovered" });
        }
        if (event.data.type === "heartbeat") return;
        this.onMessage(event.data);
      };
      this.port.start();
      this.connected = true;
      this.opening = false;
      this.lastSeen = Date.now();
      this.window.postMessage(
        { type: "projector-port", nonce: this.nonce },
        location.origin,
        [channel.port2],
      );
      this.onMessage({ type: "connected" });
    });
    this.timer = setInterval(() => {
      if (!this.window) return;
      if (
        this.window.closed ||
        (this.opening && Date.now() - this.openedAt > 15000)
      )
        this.disconnect(
          "Projector closed or stopped responding. Reopen it and recalibrate before a live session.",
        );
      else {
        if (
          this.connected &&
          Date.now() - this.lastSeen > 10000 &&
          !this.stalled
        ) {
          this.stalled = true;
          this.onMessage({ type: "stalled" });
        }
        this.send({ type: "heartbeat" });
      }
    }, 500);
    window.addEventListener("pagehide", () => {
      this.send({ type: "operator-offline" });
      this.port?.close();
    });
  }
  open() {
    if (this.window && !this.window.closed) {
      this.window.focus();
      return true;
    }
    this.nonce = crypto.randomUUID();
    this.window = window.open(
      `/projector.html#${this.nonce}`,
      "_blank",
      "popup,width=1280,height=720",
    );
    if (!this.window) return false;
    this.opening = true;
    this.ready = false;
    this.openedAt = Date.now();
    return true;
  }
  send(message) {
    if (this.connected) this.port.postMessage(message);
  }
  disconnect(reason) {
    const active = this.connected || this.opening;
    this.send({ type: "operator-offline" });
    this.port?.close();
    this.port = null;
    this.window?.close();
    this.window = null;
    this.connected = false;
    this.opening = false;
    this.ready = false;
    if (active) this.onLost(reason);
  }
}
export function joinOperator(onMessage, onLost) {
  const nonce = location.hash.slice(1);
  let port,
    lastSeen = Date.now(),
    closed = false;
  history.replaceState(null, "", location.pathname);
  const send = (m) => port?.postMessage(m);
  const lose = () => {
    if (closed) return;
    closed = true;
    onLost();
    port?.close();
  };
  window.addEventListener("message", function accept(e) {
    if (
      port ||
      e.origin !== location.origin ||
      e.source !== window.opener ||
      e.data?.type !== "projector-port" ||
      e.data.nonce !== nonce ||
      !e.ports[0]
    )
      return;
    port = e.ports[0];
    window.removeEventListener("message", accept);
    port.onmessage = (event) => {
      lastSeen = Date.now();
      if (event.data.type === "operator-offline") return lose();
      if (event.data.type !== "heartbeat") onMessage(event.data);
    };
    port.start();
  });
  if (!window.opener || !nonce) {
    onLost();
    return send;
  }
  window.opener.postMessage(
    { type: "projector-hello", nonce },
    location.origin,
  );
  const timer = setInterval(() => {
    if (closed) {
      clearInterval(timer);
      return;
    }
    if (window.opener?.closed) return lose();
    // Timer throttling is not evidence that the opener disappeared. Keep the
    // port so messages resume naturally; pause scoring while it is unresponsive.
    if (Date.now() - lastSeen > 10000) onMessage({ type: "stop" });
    send({ type: "heartbeat" });
  }, 500);
  window.addEventListener("pagehide", () =>
    send({ type: "projector-offline" }),
  );
  return send;
}
