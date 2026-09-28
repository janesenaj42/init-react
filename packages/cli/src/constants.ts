import { readFileSync } from "node:fs";

// The package scope. `pnpm set-scope <new-scope>` at the repo root rewrites every
// occurrence, so moving from a personal account to an org is one command.
export const SCOPE = "@janesenaj42";
export const REGISTRY = "https://npm.pkg.github.com";

export const CLI_PACKAGE = `${SCOPE}/init-react`;
export const ESLINT_CONFIG = `${SCOPE}/eslint-config`;
export const PRETTIER_CONFIG = `${SCOPE}/prettier-config`;
export const COMMITLINT_CONFIG = `${SCOPE}/commitlint-config`;

/** Tools the user can name in `--force`. */
export const TOOLS = [
  "eslint",
  "prettier",
  "commitlint",
  "lint-staged",
  "husky",
  "ci",
  "release",
] as const;
export type Tool = (typeof TOOLS)[number];

/** Third-party packages installed into a Target Project, at the ranges this release was tested with. */
export const THIRD_PARTY_RANGES = {
  eslint: "^10.0.0",
  prettier: "^3.9.9",
  husky: "^9.1.7",
  "lint-staged": "^16.4.0",
  "@commitlint/cli": "^21.2.3",
  commitizen: "^4.3.2",
  "cz-conventional-changelog": "^3.3.0",
} as const;

// src/constants.ts and dist/index.js both sit one level below package.json.
const ownPackageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
) as { version: string };

/** The version of this CLI; the Shared Config Packages are released in lockstep with it. */
export const OWN_VERSION = ownPackageJson.version;
