export type ClientServerRecord = {
  id?: number | string;
  identifier: string;
  uuid: string;
  name: string;
  description?: string | null;
  node?: string | number | null;
  is_suspended?: boolean;
  is_installing?: boolean;
  current_state?: string | null;
  status?: string | null;
  limits?: {
    memory?: number | null;
    disk?: number | null;
    cpu?: number | null;
  } | null;
};

export type PanelServer = {
  id: string;
  uuid: string;
  identifier: string;
  name: string;
  description: string;
  node: string | number;
  ownerId: string;
  status: string;
  limits: { memory: number; disk: number; cpu: number };
};

export function normalizeClientServer(
  server: ClientServerRecord,
  ownerId: string,
  liveState?: string | null
): PanelServer {
  const status = server.is_suspended
    ? "suspended"
    : server.is_installing
      ? "installing"
      : liveState ?? server.current_state ?? server.status ?? "unknown";

  return {
    id: server.identifier,
    uuid: server.uuid,
    identifier: server.identifier,
    name: server.name,
    description: server.description ?? "",
    node: server.node ?? "—",
    ownerId,
    status,
    limits: {
      memory: server.limits?.memory ?? 0,
      disk: server.limits?.disk ?? 0,
      cpu: server.limits?.cpu ?? 0
    }
  };
}

export function normalizePowerSignal(value: unknown): "start" | "stop" | "restart" | null {
  return value === "start" || value === "stop" || value === "restart" ? value : null;
}
