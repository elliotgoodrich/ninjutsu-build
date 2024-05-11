import { openSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

let fd: number;
let cwd: string;

/**
 * Open the corresponding depfile for the specified `out` file.  Note that this
 * must be called before any calls to `addDependency`.
 * @private
 */
export function open(out: string): void {
  cwd = resolve();
  fd = openSync(out + ".depfile", "w");
  writeFileSync(fd, out + ":");
}

/**
 * Add to ninja's dynamic dependencies the specified `path` for the currently
 * running script.
 *
 * For example, if we want to execute a "script.mjs" file with
 * ninja we can write:
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 *
 * const ninja = new NinjaBuilder();
 * const node = makeNodeRule(ninja);
 * node({
 *   in: "script.mjs",
 *   out: "$builddir/out.txt",
 * });
 * ```
 *
 * If "script.mjs" imports or requires another file then the `node` rule will
 * automatically add that JavaScript file to the dependencies of "script.mjs".
 *
 * However, if "script.mjs" decides to read a file without importing:
 *
 * ```ts
 * // script.mjs
 * import { readFileSync } from "node:fs";
 *
 * const myJson = "config.json";
 * const config = JSON.parse(readFileSync(myJson));
 *
 * // ...
 * ```
 *
 * then ninja will not know about the dependency on "config.json" and will not
 * rerun this build edge when if is modified.  This can be fixed using the
 * `addDependency` method to notify ninja,
 *
 * ```ts
 * // script.mjs
 * import { addDependency } from "@ninjutsu-build/node/runtime";
 * import { readFileSync } from "node:fs";
 *
 * const myJson = "config.json";
 * addDependency(myJson);
 * const config = JSON.parse(readFileSync(myJson));
 *
 * // ...
 * ```
 */
export function addDependency(path: string): void {
  const relPath = relative(cwd, path);
  const dependency = (
    relPath && !relPath.startsWith("..") && !isAbsolute(relPath)
      ? relPath
      : path
  ).replaceAll("\\", "/");
  writeFileSync(fd, " " + dependency);
}
