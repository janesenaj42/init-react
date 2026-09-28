import { basename, join } from "node:path";
import { CLI_PACKAGE, REGISTRY, SCOPE } from "../constants.js";
import type { Plan } from "../plan.js";
import { sharedPackageRange } from "./standard.js";

export const FULL_RELEASES = ["patch", "minor", "major"] as const;
export const PRERELEASES = ["alpha", "beta", "rc"] as const;
export type ReleaseType =
  (typeof FULL_RELEASES)[number] | (typeof PRERELEASES)[number];

export interface ReleaseSettings {
  releaseBranch: string;
  tagPrefix: string;
}

/** Stores the project's Release settings in package.json and adds the release scripts. */
export function releaseStep(
  plan: Plan,
  releaseBranchFlag: string | undefined,
): void {
  const { relDir, dir } = plan.project;
  const current = (plan.pkg["init-react"] ?? {}) as Partial<ReleaseSettings>;
  // Each Target Project releases independently; in a shared repository its tags
  // carry its folder name so they never collide with another project's.
  const settings: ReleaseSettings = {
    releaseBranch: releaseBranchFlag ?? current.releaseBranch ?? "main",
    tagPrefix:
      current.tagPrefix ?? (relDir === "." ? "v" : `${basename(dir)}@`),
  };
  plan.setPkgValue("release", ["init-react"], { ...current, ...settings });

  plan.ensureDevDependency(CLI_PACKAGE, sharedPackageRange(CLI_PACKAGE));
  for (const type of [...FULL_RELEASES, ...PRERELEASES]) {
    plan.setScript("release", `release:${type}`, `init-react release ${type}`);
  }
}

/** Points the Standard's scope at GitHub Packages so its packages install. */
export function registryStep(plan: Plan): void {
  const line = `${SCOPE}:registry=${REGISTRY}`;
  if (plan.project.yarnBerry) {
    plan.warn(
      `Yarn Berry does not read .npmrc. Add to .yarnrc.yml:\n      npmScopes:\n        ${SCOPE.slice(1)}:\n          npmRegistryServer: "${REGISTRY}"\n          npmAuthToken: "\${GITHUB_PACKAGES_TOKEN-}"`,
    );
    return;
  }
  const path = join(plan.project.dir, ".npmrc");
  const current = plan.read(path) ?? "";
  const existing = new RegExp(`^${SCOPE}:registry=(.*)$`, "m").exec(current);
  if (existing?.[1]?.trim() === REGISTRY) return;
  if (existing) {
    plan.log(
      "keep",
      `.npmrc points ${SCOPE} at ${existing[1]}; the Standard's packages are published to ${REGISTRY}.`,
    );
    return;
  }
  plan.write(
    path,
    current.replace(/\s*$/, current.trim() ? "\n" : "") + line + "\n",
    `${SCOPE} registry`,
  );
}
