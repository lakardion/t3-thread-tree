# Lint and format with oxc

Research for this repo (Bun 1.3, React 19, TypeScript 7 strict, shadcn/ui, Tailwind 4). Versions: oxlint 1.93.0, oxfmt 0.78.0. The installed `configuration_schema.json` files are the authority for option names. Every option below exists in them.

## Recommendations

### `.oxlintrc.json`

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["eslint", "typescript", "unicorn", "oxc", "react", "jsx-a11y", "import"],
  "categories": {
    "correctness": "error",
    "suspicious": "warn"
  },
  "rules": {
    "react/react-in-jsx-scope": "off",
    "react/rules-of-hooks": "error",
    "typescript/no-explicit-any": "error",
    "typescript/no-import-type-side-effects": "error",
    "import/no-cycle": "error",
    "eslint/no-underscore-dangle": "off",
    "unicorn/require-post-message-target-origin": "off"
  },
  "overrides": [
    {
      "files": ["src/components/ui/**"],
      "rules": { "typescript/no-import-type-side-effects": "off" }
    },
    {
      "files": ["test/**"],
      "rules": { "unicorn/consistent-function-scoping": "off" }
    }
  ],
  "ignorePatterns": [".claude/**", ".playwright-mcp/**", ".wayfinder/**"]
}
```

- Plugins: keep the four defaults and add `react`, `jsx-a11y`, `import`. Do not add `jest`/`vitest` (they do not see `bun:test` imports), `react-perf` (noise without memoization), `promise`, `nextjs`, `node`, `jsdoc`, `vue`.
- Categories: `correctness` as error, `suspicious` as warn. CI runs `--deny-warnings`, so warn also fails CI. Warn only changes the editor color. Do not enable `pedantic`, `style` or `restriction` as a category. They produce 51, 1937 and 633 findings here (see point 1).
- `react/rules-of-hooks` must be turned on by name. It is in `pedantic`, not `correctness`.
- Type-aware linting works with TS 7. It is optional because it adds the `oxlint-tsgolint` dependency. To turn it on: `bun add -d oxlint-tsgolint`, then add `"options": { "typeAware": true }` and `"typescript/no-unsafe-type-assertion": "off"`. See point 3.

### Adopted in this repo

The repo uses the config above with these changes. `.oxlintrc.json` is the source of truth.

- Type-aware linting is on (`oxlint-tsgolint`, `"options": { "typeAware": true }`, `typescript/no-unsafe-type-assertion` off). It catches floating promises.
- `unicorn/prefer-add-event-listener` is off. Each socket, worker and event source here has one handler on an object the code owns.
- `typescript/consistent-return` is off. A React effect returns a cleanup on some paths only.
- `jsx-a11y/prefer-tag-over-role` is off. `role="img"` wraps an SVG icon, and `<img>` cannot hold one.

### `.oxfmtrc.json`

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "printWidth": 120,
  "sortImports": true,
  "sortTailwindcss": {
    "stylesheet": "./src/page/index.css",
    "functions": ["cn", "cva", "clsx"]
  },
  "ignorePatterns": [".claude/**", ".playwright-mcp/**", ".wayfinder/**"]
}
```

Adopting it reformats 23 files. All 23 change from `sortImports`. One of them, `src/page/app.tsx`, also changes from `sortTailwindcss`. Run `bun run fmt` once.

### Findings with the recommended configs

Measured on a copy of `src`, `test`, `scripts` with the config at the copy root (see "Method").

| Rule                                | Severity | Count                        |
| ----------------------------------- | -------- | ---------------------------- |
| unicorn/no-array-sort               | warn     | 7                            |
| unicorn/prefer-add-event-listener   | warn     | 6                            |
| jsx-a11y/prefer-tag-over-role       | error    | 3                            |
| eslint/no-shadow                    | warn     | 2                            |
| unicorn/consistent-function-scoping | warn     | 2                            |
| import/no-cycle                     | error    | 2                            |
| typescript/no-explicit-any          | error    | 1                            |
| jsx-a11y/no-noninteractive-tabindex | error    | 1                            |
| **Total**                           |          | **24** (31 files, 214 rules) |

Extra findings with `--type-aware` (before `no-unsafe-type-assertion` is off): `typescript/no-unnecessary-type-assertion` 40, `typescript/no-unsafe-type-assertion` 30, `typescript/no-floating-promises` 3, `typescript/consistent-return` 2, `typescript/unbound-method` 1, `typescript/no-misused-spread` 1. Total 101 on 240 rules.

All 24 base findings must be fixed or suppressed before the config goes into CI, because CI denies warnings.

## Evidence

### 1. Plugins and categories

- Default plugins are `eslint`, `typescript`, `unicorn`, `oxc`. `oxlint --print-config` with no config prints `"plugins": ["unicorn", "typescript", "oxc"]` (`eslint` rules are always present). Source: https://oxc.rs/docs/guide/usage/linter/plugins.html, `oxlint --help` ("Disable unicorn plugin, which is turned on by default", "Enable react plugin, which is turned off by default").
- Setting `plugins` replaces the default set: "Setting the `plugins` field will overwrite the base set of plugins. The `plugins` array should reflect all of the plugins you want to use." Source: `node_modules/oxlint/configuration_schema.json` (`properties.plugins.description`). So list `eslint`, `typescript`, `unicorn`, `oxc` again.
- Valid plugin names (schema `LintPluginOptionsSchema` enum): `eslint, react, unicorn, typescript, oxc, import, jsdoc, jest, vitest, jsx-a11y, nextjs, react-perf, promise, node, vue`. There is no `react-hooks` plugin. The hooks rules are in the `react` plugin. The `react-hooks/` prefix is accepted as an alias: a config with `"react-hooks/rules-of-hooks"` resolves to `react/rules-of-hooks` in `--print-config` and reports as `react-hooks(rules-of-hooks)` (tested locally).
- Valid categories (schema `OxlintCategories`): `correctness, nursery, pedantic, perf, restriction, style, suspicious`. Default is `correctness` only (`oxlint --help`). Rules in `rules` win over `categories` (schema `OxlintCategories.description`).
- `jest`/`vitest` plugins do not lint `bun:test` tests. A test file that imports `test`/`expect` from `"bun:test"` with `expect(1)` and `test.only` gave 0 findings. The same file with global `test`/`expect` gave `valid-expect`, `expect-expect`, `no-focused-tests`. Every test here imports from `bun:test`.
- Category sizes on this repo, all candidate plugins on, `-A all -W <category>`:
  - correctness: 4 (all `jsx-a11y`)
  - suspicious: 253, of which 217 are `react/react-in-jsx-scope`
  - perf: 26, of which 20 are `react-perf` prop-identity rules
  - pedantic: 51 (`max-lines-per-function` 15, `no-array-callback-reference` 9, ...)
  - style: 1937 (`id-length` 284, `one-var` 259, `no-magic-numbers` 205, `sort-keys` 201, `no-null` 170, ...)
  - restriction: 633 (`explicit-function-return-type` 144, `no-rest-spread-properties` 72, `no-non-null-assertion` 56, ...)

  `style` and `restriction` are opt-in rule sets, not baselines. Pick single rules from them.

### 2. Rules and overrides

Rule categories come from `oxlint --rules -f json` (1.93.0).

- `react/react-in-jsx-scope` (suspicious): off. `tsconfig.json` uses `"jsx": "react-jsx"`, the automatic runtime, so `React` need not be in scope. It gives 217 false findings with `suspicious` on.
- `react/rules-of-hooks` (pedantic): error. React's plugin README sets `"react-hooks/rules-of-hooks": "error"`. Source: https://github.com/facebook/react/blob/main/packages/eslint-plugin-react-hooks/README.md.
- `react/exhaustive-deps` (correctness): on through the category, as error. React's README uses `"warn"`. With `--deny-warnings` both fail CI. Same source.
- `react/only-export-components` (restriction): leave off. It only matters for Fast Refresh. `src/server.ts` has no `development.hmr`, and the rule flags the shadcn `buttonVariants`/`badgeVariants`/`toggleVariants` exports (3 findings).
- `typescript/no-explicit-any` (restriction in oxlint): error. typescript-eslint `recommended` enables it: "Extending "plugin:@typescript-eslint/recommended" ... enables this rule." Source: https://typescript-eslint.io/rules/no-explicit-any/.
- `typescript/consistent-type-imports` (style): leave off. `verbatimModuleSyntax` already makes `tsc` fail on a type imported without `type`. typescript-eslint warns that "using both this rule and `verbatimModuleSyntax` at the same time can lead to conflicting and/or duplicate reports". Source: https://typescript-eslint.io/rules/consistent-type-imports/.
- `typescript/no-import-type-side-effects` (restriction): error. Under `verbatimModuleSyntax`, `import { type T } from "m"` emits `import {} from "m"` (same source), which keeps a side-effect import. Off for `src/components/ui/**`, where the only finding is in generated `toggle-group.tsx`.
- `import/no-cycle` (restriction): error. 2 findings: `src/page/app.tsx` and `src/page/brief.tsx` import each other.
- `eslint/no-underscore-dangle` (suspicious): off. All 4 findings are `_tag`, a field of the external T3 protocol in `src/server/t3.ts`.
- `unicorn/require-post-message-target-origin` (suspicious): off. The only finding is `self.postMessage` in the Bun worker `src/server/lineage-scan.ts`. A worker `postMessage` takes no target origin.
- `unicorn/consistent-function-scoping` (suspicious): off for `test/**`, where 13 of 15 findings are local helpers in tests.
- `react` settings: `settings.react.version` exists (schema `ReactPluginSettings`), but it is not needed.

Override `files` globs and `ignorePatterns` resolve relative to the config file. Run with `-c /tmp/x.json` from the repo, and the overrides did not match and `.claude/**` was linted. Keep the config at the repo root.

### 3. Type-aware linting

- Usable with 1.93. Enable with `--type-aware` or `options.typeAware: true` in the root config. "Note that this requires the `oxlint-tsgolint` package to be installed." Source: `node_modules/oxlint/configuration_schema.json` (`OxlintOptions.typeAware`), https://oxc.rs/docs/guide/usage/linter/type-aware.html.
- `oxlint-tsgolint` is not installed in this repo. oxlint 1.93.0 declares the peer dependency `"oxlint-tsgolint": ">=7.0.2005"` (`npm view oxlint peerDependencies`). Latest is 7.0.2007.
- Works with TypeScript 7. The docs say it "is powered by typescript-go" and "TypeScript 7.0+ is required". Legacy options like `baseUrl` are not supported. This `tsconfig.json` does not use `baseUrl`. Source: type-aware page above.
- Tested: on a copy of the repo with `oxlint-tsgolint@7.0.2007` and `typescript@7.0.2`, `oxlint --type-aware` ran without errors.
- Cost: one more dev dependency (platform binaries). Run time on 31 files was about 1.0 s with `--type-aware` against about 0.06 s without, measured with `time`. The docs say type-aware rules can dominate run time. Use `--debug timings` to find slow rules. Source: type-aware page above.
- 1.93 has 61 type-aware rules: 15 in `correctness`, 11 `suspicious`, 21 `pedantic`, 9 `style`, 3 `restriction`, 2 `nursery` (`oxlint --rules -f json`, `type_aware: true`). The docs say they cover "59 out of 61" typescript-eslint type-aware rules.
- `typescript/no-unsafe-type-assertion` (suspicious, 30 findings, mostly `JSON.parse(...) as T`): turn off. No typescript-eslint shared config lists it. Its page only shows how to turn it on manually. Source: https://typescript-eslint.io/rules/no-unsafe-type-assertion/.
- `typescript/no-unnecessary-type-assertion` (40 findings) flags `arr[0]!`. Without `noUncheckedIndexedAccess`, `arr[0]` is already `T`, so the `!` does nothing. It has an autofix (`fix: fixable_fix`).
- `--type-check` / `options.typeCheck` exist and are marked experimental (`oxlint --help`, schema `OxlintOptions.typeCheck`). Keep `tsc` in CI.

### 4. oxfmt options

- Import sorting: option `sortImports`, shape `boolean | SortImportsConfig` (schema `SortImportsUserConfig`). It is off by default. Object fields: `groups`, `customGroups`, `ignoreCase` (default `true`), `internalPattern` (default `["~/", "@/", "#"]`), `newlinesBetween` (default `true`), `order` (default `"asc"`), `partitionByComment`, `partitionByNewline`, `sortSideEffects` (default `false`). Source: `node_modules/oxfmt/configuration_schema.json`, `SortImportsConfig`.
  - The default `internalPattern` already contains `@/`, so `"sortImports": true` puts `@/` imports in the `internal` group. No `customGroups` are needed.
  - Default groups in 0.78: `["builtin", "external", ["internal", "subpath"], ["parent", "sibling", "index"], "style", "unknown"]` (schema `groups.description`). https://oxc.rs/docs/guide/usage/formatter/sorting.html shows a different default list. For 0.78, use the schema.
  - "options that rely on information outside the source file are not supported", for example `tsconfigPath`. Source: sorting page above.
- Tailwind class sorting: option `sortTailwindcss`, shape `boolean | SortTailwindcssConfig`. It is off by default. Fields: `stylesheet` ("Path to your Tailwind CSS stylesheet (v4)", resolved relative to the oxfmt config file), `config` (v3 only), `functions`, `attributes` (exact names, no regex), `preserveDuplicates`, `preserveWhitespace`. Source: schema `SortTailwindcssConfig`.
  - Point `stylesheet` at `./src/page/index.css`, the CSS entry with `@import "tailwindcss"` and the `@theme` tokens. Without it, oxfmt uses the default `theme.css`, and custom tokens are unknown. Tested: `className="p-4 bg-background flex bg-brand"` becomes `bg-brand flex bg-background p-4` with the stylesheet, and `bg-background bg-brand flex p-4` without it.
  - A wrong `stylesheet` path gives no error. It falls back without warning. Check the path.
  - `functions: ["cn", "cva", "clsx"]` covers `src/lib/utils.ts` `cn()` and the shadcn `cva()` calls.
- Prettier defaults: oxfmt's "Default `printWidth` is 100 (Prettier uses 80)". Source: https://oxc.rs/docs/guide/usage/formatter/migrate-from-prettier.html. The other JS defaults in the schema are the same as Prettier 3: `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `tabWidth: 2`, `arrowParens: "always"`, `bracketSpacing: true`, `endOfLine: "lf"`. `sortPackageJson` is on by default, and Prettier has no such option. The schema says its order "is NOT compatible with prettier-plugin-packagejson". The current `package.json` already passes.
- Other options: none needed. `printWidth: 120` stays because it is the current repo style.

### 5. Validation

- Method: `src`, `test`, `scripts`, root config files and `.gitignore` copied to `/private/tmp/claude-502/mirror`, with a fresh `bun install --frozen-lockfile` plus `oxlint-tsgolint`. Each config was placed at the copy root, because overrides and `ignorePatterns` are relative to the config file. A run from the repo with `-c /private/tmp/claude-502/oxlintrc.recommended.json` parsed without errors. It gave 38 findings because the overrides did not match.
- oxlint: the config parses and runs 214 rules on 31 files. Counts are in the table above.
- oxfmt: `oxfmt -c <path>` / `--config` is supported (`oxfmt --help`). With the recommended config at the copy root, `oxfmt --check` reports 23 files. `sortImports` alone changes all 23. `sortTailwindcss` alone changes only `src/page/app.tsx`. The shadcn files already have sorted classes. A run from the repo with `-c` pointing at the temp file reported 94 files, because the temp-relative `ignorePatterns` no longer excluded `.claude/**`.
