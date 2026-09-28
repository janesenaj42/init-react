import { join, relative } from "node:path";
import { THIRD_PARTY_RANGES } from "../constants.js";
import { readBlock, upsertBlock } from "../managed.js";
import type { Plan } from "../plan.js";
import { toPosix } from "../util.js";

const LINT_STAGED_CANDIDATES = [
  ".lintstagedrc",
  ".lintstagedrc.json",
  ".lintstagedrc.yaml",
  ".lintstagedrc.yml",
  ".lintstagedrc.js",
  ".lintstagedrc.cjs",
  ".lintstagedrc.mjs",
  "lint-staged.config.js",
  "lint-staged.config.cjs",
  "lint-staged.config.mjs",
];

// One glob per file kind: lint-staged runs globs in parallel, so overlapping globs
// would race on the same file.
export const LINT_STAGED_CONFIG = {
  "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["eslint --fix", "prettier --write"],
  "*.{json,md,css,scss,html,yml,yaml}": "prettier --write",
};

export function lintStagedStep(plan: Plan): void {
  const { dir } = plan.project;
  plan.ensureDevDependency("lint-staged", THIRD_PARTY_RANGES["lint-staged"]);
  const ownFile = LINT_STAGED_CANDIDATES.find(
    (name) => plan.read(join(dir, name)) !== null,
  );
  if (ownFile && !plan.isForced("lint-staged")) {
    plan.log(
      "keep",
      `${ownFile}: your own lint-staged config. Re-run with --force=lint-staged to use the Standard's.`,
    );
    return;
  }
  if (ownFile)
    plan.delete(join(dir, ownFile), "replaced by --force=lint-staged");
  plan.setPkgValue("lint-staged", ["lint-staged"], LINT_STAGED_CONFIG);
}

/**
 * Git hooks belong to the repository, not to a Target Project: they live at the git
 * root, and every Target Project in the repository is listed in one shared block.
 */
export function hooksStep(plan: Plan): void {
  const { gitRoot, relDir, dir } = plan.project;
  plan.ensureDevDependency("husky", THIRD_PARTY_RANGES.husky);

  if (!gitRoot) {
    plan.warn(
      "Not a git repository, so no git hooks were set up. Run `git init`, then run this again.",
    );
    return;
  }

  // husky installs the hooks from the git root; the project's bin folder is still on PATH.
  const toRoot = toPosix(relative(dir, gitRoot));
  plan.setScript(
    "husky",
    "prepare",
    toRoot ? `cd ${toRoot} && husky` : "husky",
  );

  const preCommitPath = join(gitRoot, ".husky", "pre-commit");
  const commitMsgPath = join(gitRoot, ".husky", "commit-msg");
  const projects = new Set([
    ...projectsIn(plan.read(preCommitPath)),
    ...projectsIn(plan.read(commitMsgPath)),
    relDir,
  ]);
  const list = [...projects].sort();

  upsertHook(plan, preCommitPath, preCommitBlock(list));
  upsertHook(plan, commitMsgPath, commitMsgBlock(list));
}

function upsertHook(plan: Plan, path: string, block: string): void {
  const current = plan.read(path);
  const next = upsertBlock(current, block);
  if (current !== next) plan.write(path, next);
}

function projectsIn(hook: string | null): string[] {
  const block = readBlock(hook);
  const line = block && /^# projects: (.*)$/m.exec(block)?.[1];
  return line ? (JSON.parse(line) as string[]) : [];
}

const quoteAll = (dirs: string[]) => dirs.map((d) => `"${d}"`).join(" ");

function preCommitBlock(dirs: string[]): string {
  return `# Git hooks are shared by the whole repository. Edits inside this block are overwritten.
# projects: ${JSON.stringify(dirs)}
for dir in ${quoteAll(dirs)}; do
  # Skip projects with nothing staged, so commits elsewhere (e.g. backend) need no Node.
  git diff --cached --name-only --diff-filter=ACMR -- "$dir" | grep -q . || continue
  (cd "$dir" && npx --no -- lint-staged) || exit 1
done`;
}

function commitMsgBlock(dirs: string[]): string {
  return `# The Commit Convention applies to every commit in the repository; CI enforces it too.
# projects: ${JSON.stringify(dirs)}
msg_file="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
for dir in ${quoteAll(dirs)}; do
  if [ -e "$dir/node_modules/.bin/commitlint" ]; then
    (cd "$dir" && npx --no -- commitlint --edit "$msg_file") || exit 1
    break
  fi
done`;
}
