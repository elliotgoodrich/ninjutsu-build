import {
  type NinjaBuilder,
  type Input,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { existsSync } from "node:fs";

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `bun build --no-bundle` on the input file and writing contents to the output file.
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
  name = "buntranspile",
): <O extends string>(args: {
  in: Input<string>;
  out: O;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  return ninja.rule(name, {
    command: "bun build $in --outfile $out --no-bundle $args",
    description: "Transpiling $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: "",
    [implicitDeps]: existsSync("bunfig.toml") ? "bunfig.toml" : undefined,
  });
}
