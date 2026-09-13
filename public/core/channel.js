export class Channel extends EventTarget {
  constructor(credentials) {
    super();
    this.offset = 0;
    this.bestRTT = Infinity;
    this.ws = new WebSocket(
      `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`,
    );
    this.ws.onopen = () => {
      this.send({ type: "join", ...credentials });
    };
    this.ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.type === "pong") {
        const rtt = Date.now() - m.clientTime;
        if (rtt < this.bestRTT) {
          this.bestRTT = rtt;
          this.offset = m.serverTime - (m.clientTime + Date.now()) / 2;
        }
      }
      if (m.type === "joined") {
        this.offset = m.serverTime - Date.now();
        this.ping();
        this.timer = setInterval(() => this.ping(), 3000);
      }
      this.dispatchEvent(new CustomEvent(m.type, { detail: m }));
    };
    this.ws.onclose = (e) => {
      clearInterval(this.timer);
      this.dispatchEvent(
        new CustomEvent("closed", { detail: e.reason || "Connection closed" }),
      );
    };
    this.ws.onerror = () =>
      this.dispatchEvent(
        new CustomEvent("fault", {
          detail:
            "Connection failed. Check the host address and HTTPS certificate.",
        }),
      );
  }
  on(type, fn) {
    this.addEventListener(type, (e) => fn(e.detail));
    return this;
  }
  send(m) {
    if (
      this.ws.readyState === WebSocket.OPEN &&
      this.ws.bufferedAmount < 1_000_000
    )
      this.ws.send(JSON.stringify(m));
  }
  ping() {
    this.send({ type: "ping", clientTime: Date.now() });
  }
  now() {
    return Date.now() + this.offset;
  }
}
