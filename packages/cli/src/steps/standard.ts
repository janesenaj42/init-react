import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { OWN_VERSION } from "../constants.js";
import type { Plan } from "../plan.js";
import type { Project } from "../project.js";

/**
 * The range to install a Shared Config Package at. The packages are released in
 * lockstep with this CLI, so it installs the versions it was released with.
 *
 * INIT_REACT_LOCAL_TARBALLS points at a folder of `pnpm pack` tarballs, so the
 * CLI can be tested end to end before anything is published.
 */
export function sharedPackageRange(name: string): string {
  const dir = process.env.INIT_REACT_LOCAL_TARBALLS;
  if (dir && existsSync(dir)) {
    const prefix = name.replace(/^@/, "").replace("/", "-") + "-";
    const tarball = readdirSync(dir).find(
      (file) =>
        file.startsWith(prefix) &&
        file.endsWith(".tgz") &&
        /^\d/.test(file.slice(prefix.length)),
    );
    if (tarball)
      return `file:${resolve(join(dir, tarball)).replace(/\\/g, "/")}`;
  }
  return `^${OWN_VERSION}`;
}

/** A `typecheck` script, for developers and for the CI team's pipeline. */
export function typecheckStep(plan: Plan): void {
  plan.setScript(
    "typecheck",
    "typecheck",
    plan.project.tsProjectReferences ? "tsc -b" : "tsc --noEmit",
  );
}

/** Config files use `.js` in ESM projects (Vite's default) and `.mjs` otherwise. */
export function configFileName(base: string, esm: boolean): string {
  return `${base}.${esm ? "js" : "mjs"}`;
}

/** How to invoke a package.json script with this project's package manager. */
export function runScript(project: Project, script: string): string {
  return project.pm === "npm" ? `npm run ${script}` : `${project.pm} ${script}`;
}
