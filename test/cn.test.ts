import { describe, expect, test } from "bun:test";

import { cn } from "@/lib/utils";

describe("cn", () => {
  test("keeps the text-meta size next to a text color", () => {
    expect(cn("text-xs text-meta", "text-muted-foreground")).toBe("text-meta text-muted-foreground");
  });

  test("a later font size replaces text-meta", () => {
    expect(cn("text-meta", "text-sm")).toBe("text-sm");
  });
});
