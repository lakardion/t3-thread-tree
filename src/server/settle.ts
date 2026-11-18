import type { SendError } from "../shared/send.ts";

const fail = (status: number, error: string) =>
  Response.json({ error, exitCode: null, stderrTail: "" } satisfies SendError, { status });

const SCOPE_HINT = "The T3 token cannot settle. Issue a new token with the command in Settings.";

/** The settle route. `dispatch` sends a T3 command and rejects with the failure text. */
export function settleRoutes(o: {
  dispatch: (command: Record<string, unknown>) => Promise<void>;
  hasThread: (id: string) => boolean;
}) {
  return {
    "/t3/settle": {
      /** JSON only: the click has no confirm, so a cross-site form post must not settle. */
      POST: async (req: Request) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const body = (await req.json().catch(() => null)) as { threadId?: unknown; settled?: unknown } | null;
        if (typeof body?.threadId !== "string" || typeof body.settled !== "boolean") return fail(400, "Invalid body");
        if (!o.hasThread(body.threadId)) return fail(404, "Unknown thread");
        try {
          await o.dispatch(
            body.settled
              ? { type: "thread.settle", threadId: body.threadId }
              : { type: "thread.unsettle", threadId: body.threadId, reason: "user" },
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return fail(502, /orchestration:operate|authoriz|forbidden/i.test(msg) ? SCOPE_HINT : msg);
        }
        return new Response(null, { status: 204 });
      },
    },
  };
}
