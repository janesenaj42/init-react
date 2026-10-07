import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { OWN_VERSION } from "../src/constants.js";
import { stamp } from "../src/managed.js";
import { HOOKS_FILE } from "../src/steps/hooks.js";
import { release } from "../src/release.js";
import { planSetup } from "../src/setup.js";
import { UserError } from "../src/util.js";
import {
  addProject,
  applySetup,
  makeRepo,
  read,
  readJson,
  write,
} from "./helpers.js";

describe("setup on a Vite project inside a larger repository", () => {
  it("replaces Vite's ESLint default and wires everything up", () => {
    const repo = makeRepo("vite8", { relDir: "frontend" });
    applySetup(repo.project);

    const pkg = readJson(join(repo.project, "package.json"));
    expect(read(join(repo.project, "eslint.config.js"))).toContain(
      "@janesenaj42/eslint-config",
    );
    expect(pkg.devDependencies["eslint-plugin-react-hooks"]).toBeUndefined();
    expect(pkg.devDependencies["@janesenaj42/eslint-config"]).toBe(
      `^${OWN_VERSION}`,
    );
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.prepare).toBe("lefthook install");
    expect(pkg.scripts.typecheck).toBe("tsc -b");
    expect(pkg["init-react"]).toEqual({
      releaseBranch: "main",
      tagPrefix: "frontend@",
    });
    expect(read(join(repo.project, ".npmrc"))).toContain(
      "@janesenaj42:registry=https://npm.pkg.github.com",
    );

    // The Standard also documents its scripts in the Target Project's own README,
    // so the team can find them without reading this CLI's docs.
    const readme = read(join(repo.project, "README.md"));
    expect(readme).toContain("<!-- >>> init-react >>> -->");
    expect(readme).toContain("| `npm run lint` | Lint with ESLint |");
    expect(readme).toContain(
      "`npm run release:alpha` / `npm run release:beta`",
    );

    // Hooks belong to the repository, so they live at its root.
    expect(read(join(repo.root, HOOKS_FILE))).toContain("root: frontend/");
    expect(read(join(repo.root, "lefthook.yml"))).toContain(`- ${HOOKS_FILE}`);
    // CI belongs to the CI team: the CLI writes none.
    expect(existsSync(join(repo.root, ".github"))).toBe(false);
    expect(existsSync(join(repo.root, ".gitlab-ci.yml"))).toBe(false);
  });

  it("changes nothing when run again", () => {
    const repo = makeRepo("vite8", { relDir: "frontend" });
    applySetup(repo.project);
    const again = planSetup(repo.project, { dryRun: true, force: new Set() });
    expect(again.hasChanges).toBe(false);
  });

  it("replaces Vite 9's oxlint default with ESLint", () => {
    const repo = makeRepo("vite9");
    applySetup(repo.project);
    const pkg = readJson(join(repo.project, "package.json"));
    expect(existsSync(join(repo.project, ".oxlintrc.json"))).toBe(false);
    expect(pkg.devDependencies.oxlint).toBeUndefined();
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg["init-react"].tagPrefix).toBe("v");
  });

  it("shares one set of hooks between projects in the same repository", () => {
    const repo = makeRepo("vite8", { relDir: "apps/web" });
    applySetup(repo.project);
    const admin = addProject(repo.root, "vite8", "apps/admin");
    applySetup(admin);
    const hooks = parse(read(join(repo.root, HOOKS_FILE)));
    const group = hooks["pre-commit"].jobs[0].group;
    expect(group.jobs.map((job: { root: string }) => job.root)).toEqual([
      "apps/admin/",
      "apps/web/",
    ]);
    expect(hooks["commit-msg"].jobs[0].run).toContain(
      'for dir in "apps/admin" "apps/web"',
    );
  });
});

describe("Existing Config", () => {
  it("keeps an edited config and a custom script unless forced", () => {
    const repo = makeRepo("vite8");
    const eslintPath = join(repo.project, "eslint.config.js");
    write(eslintPath, read(eslintPath) + "// team tweak\n");
    const pkgPath = join(repo.project, "package.json");
    const pkg = readJson(pkgPath);
    pkg.scripts.format = "prettier --write src";
    write(pkgPath, JSON.stringify(pkg, null, 2));

    applySetup(repo.project);
    expect(read(eslintPath)).toContain("// team tweak");
    expect(readJson(pkgPath).scripts.format).toBe("prettier --write src");

    applySetup(repo.project, { force: ["eslint"] });
    expect(read(eslintPath)).toContain("@janesenaj42/eslint-config");
    expect(readJson(pkgPath).scripts.format).toBe("prettier --write src");
  });

  it("updates an unedited Managed File written by an older release", () => {
    const repo = makeRepo("vite8");
    const eslintPath = join(repo.project, "eslint.config.js");
    write(eslintPath, stamp("export default [];\n", "//"));
    applySetup(repo.project);
    expect(read(eslintPath)).toContain("@janesenaj42/eslint-config");
  });

  it("keeps a Managed File someone has edited", () => {
    const repo = makeRepo("vite8");
    const eslintPath = join(repo.project, "eslint.config.js");
    write(
      eslintPath,
      stamp("export default [];\n", "//").replace("[]", "[{}]"),
    );
    applySetup(repo.project);
    expect(read(eslintPath)).toContain("[{}]");
  });
});

describe("a repository with its own lefthook config", () => {
  const own =
    "# Repo hooks\npre-commit:\n  parallel: true\n  commands:\n    json-valid:\n      run: echo ok # keep\n";

  it("extends it with the Standard's hooks, leaving the rest alone", () => {
    const repo = makeRepo("vite8", { relDir: "frontend/appbar" });
    const configPath = join(repo.root, "lefthook.yml");
    write(configPath, own);
    applySetup(repo.project);

    const config = read(configPath);
    expect(config.startsWith(own)).toBe(true);
    expect(parse(config)).toMatchObject({
      extends: [HOOKS_FILE],
      "pre-commit": { parallel: true },
    });

    applySetup(repo.project);
    expect(read(configPath)).toBe(config);
  });

  it("asks rather than edits when it already extends other files", () => {
    const repo = makeRepo("vite8");
    const configPath = join(repo.root, "lefthook.yml");
    write(configPath, own + "extends:\n  - shared.yml\n");
    const plan = applySetup(repo.project);
    expect(read(configPath)).not.toContain(HOOKS_FILE);
    expect(
      plan.entries.some(
        (e) => e.kind === "keep" && e.text.includes(`Add ${HOOKS_FILE}`),
      ),
    ).toBe(true);
  });
});

describe("README", () => {
  it("adds its block to an existing README without touching the rest", () => {
    const repo = makeRepo("vite8");
    write(
      join(repo.project, "README.md"),
      "# My App\n\nSome docs the team wrote.\n",
    );
    applySetup(repo.project);
    const readme = read(join(repo.project, "README.md"));
    expect(readme).toContain("# My App\n\nSome docs the team wrote.");
    expect(readme).toContain("<!-- >>> init-react >>> -->");
  });

  it("overwrites its own block, like the shared git hooks file", () => {
    const repo = makeRepo("vite8");
    applySetup(repo.project);
    const path = join(repo.project, "README.md");
    write(path, read(path).replace("Lint with ESLint", "Lint with ESLint!!"));
    applySetup(repo.project);
    expect(read(path)).not.toContain("Lint with ESLint!!");
    expect(read(path)).toContain("Lint with ESLint");
  });

  it("uses the project's package manager to run scripts", () => {
    const repo = makeRepo("vite8");
    write(join(repo.project, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
    applySetup(repo.project);
    expect(read(join(repo.project, "README.md"))).toContain(
      "| `pnpm lint` | Lint with ESLint |",
    );
  });
});

describe("without git", () => {
  it("sets up everything but hooks", () => {
    const repo = makeRepo("vite8", { git: false });
    const plan = applySetup(repo.project);
    expect(existsSync(join(repo.project, HOOKS_FILE))).toBe(false);
    expect(existsSync(join(repo.project, "lefthook.yml"))).toBe(false);
    expect(
      plan.entries.some(
        (e) => e.kind === "warn" && e.text.includes("git init"),
      ),
    ).toBe(true);
  });
});

describe("Release guards", () => {
  it("refuses a full Release off the Release Branch", () => {
    const repo = makeRepo("vite8");
    applySetup(repo.project, { releaseBranch: "dev" });
    repo.git("add", "-A");
    repo.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "chore: init");
    expect(() => release("patch", repo.project)).toThrow(UserError);
    expect(() => release("patch", repo.project)).toThrow(
      /Release Branch "dev"/,
    );
  });

  it("refuses to release with uncommitted changes", () => {
    const repo = makeRepo("vite8");
    applySetup(repo.project);
    repo.git("add", "-A");
    repo.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "chore: init");
    write(join(repo.project, "dirty.txt"), "x");
    expect(() => release("rc", repo.project)).toThrow(/uncommitted/);
  });

  it("rejects unknown release types", () => {
    expect(() => release("hotfix", ".")).toThrow(/Unknown release type/);
  });
});

describe("--skip", () => {
  it("leaves commitlint to the repository, and remembers it", () => {
    const repo = makeRepo("vite8", { relDir: "web" });
    applySetup(repo.project, { skip: ["commitlint"] });

    const pkg = readJson(join(repo.project, "package.json"));
    expect(pkg["init-react"]).toEqual({
      skip: ["commitlint"],
      releaseBranch: "main",
      tagPrefix: "web@",
    });
    expect(existsSync(join(repo.project, "commitlint.config.js"))).toBe(false);
    expect(pkg.devDependencies["@commitlint/cli"]).toBeUndefined();
    const hooks = parse(read(join(repo.root, HOOKS_FILE)));
    expect(hooks["commit-msg"]).toBeUndefined();
    expect(hooks["pre-commit"]).toBeDefined();

    // A later run without --skip keeps skipping it.
    const again = planSetup(repo.project, { dryRun: true, force: new Set() });
    expect(again.hasChanges).toBe(false);
  });

  it("is cleared with an empty list (--skip=none)", () => {
    const repo = makeRepo("vite8");
    applySetup(repo.project, { skip: ["commitlint"] });
    applySetup(repo.project, { skip: [] });
    const pkg = readJson(join(repo.project, "package.json"));
    expect(pkg["init-react"].skip).toBeUndefined();
    expect(existsSync(join(repo.project, "commitlint.config.js"))).toBe(true);
  });

  it("keeps the other projects' hooks in a shared repository", () => {
    const repo = makeRepo("vite8", { relDir: "web" });
    const admin = addProject(repo.root, "vite8", "admin");
    applySetup(repo.project, { skip: ["commitlint"] });
    applySetup(admin);
    const hooks = read(join(repo.root, HOOKS_FILE));
    expect(hooks).toContain('# skip: {"web":["commitlint"]}');
    expect(hooks).toMatch(/for dir in "admin"; do/);
    expect(hooks).toContain("lint-staged web");
    expect(hooks).toContain("lint-staged admin");
  });
});

describe("--registry", () => {
  const MIRROR = "https://nexus.acme.internal/repository/npm-group";

  it("installs from a mirror", () => {
    const repo = makeRepo("vite8", { relDir: "web" });
    applySetup(repo.project, { registry: `${MIRROR}/` });

    const pkg = readJson(join(repo.project, "package.json"));
    expect(pkg["init-react"].registry).toBe(MIRROR);
    expect(read(join(repo.project, ".npmrc"))).toContain(
      `@janesenaj42:registry=${MIRROR}`,
    );
    const again = planSetup(repo.project, { dryRun: true, force: new Set() });
    expect(again.hasChanges).toBe(false);
  });

  it("takes the registry from the project's own .npmrc", () => {
    const repo = makeRepo("vite8");
    write(join(repo.project, ".npmrc"), `@janesenaj42:registry=${MIRROR}\n`);
    applySetup(repo.project);
    const pkg = readJson(join(repo.project, "package.json"));
    expect(pkg["init-react"].registry).toBe(MIRROR);
    expect(read(join(repo.project, ".npmrc"))).toBe(
      `@janesenaj42:registry=${MIRROR}\n`,
    );
  });

  it("rejects something that isn't a URL", () => {
    const repo = makeRepo("vite8");
    expect(() =>
      planSetup(repo.project, {
        dryRun: true,
        force: new Set(),
        registry: "nexus",
      }),
    ).toThrow(UserError);
  });
});

describe("a project keeping its own ESLint", () => {
  const LEGACY_CONFIG = '{ "root": true, "extends": ["airbnb"] }\n';

  it("keeps its ESLint version under a kept .eslintrc", () => {
    const repo = makeRepo("vite8");
    const pkgPath = join(repo.project, "package.json");
    const pkg = readJson(pkgPath);
    pkg.devDependencies.eslint = "^8.57.1";
    write(pkgPath, JSON.stringify(pkg, null, 2));
    write(join(repo.project, ".eslintrc.json"), LEGACY_CONFIG);

    const plan = applySetup(repo.project);
    const after = readJson(pkgPath);
    expect(after.devDependencies.eslint).toBe("^8.57.1");
    expect(after.devDependencies["@janesenaj42/eslint-config"]).toBeUndefined();
    expect(read(join(repo.project, ".eslintrc.json"))).toBe(LEGACY_CONFIG);
    // An older ESLint is a warning, not a note: --force=eslint would also upgrade it.
    expect(
      plan.entries.some(
        (e) =>
          e.kind === "warn" &&
          e.text.includes("ESLint version mismatch") &&
          e.text.includes("^8.57.1"),
      ),
    ).toBe(true);
    // Its own ESLint still lints staged files.
    expect(after["lint-staged"]["*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"]).toContain(
      "eslint --fix",
    );
  });

  it("replaces a legacy config and upgrades ESLint with --force=eslint", () => {
    const repo = makeRepo("vite8");
    const pkgPath = join(repo.project, "package.json");
    const pkg = readJson(pkgPath);
    pkg.devDependencies.eslint = "^8.57.1";
    write(pkgPath, JSON.stringify(pkg, null, 2));
    write(join(repo.project, ".eslintrc.json"), LEGACY_CONFIG);

    applySetup(repo.project, { force: ["eslint"] });
    const after = readJson(pkgPath);
    expect(existsSync(join(repo.project, ".eslintrc.json"))).toBe(false);
    expect(read(join(repo.project, "eslint.config.js"))).toContain(
      "@janesenaj42/eslint-config",
    );
    expect(after.devDependencies.eslint).toBe("^10.0.0");
    expect(after.devDependencies["@janesenaj42/eslint-config"]).toBe(
      `^${OWN_VERSION}`,
    );
  });

  it("only notes, without a warning, when the kept config's ESLint is new enough", () => {
    const repo = makeRepo("vite8");
    const pkgPath = join(repo.project, "package.json");
    const pkg = readJson(pkgPath);
    pkg.devDependencies.eslint = "^10.1.0";
    write(pkgPath, JSON.stringify(pkg, null, 2));
    write(join(repo.project, "eslint.config.js"), "export default [];\n");

    const plan = applySetup(repo.project);
    expect(
      plan.entries.some((e) => e.kind === "warn" && e.text.includes("ESLint")),
    ).toBe(false);
    expect(
      plan.entries.some(
        (e) => e.kind === "note" && e.text.includes("your own config is kept"),
      ),
    ).toBe(true);
  });

  it("runs no ESLint from lint-staged when eslint is skipped", () => {
    const repo = makeRepo("vite8");
    applySetup(repo.project, { skip: ["eslint"] });
    const pkg = readJson(join(repo.project, "package.json"));
    expect(pkg["lint-staged"]).toEqual({
      "*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}": ["prettier --write"],
      "*.{json,md,css,scss,html,yml,yaml}": ["prettier --write"],
    });
    expect(pkg.devDependencies["@janesenaj42/eslint-config"]).toBeUndefined();
  });

  it("writes no lint-staged config with eslint and prettier both skipped", () => {
    const repo = makeRepo("vite8");
    const plan = applySetup(repo.project, { skip: ["eslint", "prettier"] });
    expect(readJson(join(repo.project, "package.json"))["lint-staged"]).toBe(
      undefined,
    );
    expect(
      plan.entries.some(
        (e) => e.kind === "warn" && e.text.includes("lint-staged"),
      ),
    ).toBe(true);
  });
});
