import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { OWN_VERSION } from "../constants.js";

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

/** Config files use `.js` in ESM projects (Vite's default) and `.mjs` otherwise. */
export function configFileName(base: string, esm: boolean): string {
  return `${base}.${esm ? "js" : "mjs"}`;
}
