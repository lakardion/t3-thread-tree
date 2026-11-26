/** Lanes and stacks of a wayfinder `map.md`. Pure, so `bun test` covers it. */

export type MapLane = { n: number; label: string; keys: { key: string; base: string }[]; explicit: boolean };

/** The lines after the `## <name>` line, up to the next `## ` line. Null when the section is absent. */
function section(lines: string[], name: string): string[] | null {
  const start = lines.findIndex((l) => l.trim() === `## ${name}`);
  if (start < 0) return null;
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return end < 0 ? rest : rest.slice(0, end);
}

/** The key of a numbered route line: a Linear key, else the ticket link as `<folder>-<NN>`. Null when neither. */
function keyOf(item: string, folder: string): string | null {
  const linear = item.match(/^[A-Z]+-\d+/)?.[0];
  if (linear) return linear;
  const nn = item.match(/\(tickets\/(\d+)-[^)]*\.md\)/)?.[1];
  return nn ? `${folder.split("/").filter(Boolean).pop()}-${nn}` : null;
}

/** Lanes and gh stack chains (PR numbers, bottom first). `stacks` is null without a `## Stacks` section. */
export function parseMapMd(text: string, folder: string): { lanes: MapLane[]; stacks: { prs: number[] }[] | null } {
  const lines = text.split("\n");
  const lanes: MapLane[] = [];
  let lane: Omit<MapLane, "n"> = { label: "", keys: [], explicit: false };
  const close = () => lane.keys.length && lanes.push({ ...lane, n: lanes.length + 1 });
  for (const line of section(lines, "Route") ?? []) {
    const heading = line.match(/^### (.*)/)?.[1].trim();
    if (heading !== undefined) {
      close();
      const label = heading.match(/^Lane \d+\s*[:—–-]?\s*(.*)/)?.[1] ?? heading;
      lane = { label, keys: [], explicit: true };
      continue;
    }
    const item = line.match(/^\d+\. (.*)/)?.[1];
    const key = item && keyOf(item, folder);
    if (!item || !key) continue;
    const base = item.match(/stack on `([^`]+)`/)?.[1] ?? lane.keys.at(-1)?.key ?? "main";
    lane.keys.push({ key, base });
  }
  close();

  const stacks = section(lines, "Stacks")?.flatMap((line) => {
    const chains: { prs: number[] }[] = [];
    let chain: { prs: number[] } | null = null;
    for (const segment of line.split("←")) {
      const pr = segment.match(/[\w./-]+`?\s*\(#(\d+)\)/)?.[1];
      if (!pr) chain = null;
      else if (chain) chain.prs.push(Number(pr));
      else chains.push((chain = { prs: [Number(pr)] }));
    }
    return chains;
  });
  return { lanes, stacks: stacks ?? null };
}
