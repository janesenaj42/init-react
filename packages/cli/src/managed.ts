import { CLI_PACKAGE } from "./constants.js";
import { normalize, sha256 } from "./util.js";

/**
 * A Managed File starts with a stamp line holding a hash of the rest of the file.
 * If the hash still matches, nobody has edited the file and a later run may update it.
 * Once someone edits it, the hash stops matching and it becomes Existing Config.
 */
const STAMP = /^(?:\/\/|#) Managed by .+ \(hash:([0-9a-f]{16})\)\..*$/;

export type CommentPrefix = "//" | "#";

export function stamp(body: string, comment: CommentPrefix): string {
  const hash = sha256(body).slice(0, 16);
  return (
    `${comment} Managed by ${CLI_PACKAGE} (hash:${hash}). Editing this file makes it yours; it will then never be updated automatically.\n` +
    normalize(body)
  );
}

export function isUneditedManagedFile(content: string): boolean {
  const normalized = normalize(content);
  const newline = normalized.indexOf("\n");
  const match = STAMP.exec(normalized.slice(0, newline));
  if (!match) return false;
  return sha256(normalized.slice(newline + 1)).slice(0, 16) === match[1];
}

// A Managed Block is our section inside a file other people also write to (git hooks).
// The markers leave out the scope so blocks survive a move to another scope.
const BLOCK_START = "# >>> init-react >>>";
const BLOCK_END = "# <<< init-react <<<";

export function readBlock(content: string | null): string | null {
  if (content === null) return null;
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return null;
  return content.slice(start, end + BLOCK_END.length);
}

/** Replaces our block in `content`, or appends it; everything outside the block is untouched. */
export function upsertBlock(content: string | null, blockBody: string): string {
  const block = `${BLOCK_START}\n${blockBody.trim()}\n${BLOCK_END}`;
  const existing = readBlock(content);
  if (content === null || content.trim() === "") return block + "\n";
  // A replacer function, because the block holds shell `$1`, which string replace would expand.
  if (existing !== null) return content.replace(existing, () => block);
  return content.replace(/\s*$/, "\n\n") + block + "\n";
}
