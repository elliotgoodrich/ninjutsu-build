import {
  type NinjaBuilder,
  type Input,
  needs,
  implicitDeps,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { existsSync } from "node:fs";

function concatConfig(
  implicitDeps: Input<string> | readonly Input<string>[],
): readonly Input<string>[] {
  const arrayDeps = Array.isArray(implicitDeps) ? implicitDeps : [implicitDeps];
  return existsSync("bunfig.toml")
    ? arrayDeps.concat("bunfig.toml")
    : arrayDeps;
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `bun build --no-bundle` on the input file and writing
 * contents to the output file.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * The returned function takes an optional `args` property, to pass any additional options
 * to the CLI.
 *
 * The returned function will create build edges that each have an implicit dependency on
 * the local `bunfig.toml` file if it exists when `makeTranspileRule` existed.
 *
 * At the moment it is not possible to silence the output of `bun` when there are no errors.
 *
 * For example, the following will transpile all TypeScript test files in the `tests`
 * directory to the `$builddir/dist` folder with the `.mjs` file extension.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeTranspileRule } from "@ninjutsu-build/bun";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const transpile = makeTranspileRule(ninja);
 *
 * globSync("src/*.tests.ts", { posix: true }).map((ts) =>
 *  transpile({
 *     in: ts,
 *     out: join("$builddir", "dist", basename(file, extname(file)) + ".mjs"),
 *     args: "--target node",
 *   })
 * );
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeTranspileRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(args: {
  in: Input<string>;
  out: O;
  args?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: string) => Input<string> | readonly Input<string>[];
}) => O {
  const {
    name = "buntranspile",
    [implicitDeps]: _implicitDeps = [],
    ...rest
  } = options;
  return ninja.rule(name, {
    command: "bun build $in --outfile $out --no-bundle $args",
    description: "Transpiling $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: "",
    [implicitDeps]: concatConfig(_implicitDeps),
    ...rest,
  });
}
