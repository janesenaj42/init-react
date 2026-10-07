# The CLI writes no CI

The CLI no longer writes CI jobs (a GitHub workflow or GitLab includes) into Target Projects, and `ci` is no longer a tool. Pipelines belong to the CI team, which runs the project's own `lint`, `format:check` and `typecheck` scripts and commitlint. The CLI makes sure those scripts exist; `typecheck` is its own tool.

## Considered Options

- **Keep writing CI jobs, with `--skip=ci` for teams that don't want them**: two owners for one pipeline, and a default that writes files the CI team then has to remove or merge.

## Consequences

- Target Projects set up by an earlier release keep the CI files it wrote (`.github/workflows/init-react-*.yml`, `.gitlab/init-react/`). The CLI no longer updates them; the CI team removes them when its pipeline takes over.
- The CLI no longer reads the `origin` remote, so `--ci` is gone.
