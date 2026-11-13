/** Launched-thread lineage from `statev2.sqlite`, opened read-only. All SQLite code lives here. */
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { USERDATA } from "./t3.ts";

const CALLS = `
  SELECT thread_id AS caller, json_extract(payload_json, '$.output.content') AS result
  FROM orchestration_v2_projection_turn_items
  WHERE type = 'dynamic_tool' AND status = 'completed'
    AND (json_extract(payload_json, '$.toolName') LIKE '%t3_thread_launch'
      OR json_extract(payload_json, '$.toolName') LIKE '%create_threads'
      OR json_extract(payload_json, '$.toolName') LIKE '%delegate_task')`;

const SENDER = `
  SELECT json_extract(payload_json, '$.senderThreadId') AS sender
  FROM orchestration_v2_projection_messages
  WHERE thread_id = ?1 AND message_id = ?1`;

/** Child thread ids named in one launch tool result. Some providers wrap the JSON in `[{ text }]`. */
export function launchedIds(result: unknown): string[] {
  let o: unknown;
  try {
    o = typeof result === "string" ? JSON.parse(result) : result;
    if (Array.isArray(o)) o = JSON.parse((o[0] as { text: string }).text);
  } catch {
    return [];
  }
  const r = (o ?? {}) as { threadId?: unknown; childThreadId?: unknown; threads?: { threadId?: unknown }[] };
  const ids = [r.threadId, r.childThreadId, ...(Array.isArray(r.threads) ? r.threads.map((t) => t?.threadId) : [])];
  return ids.filter((i): i is string => typeof i === "string");
}

/** Launched-thread ids look like `mcp:…`, `thread:mcp:…` or `thread:delegated-task:command%3Amcp%3A…`. */
export const mayBeLaunched = (id: string) => /mcp(:|%3A)/i.test(id);

const LAST_MESSAGES = `
  SELECT ids.value AS id,
    (SELECT json_extract(m.payload_json, '$.text')
     FROM orchestration_v2_projection_messages m
     WHERE m.thread_id = ids.value AND m.role = 'assistant' AND m.streaming = 0
     ORDER BY m.created_at DESC, m.message_id DESC
     LIMIT 1) AS text
  FROM json_each(?1) AS ids`;

export function openLineage(path = join(USERDATA, "statev2.sqlite")) {
  const db = new Database(path, { readonly: true });
  const calls = db.query<{ caller: string; result: string | null }, []>(CALLS);
  const sender = db.query<{ sender: string | null }, [string]>(SENDER);
  const last = db.query<{ id: string; text: string | null }, [string]>(LAST_MESSAGES);
  let callers = new Map<string, string>();

  return {
    /** The newest complete assistant text per thread; `null` when it has none. */
    lastMessages(ids: string[]): Map<string, string | null> {
      return new Map(last.all(JSON.stringify(ids)).map((r) => [r.id, r.text]));
    },
    /** Re-reads every launch tool call. One full scan, so call it only for an unknown launched thread. */
    reload() {
      const next = new Map<string, string>();
      for (const row of calls.all())
        for (const child of launchedIds(row.result)) if (!next.has(child)) next.set(child, row.caller);
      callers = next;
    },
    /** Carry the scan result across a Worker boundary. */
    entries: () => [...callers],
    seed(e: [string, string][]) {
      callers = new Map(e);
    },
    /** Tool-call caller first, then the sender of the thread's initial message. */
    spawner(id: string): string | null {
      return callers.get(id) ?? sender.get(id)?.sender ?? null;
    },
  };
}
