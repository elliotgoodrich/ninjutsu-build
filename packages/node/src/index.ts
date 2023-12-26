import {
  type NinjaBuilder,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { platform } from "os";

const makeDepfile = "@ninjutsu-build/node/dist/makeDepfile.js";
const hookRequire = "@ninjutsu-build/node/lib/hookRequire.cjs";

const importCode =
  "import { register } from 'node:module';" +
  "import { pathToFileURL } from 'node:url';" +
  `register('${makeDepfile}', pathToFileURL('./'), { data: '$out' });`;

// In order to pipe to $out we need to run with `cmd /c` on Windows.  Additionally
// we mention `node.exe` with the file extension to avoid the `winpty node` alias.
const command =
  platform() === "win32"
    ? `cmd /c node.exe --require "${hookRequire}" --import "data:text/javascript,${importCode}" $in $args > $out`
    : `node --require "${hookRequire}" --import "data:text/javascript,${importCode}" $in $args > $out`;

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `node`, passing in the specified `in` JavaScript file and optional command arguments `args`,
 * and write the output to `out`.
 *
 * All files `import`ed or `required` will be added as dependencies to `out`. So if any file
 * is later modified, `ninja` will rebuild `out` without you having to explicitly add
 * dependencies.
 *
 * ```ts
 * node({
 *   in: "src/index.js",
 *   out: "$builddir/out.txt",
 * });
 * ```
 *
 * If `src/index.js` contains an import:
 *
 * ```js
 * import { f } from "./other.js";
 * ```
 *
 * then there will be a dependency on "src/other.js".
 */
export function makeNodeRule(
  ninja: NinjaBuilder,
  name = "node",
): <O extends string>(a: {
  in: string;
  out: O;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: (out: string) => readonly string[];
}) => O {
  return ninja.rule(name, {
    command,
    description: "Creating $out from 'node $in'",
    out: needs<string>(),
    in: needs<string>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: "",
  });
}
