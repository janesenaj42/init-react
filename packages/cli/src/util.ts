import { spawnSync, type SpawnSyncOptions } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";

/** An error caused by the user's project or input; printed without a stack trace. */
export class UserError extends Error {}

export function readTextOrNull(path: string): string | null {
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}

/** Normalises line endings and trailing whitespace so fingerprints survive editors and git autocrlf. */
export function normalize(text: string): string {
  return (
    text
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n")
      .trim() + "\n"
  );
}

export function sha256(text: string): string {
  return createHash("sha256").update(normalize(text)).digest("hex");
}

/** Runs a command and returns trimmed stdout, or null when it fails. */
export function capture(
  command: string,
  args: string[],
  cwd: string,
): string | null {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

/** Runs a command with inherited output; returns its exit code. */
export function run(
  command: string,
  args: string[],
  options: SpawnSyncOptions = {},
): number {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    // npm, pnpm and yarn are .cmd shims on Windows.
    shell: process.platform === "win32",
    ...options,
  });
  return result.status ?? 1;
}

export function toPosix(path: string): string {
  return path.replace(/\\/g, "/");
}
