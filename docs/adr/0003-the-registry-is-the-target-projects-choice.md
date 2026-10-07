# The registry is the Target Project's choice, not the CLI's

The CLI no longer assumes the Shared Config Packages install from GitHub Packages. A Target Project names its registry with `--registry` (or already has it in its `.npmrc`), and the CLI saves it in `package.json` under `"init-react"` and writes it to the project's `.npmrc`. GitHub Packages stays the default, because that is where `publish.yml` publishes.

The team runs projects on GitHub and GitLab, online and on-prem. An on-prem network may not reach GitHub at all, so its projects install from a mirror (Nexus, Artifactory) at a URL only that site knows. A fixed registry made those projects edit Managed Files by hand, after which the CLI could no longer update them.

## Considered Options

- **Keep GitHub Packages fixed; on-prem edits the generated files**: every edit turns a Managed File into Existing Config, so those projects stop receiving updates.
- **Publish to every registry from `publish.yml`**: the CLI would still need to know which one a project uses, and on-prem registries aren't reachable from GitHub Actions.

## Consequences

- Each developer, and each CI pipeline, needs a read token for the registry the project uses, set in its own npm config; the project's `.npmrc` never holds one.
- Someone has to mirror the packages into the on-prem registry; the CLI doesn't.
- The package scope still has to match the GitHub owner for GitHub Packages (`pnpm set-scope`).
