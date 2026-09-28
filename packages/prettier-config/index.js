// The team's Prettier Standard. These are Prettier's own defaults written out
// explicitly, so replacing them with the org's rules is a one-file change.
/** @type {import('prettier').Config} */
export default {
  printWidth: 80,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  jsxSingleQuote: false,
  quoteProps: "as-needed",
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
};
