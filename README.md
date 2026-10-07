# init-react

One command that sets up a TypeScript React project with the team's ESLint, Prettier, commit
convention, git hooks, `typecheck` script and release scripts. CI is not set up: the CI team
owns pipelines, and runs `lint`, `format:check` and `typecheck` from the project.

- [For project teams: set up your project](#for-project-teams-set-up-your-project)
  - [Once per machine](#once-per-machine)
  - [Set up a project](#set-up-a-project)
- [For maintainers of this repo: change the CLI or the rules](#for-maintainers-of-this-repo-change-the-cli-or-the-rules)
  - [Build and test](#build-and-test)
  - [Try it on a project before publishing](#try-it-on-a-project-before-publishing)
  - [Publish a new version](#publish-a-new-version)

## For project teams: set up your project

### Once per machine

The packages are on GitHub Packages, which needs a token even to install. Create a GitHub token
(classic) with `read:packages` and add it to `~/.npmrc`:

```ini
//npm.pkg.github.com/:_authToken=YOUR_TOKEN
@janesenaj42:registry=https://npm.pkg.github.com
```

Installing from another registry (e.g. an on-prem mirror)? Use its URL and token here, and run
the CLI with `--registry=<url>`.

### Set up a project

In the folder with the React app's `package.json`:

```bash
npx @janesenaj42/init-react --dry-run   # see what would change
npx @janesenaj42/init-react             # apply it
npm run format                          # once, so existing code matches
git add -A && git commit                # or: npm run commit
```

Run it again any time to update. A file you have edited is never overwritten; `--force=<tools>`
replaces it. The scripts it adds (lint, format, commit, release) are listed in your project's own
README, in the `## Scripts` block it writes.

| Option                      | Meaning                                                                      |
| --------------------------- | ---------------------------------------------------------------------------- |
| `--dry-run`                 | Show what would change; change nothing                                       |
| `--force[=tools]`           | Replace your own config with the Standard's, for all tools or the ones named |
| `--skip=<tools>`            | Don't set these tools up; remembered by later runs. `--skip=none` clears it  |
| `--registry=<url>`          | Install the Standard's packages from this registry; remembered               |
| `--release-branch=<branch>` | Branch full releases come from (default `main`); remembered                  |

Tools: `eslint`, `prettier`, `commitlint`, `lint-staged`, `lefthook`, `typecheck`, `release`.

## For maintainers of this repo: change the CLI or the rules

| To change                       | Edit                                  |
| ------------------------------- | ------------------------------------- |
| ESLint rules                    | `packages/eslint-config/index.js`     |
| Prettier rules                  | `packages/prettier-config/index.js`   |
| Commit rules                    | `packages/commitlint-config/index.js` |
| What the CLI writes             | `packages/cli/src/steps/`             |
| Recognising a new Vite template | `packages/cli/src/fingerprints.ts`    |

### Build and test

```bash
npm install -g pnpm@12
pnpm install
pnpm test     # against real Vite 8 and 9 templates
pnpm build    # packages/cli/dist/index.js
```

### Try it on a project before publishing

```bash
pnpm -r pack --pack-destination /tmp/tgz
cd <a React project>
INIT_REACT_LOCAL_TARBALLS=/tmp/tgz node <this repo>/packages/cli/dist/index.js
```

### Publish a new version

All packages share one version. On `main`:

```bash
pnpm release:minor   # release:major if projects' code may start failing; release:patch for fixes
git push --follow-tags
```

The tag runs `.github/workflows/publish.yml`, which publishes every package. Projects get the
change by bumping `@janesenaj42/*` in their `package.json`.

Terms used in the code and ADRs: [CONTEXT.md](CONTEXT.md). Design decisions: [docs/adr](docs/adr).
