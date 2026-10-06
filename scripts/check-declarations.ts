// Guards the type checks: `tsc` and the type-aware lint cannot resolve `claude-code` without
// Claude Code's API declarations, which are never committed and only a Claude Code that loads
// this folder as a mod writes.
//
// A version mismatch is a notice, not a failure: Claude Code rewrites the declarations each time
// it loads the mod, so a maintainer whose own Claude Code is newer than the pinned one would
// otherwise fail this guard after every session.
import { existsSync, readFileSync } from "node:fs";

const DECLARATIONS = ".claude-plugin/types/claude-code/index.d.ts";
const PINNED_MANIFEST = "node_modules/@anthropic-ai/claude-code/package.json";
const WRITER = /^\/\/ Written by Claude Code (\S+?)\.?$/u;

const root = new URL("../", import.meta.url);

/**
 * Reads the Claude Code version pinned by the lockfile from its installed package.
 *
 * @returns The `version` field of the installed `@anthropic-ai/claude-code` package.
 * @throws {Error} When the package is not installed or its manifest has no string `version`.
 */
function pinnedVersion(): string {
  const manifest: unknown = JSON.parse(readFileSync(new URL(PINNED_MANIFEST, root), "utf8"));
  const version: unknown =
    manifest instanceof Object ? Reflect.get(manifest, "version") : undefined;
  if (typeof version === "string") {
    return version;
  }
  throw new Error(`${PINNED_MANIFEST} has no version; run npm install.`);
}

/**
 * Reads the Claude Code version named on the declarations' first line.
 *
 * @param text - The declarations file's content.
 * @returns The version, or `undefined` when the first line names no writer.
 */
function writerVersion(text: string): string | undefined {
  const [firstLine = ""] = text.split("\n", 1);
  return WRITER.exec(firstLine.trimEnd())?.[1];
}

const declarations = new URL(DECLARATIONS, root);

if (existsSync(declarations)) {
  const pinned = pinnedVersion();
  const writer = writerVersion(readFileSync(declarations, "utf8"));
  if (writer !== pinned) {
    const source = writer === undefined ? "an unknown Claude Code" : `Claude Code ${writer}`;
    console.log(
      `Note: ${DECLARATIONS} comes from ${source}, not the pinned ${pinned}; \`npm run declarations\` rewrites it.`,
    );
  }
} else {
  console.error(
    [
      `Missing ${DECLARATIONS}: Claude Code's API declarations, which tsc and the type-aware lint need.`,
      "Run `npm run declarations`, then quit Claude Code once it has started; it writes the file on load.",
      "This needs a logged-in Claude Code. Without one, skip this guard and the two type checks, as CI does:",
      "  LEFTHOOK_EXCLUDE=declarations,type,typelint npm run check",
    ].join("\n"),
  );
  process.exitCode = 1;
}
