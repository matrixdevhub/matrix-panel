export function normalizeConsoleCommandMessage(raw: string): string | null {
  if (raw.length > 10_000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const message = parsed as { event?: unknown; args?: unknown };
  if (message.event !== "send command" || !Array.isArray(message.args) || message.args.length !== 1) return null;
  const command = message.args[0];
  if (typeof command !== "string" || command.trim().length === 0 || command.length > 5000 || /[\r\n\u0000]/.test(command)) return null;
  return JSON.stringify({ event: "send command", args: [command] });
}
