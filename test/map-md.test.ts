import { describe, expect, test } from "bun:test";

import { parseMapMd } from "../src/server/map-md.ts";

const keys = (...k: [string, string][]) => k.map(([key, base]) => ({ key, base }));

describe("parseMapMd lanes", () => {
  test("Linear lanes with labels and virtual stack on", () => {
    const text = `## Route

Each lane is one chain in build order.

### Lane 1: trunk

1. TIB-4308
2. TIB-4309 — after TIB-4308 (forced)

### Lane 4: app shell crumbs

1. TIB-4346 — virtual stack on \`tib-4313-interview-page-layout\` (#16378)
2. TIB-4347
`;
    expect(parseMapMd(text, "/w/m").lanes).toEqual([
      { n: 1, label: "trunk", explicit: true, keys: keys(["TIB-4308", "main"], ["TIB-4309", "TIB-4308"]) },
      {
        n: 2,
        label: "app shell crumbs",
        explicit: true,
        keys: keys(["TIB-4346", "tib-4313-interview-page-layout"], ["TIB-4347", "TIB-4346"]),
      },
    ]);
  });

  test("markdown ticket lane takes the folder name and ignores gate text", () => {
    const text = `## Route

### Lane 1

1. [Show and sort by one Last run](tickets/01-row-time.md) — gate: docs PR #169 is merged to \`main\`
2. [Place threads with one rule chain](tickets/02-place-module.md) — after 01-row-time (forced)

## Stacks
`;
    const { lanes, stacks } = parseMapMd(text, "/wiki/t3/issues/thread-organization-build/");
    expect(lanes).toEqual([
      {
        n: 1,
        label: "",
        explicit: true,
        keys: keys(
          ["thread-organization-build-01", "main"],
          ["thread-organization-build-02", "thread-organization-build-01"],
        ),
      },
    ]);
    expect(stacks).toEqual([]);
  });

  test("flat route is one implicit lane, and a 3b line is skipped", () => {
    const text = `## Route

Linear holds every blocker below.

1. TIB-3866 — off \`main\`.
2. TIB-3867 — on TIB-3866.
3. TIB-3954 — on TIB-3867.
3b. TIB-3868 — on TIB-3954.
4. TIB-3869 — on TIB-3868.

## Notes
`;
    expect(parseMapMd(text, "/w/m").lanes).toEqual([
      {
        n: 1,
        label: "",
        explicit: false,
        keys: keys(["TIB-3866", "main"], ["TIB-3867", "TIB-3866"], ["TIB-3954", "TIB-3867"], ["TIB-3869", "TIB-3954"]),
      },
    ]);
  });

  test("a non-lane heading is a lane and a keyless one drops", () => {
    const text = `## Route

- \`Backlog\` or \`Todo\` → open

### Location lanes

- A go-live key also needs its location key.

### Components stack

0. ENG-5561: move the option types. Off \`main\`, base of the stack.
1. ENG-5431: \`Dropdown\`, stacked on ENG-5561.
`;
    expect(parseMapMd(text, "/w/m").lanes).toEqual([
      { n: 1, label: "Components stack", explicit: true, keys: keys(["ENG-5561", "main"], ["ENG-5431", "ENG-5561"]) },
    ]);
  });

  test("stack on without virtual sets the base", () => {
    const text = `## Route

### Lane 1

1. ENG-6081 — stack on \`eng-5584-add-filterlistbox-create\` (#15685)
2. ENG-6082
`;
    expect(parseMapMd(text, "/w/m").lanes[0].keys).toEqual(
      keys(["ENG-6081", "eng-5584-add-filterlistbox-create"], ["ENG-6082", "ENG-6081"]),
    );
  });

  test("no Route section gives no lanes", () => {
    expect(parseMapMd("# Map\n\n## Notes\n\n1. TIB-1\n", "/w/m")).toEqual({ lanes: [], stacks: null });
  });
});

describe("parseMapMd stacks", () => {
  test("reads chain PRs only, not stack ids or prose", () => {
    const text = `## Route

## Stacks

- gh stack #15765: main ← \`eng-5813-share\` (#14925) ← \`eng-5584-filter\` (#14665) ← \`eng-6081-share\` (#15764)
- Stack #127 merged
- \`a\` (#1) ← \`b\` (#2)

## Notes

- \`z\` (#9)
`;
    expect(parseMapMd(text, "/w/m").stacks).toEqual([{ prs: [14925, 14665, 15764] }, { prs: [1, 2] }]);
  });

  test("a segment with no PR breaks the chain", () => {
    expect(parseMapMd("## Stacks\n- `a` (#1) ← gone ← `b` (#2)", "/w/m").stacks).toEqual([{ prs: [1] }, { prs: [2] }]);
  });

  test("Stacks as the last section, and an empty one", () => {
    expect(parseMapMd("## Route\n\n## Stacks\n- main ← `a` (#5)", "/w/m").stacks).toEqual([{ prs: [5] }]);
    expect(parseMapMd("## Stacks\n\n", "/w/m").stacks).toEqual([]);
  });
});
