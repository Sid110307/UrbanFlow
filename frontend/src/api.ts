import type { Drain, DrainDetail, Incident, LiveEvent } from "./types";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  listDrains: () => fetch("/api/drains").then((r) => json<Drain[]>(r)),
  getDrain: (id: string) => fetch(`/api/drains/${id}`).then((r) => json<DrainDetail>(r)),
  listIncidents: (limit = 50, drainId?: string) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (drainId) params.set("drain_id", drainId);
    return fetch(`/api/incidents?${params}`).then((r) => json<Incident[]>(r));
  },
  injectRain: (drain_id: string, precip_rate_mm_hr = 45) =>
    fetch("/api/control/rain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drain_id, precip_rate_mm_hr }),
    }).then((r) => json(r)),
  injectBlockage: (drain_id: string, debris_class = "construction_debris") =>
    fetch("/api/control/blockage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drain_id, debris_class }),
    }).then((r) => json(r)),
  clearDrain: (drain_id: string) =>
    fetch(`/api/control/clear/${drain_id}`, { method: "POST" }).then((r) => json(r)),
};

export function connectLiveFeed(onEvent: (event: LiveEvent) => void): () => void {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  let socket: WebSocket | null = null;
  let closedByUser = false;

  function connect() {
    socket = new WebSocket(`${proto}://${location.host}/ws`);
    socket.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data) as LiveEvent);
      } catch {
        // ignore malformed frame
      }
    };
    socket.onclose = () => {
      if (!closedByUser) setTimeout(connect, 2000);
    };
  }
  connect();

  return () => {
    closedByUser = true;
    socket?.close();
  };
}
