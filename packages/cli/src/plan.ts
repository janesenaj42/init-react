import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative } from "node:path";
import semver from "semver";
import { DEFAULT_REGISTRY, type Tool } from "./constants.js";
import { isScaffoldDefault } from "./fingerprints.js";
import { isUneditedManagedFile } from "./managed.js";
import type { PackageJson, Project } from "./project.js";
import { normalize, readTextOrNull, toPosix } from "./util.js";

type LogKind = "create" | "update" | "delete" | "keep" | "warn" | "note";

interface LogEntry {
  kind: LogKind;
  text: string;
}

/**
 * Everything a run would change, staged in memory. A Dry Run prints it;
 * a real run prints it and then applies it.
 */
export class Plan {
  readonly pkg: PackageJson;
  readonly entries: LogEntry[] = [];
  private readonly files = new Map<string, string | null>();
  private readonly originalPkg: string;
  needsInstall = false;

  constructor(
    readonly project: Project,
    private readonly forced: ReadonlySet<Tool>,
    private readonly skipped: ReadonlySet<Tool> = new Set(),
    /** Where the Standard's packages install from (settings.ts, resolveRegistry). */
    readonly registry: string = DEFAULT_REGISTRY,
  ) {
    this.pkg = structuredClone(project.pkg);
    this.originalPkg = JSON.stringify(project.pkg);
  }

  isForced(tool: Tool): boolean {
    return this.forced.has(tool);
  }

  /** A tool left to something else (--skip): its step doesn't run. */
  isSkipped(tool: Tool): boolean {
    return this.skipped.has(tool);
  }

  /**
   * Saves one of the project's own settings (package.json "init-react"). Unlike
   * setPkgValue, the value always comes from the user (a flag), so it replaces the old one;
   * undefined removes it.
   */
  setSetting(key: string, value: unknown): void {
    const settings = (this.pkg["init-react"] ?? {}) as Record<string, unknown>;
    if (deepEqual(settings[key], value)) return;
    const next = { ...settings };
    if (value === undefined) delete next[key];
    else next[key] = value;
    this.pkg["init-react"] = next;
    this.log(
      value === undefined
        ? "delete"
        : settings[key] === undefined
          ? "create"
          : "update",
      `package.json init-react.${key}${value === undefined ? "" : ` ${JSON.stringify(value)}`}`,
    );
  }

  /** The file's content as this plan would leave it. */
  read(path: string): string | null {
    return this.files.has(path) ? this.files.get(path)! : readTextOrNull(path);
  }

  write(path: string, content: string, reason = ""): void {
    const existed = this.read(path) !== null;
    this.files.set(path, content);
    this.log(
      existed ? "update" : "create",
      `${this.display(path)}${reason ? ` (${reason})` : ""}`,
    );
  }

  delete(path: string, reason = ""): void {
    this.files.set(path, null);
    this.log("delete", `${this.display(path)}${reason ? ` (${reason})` : ""}`);
  }

  log(kind: LogKind, text: string): void {
    this.entries.push({ kind, text });
  }

  warn(text: string): void {
    this.log("warn", text);
  }

  note(text: string): void {
    this.log("note", text);
  }

  display(path: string): string {
    const base = this.project.gitRoot ?? this.project.dir;
    return toPosix(relative(base, path)) || basename(path);
  }

  /** Whether the package.json would change. */
  get pkgChanged(): boolean {
    return JSON.stringify(this.pkg) !== this.originalPkg;
  }

  get hasChanges(): boolean {
    return this.pkgChanged || this.files.size > 0;
  }

  apply(): void {
    for (const [path, content] of this.files) {
      if (content === null) {
        rmSync(path, { force: true });
      } else {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, content);
      }
    }
    if (this.pkgChanged) {
      writeFileSync(
        join(this.project.dir, "package.json"),
        JSON.stringify(this.pkg, null, this.project.pkgIndent) + "\n",
      );
    }
  }

  // ---- package.json helpers ------------------------------------------------

  /**
   * Sets one package.json setting. Each setting is judged on its own: a missing one
   * is added, a Scaffold Default one is replaced, and any other value is Existing
   * Config and kept unless the tool is forced.
   */
  setPkgValue(
    tool: Tool,
    path: string[],
    desired: unknown,
    options: { scaffoldValues?: ReadonlySet<unknown> } = {},
  ): "set" | "unchanged" | "kept" {
    const label = `package.json ${path.join(".")}`;
    const parent = this.pkgParent(path);
    const key = path.at(-1)!;
    const current = parent[key];
    if (current !== undefined && deepEqual(current, desired))
      return "unchanged";
    if (
      current === undefined ||
      options.scaffoldValues?.has(current) ||
      this.isForced(tool)
    ) {
      parent[key] = desired;
      this.log(
        current === undefined ? "create" : "update",
        `${label}${current === undefined ? "" : ` (was ${JSON.stringify(current)})`}`,
      );
      return "set";
    }
    this.log(
      "keep",
      `${label} is your own (${JSON.stringify(current)}); the Standard wants ${JSON.stringify(desired)}. Use --force=${tool} to replace it.`,
    );
    return "kept";
  }

  setScript(
    tool: Tool,
    name: string,
    command: string,
    scaffoldValues?: ReadonlySet<unknown>,
  ): "set" | "unchanged" | "kept" {
    return this.setPkgValue(tool, ["scripts", name], command, {
      scaffoldValues,
    });
  }

  /**
   * Makes sure a dependency is installed at a range the Standard was tested with.
   * Dependencies are requirements of the Standard, not config, so an incompatible
   * range is updated rather than kept.
   */
  ensureDevDependency(name: string, range: string): void {
    const section =
      this.pkg.dependencies?.[name] !== undefined
        ? "dependencies"
        : "devDependencies";
    const deps = (this.pkg[section] ??= {});
    const current = deps[name];
    if (current !== undefined && rangeSatisfies(current, range)) return;
    deps[name] = range;
    this.pkg[section] = sortKeys(deps);
    this.needsInstall = true;
    this.log(
      current === undefined ? "create" : "update",
      `package.json ${section}.${name} ${range}${current === undefined ? "" : ` (was ${current})`}`,
    );
  }

  removeDevDependency(name: string, reason: string): void {
    if (this.pkg.devDependencies?.[name] === undefined) return;
    delete this.pkg.devDependencies[name];
    this.needsInstall = true;
    this.log("delete", `package.json devDependencies.${name} (${reason})`);
  }

  removePkgKey(key: string, reason: string): void {
    if (this.pkg[key] === undefined) return;
    delete this.pkg[key];
    this.log("delete", `package.json ${key} (${reason})`);
  }

  private pkgParent(path: string[]): Record<string, unknown> {
    let node = this.pkg as Record<string, unknown>;
    for (const key of path.slice(0, -1)) {
      const next = node[key];
      if (typeof next !== "object" || next === null) node[key] = {};
      node = node[key] as Record<string, unknown>;
    }
    return node;
  }

  // ---- config file helper --------------------------------------------------

  /**
   * Reconciles one tool's config file. `candidates` are every file name the tool
   * would read its config from; if any holds Existing Config, the Standard is not
   * written (unless forced) because the tool would read only one of them.
   */
  reconcileConfigFile(options: {
    tool: Tool;
    target: string;
    content: string;
    candidates: string[];
    pkgKey?: string;
    snippet?: string;
  }): { outcome: "written" | "unchanged" | "kept"; replacedScaffold: boolean } {
    const { tool, target, content, candidates, pkgKey, snippet } = options;
    const blockers: string[] = [];
    const replaceable: { path: string; reason: string }[] = [];
    let upToDate = false;

    for (const path of candidates) {
      const text = this.read(path);
      if (text === null) continue;
      if (path === target && normalize(text) === normalize(content)) {
        upToDate = true;
      } else if (isUneditedManagedFile(text)) {
        replaceable.push({ path, reason: "unedited Managed File" });
      } else if (isScaffoldDefault(basename(path), text)) {
        replaceable.push({ path, reason: "unedited Vite default" });
      } else {
        blockers.push(path);
      }
    }
    const pkgKeyBlocks = pkgKey !== undefined && this.pkg[pkgKey] !== undefined;

    if ((blockers.length > 0 || pkgKeyBlocks) && !this.isForced(tool)) {
      const where = [
        ...blockers.map((path) => this.display(path)),
        ...(pkgKeyBlocks ? [`package.json "${pkgKey}"`] : []),
      ].join(", ");
      this.log(
        "keep",
        snippet
          ? `${where}: your own ${tool} config. To use the Standard, add this to it, or re-run with --force=${tool}:\n${indent(snippet)}`
          : `${where}: edited by you, so it is kept. Re-run with --force=${tool} to replace it.`,
      );
      return { outcome: "kept", replacedScaffold: false };
    }

    for (const path of blockers) {
      if (path !== target) this.delete(path, `replaced by --force=${tool}`);
    }
    if (pkgKeyBlocks) this.removePkgKey(pkgKey!, `replaced by --force=${tool}`);
    for (const { path, reason } of replaceable) {
      if (path !== target) this.delete(path, reason);
    }
    const replacedScaffold = replaceable.some((r) => r.reason.includes("Vite"));
    if (upToDate) return { outcome: "unchanged", replacedScaffold };

    const replacing =
      replaceable.find((r) => r.path === target)?.reason ??
      (blockers.includes(target) ? `--force=${tool}` : "");
    this.write(target, content, replacing ? `replacing ${replacing}` : "");
    return { outcome: "written", replacedScaffold };
  }
}

/** Reconciles a file the CLI owns outright (CI jobs, .prettierignore): write unless Existing Config. */
export function reconcileManagedFile(
  plan: Plan,
  tool: Tool,
  path: string,
  content: string,
): "written" | "unchanged" | "kept" {
  return plan.reconcileConfigFile({
    tool,
    target: path,
    content,
    candidates: [path],
  }).outcome;
}

function rangeSatisfies(current: string, wanted: string): boolean {
  if (current === wanted) return true;
  if (/^(workspace|file|link|portal|catalog):/.test(current)) return true;
  const min = semver.validRange(current) ? semver.minVersion(current) : null;
  return min !== null && semver.satisfies(min, wanted);
}

function sortKeys(record: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b)),
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function indent(text: string): string {
  return text
    .split("\n")
    .map((line) => `      ${line}`)
    .join("\n");
}
