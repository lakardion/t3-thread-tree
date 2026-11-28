/** Compiles the server into one macOS arm64 binary. */
import tailwind from "bun-plugin-tailwind";

const result = await Bun.build({
  entrypoints: ["./src/server.ts", "./src/server/lineage-scan.ts"],
  root: ".",
  compile: { target: "bun-darwin-arm64", outfile: "dist/sidecar/server" },
  /** Drops the dev-only Retouche overlay from the compiled app. */
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [tailwind],
});

if (!result.success) {
  console.error(...result.logs);
  process.exit(1);
}
