import { execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Tool } from "../src/constants.js";
import { planSetup } from "../src/setup.js";

const FIXTURES = join(import.meta.dirname, "fixtures");

export interface Repo {
  root: string;
  project: string;
  git: (...args: string[]) => string;
}

/** A git repository holding a Vite fixture at `relDir`, optionally next to other projects. */
export function makeRepo(
  fixture: "vite8" | "vite9",
  options: { relDir?: string; origin?: string | null; git?: boolean } = {},
): Repo {
  const root = mkdtempSync(join(tmpdir(), "init-react-test-"));
  const project = options.relDir ? join(root, options.relDir) : root;
  mkdirSync(project, { recursive: true });
  cpSync(join(FIXTURES, fixture), project, { recursive: true });
  const git = (...args: string[]) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: "t",
        GIT_AUTHOR_EMAIL: "t@t",
        GIT_COMMITTER_NAME: "t",
        GIT_COMMITTER_EMAIL: "t@t",
      },
    }).trim();
  if (options.git !== false) {
    git("init", "-q", "-b", "main");
    git("config", "core.autocrlf", "false");
    const origin =
      options.origin === undefined
        ? "git@github.com:acme/app.git"
        : options.origin;
    if (origin) git("remote", "add", "origin", origin);
  }
  return { root, project, git };
}

/** Adds another fixture project to an existing repository. */
export function addProject(
  root: string,
  fixture: "vite8" | "vite9",
  relDir: string,
): string {
  const project = join(root, relDir);
  cpSync(join(FIXTURES, fixture), project, { recursive: true });
  return project;
}

export function applySetup(
  dir: string,
  options: {
    force?: Tool[];
    skip?: Tool[];
    registry?: string;
    ci?: "github" | "gitlab" | "none";
    releaseBranch?: string;
  } = {},
) {
  const plan = planSetup(dir, {
    dryRun: false,
    force: new Set(options.force ?? []),
    skip: options.skip ? new Set(options.skip) : undefined,
    registry: options.registry,
    ci: options.ci,
    releaseBranch: options.releaseBranch,
  });
  plan.apply();
  return plan;
}

export function readJson(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function read(path: string): string {
  return readFileSync(path, "utf8");
}

export function write(path: string, content: string): void {
  writeFileSync(path, content);
}
