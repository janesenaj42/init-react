import { basename, join } from "node:path";
import { CLI_PACKAGE, SCOPE } from "../constants.js";
import type { Plan } from "../plan.js";
import { registryTokenVariable } from "../settings.js";
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
  // Each setting on its own, so other settings saved beside them (--skip, --registry)
  // don't make the whole "init-react" object look like Existing Config.
  plan.setSetting(
    "releaseBranch",
    releaseBranchFlag ?? current.releaseBranch ?? "main",
  );
  // Each Target Project releases independently; in a shared repository its tags
  // carry its folder name so they never collide with another project's.
  plan.setSetting(
    "tagPrefix",
    current.tagPrefix ?? (relDir === "." ? "v" : `${basename(dir)}@`),
  );

  plan.ensureDevDependency(CLI_PACKAGE, sharedPackageRange(CLI_PACKAGE));
  for (const type of [...FULL_RELEASES, ...PRERELEASES]) {
    plan.setScript("release", `release:${type}`, `init-react release ${type}`);
  }
}

/**
 * Points the Standard's scope at the project's registry (settings.ts, resolveRegistry) so
 * its packages install. Only the registry goes in the project's .npmrc; a token never does.
 */
export function registryStep(plan: Plan): void {
  const { registry } = plan;
  const line = `${SCOPE}:registry=${registry}`;
  if (plan.project.yarnBerry) {
    plan.warn(
      `Yarn Berry does not read .npmrc. Add to .yarnrc.yml:\n      npmScopes:\n        ${SCOPE.slice(1)}:\n          npmRegistryServer: "${registry}"\n          npmAuthToken: "\${${registryTokenVariable(registry)}-}"`,
    );
    return;
  }
  const path = join(plan.project.dir, ".npmrc");
  const current = plan.read(path) ?? "";
  const pattern = new RegExp(`^${SCOPE}:registry=(.*)$`, "m");
  const existing = pattern.exec(current);
  if (existing?.[1]?.trim().replace(/\/+$/, "") === registry) return;
  if (existing) {
    plan.write(path, current.replace(pattern, line), `${SCOPE} registry`);
    return;
  }
  plan.write(
    path,
    current.replace(/\s*$/, current.trim() ? "\n" : "") + line + "\n",
    `${SCOPE} registry`,
  );
}
