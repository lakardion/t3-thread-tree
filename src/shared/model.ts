/** The Model pick and the Local model, shared by the server and the page. */
export type ModelPick = "claude" | "codex" | "local";

export type LocalConfig = { baseUrl: string; model: string };

export type LocalState = "unset" | "ok" | "missing" | "down";

/** The Model picks that the server offers, with their labels. */
export type Offered = { id: ModelPick; label: string }[];
