import { Ghost } from "lucide-react";

import { NO_PROJECT } from "../shared/tree.ts";

/** The project monogram and color rule of T3 Code, so a project has the same icon here as in T3. */
const normalize = (projectName: string) => projectName.normalize("NFKC").trim();

function projectMonogram(projectName: string): string {
  const words = normalize(projectName).match(/[\p{L}\p{N}]+/gu) ?? [];
  const firstWord = words[0];
  if (!firstWord) return "PR";
  const glyphs = Array.from(firstWord);
  const first = glyphs[0] ?? "P";
  const second =
    glyphs.slice(1).find((glyph) => /\p{N}/u.test(glyph)) ??
    (words.length > 1 ? Array.from(words.at(-1) ?? "")[0] : glyphs.at(-1)) ??
    first;
  return Array.from(`${first}${second}`.toUpperCase()).slice(0, 2).join("");
}

const PROJECT_ICON_COLORS = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
] as const;

function projectColor(projectName: string): (typeof PROJECT_ICON_COLORS)[number] {
  const seed = normalize(projectName).toLocaleLowerCase("en-US") || "project";
  let index = 0;
  for (const glyph of seed) {
    index = (index * 31 + (glyph.codePointAt(0) ?? 0)) % PROJECT_ICON_COLORS.length;
  }
  return PROJECT_ICON_COLORS[index] ?? "blue";
}

/** Tailwind 500 shades. */
const HEX: Record<(typeof PROJECT_ICON_COLORS)[number], string> = {
  gray: "#6b7280",
  red: "#ef4444",
  orange: "#f97316",
  amber: "#f59e0b",
  yellow: "#eab308",
  lime: "#84cc16",
  green: "#22c55e",
  emerald: "#10b981",
  teal: "#14b8a6",
  cyan: "#06b6d4",
  sky: "#0ea5e9",
  blue: "#3b82f6",
  indigo: "#6366f1",
  violet: "#8b5cf6",
  purple: "#a855f7",
  fuchsia: "#d946ef",
  pink: "#ec4899",
  rose: "#f43f5e",
};

export function ProjectIcon({ name }: { name: string }) {
  if (name === NO_PROJECT) return <Ghost aria-hidden className="size-4 shrink-0 text-muted-foreground" />;
  const text = projectMonogram(name);
  return (
    <span aria-hidden className="inline-flex size-4 shrink-0 items-center justify-center">
      <svg
        viewBox="0 0 16 16"
        className="size-full overflow-hidden rounded-[25%] font-mono select-none"
        style={{ color: HEX[projectColor(name)], backgroundColor: "color-mix(in srgb, currentColor 14%, transparent)" }}
      >
        <text
          x="8"
          y="10.8"
          textAnchor="middle"
          fill="currentColor"
          fontSize="8.25"
          fontWeight="700"
          textLength={Array.from(text).length === 1 ? 6 : 12}
          lengthAdjust="spacingAndGlyphs"
          textRendering="geometricPrecision"
        >
          {text}
        </text>
      </svg>
    </span>
  );
}

export const projectHex = (projectName: string) => HEX[projectColor(projectName)];
