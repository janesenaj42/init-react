# init-react

One command that brings a TypeScript React project up to the team's **Standard**: ESLint, Prettier, a commit convention (commitlint + commitizen), pre-commit hooks (husky + lint-staged), a CI check (GitHub Actions or GitLab CI) and local releases (commit-and-tag-version).

```bash
npx @janesenaj42/init-react            # apply the Standard
npx @janesenaj42/init-react --dry-run  # see what would change first
```

The vocabulary used here (Target Project, Standard, Existing Config, Scaffold Default, Managed File, Release…) is defined in [CONTEXT.md](CONTEXT.md). Design decisions are in [docs/adr](docs/adr).

This README has two parts:

- **[Using init-react in your project](#using-init-react-in-your-project)** — for any downstream Target Project that runs the CLI.
- **[Working on this repo](#working-on-this-repo)** — for people changing the CLI or the Standard itself.

## Using init-react in your project

### One-time setup (every developer)

The packages are on GitHub Packages, which needs a login even to install. Create a GitHub token (classic) with `read:packages`, then add it to your user `~/.npmrc`:

```ini
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
@janesenaj42:registry=https://npm.pkg.github.com
```

### Using it in a project

Run it inside the project folder, which is the folder with the React app's `package.json`. In a monorepo, that's the subfolder (e.g. `frontend/`), not the repository root.

Requirements: Node 22.13+, a TypeScript React project (Vite or any other setup), and npm, pnpm or yarn. Next.js and JavaScript-only projects are refused.

What it does:

- **ESLint and Prettier**: writes `eslint.config.js` / `prettier.config.js` that extend the shared packages, plus `lint`, `format`, `format:check` and `typecheck` scripts. Vite's unedited lint setup is replaced, including Vite 9's oxlint.
- **Commit Convention**: `commitlint.config.js`, plus commitizen (`npm run commit` asks you questions and writes the message).
- **Git hooks** (at the repository root, shared by every project in it):
  - pre-commit runs lint-staged (ESLint `--fix` + Prettier) on staged files, per project. Commits that touch only other folders (e.g. a Java backend) skip it and don't need Node.
  - commit-msg runs commitlint for every commit in the repository.
- **CI Check**: GitHub or GitLab, detected from the `origin` remote. It runs lint, format check and typecheck when the project changes, and commitlint on every PR/MR. On GitLab, only `include:` lines are added to your root `.gitlab-ci.yml`.
- **Release scripts**: see below.
- **`.npmrc`**: points `@janesenaj42` at GitHub Packages.
- **README**: adds a `## Scripts` section to the Target Project's own `README.md`, listing whichever of the scripts above ended up in `package.json` and how to run them with your package manager. It's a Managed Block: edits inside it are overwritten the next time the CLI runs, so the team always has one place to look, instead of needing to know this repo's docs.

Afterwards, run `npm run format` once so existing code matches the Standard, and commit.

#### Your own config is never overwritten

If a file or `package.json` setting already exists and isn't an unedited Vite default, it is **kept**, and the CLI tells you what to add yourself. To let the Standard replace it:

```bash
npx @janesenaj42/init-react --force=eslint,prettier   # only these tools
npx @janesenaj42/init-react --force                   # everything
```

Tools: `eslint`, `prettier`, `commitlint`, `lint-staged`, `husky`, `ci`, `release`.

Files the CLI writes start with a `Managed by …` line. Re-running a newer version of the CLI updates them, **as long as nobody has edited them**. Once you edit one, it's yours and is never touched again (unless you use `--force`). Re-running when everything is current changes nothing.

#### Options

| Option                      | Meaning                                                         |
| --------------------------- | --------------------------------------------------------------- |
| `--dry-run`                 | Show what would change; change nothing                          |
| `--force[=tools]`           | Let the Standard replace your own config                        |
| `--ci=github\|gitlab\|none` | Override the CI provider detected from `origin`                 |
| `--release-branch=<branch>` | The branch full releases come from (default `main`; e.g. `dev`) |

#### CI access to the packages

- **GitHub:** the workflow installs with the built-in `GITHUB_TOKEN`. In each package's settings on GitHub (_Package settings → Manage Actions access_), give the project's repository read access.
- **GitLab:** add a masked CI/CD variable `GITHUB_PACKAGES_TOKEN`, a GitHub token with `read:packages`.

### Releasing a project

```bash
npm run release:patch   # 1.2.3 -> 1.2.4   (also release:minor, release:major)
npm run release:rc      # 1.2.3 -> 1.2.4-rc.0
git push --follow-tags  # releases never push by themselves
```

- **Full releases** (`patch` / `minor` / `major`) only run on the Release Branch (`main` unless set with `--release-branch`) with no uncommitted changes. They bump `package.json`, update `CHANGELOG.md` from the commit messages, commit, and tag.
- **Prereleases** run on any branch. They bump and tag, but don't touch the changelog.
- In a monorepo, each project releases independently. Tags carry the folder name (`frontend@1.2.4`), and only commits touching that folder count.

Which prerelease to use:

| Stage   | Meaning                                                       | Who it's for       |
| ------- | ------------------------------------------------------------- | ------------------ |
| `alpha` | Still being built; expect breakage                            | The team itself    |
| `beta`  | Feature-complete, not yet stable                              | QA, friendly users |
| `rc`    | Believed ready to ship; bug fixes only. Ships unchanged if OK | Final sign-off     |

The release settings live in the project's `package.json` under `"init-react"`.

## Working on this repo

### What's in this repo

| Package                                                        | What it is                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------- |
| [`@janesenaj42/init-react`](packages/cli)                      | The CLI                                                             |
| [`@janesenaj42/eslint-config`](packages/eslint-config)         | ESLint rules (flat config): TypeScript + React hooks, Prettier-safe |
| [`@janesenaj42/prettier-config`](packages/prettier-config)     | Prettier rules                                                      |
| [`@janesenaj42/commitlint-config`](packages/commitlint-config) | Commit Convention: Conventional Commits                             |

The rules live in these packages, not in each project ([ADR 0001](docs/adr/0001-standard-lives-in-shared-config-packages.md)). Each project gets a short config file that extends them. To change a rule for everyone, edit the package and release; each project picks it up by bumping the version, when it's ready.

The packages hold sensible defaults for now. The org's own rules go in `packages/eslint-config/index.js` and `packages/prettier-config/index.js`.

### Developing this repo

```bash
npm install -g pnpm@12
pnpm install
pnpm test          # unit + integration tests against real Vite 8/9 templates
pnpm build
```

To try the CLI on a project before publishing, pack the packages and point the CLI at them:

```bash
pnpm -r pack --pack-destination /tmp/tgz
INIT_REACT_LOCAL_TARBALLS=/tmp/tgz node /path/to/packages/cli/dist/index.js
```

#### Releasing the Standard

All four packages, plus this monorepo's own `package.json`, share one version. On `main`:

```bash
pnpm release:minor   # or release:patch / release:major
git push --follow-tags
```

Off `main`, or to ship a prerelease first, use `pnpm release:alpha`, `pnpm release:beta` or `pnpm release:rc` — same stages, and the same meaning, as the [Releasing a project](#releasing-a-project) section above, since this repo's own package.json is set up the same way the CLI sets up a Target Project's.

The `v*` tag triggers [publish.yml](.github/workflows/publish.yml), which publishes every package to GitHub Packages. The CLI installs the Shared Config Packages at the version it was released with.

#### When Vite changes its template

Unedited Vite configs are recognised by fingerprint ([fingerprints.ts](packages/cli/src/fingerprints.ts)), covering create-vite 5.0 to 9.2. A config from a newer Vite template is safely treated as Existing Config (kept, with a warning) until its hash is added there.

#### Moving to the org

```bash
pnpm set-scope @your-org
pnpm install
```

This rewrites the scope everywhere; the scope must match the GitHub owner. Projects set up under the old scope need their dependencies renamed. The config files the CLI wrote update themselves on the next run, because they are unedited Managed Files.
