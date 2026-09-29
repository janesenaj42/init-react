import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stamp } from "../src/managed.js";
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
    expect(pkg.devDependencies["@janesenaj42/eslint-config"]).toBe("^0.1.0");
    expect(pkg.scripts.lint).toBe("eslint .");
    expect(pkg.scripts.prepare).toBe("cd .. && husky");
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

    // Hooks and CI belong to the repository, so they live at its root.
    expect(read(join(repo.root, ".husky/pre-commit"))).toContain(
      'for dir in "frontend"',
    );
    expect(
      existsSync(join(repo.root, ".github/workflows/init-react-frontend.yml")),
    ).toBe(true);
    expect(
      existsSync(
        join(repo.root, ".github/workflows/init-react-commitlint.yml"),
      ),
    ).toBe(true);
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
    const hook = read(join(repo.root, ".husky/pre-commit"));
    expect(hook).toContain('for dir in "apps/admin" "apps/web"');
    expect(hook.match(/^# >>> /gm)).toHaveLength(1);
    // The shared commitlint workflow still runs from the first project.
    expect(
      read(join(repo.root, ".github/workflows/init-react-commitlint.yml")),
    ).toContain("working-directory: apps/web");
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

describe("GitLab", () => {
  it("only adds include entries to the shared .gitlab-ci.yml", () => {
    const repo = makeRepo("vite8", {
      relDir: "web",
      origin: "git@gitlab.acme.internal:team/app.git",
    });
    const ciPath = join(repo.root, ".gitlab-ci.yml");
    write(
      ciPath,
      "# Java\nstages: [build, test]\ninclude: templates/java.yml\nbuild:\n  script: ./gradlew build # keep\n",
    );
    applySetup(repo.project);
    const ci = read(ciPath);
    expect(ci).toContain("stages: [build, test]");
    expect(ci).toContain("- templates/java.yml");
    expect(ci).toContain("- local: /.gitlab/init-react/web.yml");
    expect(ci).toContain("./gradlew build # keep");
    expect(
      existsSync(join(repo.root, ".gitlab/init-react/commitlint.yml")),
    ).toBe(true);

    applySetup(repo.project);
    expect(read(ciPath).match(/init-react\/web\.yml/g)).toHaveLength(1);
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

  it("overwrites its own block, like the shared git hooks do", () => {
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
  it("sets up everything but hooks and CI", () => {
    const repo = makeRepo("vite8", { git: false });
    const plan = applySetup(repo.project);
    expect(existsSync(join(repo.project, ".husky"))).toBe(false);
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
