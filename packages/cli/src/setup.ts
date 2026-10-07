import { CLI_PACKAGE, DEFAULT_REGISTRY, type Tool } from "./constants.js";
import { Plan } from "./plan.js";
import { detectProject, type CiProvider } from "./project.js";
import { ciStep } from "./steps/ci.js";
import { commitlintStep } from "./steps/commitlint.js";
import { eslintStep } from "./steps/eslint.js";
import { hooksStep, lintStagedStep } from "./steps/hooks.js";
import { prettierStep } from "./steps/prettier.js";
import { readmeStep } from "./steps/readme.js";
import { registryStep, releaseStep } from "./steps/release.js";
import { resolveRegistry, resolveSkip } from "./settings.js";
import { runScript } from "./steps/standard.js";
import { run } from "./util.js";

export interface SetupOptions {
  dryRun: boolean;
  force: Set<Tool>;
  /** --skip; undefined keeps the list saved by an earlier run. */
  skip?: Set<Tool>;
  registry?: string;
  ci?: CiProvider | "none";
  releaseBranch?: string;
}

/** Builds the full plan for applying the Standard to the Target Project in `cwd`. */
export function planSetup(cwd: string, options: SetupOptions): Plan {
  const project = detectProject(cwd);
  const skip = resolveSkip(project, options.skip);
  const registry = resolveRegistry(project, options.registry);
  const plan = new Plan(project, options.force, skip, registry);

  plan.setSetting("skip", skip.size > 0 ? [...skip].sort() : undefined);
  plan.setSetting(
    "registry",
    registry === DEFAULT_REGISTRY ? undefined : registry,
  );
  registryStep(plan);
  if (!skip.has("eslint")) eslintStep(plan);
  if (!skip.has("prettier")) prettierStep(plan);
  if (!skip.has("commitlint")) commitlintStep(plan);
  if (!skip.has("lint-staged")) lintStagedStep(plan);
  if (!skip.has("lefthook")) hooksStep(plan);
  if (!skip.has("release")) releaseStep(plan, options.releaseBranch);
  if (!skip.has("ci")) ciStep(plan, options.ci);
  readmeStep(plan);
  for (const tool of [...skip].sort()) {
    plan.note(`${tool}: skipped (--skip), so it is left to the repository.`);
  }
  return plan;
}

export function setup(cwd: string, options: SetupOptions): number {
  const plan = planSetup(cwd, options);
  const { project } = plan;
  console.log(
    `${CLI_PACKAGE}: ${project.relDir === "." ? project.dir : project.relDir} (${project.pm}${project.ciProvider ? `, ${project.ciProvider}` : ""})\n`,
  );
  printPlan(plan);

  if (!plan.hasChanges) {
    console.log("\nAlready up to date.");
    return 0;
  }
  if (options.dryRun) {
    console.log("\nDry run: nothing was changed.");
    printNotes(plan);
    return 0;
  }
  plan.apply();
  if (plan.needsInstall && !process.env.INIT_REACT_SKIP_INSTALL) {
    console.log(`\nInstalling with ${project.pm}...`);
    const code = run(project.pm, ["install"], { cwd: project.dir });
    if (code !== 0) {
      console.error(
        `\n${project.pm} install failed. Fix the error above, then run it again.`,
      );
      return code;
    }
  }
  console.log(
    `\nDone. Next:\n` +
      `  1. \`${runScript(project, "format")}\` once, so existing code matches the Standard\n` +
      `  2. Commit the changes; from then on, \`${runScript(project, "commit")}\` helps write commit messages`,
  );
  printNotes(plan);
  return 0;
}

function printNotes(plan: Plan): void {
  for (const entry of plan.entries.filter((e) => e.kind === "note")) {
    console.log(`  i ${entry.text}`);
  }
}

const SYMBOLS = {
  create: "+",
  update: "~",
  delete: "-",
  keep: "=",
  warn: "!",
  note: "i",
} as const;

function printPlan(plan: Plan): void {
  for (const entry of plan.entries.filter((e) => e.kind !== "note")) {
    console.log(`  ${SYMBOLS[entry.kind]} ${entry.text}`);
  }
}
