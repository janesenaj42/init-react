import { join } from "node:path";
import { ESLINT_CONFIG, THIRD_PARTY_RANGES } from "../constants.js";
import {
  isScaffoldDefault,
  SCAFFOLD_LINT_DEPENDENCIES,
  SCAFFOLD_LINT_SCRIPTS,
} from "../fingerprints.js";
import { stamp } from "../managed.js";
import { rangeSatisfies, type Plan } from "../plan.js";
import { configFileName, sharedPackageRange } from "./standard.js";

const CANDIDATES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
];

const BODY = `import standard from "${ESLINT_CONFIG}";
import { defineConfig } from "eslint/config";

export default defineConfig([
  ...standard,
  // Project-specific rules go here.
]);
`;

export function eslintStep(plan: Plan): void {
  const { dir, esm } = plan.project;
  const target = join(dir, configFileName("eslint.config", esm));

  // A legacy .eslintrc can't import a flat config, so it gets no "add this" snippet.
  const legacy = CANDIDATES.some(
    (name) =>
      name.startsWith(".eslintrc") && plan.read(join(dir, name)) !== null,
  );
  const { outcome, replacedScaffold } = plan.reconcileConfigFile({
    tool: "eslint",
    target,
    content: stamp(BODY, "//"),
    candidates: CANDIDATES.map((name) => join(dir, name)),
    pkgKey: "eslintConfig",
    snippet: legacy
      ? undefined
      : `import standard from "${ESLINT_CONFIG}";\n// ...then spread \`...standard\` first in your exported config array`,
  });

  // A kept config is linted by the project's own ESLint: upgrading ESLint under it would
  // break it (ESLint 10 no longer reads .eslintrc files).
  if (outcome === "kept") {
    adviseKeptConfig(plan);
    return;
  }

  plan.ensureDevDependency("eslint", THIRD_PARTY_RANGES.eslint);
  plan.ensureDevDependency(ESLINT_CONFIG, sharedPackageRange(ESLINT_CONFIG));

  if (replacedScaffold) {
    // The Standard's package brings these; Vite's copies would only drift.
    for (const name of SCAFFOLD_LINT_DEPENDENCIES) {
      plan.removeDevDependency(name, "now provided by the Standard");
    }
  }
  replaceOxlint(plan);
  plan.setScript("eslint", "lint", "eslint .", SCAFFOLD_LINT_SCRIPTS);
}

/**
 * The project keeps its own config and ESLint. Says what using the Standard takes, loudly
 * when its ESLint is older than the Standard needs, since --force=eslint then also upgrades it.
 */
function adviseKeptConfig(plan: Plan): void {
  const wanted = THIRD_PARTY_RANGES.eslint;
  const current =
    plan.pkg.devDependencies?.eslint ?? plan.pkg.dependencies?.eslint;
  const force = `re-run with --force=eslint: it replaces your config with the Standard's (add your own rules back under "Project-specific rules go here") and installs eslint ${wanted}`;
  if (current !== undefined && !rangeSatisfies(current, wanted)) {
    plan.warn(
      `ESLint version mismatch: this project has eslint ${current}; the Standard needs ${wanted} (flat config, eslint.config.js; .eslintrc files no longer load). Your config and ESLint are kept. To use the Standard, ${force}.`,
    );
    return;
  }
  plan.note(
    `ESLint: your own config is kept. To use the Standard, add ${ESLINT_CONFIG} to it as shown above, or ${force}.`,
  );
}

/** Vite 9+ ships oxlint; the Standard uses ESLint, so an unedited oxlint setup is removed. */
function replaceOxlint(plan: Plan): void {
  const path = join(plan.project.dir, ".oxlintrc.json");
  const text = plan.read(path);
  if (text === null) return;
  if (isScaffoldDefault(".oxlintrc.json", text) || plan.isForced("eslint")) {
    plan.delete(path, "Vite's oxlint default; the Standard uses ESLint");
    plan.removeDevDependency("oxlint", "the Standard uses ESLint");
  } else {
    plan.log(
      "keep",
      ".oxlintrc.json: your own oxlint config. It is kept; `lint` now runs ESLint. Use --force=eslint to remove oxlint.",
    );
  }
}
