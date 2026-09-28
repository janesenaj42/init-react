import { join } from "node:path";
import { ESLINT_CONFIG, THIRD_PARTY_RANGES } from "../constants.js";
import {
  isScaffoldDefault,
  SCAFFOLD_LINT_DEPENDENCIES,
  SCAFFOLD_LINT_SCRIPTS,
} from "../fingerprints.js";
import { stamp } from "../managed.js";
import type { Plan } from "../plan.js";
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

  const { outcome, replacedScaffold } = plan.reconcileConfigFile({
    tool: "eslint",
    target,
    content: stamp(BODY, "//"),
    candidates: CANDIDATES.map((name) => join(dir, name)),
    pkgKey: "eslintConfig",
    snippet: `import standard from "${ESLINT_CONFIG}";\n// ...then spread \`...standard\` first in your exported config array`,
  });

  plan.ensureDevDependency("eslint", THIRD_PARTY_RANGES.eslint);
  plan.ensureDevDependency(ESLINT_CONFIG, sharedPackageRange(ESLINT_CONFIG));

  if (outcome === "kept") return;

  if (replacedScaffold) {
    // The Standard's package brings these; Vite's copies would only drift.
    for (const name of SCAFFOLD_LINT_DEPENDENCIES) {
      plan.removeDevDependency(name, "now provided by the Standard");
    }
  }
  replaceOxlint(plan);
  plan.setScript("eslint", "lint", "eslint .", SCAFFOLD_LINT_SCRIPTS);
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
