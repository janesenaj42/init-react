import { join } from "node:path";
import { stringify } from "yaml";
import { THIRD_PARTY_RANGES } from "../constants.js";
import { readBlock, upsertBlock } from "../managed.js";
import type { Plan } from "../plan.js";
import { capture } from "../util.js";

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

const CODE_FILES = "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}";
const OTHER_FILES = "*.{json,md,css,scss,html,yml,yaml}";

/**
 * One glob per file kind: lint-staged runs globs in parallel, so overlapping globs would
 * race on the same file. A skipped tool isn't run: the project may not have it.
 */
export function lintStagedConfig(plan: Plan): Record<string, string[]> {
  const eslint = plan.isSkipped("eslint") ? [] : ["eslint --fix"];
  const prettier = plan.isSkipped("prettier") ? [] : ["prettier --write"];
  const config: Record<string, string[]> = {
    [CODE_FILES]: [...eslint, ...prettier],
    [OTHER_FILES]: prettier,
  };
  return Object.fromEntries(
    Object.entries(config).filter(([, commands]) => commands.length > 0),
  );
}

export function lintStagedStep(plan: Plan): void {
  const { dir } = plan.project;
  const config = lintStagedConfig(plan);
  if (Object.keys(config).length === 0) {
    plan.warn(
      "lint-staged has nothing to run with both eslint and prettier skipped. Add lint-staged to --skip.",
    );
    return;
  }
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
  plan.setPkgValue("lint-staged", ["lint-staged"], config);
}

/** Our hooks, in their own file so the repository's lefthook config stays its own. */
export const HOOKS_FILE = "lefthook-init-react.yml";

// Every name lefthook reads its main config from, in its own order of preference.
const LEFTHOOK_CONFIGS = [
  "lefthook.yml",
  "lefthook.yaml",
  ".lefthook.yml",
  ".lefthook.yaml",
  ".config/lefthook.yml",
  ".config/lefthook.yaml",
  "lefthook.toml",
  ".lefthook.toml",
  "lefthook.json",
  ".lefthook.json",
];

/** lefthook 2 refuses to run on older git. */
const MIN_GIT = [2, 31] as const;

/**
 * Git hooks belong to the repository, not to a Target Project. They run through
 * lefthook (docs/adr/0002): every Target Project in the repository is listed in one
 * shared file at the git root, which the repository's own lefthook config extends.
 */
export function hooksStep(plan: Plan): void {
  const { gitRoot, relDir, dir } = plan.project;
  plan.ensureDevDependency("lefthook", THIRD_PARTY_RANGES.lefthook);

  if (!gitRoot) {
    plan.warn(
      "Not a git repository, so no git hooks were set up. Run `git init`, then run this again.",
    );
    return;
  }

  // lefthook finds the git root itself, so this works from a subfolder too.
  plan.setScript("lefthook", "prepare", "lefthook install");

  const hooksPath = join(gitRoot, HOOKS_FILE);
  const current = plan.read(hooksPath);
  const projects = [...new Set([...projectsIn(current), relDir])].sort();
  // Each project's own --skip decides which of its hooks run.
  const skips = skipsIn(current);
  const own = HOOK_TOOLS.filter((tool) => plan.isSkipped(tool));
  if (own.length > 0) skips[relDir] = own;
  else delete skips[relDir];
  const hooks = hooksFile(projects, skips);
  if (plan.read(hooksPath) !== hooks) plan.write(hooksPath, hooks);
  extendRepoConfig(plan, gitRoot);

  // husky and similar tools point git at their own hooks folder; lefthook won't
  // install over that.
  const hooksDir = capture("git", ["config", "core.hooksPath"], dir);
  if (hooksDir) {
    plan.warn(
      `git's core.hooksPath is set to "${hooksDir}" (husky?), so lefthook can't install its hooks. Remove that tool, then run \`git config --unset core.hooksPath\`.`,
    );
  }
  const gitVersion = /(\d+)\.(\d+)/.exec(
    capture("git", ["--version"], dir) ?? "",
  );
  if (
    gitVersion &&
    Number(gitVersion[1]) * 1000 + Number(gitVersion[2]) <
      MIN_GIT[0] * 1000 + MIN_GIT[1]
  ) {
    plan.warn(
      `git ${gitVersion[0]} is too old for lefthook, so the hooks won't run on this machine. Update git to ${MIN_GIT.join(".")} or later.`,
    );
  }
}

/** Makes the repository's lefthook config extend our hooks file, creating the config if there is none. */
function extendRepoConfig(plan: Plan, gitRoot: string): void {
  const existing = LEFTHOOK_CONFIGS.map((name) => join(gitRoot, name)).find(
    (path) => plan.read(path) !== null,
  );
  const path = existing ?? join(gitRoot, "lefthook.yml");
  const current = plan.read(path);
  const block = `# Hooks of the projects set up by init-react.\nextends:\n  - ${HOOKS_FILE}`;

  if (current === null) {
    plan.write(path, upsertBlock(null, block));
    return;
  }
  const ours = readBlock(current);
  const alreadyExtends = new RegExp(
    `^\\s*-\\s*["']?${HOOKS_FILE.replace(/\./g, "\\.")}["']?\\s*$`,
    "m",
  ).test(current.replace(ours ?? "", ""));
  const ownExtends = /^extends\s*:/m.test(current.replace(ours ?? "", ""));

  if (alreadyExtends) return;
  if (ownExtends || !/\.ya?ml$/.test(path)) {
    plan.log(
      "keep",
      `${plan.display(path)}: your own lefthook config. Add ${HOOKS_FILE} to its \`extends\` so the Standard's hooks run.`,
    );
    return;
  }
  const next = upsertBlock(current, block);
  if (next !== current) plan.write(path, next);
}

/** The tools a project's hooks run; a project that skips one gets no job for it. */
const HOOK_TOOLS = ["lint-staged", "commitlint"] as const;
type HookTool = (typeof HOOK_TOOLS)[number];
type Skips = Record<string, HookTool[]>;

function projectsIn(hooks: string | null): string[] {
  const line = hooks && /^# projects: (.*)$/m.exec(hooks)?.[1];
  return line ? (JSON.parse(line) as string[]) : [];
}

function skipsIn(hooks: string | null): Skips {
  const line = hooks && /^# skip: (.*)$/m.exec(hooks)?.[1];
  return line ? (JSON.parse(line) as Skips) : {};
}

function hooksFile(projects: string[], skips: Skips): string {
  const using = (tool: HookTool) =>
    projects.filter((dir) => !skips[dir]?.includes(tool));
  const lintStaged = using("lint-staged");
  const commitlint = using("commitlint");
  const hooks: Record<string, unknown> = {};
  if (lintStaged.length > 0) {
    hooks["pre-commit"] = {
      jobs: [
        {
          name: "init-react",
          // One project after another: each lint-staged run stashes and restores
          // the working tree, so two at once would trip over each other.
          group: {
            piped: true,
            jobs: lintStaged.map((dir) => ({
              name: `lint-staged ${dir}`,
              // lefthook skips a project with nothing staged under its root,
              // so commits elsewhere (e.g. a Java backend) need no Node.
              ...(dir === "." ? {} : { root: `${dir}/` }),
              run: "npx --no -- lint-staged",
            })),
          },
        },
      ],
    };
  }
  if (commitlint.length > 0) {
    hooks["commit-msg"] = {
      jobs: [
        {
          name: "init-react commitlint",
          // One run for the whole repository, from the first project with
          // commitlint installed. A bare --edit makes commitlint find the message
          // file itself, worktrees included. One line: lefthook on Windows breaks
          // multi-line scripts.
          run:
            `for dir in ${commitlint.map((d) => `"${d}"`).join(" ")}; do ` +
            `if [ -e "$dir/node_modules/.bin/commitlint" ]; then ` +
            `exec "$dir/node_modules/.bin/commitlint" --cwd "$dir" --edit; fi; done`,
        },
      ],
    };
  }
  return (
    `# Written by init-react; edits are overwritten. Git hooks shared by every Target\n` +
    `# Project in this repository, extended by the repository's own lefthook config.\n` +
    `# The Commit Convention applies to every commit.\n` +
    `# projects: ${JSON.stringify(projects)}\n` +
    (Object.keys(skips).length > 0
      ? `# skip: ${JSON.stringify(Object.fromEntries(Object.entries(skips).sort()))}\n`
      : "") +
    (Object.keys(hooks).length > 0 ? stringify(hooks, { lineWidth: 0 }) : "")
  );
}
