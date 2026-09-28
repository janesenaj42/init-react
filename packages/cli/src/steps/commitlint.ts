import { join } from "node:path";
import { COMMITLINT_CONFIG, THIRD_PARTY_RANGES } from "../constants.js";
import { stamp } from "../managed.js";
import type { Plan } from "../plan.js";
import { configFileName, sharedPackageRange } from "./standard.js";

const CANDIDATES = [
  ".commitlintrc",
  ".commitlintrc.json",
  ".commitlintrc.yaml",
  ".commitlintrc.yml",
  ".commitlintrc.js",
  ".commitlintrc.cjs",
  ".commitlintrc.mjs",
  ".commitlintrc.ts",
  ".commitlintrc.cts",
  "commitlint.config.js",
  "commitlint.config.cjs",
  "commitlint.config.mjs",
  "commitlint.config.ts",
  "commitlint.config.cts",
  "commitlint.config.mts",
];

const BODY = `export { default } from "${COMMITLINT_CONFIG}";
`;

/** The Commit Convention: commitlint checks messages, commitizen helps write them. */
export function commitlintStep(plan: Plan): void {
  const { dir, esm } = plan.project;

  plan.reconcileConfigFile({
    tool: "commitlint",
    target: join(dir, configFileName("commitlint.config", esm)),
    content: stamp(BODY, "//"),
    candidates: CANDIDATES.map((name) => join(dir, name)),
    pkgKey: "commitlint",
    snippet: `export { default } from "${COMMITLINT_CONFIG}";`,
  });

  plan.ensureDevDependency(
    "@commitlint/cli",
    THIRD_PARTY_RANGES["@commitlint/cli"],
  );
  plan.ensureDevDependency(
    COMMITLINT_CONFIG,
    sharedPackageRange(COMMITLINT_CONFIG),
  );
  plan.ensureDevDependency("commitizen", THIRD_PARTY_RANGES.commitizen);
  plan.ensureDevDependency(
    "cz-conventional-changelog",
    THIRD_PARTY_RANGES["cz-conventional-changelog"],
  );
  plan.setScript("commitlint", "commit", "cz");
  plan.setPkgValue("commitlint", ["config", "commitizen"], {
    path: "cz-conventional-changelog",
  });
}
