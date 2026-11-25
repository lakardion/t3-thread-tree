import { useEffect, useRef } from "react";

import type { RunItem } from "../shared/runs.ts";
import type { Linear, ThreadNode, Tree } from "../shared/tree.ts";
import {
  HOLD_MS,
  holdNew,
  needsYouThreads,
  noMemory,
  notifyEvents,
  releaseHeld,
  upNextList,
  type Held,
  type NotifyMemory,
} from "./needs-you.ts";

type Item = ThreadNode | RunItem;

/**
 * Keeps the Desktop app in step with the page: the menu-bar "Open next" title, the Up next window, the Needs-you list
 * and the notifications. It also runs `openNext` and `openThread` when the Desktop app asks. In the Browser version it
 * does nothing.
 */
export function useDesktopSync(o: {
  tree: Tree | null;
  queue: Item[];
  target: Item | null;
  linear: Linear | null;
  /** `undefined` until the server answers. */
  catchUpOn: boolean | undefined;
  openNext: () => void;
  openThread: (id: string) => void;
}): void {
  const { tree, queue, target, linear, catchUpOn } = o;
  const actions = useRef(o);
  useEffect(() => {
    actions.current = o;
  });

  const sentOpenNext = useRef<string | null | undefined>(undefined);
  const openNextTitle = target ? target.title || target.id : null;
  useEffect(() => {
    if (!window.desktopBridge || openNextTitle === sentOpenNext.current) return;
    sentOpenNext.current = openNextTitle;
    window.desktopBridge.setOpenNext(openNextTitle);
  }, [openNextTitle]);
  useEffect(() => window.desktopBridge?.onOpenNext(() => actions.current.openNext()), []);
  useEffect(() => window.desktopBridge?.onOpenThread((id) => actions.current.openThread(id)), []);

  const sentUpNext = useRef("");
  useEffect(() => {
    if (!window.desktopBridge || !tree) return;
    const list = upNextList(tree.projects, queue, target, linear);
    const key = JSON.stringify(list);
    if (key === sentUpNext.current) return;
    sentUpNext.current = key;
    window.desktopBridge.setUpNext(list);
  });

  const sentNeedsYou = useRef("");
  useEffect(() => {
    if (!window.desktopBridge || !tree) return;
    const list = needsYouThreads(tree.projects, tree.runs ?? []);
    const key = JSON.stringify(list);
    if (key === sentNeedsYou.current) return;
    sentNeedsYou.current = key;
    window.desktopBridge.setNeedsYou(list);
  }, [tree]);

  const lastNotified = useRef<NotifyMemory>(noMemory);
  const held = useRef<Held>(new Map());
  useEffect(() => {
    if (!window.desktopBridge || !tree) return;
    const bridge = window.desktopBridge;
    const { events, next: memory } = notifyEvents(lastNotified.current, tree);
    lastNotified.current = memory;
    const now = holdNew(events, held.current, catchUpOn, Date.now());
    held.current = now.held;
    if (now.send.length > 0) bridge.notify(now.send);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const release = () => {
      const r = releaseHeld(held.current, tree, Date.now());
      held.current = r.held;
      if (r.send.length > 0) bridge.notify(r.send);
      if (r.held.size > 0 && tree.conn === "up") {
        const next = Math.min(...[...r.held.values()].map((h) => h.at)) + HOLD_MS;
        timer = setTimeout(release, Math.max(next - Date.now(), 0));
      }
    };
    release();
    return () => clearTimeout(timer);
  }, [tree, catchUpOn]);
}
