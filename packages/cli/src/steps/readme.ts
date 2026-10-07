import { join } from "node:path";
import { CLI_PACKAGE } from "../constants.js";
import { MARKDOWN_BLOCK, upsertBlock } from "../managed.js";
import type { Plan } from "../plan.js";
import { runScript } from "./standard.js";

/**
 * Script names the Standard puts in package.json, in the order they should be
 * documented. Whichever of these actually end up in package.json (ours, or an
 * Existing Config script kept under the same name) get a row.
 */
const SCRIPT_DOCS: { names: string[]; what: string }[] = [
  { names: ["lint"], what: "Lint with ESLint" },
  { names: ["format"], what: "Format with Prettier" },
  { names: ["format:check"], what: "Check formatting without changing files" },
  { names: ["typecheck"], what: "Type-check with tsc" },
  { names: ["commit"], what: "Write a commit message (commitizen)" },
  {
    names: ["release:patch", "release:minor", "release:major"],
    what: "Full Release: bump, changelog, commit, tag",
  },
  {
    names: ["release:alpha", "release:beta", "release:rc"],
    what: "Prerelease: bump and tag only",
  },
];

/**
 * A Target Project's README is the user's own document, so the Standard never rewrites
 * it wholesale. It only keeps one Managed Block current, documenting whichever of its
 * scripts made it into package.json (including a script the user kept under the same
 * name), so the team knows how to run them without reading this CLI's own docs.
 */
export function readmeStep(plan: Plan): void {
  const { dir } = plan.project;
  // plan.pkg, not plan.project.pkg: the latter is the untouched original, and this
  // step must document the scripts every earlier step just decided on.
  const scripts = plan.pkg.scripts ?? {};
  const rows = SCRIPT_DOCS.filter((doc) =>
    doc.names.some((name) => scripts[name] !== undefined),
  ).map(
    (doc) =>
      `| \`${doc.names.map((name) => runScript(plan.project, name)).join("` / `")}\` | ${doc.what} |`,
  );
  if (rows.length === 0) return;

  const block = `## Scripts

Added by [${CLI_PACKAGE}](https://github.com/janesenaj42/init-react). Edits inside this block are overwritten the next time it runs; write anything else about the project around it.

| Script | What it does |
| --- | --- |
${rows.join("\n")}`;

  const path = join(dir, "README.md");
  const current = plan.read(path);
  const next = upsertBlock(current, block, MARKDOWN_BLOCK);
  if (current !== next)
    plan.write(path, next, current === null ? "new file" : undefined);
}
