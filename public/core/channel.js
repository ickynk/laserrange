export class Channel extends EventTarget {
  constructor(credentials) {
    super();
    this.credentials = { ...credentials, clientId: crypto.randomUUID() };
    this.offset = 0;
    this.bestRTT = Infinity;
    this.attempt = 0;
    this.connect();
  }
  emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  connect() {
    if (this.stopped) return;
    const ws = (this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
    ));
    this.lastSeen = Date.now();
    const deadline = setTimeout(
      () => ws.close(4000, "Connection timeout"),
      15000,
    );
    ws.onopen = () =>
      ws.send(JSON.stringify({ type: "join", ...this.credentials }));
    ws.onmessage = (e) => {
      if (ws !== this.ws) return;
      const m = JSON.parse(e.data);
      this.lastSeen = Date.now();
      if (m.type === "pong") {
        const rtt = Date.now() - m.clientTime;
        if (rtt < this.bestRTT) {
          this.bestRTT = rtt;
          this.offset = m.serverTime - (m.clientTime + Date.now()) / 2;
        }
      }
      if (m.type === "joined") {
        clearTimeout(deadline);
        m.reconnected = !!this.joined;
        this.joined = true;
        this.attempt = 0;
        this.bestRTT = Infinity;
        this.offset = m.serverTime - Date.now();
        clearInterval(this.timer);
        this.ping();
        this.timer = setInterval(() => {
          if (Date.now() - this.lastSeen > 30000)
            ws.close(4000, "Connection stalled");
          else this.ping();
        }, 3000);
      }
      this.emit(m.type, m);
    };
    ws.onclose = (e) => {
      clearTimeout(deadline);
      if (ws !== this.ws || this.stopped) return;
      clearInterval(this.timer);
      if ([1008, 1009, 4001].includes(e.code)) {
        this.stopped = true;
        return this.emit("closed", e.reason || "Connection rejected");
      }
      this.emit(
        "reconnecting",
        e.reason || "Network interrupted; reconnecting automatically",
      );
      const delay = Math.min(5000, 500 * 2 ** Math.min(this.attempt++, 4));
      this.retry = setTimeout(
        () => this.connect(),
        delay + Math.random() * 200,
      );
    };
    ws.onerror = () => {}; // onclose drives the single retry path.
  }
  close() {
    this.stopped = true;
    clearTimeout(this.retry);
    clearInterval(this.timer);
    this.ws.close();
  }
  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }
  send(m) {
    // Drop stale preview frames before they can block control/shot traffic.
    const limit = ["reference", "telemetry"].includes(m.type)
      ? 150_000
      : 1_000_000;
    if (this.ws.readyState === WebSocket.OPEN && this.ws.bufferedAmount < limit)
      this.ws.send(JSON.stringify(m));
  }
  ping() {
    this.send({ type: "ping", clientTime: Date.now() });
  }
  now() {
    return Date.now() + this.offset;
  }
}
