/** The Linear GraphQL calls for issue project and milestone. No state: the `fetch` is injected. */
import type { LinearIssue } from "../shared/tree.ts";

const ENDPOINT = "https://api.linear.app/graphql";
const PAGE = 250;
const DEFAULT_RETRY_MS = 60_000;
const FIELDS = "project { id name url } projectMilestone { id name targetDate }";
const BATCH = `query Issues($keys: [ID!]!) { issues(filter: { id: { in: $keys } }, first: ${PAGE}, includeArchived: true) { nodes { identifier previousIdentifiers ${FIELDS} } } }`;
const SINGLE = `query Issue($key: String!) { issue(id: $key) { identifier ${FIELDS} } }`;

type Fetch = (url: string, init: RequestInit) => Promise<Response>;
type IssueNode = { project?: LinearIssue["project"]; projectMilestone?: LinearIssue["milestone"] } | null;
type Body = {
  data?: {
    issues?: { nodes: (IssueNode & { identifier: string; previousIdentifiers: string[] | null })[] };
    issue?: IssueNode;
  } | null;
  errors?: { extensions?: { code?: string } }[];
} | null;

export type LinearResult =
  | { status: "ok"; data: Map<string, LinearIssue> }
  | { status: "rejected" }
  | { status: "limited"; ms: number }
  | { status: "failed" };

type Reply = { status: "body"; body: Body } | { status: "missing" } | Exclude<LinearResult, { status: "ok" }>;

const issueOf = (n: IssueNode): LinearIssue => ({
  project: n?.project ?? null,
  milestone: n?.projectMilestone ?? null,
});

async function post(apiKey: string, query: string, variables: object, fetch: Fetch): Promise<Reply> {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: apiKey },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await res.json().catch(() => null)) as Body;
    const code = body?.errors?.[0]?.extensions?.code;
    if (res.status === 401 || code === "AUTHENTICATION_ERROR") return { status: "rejected" };
    if (res.status === 429 || code === "RATELIMITED") {
      const s = Number(res.headers.get("Retry-After"));
      return { status: "limited", ms: s > 0 ? s * 1000 : DEFAULT_RETRY_MS };
    }
    /** `INPUT_ERROR` is what Linear answers for an unknown issue key; a batch with a malformed key gets `INVALID_INPUT`. */
    if (code === "INPUT_ERROR" || code === "INVALID_INPUT") return { status: "missing" };
    if (!res.ok || body?.errors || !body?.data) return { status: "failed" };
    return { status: "body", body };
  } catch {
    return { status: "failed" };
  }
}

/** A number with a leading zero makes Linear refuse a whole batch, so such a key goes to an issue call. */
const batchable = (k: string) => !/-0\d/.test(k);

/** The project and milestone of each of `keys`; a key Linear does not know maps to no project. */
export async function fetchLinear(
  apiKey: string,
  keys: string[],
  fetch: Fetch = globalThis.fetch,
): Promise<LinearResult> {
  const data = new Map<string, LinearIssue>();
  const batched = keys.filter(batchable);
  for (let i = 0; i < batched.length; i += PAGE) {
    const page = batched.slice(i, i + PAGE);
    const reply = await post(apiKey, BATCH, { keys: page }, fetch);
    if (reply.status === "missing") continue;
    if (reply.status !== "body") return reply;
    const wanted = new Set(page);
    for (const n of reply.body?.data?.issues?.nodes ?? [])
      for (const id of [n.identifier, ...(n.previousIdentifiers ?? [])]) if (wanted.has(id)) data.set(id, issueOf(n));
  }
  for (const k of keys) {
    if (data.has(k)) continue;
    const reply = await post(apiKey, SINGLE, { key: k }, fetch);
    if (reply.status === "missing") data.set(k, issueOf(null));
    else if (reply.status === "body") data.set(k, issueOf(reply.body?.data?.issue ?? null));
    else return reply;
  }
  return { status: "ok", data };
}
