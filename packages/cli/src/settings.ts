import { join } from "node:path";
import { DEFAULT_REGISTRY, SCOPE, TOOLS, type Tool } from "./constants.js";
import type { Project } from "./project.js";
import { readTextOrNull, UserError } from "./util.js";

/** A Target Project's own choices, kept in its package.json under "init-react". */
export interface ProjectSettings {
  releaseBranch?: string;
  tagPrefix?: string;
  /** Tools left to something else; saved so every later run skips them too. */
  skip?: Tool[];
  /** Registry the Standard's packages install from, when not DEFAULT_REGISTRY. */
  registry?: string;
}

export function savedSettings(project: Project): ProjectSettings {
  return (project.pkg["init-react"] ?? {}) as ProjectSettings;
}

/** --skip wins; without it, the list saved by an earlier run. */
export function resolveSkip(
  project: Project,
  flag: ReadonlySet<Tool> | undefined,
): Set<Tool> {
  if (flag) return new Set(flag);
  const saved = savedSettings(project).skip ?? [];
  return new Set(
    saved.filter((t): t is Tool => (TOOLS as readonly string[]).includes(t)),
  );
}

/**
 * --registry wins; then the one saved by an earlier run; then the project's own .npmrc
 * line for the scope; then where the packages are published.
 */
export function resolveRegistry(
  project: Project,
  flag: string | undefined,
): string {
  const npmrc = readTextOrNull(join(project.dir, ".npmrc")) ?? "";
  const fromNpmrc = new RegExp(`^${SCOPE}:registry=(.+)$`, "m")
    .exec(npmrc)?.[1]
    ?.trim();
  const registry =
    flag ?? savedSettings(project).registry ?? fromNpmrc ?? DEFAULT_REGISTRY;
  let url: URL;
  try {
    url = new URL(registry);
  } catch {
    throw new UserError(`--registry must be a URL, got "${registry}".`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UserError(
      `--registry must be an http(s) URL, got "${registry}".`,
    );
  }
  return registry.replace(/\/+$/, "");
}

export function isGitHubPackages(registry: string): boolean {
  return new URL(registry).hostname === "npm.pkg.github.com";
}

/** The CI variable holding the token for the registry. */
export function registryTokenVariable(registry: string): string {
  return isGitHubPackages(registry)
    ? "GITHUB_PACKAGES_TOKEN"
    : "NPM_REGISTRY_TOKEN";
}

/** The .npmrc key an auth token for the registry goes under: //host/path/:_authToken */
export function registryAuthKey(registry: string): string {
  const url = new URL(registry);
  return `//${url.host}${url.pathname.replace(/\/*$/, "/")}:_authToken`;
}
