import {
  type NinjaBuilder,
  type Input,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { platform } from "os";
import {
  relative as relativeNative,
  resolve as resolveNative,
} from "node:path";
import { isAbsolute } from "node:path/posix";

function resolvePath(ninja: NinjaBuilder, file: string): string {
  const path = relativeNative(
    resolveNative(process.cwd(), ninja.outputDir),
    require.resolve(file),
  ).replaceAll("\\", "/");
  // Make sure that relative paths start with "./" or "../" as node
  // will resolve "foo/bar.js" as "node_modules/foo/bar.js" instead
  // of "./foo/bar.js".
  return !isAbsolute(path) && !path.startsWith("../") ? "./" + path : path;
}

function getImportCode(ninja: NinjaBuilder): string {
  const makeDepfile = "@ninjutsu-build/node/dist/makeDepfile.js";
  return (
    "import { register } from 'node:module';" +
    "import { pathToFileURL } from 'node:url';" +
    `register('${resolvePath(
      ninja,
      makeDepfile,
    )}', pathToFileURL('./'), { data: '$out' });`
  );
}

// In order to pipe to $out we need to run with `cmd /c` on Windows.  Additionally
// we mention `node.exe` with the file extension to avoid the `winpty node` alias.
const node = platform() === "win32" ? "cmd /c node.exe" : "node";

function getNodeCommand(ninja: NinjaBuilder): string {
  const hookRequire = "@ninjutsu-build/node/lib/hookRequire.cjs";
  return `${node} --require "${resolvePath(
    ninja,
    hookRequire,
  )}" --import "data:text/javascript,${getImportCode(ninja)}"`;
}

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
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 *
 * const ninja = new NinjaBuilder();
 * const node = makeNodeRule(ninja);
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
  in: Input<string>;
  out: O;
  args?: string;
  nodeArgs?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  return ninja.rule(name, {
    command: getNodeCommand(ninja) + " $nodeArgs $in $args > $out",
    description: "Creating $out from 'node $in'",
    out: needs<string>(),
    in: needs<Input<string>>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: "",
    nodeArgs: "",
  });
}

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run [node's test runner](https://nodejs.org/api/test.html), passing in the specified
 * `in` JavaScript file and optional command arguments `args`, and write the test
 * output to `out`.
 *
 * All files `import`ed or `required` will be added as dependencies to `out`. So if any file
 * is later modified, `ninja` will rebuild `out` without you having to explicitly add
 * dependencies.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeNodeTestRule } from "@ninjutsu-build/node";
 *
 * const ninja = new NinjaBuilder();
 * const test = makeNodeTestRule(ninja);
 * test({
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
export function makeNodeTestRule(
  ninja: NinjaBuilder,
  name = "test",
): <O extends string>(a: {
  in: Input<string>;
  out: O;
  args?: string;
  nodeArgs?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  const testReporter = "@ninjutsu-build/node/lib/testReporter.mjs";
  return ninja.rule(name, {
    command:
      getNodeCommand(ninja) +
      ` --test --test-reporter=${resolvePath(
        ninja,
        testReporter,
      )} --test-reporter=tap --test-reporter-destination=stderr --test-reporter-destination=$out $nodeArgs $in $args`,
    description: "Running test $in",
    out: needs<string>(),
    in: needs<Input<string>>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: "",
    nodeArgs: "",
  });
}
