import { body, options } from "./lib/morning-catch-up.ts";

const { workflow } = T3;

export default workflow("morning-catch-up", options, body);
