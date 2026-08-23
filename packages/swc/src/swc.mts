import {
  type NinjaBuilder,
  type Input,
  needs,
  orderOnlyDeps,
  implicitDeps,
  validations,
} from "@ninjutsu-build/core";
import {
  resolve as resolveNative,
  relative as relativeNative,
} from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` (defaulting to `"swc"`) that will run `swc` on the input file
 * and write the result to the output file.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * The returned function takes an `in` property for the TypeScript source file
 * and an `out` property for the output file path, and returns the value of
 * `out` to allow the result to be passed to other rules.  It also takes an
 * optional `args` property to pass additional options to the SWC CLI.  The
 * default value for `args` can be set in `options.args` and overridden per
 * build edge.
 *
 * For example, the following will transpile all TypeScript source files in the
 * `src` directory to the `dist` directory,
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeSWCRule } from "@ninjutsu-build/swc";
 * import { basename } from "node:path";
 * import { globSync } from "node:fs";
 *
 * const ninja = new NinjaBuilder();
 * const swc = makeSWCRule(ninja, {
 *   args: ["-C", "jsc.target=es2018", "-C", "module.type=commonjs"],
 * });
 *
 * globSync("src/*.ts").map((ts) =>
 *   swc({
 *     in: ts,
 *     out: `dist/${basename(ts, ".ts")}.js`,
 *   }),
 * );
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeSWCRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    args?: readonly string[];
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(args: {
  in: Input<string>;
  out: O;
  args?: readonly string[];
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: string) => Input<string> | readonly Input<string>[];
}) => O {
  const { args: defaultArgs, name = "swc", ...restOptions } = options;
  const swcPath = relativeNative(
    resolveNative(process.cwd(), ninja.outputDir),
    fileURLToPath(import.meta.resolve("@swc/cli/bin/swc.js")),
  );
  const node = platform() === "win32" ? "node.exe" : "node";
  const swc = ninja.rule(name, {
    command: `${node} ${swcPath} $in -o $out -q $args`,
    description: "Transpiling $in",
    out: needs<string>(),
    in: needs<Input<string>>(),
    args: "",
    ...restOptions,
  });
  return <O extends string>({
    args: argsArr = defaultArgs ?? [],
    ...rest
  }: {
    in: Input<string>;
    out: O;
    args?: readonly string[];
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [validations]?: (out: string) => Input<string> | readonly Input<string>[];
  }): O => {
    const cliArgs = argsArr.length === 0 ? {} : { args: argsArr.join(" ") };
    return swc({
      ...rest,
      ...cliArgs,
    });
  };
}
