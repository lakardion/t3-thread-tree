import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve, sep } from "node:path";

/** The subfolder of the T3 workflows folder that links to the repo `workflows/`. T3 does not load a subfolder by itself. */
const SUB = "t3-thread-tree";
/** The file names that T3 loads as workflow files. */
const WORKFLOW_FILE = /^[A-Za-z0-9_][\w.-]*\.(ts|mts|js|mjs)$/;

export function entryFile(name: string): string {
  return `/** Installed by t3-thread-tree. Run \`bun run workflows:install\` to update. */\nexport { default } from "./${SUB}/${name}";\n`;
}

/**
 * Links `<repo>/workflows` as a subfolder of `dir` and writes one top-level entry file per repo workflow.
 * It changes only a file whose content is exactly an entry file, and links that point into the repo.
 * Returns one line for each entry it did not write.
 */
export function installWorkflows(repo: string, dir: string): string[] {
  const target = join(repo, "workflows");
  if (existsSync(dir) && !statSync(dir).isDirectory()) throw new Error(`${dir} is not a folder`);
  mkdirSync(dir, { recursive: true });

  const link = join(dir, SUB);
  const linkStat = lstatSync(link, { throwIfNoEntry: false });
  if (linkStat && !linkStat.isSymbolicLink()) throw new Error(`${link} is not a symlink. Move it, then run again.`);
  if (linkStat?.isSymbolicLink() && resolve(dir, readlinkSync(link)) !== target) unlinkSync(link);
  if (!existsSync(link)) symlinkSync(target, link);

  const names = readdirSync(target).filter((f) => WORKFLOW_FILE.test(f));
  const others = new Map<string, string>();
  for (const f of readdirSync(dir)) {
    const path = join(dir, f);
    const stat = lstatSync(path);
    if (f === SUB) continue;
    if (stat.isSymbolicLink()) {
      if (resolve(dir, readlinkSync(path)).startsWith(repo + sep)) unlinkSync(path);
    } else if (stat.isFile() && WORKFLOW_FILE.test(f)) {
      const text = readFileSync(path, "utf8");
      if (text === entryFile(f) && !names.includes(f)) unlinkSync(path);
      else others.set(f, text);
    }
  }

  const lines: string[] = [];
  for (const name of names) {
    const own = others.get(name);
    if (own !== undefined) {
      lines.push(own === entryFile(name) ? `up to date: ${name}` : `kept your file: ${name}`);
      continue;
    }
    const importer = [...others].find(([, text]) => text.includes(`./${SUB}/${name}`))?.[0];
    if (importer) lines.push(`kept ${importer}, it imports ${name}`);
    else writeFileSync(join(dir, name), entryFile(name));
  }
  return lines;
}

if (import.meta.main) {
  const dir = process.env.T3CODE_WORKFLOWS ?? join(homedir(), ".t3", "workflows");
  for (const line of installWorkflows(resolve(import.meta.dir, ".."), dir)) console.log(line);
  console.log(`Installed the repo workflows in ${dir}`);
}
