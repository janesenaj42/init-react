# init-react

A CLI that brings an existing React project up to the team's linting, formatting and pre-commit standard.

## Language

**Target Project**:
An already-scaffolded TypeScript React project that the CLI is run inside: the folder the command runs in. It may be one of several projects (in any language) inside a larger repository. The CLI never creates the project itself. JavaScript-only projects are not Target Projects.
_Avoid_: new project, app, repo (when meaning the project being set up)

**Standard**:
The team's agreed set of lint, format and pre-commit rules and how the tools are wired together.
_Avoid_: template, preset, defaults

**Existing Config**:
Any lint, format or pre-commit setting already present in the Target Project before the CLI runs.

**Scaffold Default**:
A config file or setting that is exactly what a known scaffolder (Vite) generated and has not been edited. It is not treated as Existing Config, so the Standard may replace it. This includes Vite's oxlint setup, since the Standard lints with ESLint.
_Avoid_: default config, boilerplate

**Managed File**:
A file the CLI wrote and stamped as its own. While nobody has edited it, a later run of the CLI may update it; once a person edits it, it becomes Existing Config.
_Avoid_: generated file

**Tool Wiring**:
Making the tools work together: ESLint not fighting Prettier, the pre-commit hook running lint-staged, lint-staged running ESLint and Prettier.

**Reconcile**:
Combining the Standard with Existing Config. By default, Existing Config is kept and never overwritten.

**Force**:
An explicit user choice to let the Standard overwrite Existing Config, given per tool (e.g. only ESLint).

**Commit Convention**:
The required format for commit messages, which the Release process reads. It applies to every commit in the repository, including commits to non-React projects in the same repository.

**Release**:
Bumping a Target Project's version, updating its changelog, committing and tagging it, based on the commits since its last Release. A Release is local: it never pushes, publishes or deploys. Each Target Project releases independently, with tags prefixed by its name.

**Release Branch**:
The branch a Target Project makes full Releases from. Defaults to `main`; each project team may choose another (e.g. `dev`).

**Prerelease**:
A Release marked as not final. The only kind of Release allowed off the Release Branch. It bumps the version and tags, but never touches the changelog. It comes in three stages:

- **Alpha**: incomplete; features still being built, expect breakage. For the team's own testing.
- **Beta**: feature-complete but not yet stable; for wider testing (QA, friendly users).
- **Release Candidate (rc)**: believed ready to ship; only bug fixes from here. If nothing is found, it becomes the full Release unchanged.
  _Avoid_: pre-release build, snapshot

**Shared Config Package**:
A published package that holds part of the Standard (e.g. the ESLint rules, the Prettier rules). Target Projects extend it rather than holding their own copy of the rules.
_Avoid_: preset, template

**Skip**:
An explicit user choice to leave a tool to something else, given per tool (e.g. commitlint, when the repository sets up its Commit Convention itself). The CLI then writes nothing for that tool, and keeps skipping it on later runs.
_Avoid_: exclude, disable

**Dry Run**:
A run that reports what Reconcile would change without changing anything.

## Relationships

- The CLI applies the **Standard** to a **Target Project** by **Reconciling** it with any **Existing Config**
- Git hooks belong to the repository, not to a **Target Project**; several **Target Projects** in one repository share them
- The **Commit Convention** is enforced repo-wide without asking, by the git hooks; pipelines belong to the CI team, not the CLI
- **Existing Config** wins over the **Standard** unless the user chooses **Force** for that tool
- A **Scaffold Default** is never **Existing Config**; an unedited **Managed File** is never **Existing Config**
- The **Standard** is delivered through **Shared Config Packages**; changing the rules means releasing a new version of a package, not editing Target Projects
- Next.js projects are not supported
- Running the CLI again on an already-set-up **Target Project** changes nothing
- A **Release** is derived from commits that follow the **Commit Convention**
- A full **Release** happens only on the **Release Branch**, with a clean working tree; any other branch may only make a **Prerelease**
- Settings in the project manifest (scripts, lint-staged settings) are each judged separately; a config file is judged as a whole
