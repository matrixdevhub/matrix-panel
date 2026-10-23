import { config, pterodactylConfigured } from "./config.js";

export class PterodactylError extends Error {
  constructor(message: string, public statusCode = 502) {
    super(message);
    this.name = "PterodactylError";
  }
}

function baseUrl() {
  if (!config.PTERODACTYL_URL) throw new PterodactylError("PTERODACTYL_URL is not configured", 503);
  return config.PTERODACTYL_URL.replace(/\/+$/, "");
}

export async function applicationRequest<T>(path: string): Promise<T> {
  if (!pterodactylConfigured || !config.PTERODACTYL_APPLICATION_KEY) {
    throw new PterodactylError("Pterodactyl connection is not configured. Set PTERODACTYL_URL and PTERODACTYL_APPLICATION_KEY on the API server.", 503);
  }

  const response = await fetch(`${baseUrl()}/api/application${path}`, {
    headers: {
      Authorization: `Bearer ${config.PTERODACTYL_APPLICATION_KEY}`,
      Accept: "Application/vnd.pterodactyl.v1+json",
      "Content-Type": "application/json"
    },
    signal: AbortSignal.timeout(10_000)
  });

  if (!response.ok) {
    const safeMessage = response.status === 401 || response.status === 403
      ? "Pterodactyl rejected the Application API key or its permissions."
      : response.status === 404
        ? "The requested Pterodactyl API endpoint was not found. Check the panel URL."
        : `Pterodactyl API request failed (HTTP ${response.status}).`;
    throw new PterodactylError(safeMessage, response.status === 401 ? 502 : response.status);
  }
  return response.json() as Promise<T>;
}

export async function getServers() {
  const result = await applicationRequest<{
    data: Array<{ attributes: {
      id: number; uuid: string; identifier: string; name: string; description?: string;
      status?: string; node: number; user: number; is_installing?: boolean; is_suspended?: boolean;
      limits?: { memory: number; disk: number; cpu: number };
    } }>;
    meta?: { pagination?: { total: number; count: number; current_page: number; total_pages: number } };
  }>("/servers?per_page=50");

  return {
    data: result.data.map(({ attributes: s }) => ({
      id: s.id, uuid: s.uuid, identifier: s.identifier, name: s.name,
      description: s.description ?? "", node: s.node, ownerId: s.user,
      status: s.is_suspended ? "suspended" : s.is_installing ? "installing" : (s.status ?? "unknown"),
      limits: s.limits ?? { memory: 0, disk: 0, cpu: 0 }
    })),
    pagination: result.meta?.pagination ?? null
  };
}

export async function getPanelSummary() {
  const [servers, nodes, locations] = await Promise.all([
    applicationRequest<{ meta?: { pagination?: { total: number } } }>("/servers?per_page=1"),
    applicationRequest<{ meta?: { pagination?: { total: number } } }>("/nodes?per_page=1"),
    applicationRequest<{ meta?: { pagination?: { total: number } } }>("/locations?per_page=1")
  ]);
  return {
    servers: servers.meta?.pagination?.total ?? 0,
    nodes: nodes.meta?.pagination?.total ?? 0,
    locations: locations.meta?.pagination?.total ?? 0
  };
}
