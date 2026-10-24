export function validateConsoleWebSocketUrl(value: string, nodeEnv: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Invalid upstream console URL");
  }

  const secureSocket = url.protocol === "wss:";
  const developmentSocket = nodeEnv !== "production" && url.protocol === "ws:";
  if ((!secureSocket && !developmentSocket) || url.username || url.password) {
    throw new Error("Invalid upstream console URL");
  }

  return url;
}
