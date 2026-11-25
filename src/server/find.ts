import { find, hits } from "../shared/find.ts";
import type { Group } from "../shared/tree.ts";

/** `GET /find?q=`: the settled threads that match `q`. A missing or blank `q` gives an empty list. */
export function findRoutes(settledTree: () => Group[]) {
  return {
    "/find": {
      GET: (req: Request) => {
        const q = new URL(req.url).searchParams.get("q") ?? "";
        const found = find(
          hits(settledTree()).filter((h) => h.t.settled),
          q,
        );
        return Response.json(found.map((h) => ({ ...h, t: { ...h.t, children: [] } })));
      },
    },
  };
}
