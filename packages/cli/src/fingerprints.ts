import { sha256 } from "./util.js";

/**
 * Scaffold Defaults: normalised SHA-256 of config files exactly as create-vite's
 * react-ts template generated them. A file matching one of these was never edited,
 * so it is not Existing Config and the Standard may replace it.
 *
 * Collected from every stable create-vite release from 5.0.0 to 9.2.1. When Vite
 * ships a new template, add its hash here; until then an unknown file is kept.
 */
const SCAFFOLD_DEFAULTS: Record<string, Set<string>> = {
  // create-vite 5.0.0 – 5.4.0 (legacy eslintrc)
  ".eslintrc.cjs": new Set([
    "48fbb93fc59962f7f52881f89adcc7254a2e164afa8c01cd7628f299f0b485ec",
  ]),
  "eslint.config.js": new Set([
    // 5.5.0 – 5.5.1
    "33afba00b6458fb40e799268761bb30b824452531dce2cc1d03ad70a6032d2ff",
    // 5.5.2 – 6.5.0
    "dc00c7db700d03834d04a172ea709593ae5ef1bc750eb55dfc521a60d9e1baa0",
    // 7.0.0 – 7.1.1
    "7a39f6bf29b2b84a243df3330c218b9688114594081bd1280a32ffaa4766d023",
    // 7.1.2 – 8.0.3
    "088e9031a1668aacb8163463e8c1238c82f9188075c4216b04a615e7ad4c92d4",
    // 8.1.0 – 9.0.5
    "4efe97b16d1200fac0eaf07aa00930a8668b1f96a0be1891ace8c1e712ff0ccb",
    // 9.0.6 – 9.0.7
    "cf80a7510234dcd5ae594b30b44682b8b45ba13c0fcb5bf8928bea143802aa1c",
  ]),
  // create-vite 9.1.0+ ships oxlint instead of ESLint
  ".oxlintrc.json": new Set([
    "b4d344818a1e1bf43997e4744a9153c8eef770c98b58229cd86363dabb85ded4",
  ]),
};

/** `lint` script values create-vite has generated. */
export const SCAFFOLD_LINT_SCRIPTS = new Set([
  "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
  "eslint .",
  "oxlint",
]);

/** Lint dependencies create-vite adds that the Standard makes redundant once its lint config is replaced. */
export const SCAFFOLD_LINT_DEPENDENCIES = [
  "@eslint/js",
  "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser",
  "eslint-plugin-react-hooks",
  "eslint-plugin-react-refresh",
  "globals",
  "typescript-eslint",
];

export function isScaffoldDefault(fileName: string, content: string): boolean {
  return SCAFFOLD_DEFAULTS[fileName]?.has(sha256(content)) ?? false;
}
