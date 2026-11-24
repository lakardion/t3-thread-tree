/** The marked map threads: a JSON array of thread ids in a local file, and the route that edits it. */
import { readFileSync } from "node:fs";

import * as v from "valibot";

import { writeToken } from "./token.ts";

const IdsSchema = v.array(v.string());
const BodySchema = v.object({ id: v.pipe(v.string(), v.minLength(1)), marked: v.boolean() });

/** The marked thread ids. A missing or invalid file gives an empty set. */
export function readMapThreads(file: string): Set<string> {
  try {
    const r = v.safeParse(IdsSchema, JSON.parse(readFileSync(file, "utf8")));
    return new Set(r.success ? r.output : []);
  } catch {
    return new Set();
  }
}

/** `POST /map-threads` with `{ id, marked }` adds or removes an id, saves, calls `onSave` and answers the ids. JSON only, like `/model-pick`. */
export function mapThreadRoutes(file: string, onSave: () => void) {
  return {
    "/map-threads": {
      POST: async (req: Request) => {
        if (!req.headers.get("content-type")?.startsWith("application/json"))
          return new Response(null, { status: 415 });
        const r = v.safeParse(BodySchema, await req.json().catch(() => null));
        if (!r.success) return new Response("Not a valid map thread", { status: 400 });
        const ids = readMapThreads(file);
        if (r.output.marked) ids.add(r.output.id);
        else ids.delete(r.output.id);
        writeToken(file, JSON.stringify([...ids]));
        onSave();
        return Response.json([...ids]);
      },
    },
  };
}
