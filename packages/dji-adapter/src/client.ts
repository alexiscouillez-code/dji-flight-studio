import { PROTOCOL, parseIncoming, type Hello, type MissionStatus, type Outgoing, type TelemetryMsg } from "./protocol";

export interface Transport {
  send(data: string): void;
  close(): void;
  onMessage(cb: (data: string) => void): void;
  onClose(cb: (reason: string) => void): void;
}

export type BridgeState = "disconnected" | "connecting" | "connected" | "error";

export interface BridgeEvents {
  state(s: BridgeState, detail?: string): void;
  hello(h: Hello): void;
  telemetry(t: TelemetryMsg): void;
  missionStatus(m: MissionStatus): void;
  invalid(error: string): void;
  bridgeError(code: string, message: string): void;
}

/** Transport-agnostic client: handshake with timeout, strict validation, nothing assumed. */
export class BridgeClient {
  state: BridgeState = "disconnected";
  hello: Hello | null = null;
  lastTelemetry: TelemetryMsg | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private transport: Transport, private on: Partial<BridgeEvents> = {}, private handshakeMs = 5000) {
    this.set("connecting");
    transport.onMessage((d) => this.receive(d));
    transport.onClose((r) => { this.clear(); this.hello = null; this.set(this.state === "error" ? "error" : "disconnected", r); });
    this.timer = setTimeout(() => { if (!this.hello) { this.set("error", "Pas de réponse du pont (handshake)."); transport.close(); } }, handshakeMs);
  }

  private set(s: BridgeState, detail?: string) { this.state = s; this.on.state?.(s, detail); }
  private clear() { if (this.timer) clearTimeout(this.timer); this.timer = null; }

  private receive(data: string) {
    const r = parseIncoming(data);
    if (!r.ok) { this.on.invalid?.(r.error); return; }
    const m = r.msg;
    if (m.type === "hello") {
      this.clear();
      this.hello = m;
      this.send({ type: "hello-ack", protocol: PROTOCOL, app: "DJI FLIGHT STUDIO" });
      this.set("connected");
      this.on.hello?.(m);
      return;
    }
    if (!this.hello) { this.on.invalid?.("Message reçu avant le handshake."); return; }
    if (m.type === "telemetry") { this.lastTelemetry = m; this.on.telemetry?.(m); }
    else if (m.type === "mission-status") this.on.missionStatus?.(m);
    else if (m.type === "error") this.on.bridgeError?.(m.code, m.message);
  }

  send(msg: Outgoing) {
    if (msg.type !== "hello-ack" && this.state !== "connected") throw new Error("Pont non connecté.");
    this.transport.send(JSON.stringify(msg));
  }

  close() { this.clear(); this.transport.close(); }
}

/** Browser WebSocket transport. Only ws://localhost / 127.0.0.1 or wss:// are accepted. */
export function webSocketTransport(url: string): Transport {
  const u = new URL(url);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  if (!(u.protocol === "wss:" || (u.protocol === "ws:" && local))) throw new Error("Adresse refusée : utilisez wss:// ou ws://localhost.");
  const ws = new WebSocket(url);
  const pending: string[] = [];
  ws.addEventListener("open", () => { pending.splice(0).forEach((m) => ws.send(m)); });
  let closeCb: (r: string) => void = () => {};
  ws.addEventListener("close", (e) => closeCb(e.reason || "Connexion fermée."));
  ws.addEventListener("error", () => closeCb("Impossible de joindre le pont."));
  return {
    send: (d) => (ws.readyState === WebSocket.OPEN ? ws.send(d) : pending.push(d)),
    close: () => ws.close(),
    onMessage: (cb) => ws.addEventListener("message", (e) => cb(String(e.data))),
    onClose: (cb) => { closeCb = cb; },
  };
}
