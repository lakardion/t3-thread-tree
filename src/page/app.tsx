import { render } from "preact";
import { effect, signal } from "@preact/signals";
import { allThreads, type Branch, type Status, type ThreadNode, type Tree } from "../shared/tree.ts";

const TOKEN_CMD =
  "~/.t3/bin/t3 auth session issue --scope orchestration:read --label thread-tree --ttl 52w --token-only";
const LABEL: Record<Status, string> = {
  "needs-input": "needs input",
  running: "running",
  completed: "done, your turn",
  cancelled: "cancelled",
  idle: "idle",
  snoozed: "snoozed",
};
const CLOSED_KEY = "thread-tree:closed";
const SETTLED_KEY = "thread-tree:settled";

const load = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const save = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {}
};

const tree = signal<Tree | null>(null);
const settled = signal(load(SETTLED_KEY) === "1");
const closed = signal(new Set<string>(JSON.parse(load(CLOSED_KEY) ?? "[]") as string[]));
const toggle = (id: string) => {
  const n = new Set(closed.value);
  n.has(id) ? n.delete(id) : n.add(id);
  closed.value = n;
  save(CLOSED_KEY, JSON.stringify([...n]));
};

let es: EventSource | undefined;
effect(() => {
  es?.close();
  save(SETTLED_KEY, settled.value ? "1" : "0");
  es = new EventSource(settled.value ? "/events?settled=1" : "/events");
  es.onmessage = (e) => (tree.value = JSON.parse(e.data) as Tree);
});

const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const until = (iso: string) =>
  new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

const Dot = ({ t }: { t: ThreadNode }) => <span class={`dot s-${t.status}`} title={`${LABEL[t.status]} · ${t.raw}`} />;

function ThreadRow({ t }: { t: ThreadNode }) {
  return (
    <li class={t.snoozedUntil ? "snoozed" : ""}>
      <div class="row">
        <Dot t={t} />
        <a class="t title" href={t.href}>
          {t.title || t.id}
        </a>
        <span class="meta">
          {t.snoozedUntil && <span class="badge">⏾ until {until(t.snoozedUntil)}</span>}
          {t.stack && (
            <span class="badge stack" title="PR stack">
              ⧉ {t.stack.pos ? `${t.stack.pos}/${t.stack.total}` : `base · ${t.stack.total}`}
            </span>
          )}
          {t.prs.map((p) => (
            <a key={p.n} class="badge" href={p.url} target="_blank" rel="noreferrer" title={p.state}>
              #{p.n}
              {p.state !== "open" && ` ${p.state}`}
            </a>
          ))}
        </span>
      </div>
      {t.children.length > 0 && (
        <ul>
          {t.children.map((c) => (
            <ThreadRow key={c.id} t={c} />
          ))}
        </ul>
      )}
    </li>
  );
}

function BranchRow({ b, top }: { b: Branch; top?: boolean }) {
  const open = !closed.value.has(b.id);
  return (
    <li>
      <div class="row">
        <button class="tw" aria-expanded={open} onClick={() => toggle(b.id)}>
          {open ? "▾" : "▸"}
        </button>
        <span class={top ? "proj" : "key"}>{b.label}</span>
        {!open && (
          <span class="dots">
            {allThreads(b).map((t) => (
              <Dot key={t.id} t={t} />
            ))}
          </span>
        )}
      </div>
      {open && (
        <ul>
          {b.branches.map((c) => (
            <BranchRow key={c.id} b={c} />
          ))}
          {b.threads.map((t) => (
            <ThreadRow key={t.id} t={t} />
          ))}
        </ul>
      )}
    </li>
  );
}

function App() {
  const t = tree.value;
  return (
    <>
      <header>
        <h1>Thread tree</h1>
        <label>
          <input type="checkbox" checked={settled.value} onChange={(e) => (settled.value = e.currentTarget.checked)} />{" "}
          show settled
        </label>
      </header>
      {t?.conn === "down" && (
        <div class="banner">T3 not running: last update {t.lastUpdate ? hhmm(t.lastUpdate) : "never"}</div>
      )}
      {t?.conn === "unauthorized" && (
        <div class="banner">
          T3 rejected the token. Issue one and put it in <code>.env</code> as <code>T3_TOKEN</code>, then restart:
          <br />
          <code>{TOKEN_CMD}</code>
        </div>
      )}
      <div class={t && t.conn !== "up" ? "stale" : ""}>
        {t && t.projects.length === 0 && <p class="empty">No active threads.</p>}
        <ul>
          {t?.projects.map((p) => (
            <BranchRow key={p.id} b={p} top />
          ))}
        </ul>
      </div>
    </>
  );
}

render(<App />, document.getElementById("root")!);
