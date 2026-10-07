import { join } from "node:path";
import YAML, { isMap, isScalar, isSeq } from "yaml";
import { SCOPE } from "../constants.js";
import { isUneditedManagedFile, stamp } from "../managed.js";
import { reconcileManagedFile, type Plan } from "../plan.js";
import type { CiProvider, Project } from "../project.js";
import {
  isGitHubPackages,
  registryAuthKey,
  registryTokenVariable,
} from "../settings.js";

const NODE_VERSION = "22";

// No host is fixed in a CI file: the runner and the image come from variables the
// repository or its org/group can set, with these defaults.
const GITHUB_RUNNER = `\${{ fromJSON(vars.CI_RUNS_ON || '"ubuntu-latest"') }}`;
const GITLAB_IMAGE_VARIABLE = "NODE_IMAGE";

/** The CI Check: the pipeline jobs that actually enforce the Standard on every PR / MR. */
export function ciStep(
  plan: Plan,
  override: CiProvider | "none" | undefined,
): void {
  const { project } = plan;
  plan.setScript(
    "ci",
    "typecheck",
    project.tsProjectReferences ? "tsc -b" : "tsc --noEmit",
  );

  if (override === "none") return;
  const provider = override ?? project.ciProvider;
  if (!project.gitRoot) {
    plan.warn("Not a git repository, so no CI Check was set up.");
    return;
  }
  if (!provider) {
    plan.warn(
      "Could not tell GitHub or GitLab from the `origin` remote, so no CI Check was set up. Use --ci=github or --ci=gitlab.",
    );
    return;
  }
  if (provider === "github") githubCi(plan, project);
  else gitlabCi(plan, project);
}

// ---- shared job pieces -----------------------------------------------------

function pmCommands(project: Project): {
  setup: string[];
  install: string;
  run: string;
} {
  switch (project.pm) {
    case "pnpm":
      return {
        setup: [`npm install -g pnpm@${project.pmVersion ?? "latest"}`],
        install: "pnpm install --frozen-lockfile",
        run: "pnpm run",
      };
    case "yarn":
      return project.yarnBerry
        ? {
            setup: ["corepack enable"],
            install: "yarn install --immutable",
            run: "yarn run",
          }
        : {
            setup: [],
            install: "yarn install --frozen-lockfile",
            run: "yarn run",
          };
    default:
      return { setup: [], install: "npm ci", run: "npm run" };
  }
}

const CHECK_SCRIPTS = ["lint", "format:check", "typecheck"];

/** The shared commitlint job only needs one Target Project to run from; keep the one it has. */
function commitlintProjectDir(
  plan: Plan,
  path: string,
  pattern: RegExp,
): string {
  const current = plan.read(path);
  return (current && pattern.exec(current)?.[1]) || plan.project.relDir;
}

// ---- GitHub Actions --------------------------------------------------------

function githubCi(plan: Plan, project: Project): void {
  const gitRoot = project.gitRoot!;
  const workflows = join(gitRoot, ".github", "workflows");
  const pm = pmCommands(project);
  const dir = project.relDir;
  const paths =
    dir === "."
      ? ""
      : `\n    paths:\n      - "${dir}/**"\n      - ".github/workflows/init-react-${project.slug}.yml"`;

  // GitHub Packages accepts the workflow's own token; any other registry needs a secret.
  const token = isGitHubPackages(plan.registry)
    ? "GITHUB_TOKEN"
    : registryTokenVariable(plan.registry);
  const setupSteps = (workingDir: string) =>
    [
      `      - uses: actions/setup-node@v5`,
      `        with:`,
      `          node-version: ${NODE_VERSION}`,
      `          registry-url: ${plan.registry}`,
      `          scope: "${SCOPE}"`,
      ...pm.setup.map((cmd) => `      - run: ${cmd}`),
      `      - run: ${pm.install}`,
      `        working-directory: ${workingDir}`,
      `        env:`,
      `          NODE_AUTH_TOKEN: \${{ secrets.${token} }}`,
    ].join("\n");

  const checks = `name: "init-react checks: ${project.slug}"
on:
  pull_request:${paths}
  push:
    branches: [${JSON.stringify(releaseBranch(plan))}]${paths}
permissions:
  contents: read
  packages: read
jobs:
  checks:
    runs-on: ${GITHUB_RUNNER}
    defaults:
      run:
        working-directory: ${dir}
    steps:
      - uses: actions/checkout@v5
${setupSteps(dir)}
${CHECK_SCRIPTS.map((script) => `      - run: ${pm.run} ${script}`).join("\n")}
`;
  reconcileManagedFile(
    plan,
    "ci",
    join(workflows, `init-react-${project.slug}.yml`),
    stamp(checks, "#"),
  );
  if (!isGitHubPackages(plan.registry)) {
    plan.note(
      `GitHub: add a repository or organization secret ${token} with a read token for ${plan.registry}, so CI can install the Standard's packages.`,
    );
  }

  if (plan.isSkipped("commitlint")) return;
  const commitlintPath = join(workflows, "init-react-commitlint.yml");
  const clDir = commitlintProjectDir(
    plan,
    commitlintPath,
    /working-directory: (.+)$/m,
  );
  if (!sharedFileMayChange(plan, commitlintPath, clDir)) return;
  const commitlint = `name: "init-react commit convention"
# The Commit Convention covers every commit in the repository, so this runs on every PR.
on:
  pull_request:
permissions:
  contents: read
  packages: read
jobs:
  commitlint:
    runs-on: ${GITHUB_RUNNER}
    defaults:
      run:
        working-directory: ${clDir}
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
${setupSteps(clDir)}
      - run: npx --no -- commitlint --from \${{ github.event.pull_request.base.sha }} --to \${{ github.event.pull_request.head.sha }} --verbose
`;
  reconcileManagedFile(plan, "ci", commitlintPath, stamp(commitlint, "#"));
}

// ---- GitLab CI -------------------------------------------------------------

function gitlabCi(plan: Plan, project: Project): void {
  const gitRoot = project.gitRoot!;
  const folder = join(gitRoot, ".gitlab", "init-react");
  const pm = pmCommands(project);
  const dir = project.relDir;
  const changes = dir === "." ? "**/*" : `${dir}/**/*`;

  const token = registryTokenVariable(plan.registry);
  const beforeScript = (workingDir: string) =>
    [
      `    - cd "${workingDir}"`,
      `    # ${token}: a read token for ${plan.registry}, set as a masked CI/CD variable.`,
      `    - echo "${registryAuthKey(plan.registry)}=\${${token}}" >> ~/.npmrc`,
      ...pm.setup.map((cmd) => `    - ${cmd}`),
      `    - ${pm.install}`,
    ].join("\n");

  const checksFile = `.gitlab/init-react/${project.slug}.yml`;
  const checks = `"init-react:${project.slug}:checks":
  # A CI/CD variable ${GITLAB_IMAGE_VARIABLE} (e.g. an on-prem registry's mirror) overrides this default.
  image: $${GITLAB_IMAGE_VARIABLE}
  variables:
    ${GITLAB_IMAGE_VARIABLE}: node:${NODE_VERSION}
  stage: test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
      changes: ["${changes}"]
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
      changes: ["${changes}"]
  before_script:
${beforeScript(dir)}
  script:
${CHECK_SCRIPTS.map((script) => `    - ${pm.run} ${script}`).join("\n")}
`;
  reconcileManagedFile(
    plan,
    "ci",
    join(gitRoot, checksFile),
    stamp(checks, "#"),
  );

  const commitlintFile = ".gitlab/init-react/commitlint.yml";
  const commitlintPath = join(folder, "commitlint.yml");
  const clDir = commitlintProjectDir(plan, commitlintPath, /- cd "(.+)"$/m);
  const withCommitlint = !plan.isSkipped("commitlint");
  if (withCommitlint && sharedFileMayChange(plan, commitlintPath, clDir)) {
    const commitlint = `# The Commit Convention covers every commit in the repository, so this runs on every MR.
"init-react:commitlint":
  image: $${GITLAB_IMAGE_VARIABLE}
  variables:
    ${GITLAB_IMAGE_VARIABLE}: node:${NODE_VERSION}
    GIT_DEPTH: 0
  stage: test
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
  before_script:
${beforeScript(clDir)}
  script:
    - npx --no -- commitlint --from "$CI_MERGE_REQUEST_DIFF_BASE_SHA" --to "$CI_COMMIT_SHA" --verbose
`;
    reconcileManagedFile(plan, "ci", commitlintPath, stamp(commitlint, "#"));
  }

  addGitlabIncludes(plan, join(gitRoot, ".gitlab-ci.yml"), [
    checksFile,
    ...(withCommitlint ? [commitlintFile] : []),
  ]);
  plan.note(
    `GitLab: set a masked CI/CD variable ${token} (a read token for ${plan.registry}) so CI can install the Standard's packages.`,
  );
}

/**
 * The root .gitlab-ci.yml is shared with other teams: only `include:` entries are
 * added; nothing else in the file changes.
 */
function addGitlabIncludes(plan: Plan, path: string, files: string[]): void {
  const current = plan.read(path);
  const doc =
    current === null ? new YAML.Document({}) : YAML.parseDocument(current);
  if (doc.errors.length > 0) {
    plan.warn(
      `.gitlab-ci.yml could not be parsed, so add these includes yourself: ${files.join(", ")}`,
    );
    return;
  }
  let include = doc.get("include", true);
  if (include === undefined || include === null) {
    include = doc.createNode([]);
    doc.set("include", include);
  } else if (!isSeq(include)) {
    // A single include (a string or a map) becomes a list holding it.
    const list = doc.createNode([]);
    list.items.push(include as never);
    doc.set("include", list);
    include = list;
  }
  if (!isSeq(include)) return;

  const existing = new Set(
    include.items.map((item) => {
      if (isScalar(item)) return String(item.value).replace(/^\//, "");
      if (isMap(item))
        return String(item.get("local") ?? "").replace(/^\//, "");
      return "";
    }),
  );
  let added = false;
  for (const file of files) {
    if (existing.has(file)) continue;
    include.items.push(doc.createNode({ local: `/${file}` }) as never);
    added = true;
  }

  const stages = doc.get("stages");
  if (
    isSeq(stages) &&
    !stages.items.some((s) => isScalar(s) && s.value === "test")
  ) {
    plan.warn(
      `.gitlab-ci.yml declares stages without "test"; the init-react jobs use stage "test". Add it.`,
    );
  }
  if (added)
    plan.write(
      path,
      doc.toString({ flowCollectionPadding: false }),
      "added init-react includes",
    );
}

/**
 * A shared CI file (one per repository) runs from one Target Project. Only that
 * project updates it, and only while it is unedited; other projects leave it alone.
 */
function sharedFileMayChange(
  plan: Plan,
  path: string,
  ownerDir: string,
): boolean {
  const current = plan.read(path);
  if (current === null || plan.isForced("ci")) return true;
  return ownerDir === plan.project.relDir && isUneditedManagedFile(current);
}

function releaseBranch(plan: Plan): string {
  const settings = plan.pkg["init-react"] as
    { releaseBranch?: string } | undefined;
  return settings?.releaseBranch ?? "main";
}
