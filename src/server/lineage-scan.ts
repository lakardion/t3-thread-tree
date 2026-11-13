/** Runs the full lineage scan off the main thread. */
import { openLineage } from "./lineage.ts";

declare const self: Worker;
const l = openLineage();
l.reload();
self.postMessage(l.entries());
