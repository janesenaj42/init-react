import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isScaffoldDefault } from "../src/fingerprints.js";
import {
  isUneditedManagedFile,
  MARKDOWN_BLOCK,
  readBlock,
  stamp,
  upsertBlock,
} from "../src/managed.js";

const viteEslint = readFileSync(
  join(import.meta.dirname, "fixtures/vite8/eslint.config.js"),
  "utf8",
);

describe("Scaffold Defaults", () => {
  it("recognises Vite's eslint.config.js, whatever the line endings", () => {
    expect(isScaffoldDefault("eslint.config.js", viteEslint)).toBe(true);
    expect(
      isScaffoldDefault("eslint.config.js", viteEslint.replace(/\n/g, "\r\n")),
    ).toBe(true);
  });

  it("treats an edited file as Existing Config", () => {
    expect(
      isScaffoldDefault("eslint.config.js", viteEslint + "// tweak\n"),
    ).toBe(false);
  });
});

describe("Managed Files", () => {
  it("is unedited right after stamping, even with CRLF", () => {
    const file = stamp("export default 1;\n", "//");
    expect(isUneditedManagedFile(file)).toBe(true);
    expect(isUneditedManagedFile(file.replace(/\n/g, "\r\n"))).toBe(true);
  });

  it("becomes Existing Config once edited", () => {
    const file = stamp("export default 1;\n", "//");
    expect(isUneditedManagedFile(file.replace("1", "2"))).toBe(false);
    expect(isUneditedManagedFile("export default 1;\n")).toBe(false);
  });
});

describe("Managed Blocks", () => {
  it("appends to a user's hook without touching their lines", () => {
    const result = upsertBlock("npm test\n", "echo ours");
    expect(result.startsWith("npm test\n\n")).toBe(true);
    expect(readBlock(result)).toContain("echo ours");
  });

  it("replaces only its own block, keeping shell variables intact", () => {
    const first = upsertBlock("before\n", 'echo "$1"');
    const second = upsertBlock(first + "after\n", 'echo "$1" again');
    expect(second).toContain('echo "$1" again');
    expect(second).toMatch(/^before\n/);
    expect(second).toMatch(/after\n$/);
    expect(second.match(/^# >>> /gm)).toHaveLength(1);
  });

  it("uses HTML comment markers for Markdown, so they render invisibly", () => {
    const result = upsertBlock(
      "# My App\n\nSome docs.\n",
      "## Scripts\n\n...",
      MARKDOWN_BLOCK,
    );
    expect(result).toContain("# My App\n\nSome docs.");
    expect(result).toContain("<!-- >>> init-react >>> -->");
    expect(readBlock(result, MARKDOWN_BLOCK)).toContain("## Scripts");
  });
});
