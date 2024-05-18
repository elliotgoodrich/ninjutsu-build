import { createInterface } from "node:readline";
import { isAbsolute, relative } from "node:path";
import { realpath } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const cwd = process.cwd();

async function convertToPath(line: string): Promise<string> {
  // Look at the canonical path to resolve symlinks and find the original
  // path.  This will allow us to handle dependencies across monorepos.
  let path = await realpath(line);

  if (isAbsolute(path)) {
    // Absolute paths are most likely references to things inside `node_modules`,
    // but could be absolute paths given by the user to something else.  If the
    // path is within the current working directory, replace with the relative
    // path, otherwise keep it as absolute.
    const relativeAttempt = relative(cwd, path);
    if (
      relativeAttempt &&
      !relativeAttempt.startsWith("..") &&
      !isAbsolute(relativeAttempt)
    ) {
      path = relativeAttempt;
    }
  }

  // This escaping should be provided by the `@ninjutsu-build/core` module as it
  // is not the same rules as `escapePath`.  Use "$$$$" as "$" is special in
  // `replaceAll` and "$$$$" is taken as "$$".
  return path
    .replaceAll("\\", "/")
    .replaceAll(" ", "\\ ")
    .replaceAll("$", "$$$$");
}

async function main() {
  const {
    positionals: [out],
    values: { touch },
  } = parseArgs({
    allowPositionals: true,
    options: { touch: { type: "boolean" } },
  });

  const lines: string[] = [];
  for await (const line of createInterface({
    input: process.stdin,
  })) {
    lines.push(line);
  }

  // Assume the last line passes in the return code of `tsc`
  const rc = Number.parseInt(lines.pop() ?? "1");
  if (rc === 0) {
    const paths = await Promise.all(
      lines.filter((l) => l !== "").map(convertToPath),
    );

    // The ".depfile" suffix must match what's used in `node.ts`
    writeFileSync(out + ".depfile", out + ": " + paths.join(" "));
    if (touch) {
      writeFileSync(out, "");
    }
  } else {
    // Drop the `--listFiles` content printed at the end until we get to the
    // error messages.  Assume that all the paths end in `ts` (e.g. `.d.ts`
    // or `.d.mts`) and keep searching until we find something that doesn't.
    let i = lines.length - 1;
    for (; i >= 0; --i) {
      if (!lines[i].endsWith("ts")) {
        break;
      }
    }
    console.log(lines.slice(0, i + 1).join("\n"));
  }
  process.exit(rc);
}

await main();
