import { dispatchFail, fail } from "./settle.ts";

type Body = Record<string, unknown>;

const filled = (v: unknown): v is string => typeof v === "string" && v !== "";

/**
 * The answer, resume and cancel routes. `call` sends one workflow call and rejects with the failure text.
 * A cancel that times out answers 202: T3 may still finish it, and the next snapshot settles it.
 */
export function workflowRoutes(o: { call: (tag: string, payload: unknown) => Promise<unknown> }) {
  /** JSON only, like settle. `payload` returns the call payload, or null for a bad body. */
  const route = (tag: string, verb: string, payload: (b: Body) => unknown, slow = false) => ({
    POST: async (req: Request) => {
      if (!req.headers.get("content-type")?.startsWith("application/json")) return new Response(null, { status: 415 });
      const body = (await req.json().catch(() => null)) as Body | null;
      const p = body && payload(body);
      if (!p) return fail(400, "Invalid body");
      try {
        await o.call(tag, p);
      } catch (e) {
        if (slow && e instanceof Error && e.message === "timed out") return new Response(null, { status: 202 });
        return dispatchFail(e, verb);
      }
      return new Response(null, { status: 204 });
    },
  });
  return {
    "/t3/workflows/answer": route("workflows.answer", "answer", (b) => {
      if (!filled(b.runId) || !filled(b.name) || !filled(b.choice)) return null;
      const reason = typeof b.reason === "string" ? b.reason.trim() : "";
      return { runId: b.runId, name: b.name, choice: b.choice, ...(reason && { reason }) };
    }),
    "/t3/workflows/resume": route("workflows.resume", "resume", (b) => filled(b.runId) && { runId: b.runId }),
    "/t3/workflows/cancel": route("workflows.cancel", "cancel", (b) => filled(b.runId) && { runId: b.runId }, true),
  };
}
