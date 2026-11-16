import { createServer } from "node:net";

/** The first port from `start` up that a server can listen on at 127.0.0.1. */
export async function pickPort(start = 4773): Promise<number> {
  for (let port = start; ; port++) {
    const free = await new Promise<boolean>((resolve) => {
      const probe = createServer();
      probe.once("error", () => resolve(false));
      probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
    });
    if (free) return port;
  }
}

/** The value of the `PATH=` line in `env` output. */
export function shellPath(envOutput: string): string | null {
  const line = envOutput.split("\n").find((l) => l.startsWith("PATH="));
  return line ? line.slice(5) : null;
}

export function fallbackPath(path: string | undefined, home: string): string {
  return [path, "/opt/homebrew/bin", `${home}/.local/bin`, `${home}/.bun/bin`].filter(Boolean).join(":");
}

export const restartDelay = (attempt: number) => Math.min(500 * 2 ** attempt, 10_000);

/** A child that ran this long resets the restart attempt count. */
export const RESET_AFTER_MS = 60_000;
