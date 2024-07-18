import {
  type NinjaBuilder,
  type Input,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { platform } from "node:os";
import { relative, resolve } from "node:path";
import { isAbsolute } from "node:path/posix";

function resolvePath(ninja: NinjaBuilder, file: string): string {
  const path = relative(
    resolve(process.cwd(), ninja.outputDir),
    require.resolve(file),
  ).replaceAll("\\", "/");
  // Make sure that relative paths start with "./" or "../" as node
  // will resolve "foo/bar.js" as "node_modules/foo/bar.js" instead
  // of "./foo/bar.js".
  return !isAbsolute(path) && !path.startsWith("../") ? "./" + path : path;
}

// Note that within a data URL we can only import builtin modules and
// absolute paths (https://nodejs.org/api/esm.html#data-imports) which is
// why we need to get the full path for `depfile.cjs`.
function getImportCode(ninja: NinjaBuilder): string {
  return (
    "import { register } from 'node:module';" +
    "import { pathToFileURL } from 'node:url';" +
    "import { MessageChannel } from 'node:worker_threads';" +
    `import { open, addDependency } from 'file://${require
      .resolve("./depfile.cjs")
      .replaceAll("\\", "/")}';` +
    "open('$out');" +
    "const { port1, port2 } = new MessageChannel();" +
    "port1.on('message', addDependency);" +
    "port1.unref();" +
    `register('${resolvePath(
      ninja,
      "./hookImport.mjs",
    )}', { parentURL: pathToFileURL('./'), data: port2, transferList: [port2] });`
  );
}

// USe `node.exe` with the file extension to avoid the `winpty node` alias.
const node = platform() === "win32" ? "node.exe" : "node";

function getNodeCommand(ninja: NinjaBuilder): string {
  return `${node} --require "${resolvePath(
    ninja,
    "./hookRequire.cjs",
  )}" --import "data:text/javascript,${getImportCode(ninja)}"`;
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `node`, passing in the specified `in` JavaScript file
 * and optional command arguments `args`, and write the output to `out`.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * All files `import`ed or `required` will be added as dependencies to `out`. So if any file
 * is later modified, `ninja` will rebuild `out` without you having to explicitly add
 * dependencies.
 *
 * For example, given the script that writes "Hello World!" to the file passed as the
 * `--output` parameter,
 *
 * ```ts
 * import { parseArgs } from "node:util";
 * import { writeFileSync } from "node:fs";
 *
 * const args = parseArgs({
 *   options: {
 *     output: {
 *       type: "string",
 *     },
 *   },
 * });
 *
 * writeFileSync(args.values.output, "Hello World!");
 * ```
 *
 * We can invoke this with `ninjutsu-build` like so,
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
 *   args: "--output",
 * });
 * ```
 *
 * If instead your script writes to the console then you can use shell redirection
 * within the `args` parameter,
 *
 * ```ts
 * node({
 *   in: "src/index.js",
 *   out: "$builddir/out.txt",
 *   args: ">",
 * });
 * ```
 */
export function makeNodeRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: {
  in: Input<string>;
  out: O;
  args: string;
  nodeArgs?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => Input<string> | readonly Input<string>[];
}) => O {
  // Run within `cmd` in Windows in case the user wants to pipe the output to a file
  const prefix = platform() === "win32" ? "cmd /c " : "";
  const { name = "node", ...rest } = options;
  return ninja.rule(name, {
    command: prefix + getNodeCommand(ninja) + " $nodeArgs $in $args $out",
    description: "Creating $out from 'node $in'",
    out: needs<string>(),
    in: needs<Input<string>>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: "",
    nodeArgs: "",
    ...rest,
  });
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run [node's test runner](https://nodejs.org/api/test.html),
 * passing in the specified `in` JavaScript file and optional command arguments `args`,
 * and write the test output to `out`.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
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
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: {
  in: Input<string>;
  out: O;
  args?: string;
  nodeArgs?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => Input<string> | readonly Input<string>[];
}) => O {
  const { name = "test", ...rest } = options;
  return ninja.rule(name, {
    command:
      getNodeCommand(ninja) +
      ` --test --test-reporter=${resolvePath(
        ninja,
        "./testReporter.mjs",
      )} --test-reporter=tap --test-reporter-destination=stderr --test-reporter-destination=$out $nodeArgs $in $args`,
    description: "Running test $in",
    out: needs<string>(),
    in: needs<Input<string>>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: "",
    nodeArgs: "",
    ...rest,
  });
}
