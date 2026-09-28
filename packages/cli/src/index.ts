import { parseArgs } from "node:util";
import { CLI_PACKAGE, OWN_VERSION, TOOLS, type Tool } from "./constants.js";
import { release } from "./release.js";
import { setup } from "./setup.js";
import { UserError } from "./util.js";

const HELP = `${CLI_PACKAGE} ${OWN_VERSION}

Usage:
  init-react [options]          Apply the Standard to the TypeScript React project in this folder
  init-react release <type>     Make a Release: patch | minor | major | alpha | beta | rc

Options:
  --dry-run                     Show what would change without changing anything
  --force[=tools]               Let the Standard replace your own config, for all tools or
                                only some: ${TOOLS.join(",")}
  --ci=github|gitlab|none       Override the CI provider detected from the origin remote
  --release-branch=<branch>     The branch full Releases are made from (default: main)
  -h, --help                    Show this help
  -v, --version                 Show the version
`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "dry-run": { type: "boolean", default: false },
      force: { type: "string" },
      ci: { type: "string" },
      "release-branch": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });

  if (values.help) {
    console.log(HELP);
    return 0;
  }
  if (values.version) {
    console.log(OWN_VERSION);
    return 0;
  }

  const [command, ...rest] = positionals;
  if (command === "release") {
    if (rest.length !== 1)
      throw new UserError(
        "Usage: init-react release <patch|minor|major|alpha|beta|rc>",
      );
    return release(rest[0]!, process.cwd());
  }
  if (command !== undefined)
    throw new UserError(`Unknown command "${command}".\n\n${HELP}`);

  const ci = values.ci;
  if (ci !== undefined && ci !== "github" && ci !== "gitlab" && ci !== "none") {
    throw new UserError(`--ci must be github, gitlab or none.`);
  }
  return setup(process.cwd(), {
    dryRun: values["dry-run"],
    force: parseForce(values.force),
    ci,
    releaseBranch: values["release-branch"],
  });
}

function parseForce(value: string | undefined): Set<Tool> {
  if (value === undefined) return new Set();
  if (value === "" || value === "all") return new Set(TOOLS);
  const tools = value.split(",").map((t) => t.trim());
  const unknown = tools.filter(
    (t) => !(TOOLS as readonly string[]).includes(t),
  );
  if (unknown.length > 0) {
    throw new UserError(
      `Unknown tool in --force: ${unknown.join(", ")}. Use: ${TOOLS.join(", ")}.`,
    );
  }
  return new Set(tools as Tool[]);
}

// parseArgs treats a bare `--force` (no value) as an error for string options.
const argv = process.argv
  .slice(2)
  .map((arg) => (arg === "--force" ? "--force=all" : arg));
try {
  process.exitCode = main(argv);
} catch (error) {
  if (
    error instanceof UserError ||
    (error as { code?: string }).code?.startsWith("ERR_PARSE_ARGS")
  ) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
