export class InvalidServerPathError extends Error {
  constructor() {
    super("Invalid server file path");
    this.name = "InvalidServerPathError";
  }
}

/**
 * Pterodactyl Client API file paths are rooted at the server directory.
 * Accept absolute or relative user paths, but never allow traversal segments,
 * Windows separators, NULs, or control characters.
 */
export function normalizeServerPath(value: string, options: { allowRoot?: boolean } = {}): string {
  if (typeof value !== "string" || value.length > 1000 || value.includes("\\") ||
      /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidServerPathError();
  }

  const segments = value.split("/").filter(Boolean);
  if (segments.some(segment => segment === "." || segment === "..")) {
    throw new InvalidServerPathError();
  }

  if (segments.length === 0) {
    if (options.allowRoot) return "/";
    throw new InvalidServerPathError();
  }

  return "/" + segments.join("/");
}
