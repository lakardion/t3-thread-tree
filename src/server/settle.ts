import type { SendError } from "../shared/send.ts";

export const fail = (status: number, error: string) =>
  Response.json({ error, exitCode: null, stderrTail: "" } satisfies SendError, { status });

/** The 502 for a failed dispatch. A scope failure names the fix: `verb` is what the token cannot do. */
export const dispatchFail = (e: unknown, verb: string) => {
  const msg = e instanceof Error ? e.message : String(e);
  return fail(
    502,
    /orchestration:operate|authoriz|forbidden/i.test(msg)
      ? `The T3 token cannot ${verb}. Issue a new token with the command in Settings.`
      : msg,
  );
};

/** The settle and snooze routes. `dispatch` sends a T3 command and rejects with the failure text. */
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
          return dispatchFail(e, "settle");
        }
        return new Response(null, { status: 204 });
      },
    },
    "/t3/snooze": {
      /** JSON only, like settle. */
      POST: async (req: Request) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const body = (await req.json().catch(() => null)) as { threadId?: unknown; snoozedUntil?: unknown } | null;
        if (
          typeof body?.threadId !== "string" ||
          typeof body.snoozedUntil !== "string" ||
          Number.isNaN(Date.parse(body.snoozedUntil))
        )
          return fail(400, "Invalid body");
        if (!o.hasThread(body.threadId)) return fail(404, "Unknown thread");
        try {
          await o.dispatch({ type: "thread.snooze", threadId: body.threadId, snoozedUntil: body.snoozedUntil });
        } catch (e) {
          return dispatchFail(e, "snooze");
        }
        return new Response(null, { status: 204 });
      },
    },
  };
}
