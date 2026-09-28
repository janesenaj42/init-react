import { join } from "node:path";
import { PRETTIER_CONFIG, THIRD_PARTY_RANGES } from "../constants.js";
import { stamp } from "../managed.js";
import { reconcileManagedFile, type Plan } from "../plan.js";
import { configFileName, sharedPackageRange } from "./standard.js";

const CANDIDATES = [
  ".prettierrc",
  ".prettierrc.json",
  ".prettierrc.json5",
  ".prettierrc.yaml",
  ".prettierrc.yml",
  ".prettierrc.toml",
  ".prettierrc.js",
  ".prettierrc.cjs",
  ".prettierrc.mjs",
  ".prettierrc.ts",
  ".prettierrc.cts",
  ".prettierrc.mts",
  "prettier.config.js",
  "prettier.config.cjs",
  "prettier.config.mjs",
  "prettier.config.ts",
  "prettier.config.cts",
  "prettier.config.mts",
];

const BODY = `import standard from "${PRETTIER_CONFIG}";

/** @type {import("prettier").Config} */
export default {
  ...standard,
  // Project-specific options go here.
};
`;

// Release writes CHANGELOG.md in its own format; lockfiles are generated.
const IGNORE = `CHANGELOG.md
package-lock.json
pnpm-lock.yaml
yarn.lock
`;

export function prettierStep(plan: Plan): void {
  const { dir, esm } = plan.project;

  plan.reconcileConfigFile({
    tool: "prettier",
    target: join(dir, configFileName("prettier.config", esm)),
    content: stamp(BODY, "//"),
    candidates: CANDIDATES.map((name) => join(dir, name)),
    pkgKey: "prettier",
    snippet: `Use "${PRETTIER_CONFIG}" as your Prettier config (e.g. "prettier": "${PRETTIER_CONFIG}" in package.json)`,
  });

  const ignorePath = join(dir, ".prettierignore");
  if (
    reconcileManagedFile(plan, "prettier", ignorePath, stamp(IGNORE, "#")) ===
    "kept"
  ) {
    const current = plan.read(ignorePath) ?? "";
    if (!/^CHANGELOG\.md$/m.test(current)) {
      plan.warn(
        ".prettierignore does not ignore CHANGELOG.md; `format:check` will fail after a Release. Add it.",
      );
    }
  }

  plan.ensureDevDependency("prettier", THIRD_PARTY_RANGES.prettier);
  plan.ensureDevDependency(
    PRETTIER_CONFIG,
    sharedPackageRange(PRETTIER_CONFIG),
  );
  plan.setScript("prettier", "format", "prettier --write .");
  plan.setScript("prettier", "format:check", "prettier --check .");
}
