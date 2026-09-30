# Git hooks run through lefthook, in a file the repository's config extends

The CLI wires git hooks with lefthook, not husky. Every Target Project in a repository is listed in one file at the git root, `lefthook-init-react.yml`, which the CLI rewrites on each run. The repository's own lefthook config gets only an `extends:` entry pointing at that file.

Target Projects often sit inside larger repositories with Java or Python services, and those repositories (Terminal-6, for one) already use lefthook: a single language-neutral binary with per-path hooks. husky takes over git's `core.hooksPath`, so the two can't both run; a CLI that installed husky would switch off the repository's existing hooks. A separate file that the repository's config extends means the CLI never edits the team's own hooks beyond one line, and lefthook merges the two for us.

## Considered Options

- **husky + a Managed Block in `.husky/pre-commit`**: what the CLI did first. Conflicts with repositories that already use lefthook.
- **Editing `lefthook.yml` directly** (adding our commands to it): puts the Standard's hooks among the team's own, and needs YAML editing that keeps their comments.
- **Detecting the repository's hook manager and supporting both**: twice the wiring to test, for no need we have.

## Consequences

- lefthook 2 needs git 2.31 or later; the CLI warns on older git.
- The projects' lint-staged runs are grouped to run one after another, because each stashes and restores the working tree. The repository's own hooks may still run in parallel with the group.
- The commit-msg hook is one shell line: lefthook on Windows breaks multi-line scripts.
