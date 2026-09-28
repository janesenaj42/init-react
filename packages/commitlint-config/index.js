// The team's Commit Convention: Conventional Commits.
// Everything is imported here rather than referenced by package name, because
// commitlint resolves names from the project, which fails under pnpm's strict
// node_modules layout.
import conventional from "@commitlint/config-conventional";
import createPreset from "conventional-changelog-conventionalcommits";

const preset = await createPreset();

/** @type {import('@commitlint/types').UserConfig} */
export default {
  ...conventional,
  parserPreset: { parserOpts: preset.parser },
  rules: {
    ...conventional.rules,
  },
};
