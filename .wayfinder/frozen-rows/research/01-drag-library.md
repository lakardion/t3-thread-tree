# Research: the drag library for the tree

Ticket: [01-drag-library](../tickets/01-drag-library.md).

Facts come from the npm registry, the GitHub API, the library docs, and the published package source. I fetched each package into a scratch folder outside the repo (with `--ignore-scripts`), read its `dist` code, and bundled the real imports with `bun build --minify`. All checks ran on 2026-11-13. The repo is not changed.

## Summary

- **Recommendation:** `@dnd-kit/react` `0.5.3` with `@dnd-kit/helpers` `0.5.3`. It is the only option that has all of: sortable lists scoped per list, a built-in keyboard drag (Space, arrows, Space, Escape) with screen reader announcements, items that slide to make room, and reduced-motion handling in the library. It is maintained (last release 2026-10-31) and declares React 19 support.
- **Costs and risks:** 39.8 kB min+gzip, the largest option. The version is `0.x`, so pin it exactly. A data push that changes the indices of the list under the drag can make the DOM and React disagree (see [Live data](#3-live-data-during-a-drag)). The fix is to freeze the rendered order of the dragged list until the drop.
- **Rejected:** Atlassian `pragmatic-drag-and-drop` is small (8.2 kB) and healthy, but it has no keyboard drag and no "make room" motion. Its own guidelines recommend a "Move" menu instead of arrow keys. Classic `@dnd-kit/core` + `@dnd-kit/sortable` works, but its last release was 2024-12-05 and its docs are now under "Legacy". `@hello-pangea/dnd` had its last release on 2025-02-09 and pulls in Redux.

## 1. Options and health

| | `@dnd-kit/react` (new) | `@dnd-kit/core` + `sortable` (classic) | `pragmatic-drag-and-drop` | `@hello-pangea/dnd` |
|---|---|---|---|---|
| Latest version | `0.5.3` (2026-10-31) | `core 6.3.1` (2024-12-05), `sortable 10.0.0` (2024-12-04) | `4.0.0` (2026-09-24); `flourish 3.2.5` (2026-11-10) | `18.0.1` (2025-02-09) |
| React peer | `^18.0.0 \|\| ^19.0.0` | `>=16.8.0` | none (vanilla core) | `^18.0.0 \|\| ^19.0.0` |
| Repo | 152 open issues, last push 2026-10-31 | same repo | 104 open issues, synced from Atlassian's monorepo almost each day (last 2026-11-13) | 145 open issues, last commit 2026-02-13 |
| Cost, min+gzip, real imports | 39.8 kB | 15.6 kB | 8.2 kB (adapter, combine, reorder, hitbox, live region) | 28.8 kB (bundlephobia) |
| Mechanism | Pointer and keyboard sensors, own rendering | Pointer and keyboard sensors, own rendering | Native HTML5 drag and drop under a wrapper | Own rendering |

Sizes for the first three come from `bun build --minify` of the imports in the sketch below, React excluded, then `gzip -9`. Bundlephobia gives 33.2 kB for the `@dnd-kit/react` main entry alone and 14.2 kB for `@dnd-kit/core` alone; Bundlephobia cannot size Pragmatic, because its main entry is an empty barrel (174 B).

The dnd-kit site shows two doc sets: "Latest" (the new packages) and "Legacy" (`/legacy/...`, the classic packages). The migration guide maps `DndContext` to `DragDropProvider`, removes `SortableContext`, and maps `arrayMove` to `move` from `@dnd-kit/helpers`. All new work in the repo goes to the new packages: every 2026 release tag is `0.x` of the new packages.

React 19 signal: open issue #2116 says `DragDropProvider` destroys its manager during the React 19 Strict Mode effect replay. This app does not use `<StrictMode>` (`src/page/app.tsx` renders `<App />` directly), so it does not apply. Open issue #1654 asks for `"use client"`, which matters only for server components. `bun build` bundles the package with no error.

## 2. Nested lists and stacked groups

`@dnd-kit/react`: one `DragDropProvider` serves all levels. Each item calls `useSortable({ id, index, group, type, accept })`. The docs: "Items with the same `group` can be sorted within the same list", and `accept` limits which draggables can drop on an item. Give every list its own key (for example `groups:<projectId>`) and pass it as `group`, `type` and `accept`. Then an item only accepts items of its own list, and the keyboard sensor only considers droppables that accept the source (`droppable.accepts(source)` in `SortableKeyboardPlugin`). Without `accept`, the `OptimisticSortingPlugin` moves items across groups.

Ids must be unique in the whole provider. The registry is a `Map` keyed by id (`@dnd-kit/abstract`), so a group and a thread with the same id would replace each other. Prefix ids by level.

Stacked groups: the project section already renders `stackRuns(b.branches)`, where a run of one PR stack is one `StackRail`. Make the run the sortable unit, with a key from the stack (`stack:<stack.id>`), and do not make the groups inside a rail sortable. The block then moves as one item, and its stack order stays as it is. `stackRuns` joins only adjacent groups of the same stack, so 04 must apply the user order to units (runs), not to single groups, or a stack can split.

Pragmatic and classic dnd-kit can also scope lists (Pragmatic with `canDrop` on each drop target, classic with one `SortableContext` per list). This is not a discriminator.

## 3. Live data during a drag

How `@dnd-kit/react` keeps the order during a drag, from `@dnd-kit/dom/sortable.js`:

- On each `dragover`, `OptimisticSortingPlugin` moves the dragged DOM node with `insertAdjacentElement` and writes the new `index` on each sortable. React state does not change until you call `move()` or update state yourself.
- `useSortable` copies the `index` prop into the sortable only in a layout effect with deps `[sortable, group, index]`. A re-render with the same `index` props does not reset the optimistic order. So a push that only changes row data (status, phrase, PR marks) does not disturb the drag.
- The plugin bails out (`hasChanged(...)`) when the indices changed in a render between the event and its microtask.

The risk is a push that changes indices in the dragged list during the drag. A removed row above the dragged one, or a base-order change, gives new `index` props while the DOM is in the optimistic order. Open issue #1940 ("Failed to execute removeChild on Node" in multiple sortable lists) reports this class of failure, and one comment there says real-time updates during a drag still cause DOM conflicts. A push that appends a row at the end does not change any existing index, so stable order (route 02) already removes most of the risk.

Rule for 04: from `onDragStart` to `onDragEnd`, render the dragged list from a snapshot of its ids. Keep the last data of a row that a push removed until the drop, then drop it. Other lists, and the data inside each row, update as usual. Route 05 also keeps the last data of a removed row for its exit, so both keys can share that store.

If the dragged item itself leaves the DOM, its sortable unregisters and the drag cannot continue. The snapshot rule above also prevents this.

Pragmatic is the most robust here: native drag keeps the drag alive in the browser, and the docs say you can "make any changes you want during a drag operation". Classic dnd-kit computes transforms from the `items` array of `SortableContext`, so it does not move DOM nodes, but a push that changes `items` re-computes the transforms with a one-frame transition reset (`itemsHaveChanged` in `sortable.esm.js`).

## 4. Keyboard and screen readers

- `@dnd-kit/react`: the default sensors are `PointerSensor` and `KeyboardSensor`, and the default plugins include `Accessibility`. Default instructions: "To pick up a draggable item, press the space bar. While dragging, use the arrow keys to move the item in a given direction. Press space again to drop the item in its new position, or press escape to cancel." The plugin sets `role="button"`, `aria-roledescription="draggable"`, and an `aria-live="polite"` region. The default announcements use raw ids ("Picked up draggable item …"). 04 must pass its own `announcements` (`dragstart`, `dragover`, `dragend`) with the row name and position, through `Accessibility.configure({ announcements })` in the provider's `plugins`. Only `dragover` and `dragmove` announcements are debounced.
- Classic dnd-kit: `KeyboardSensor` with `sortableKeyboardCoordinates`, and `accessibility.announcements` on `DndContext`. Same model.
- Pragmatic: no keyboard drag. Its accessibility guidelines say the core "does not enable accessible controls automatically", recommend a "More" (…) menu with move actions, and advise against arrow-key controls. The live region package gives `announce()`. This fails the 04 spec ("Space to lift, arrows to move, Space to drop").

## 5. Motion

`@dnd-kit/react` (from `@dnd-kit/dom/sortable.js`):

- Each sortable animates itself when its `index` changes during a drag. It measures the old and new rectangles and runs a Web Animations API animation on `translate` (a FLIP). Default transition: `{ duration: 250, easing: "cubic-bezier(0.25, 1, 0.5, 1)", idle: false }`. Pass `transition` to `useSortable` to change it, or `null` to turn it off.
- `idle: false` means the library does not animate index changes when no drag runs. A push never makes dnd-kit animate. Routes 02 and 05 own all motion outside a drag.
- Before it animates, it cancels CSS transitions on `transform`, `translate` and `scale` on that element.
- The dragged element is the real element, lifted into the top layer with the Popover API (`showPopover(feedbackElement)`). `overflow-hidden` on `ProjectCard` does not clip it.
- Reduced motion: when `matchMedia("(prefers-reduced-motion: reduce)")` matches, the library sets the sortable transition, the drop animation, and the keyboard move transition to 0 ms. No code is needed in the app.

Fit with route 03 (status transitions): `Swap`, `row-pulse` and the status icons animate opacity and scale on child elements inside the row. dnd-kit animates `translate` on the sortable element (the `<li>`). They do not touch the same property on the same element, so they combine.

Fit with route 05 (enter and exit): animate height and opacity, not `translate`, on the sortable `<li>`, or animate an inner wrapper. A hand-written FLIP from the fluidity research also uses `translate`. If 05 adds one, it must not run while a drag is active, and it must not target the element that dnd-kit is animating. Do not run an enter or exit animation on the drag source.

Pragmatic does not move other items during a drag. The browser draws a drag preview, and the app draws a drop indicator line (optional package). After the drop, `@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash` flashes the moved item. That fails the 04 spec ("Items that make room move with the library's animation"). Classic dnd-kit animates with an inline CSS `transform` and `transition` (default 200 ms `ease`) that the app must set, and it has no reduced-motion check (no `prefers-reduced-motion` string in its `dist`).

## Recommendation and sketch

Use `@dnd-kit/react` and `@dnd-kit/helpers`, pinned to `0.5.3`. Use one `DragDropProvider` in `App` around the project list. Add the order store, the snapshot rule, and the announcements in 04.

The sketch wires the group list of one project section. `GroupRow` and `StackRail` each take a `sortRef` and put it on their outer `<li>`; Radix `Slot` (`Collapsible asChild`) merges refs. `orderUnits` and `saveOrder` are the 04 order store. The sketch is the API shape, not tested code.

```tsx
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { arrayMove } from "@dnd-kit/helpers";

const unitId = (run: Branch[]) => (run[0].stack ? `stack:${run[0].stack.id}` : `group:${run[0].id}`);

/** One sortable unit: a stack rail (moves as one block) or a single group. */
function GroupUnit({ run, index, list, ...fold }: { run: Branch[]; index: number; list: string } & Fold) {
  const { ref, handleRef } = useSortable({ id: unitId(run), index, group: list, type: list, accept: list });
  return run[0].stack ? (
    <StackRail run={run} sortRef={ref} handleRef={handleRef} {...fold} />
  ) : (
    <GroupRow b={run[0]} sortRef={ref} handleRef={handleRef} {...fold} />
  );
}

/** In ProjectCard, replaces the stackRuns(...) map. */
const list = `groups:${b.id}`;
<ul className="m-0 list-none p-0">
  {orderUnits(list, stackRuns(b.branches), unitId).map((run, i) => (
    <GroupUnit key={unitId(run)} run={run} index={i} list={list} closed={closed} toggle={toggle} />
  ))}
</ul>;

/** In App, around the project <ul>. */
<DragDropProvider
  onDragEnd={({ operation: { source }, canceled }) => {
    if (canceled || !isSortable(source)) return;
    const { group, initialIndex, index } = source.sortable;
    saveOrder(String(group), (ids) => arrayMove(ids, initialIndex, index));
  }}
>
```

## Checks

1. **Registry data** (`registry.npmjs.org`): versions, publish dates, peer dependencies and dist-tags in [section 1](#1-options-and-health).
2. **Bundle cost:** `bun build --minify --target browser` with React external, then `gzip -9`. `@dnd-kit/react` + `/sortable` + `@dnd-kit/helpers`: 123,753 B min, 39,800 B gz. Classic `core` + `sortable` + `utilities`: 45,799 B min, 15,613 B gz. Pragmatic adapter, `combine`, `reorder`, hitbox `closest-edge` and `get-reorder-destination-index`, live region: 25,687 B min, 8,207 B gz. Flourish post-move flash: 219 B gz.
3. **Source reads** (`@dnd-kit/dom@0.5.3`, `@dnd-kit/react@0.5.3`, `@dnd-kit/abstract@0.5.3`, `@dnd-kit/sortable@10.0.0`): `defaultSortableTransition`, `Sortable.animate()`, `OptimisticSortingPlugin`, `SortableKeyboardPlugin`, `defaultPreset`, `defaultAnnouncements`, `prefersReducedMotion` uses, `useSortable` layout effect, `EntityRegistry.register`, `move` and `arrayMove` types.
4. **GitHub API:** open issue counts, last push and last releases for `clauderic/dnd-kit`, `atlassian/pragmatic-drag-and-drop`, `hello-pangea/dnd`. Issues #1940 and #2116 read in full.
5. **App:** `src/page/app.tsx` has no `<StrictMode>`. `stackRuns` in `src/page/format.ts` joins only adjacent groups of one stack.

## Sources

- dnd-kit, `useSortable`: https://dndkit.com/react/hooks/use-sortable
- dnd-kit, multiple sortable lists: https://dndkit.com/react/guides/multiple-sortable-lists
- dnd-kit, migration from the legacy packages: https://dndkit.com/react/guides/migration
- dnd-kit, overview (Latest and Legacy docs): https://dndkit.com/overview
- dnd-kit source and releases: https://github.com/clauderic/dnd-kit
- dnd-kit issue #1940: https://github.com/clauderic/dnd-kit/issues/1940
- dnd-kit issue #2116: https://github.com/clauderic/dnd-kit/issues/2116
- dnd-kit issue #1654: https://github.com/clauderic/dnd-kit/issues/1654
- npm: https://www.npmjs.com/package/@dnd-kit/react, https://www.npmjs.com/package/@dnd-kit/core, https://www.npmjs.com/package/@atlaskit/pragmatic-drag-and-drop, https://www.npmjs.com/package/@hello-pangea/dnd
- Bundlephobia: https://bundlephobia.com/package/@dnd-kit/react@0.5.3, https://bundlephobia.com/package/@dnd-kit/core@6.3.1, https://bundlephobia.com/package/@hello-pangea/dnd@18.0.1
- Pragmatic drag and drop README: https://github.com/atlassian/pragmatic-drag-and-drop
- Pragmatic drag and drop, core package: https://atlassian.design/components/pragmatic-drag-and-drop/core-package/
- Pragmatic drag and drop, accessibility guidelines: https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines
- hello-pangea/dnd: https://github.com/hello-pangea/dnd
