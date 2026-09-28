// Moves every package to a new npm scope, e.g. when forking from a personal
// account to the org: `pnpm set-scope @acme` (the scope must match the GitHub owner).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OLD_SCOPE = "@janesenaj42";
const OLD_OWNER = OLD_SCOPE.slice(1);
const next = process.argv[2];

if (!next || !/^@[a-z0-9][a-z0-9-]*$/.test(next)) {
  console.error("Usage: pnpm set-scope @your-github-owner   (lowercase)");
  process.exit(1);
}

const SKIP = new Set(["node_modules", "dist", ".git", "fixtures"]);
const EXTENSIONS = /\.(json|js|mjs|ts|md|yml|yaml)$/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (EXTENSIONS.test(name)) yield path;
  }
}

let changed = 0;
for (const path of files(process.cwd())) {
  if (path.endsWith("set-scope.mjs") || path.endsWith("pnpm-lock.yaml"))
    continue;
  const text = readFileSync(path, "utf8");
  const updated = text
    .replaceAll(OLD_SCOPE, next)
    .replaceAll(`github.com/${OLD_OWNER}/`, `github.com/${next.slice(1)}/`);
  if (updated !== text) {
    writeFileSync(path, updated);
    changed++;
    console.log(`updated ${path}`);
  }
}
writeFileSync(
  new URL(import.meta.url),
  readFileSync(new URL(import.meta.url), "utf8").replace(
    `const OLD_SCOPE = "${OLD_SCOPE}";`,
    `const OLD_SCOPE = "${next}";`,
  ),
);
console.log(
  `\n${changed} files moved to ${next}. Run \`pnpm install\` to refresh the lockfile.`,
);
