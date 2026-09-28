# The Standard lives in Shared Config Packages, not copied files

The CLI does not copy the full ESLint and Prettier rules into each Target Project. The rules live in Shared Config Packages (`@team/eslint-config`, `@team/prettier-config`) built in this repo, and each Target Project gets a short config file that extends them, pinned to a version range. We did this because the previous approach, a template repo, was hard to maintain: once copied, every project's rules drifted and there was no way to bring existing projects forward. With packages, a rule change is one release, and each Target Project upgrades on its own schedule by bumping the version (repo A can move to v3 while repo B stays on v2).

## Considered Options

- **Copy files from templates inside the CLI**: simplest, but each project drifts from the Standard the moment it is created.
- **Remote template repo fetched by the CLI**: same drift problem; this is what we used before.
