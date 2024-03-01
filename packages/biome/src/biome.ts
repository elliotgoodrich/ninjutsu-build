import {
  type NinjaBuilder,
  type Input,
  needs,
  getInput,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { join } from "node:path";
import { dirname } from "node:path/posix";
import { platform, arch } from "os";

const exe = platform() === "win32" ? ".exe" : "";
const prefix = platform() === "win32" ? "cmd /c " : "";

// Don't use `npx biome format` as this requires a node process and
// the overhead is so much greater than running the biome executable.
const biomeCommand = join(
  "@biomejs",
  `cli-${platform()}-${arch()}`,
  `biome${exe}`,
);

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `biome format` on the input file, overwriting its contents. The returned function
 * returns `{ file: string, [orderOnlyDeps]: string }` where the `file` property is the
 * `in` property passed as an argument, and `[orderOnlyDeps]` is an unspecified path to
 * an empty file that is updated after the formatting has completed.
 *
 * The returned function takes a `configPath` property, which is the path to the
 * [`biome.json` configuration file](https://biome.dev/reference/configuration/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * This rule is preferred when running over source files that are written by developers.
 * If you wish to format generated code that is the output of another build edge, then the
 * {@link makeFormatToRule} is preferred since `makeFormatRule` will overwrite the
 * generated file and cause `ninja` to view that file as dirty - causing it to be built every
 * file `ninja` is run.
 *
 * For example the following will format all test files in the `tests` directory and
 * then run the test file afterwards.  This uses ninja's order-only dependencies to make
 * sure that formatting always occurs before running the test.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeFormatRule } from "@ninjutsu-build/biome";
 * import { makeNodeTestRule } from "@ninjutsu-build/node";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const format = makeFormatRule(ninja);
 * const test = makeNodeTestRule(ninja);
 *
 * globSync("tests/*.test.js", { posix: true }).forEach((test) => {
 *   const formatted = format({
 *     in: test,
 *     configPath: "biome.json",
 *     args: "--no-errors-on-unmatched",
 *   });
 *   test({
 *     in: formatted,
 *     out: getInput(formatted) + ".txt",
 *   })
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeFormatRule(
  ninja: NinjaBuilder,
  name = "format",
): <I extends string>(args: {
  in: Input<I>;
  configPath: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: {
    file: string;
    [orderOnlyDeps]: string;
  }) => string | readonly string[];
}) => {
  file: I;
  [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${I}`;
} {
  const format = ninja.rule(name, {
    command:
      prefix +
      join("node_modules", biomeCommand) +
      " format $args --config-path $configPath --write $in > $out",
    description: "Formatting $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    configPath: needs<string>(),
    args: "",
  });
  return <I extends string>(a: {
    in: Input<I>;
    configPath: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: string | readonly string[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: {
      file: string;
      [orderOnlyDeps]: string;
    }) => string | readonly string[];
  }): {
    file: I;
    [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${I}`;
  } => {
    const {
      [implicitDeps]: _implicitDeps = [],
      [validations]: _validations,
      configPath,
      ...rest
    } = a;
    const input = getInput(a.in);
    const result = {
      file: input,
      [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${input}`,
    } as const;
    const validation =
      _validations === undefined
        ? undefined
        : {
            [validations]: () => _validations(result),
          };
    format({
      out: result[orderOnlyDeps],
      configPath: dirname(configPath),
      ...rest,
      [implicitDeps]: _implicitDeps.concat(a.configPath),
      ...validation,
    });
    return result;
  };
}

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `biome format` on the input file and save the output to the specified file. The
 * returned function returns the `out` parameter passed in.
 *
 * The returned function takes a `configPath` property, which is the path to the
 * [`biome.json` configuration file](https://biome.dev/reference/configuration/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * The example below shows both `makeFormatRule` and `makeFormatToRule` and when each
 * is appropriate.
 *
 * ```ts
 * import { NinjaBuilder, needs, type Input } from "@ninjutsu-build/core";
 * import { makeFormatRule, makeFormatToRule } from "@ninjutsu-build/biome";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 *
 * const ninja = new NinjaBuilder();
 * const format = makeFormatRule(ninja);
 * const formatTo = makeFormatToRule(ninja);
 * const node = makeNodeRule(ninja);
 *
 * const generatorJS = format({ in: "makeCode.js" });
 * const tmpOutputJS = node({
 *   in: generatorJS,
 *   out: "$builddir/generated.js",
 * });
 * const outputJS = formatTo({
 *   in: tmpOutputJS,
 *   out: "gen/generated.js"
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeFormatToRule(
  ninja: NinjaBuilder,
  name = "formatTo",
): <O extends string>(args: {
  in: Input<string>;
  out: O;
  configPath: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  const formatTo = ninja.rule(name, {
    command:
      prefix +
      join("node_modules", biomeCommand) +
      " format $args --config-path $configPath > $out",
    description: "Creating formatted $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    configPath: needs<string>(),
    args: "",
  });
  return <O extends string>(a: {
    in: Input<string>;
    out: O;
    configPath: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: string | readonly string[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): O => {
    const { [implicitDeps]: _implicitDeps = [], configPath, ...rest } = a;
    return formatTo({
      ...rest,
      configPath: dirname(configPath),
      [implicitDeps]: _implicitDeps.concat(a.configPath),
    });
  };
}

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `biome lint` on the input file and write the results to a unspecified file, whose
 * path will be returned by the function.
 *
 * The returned function takes a `configPath` property, which is the path to the
 * [`biome.json` configuration file](https://biome.dev/reference/configuration/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * For example the following will lint all `*.js` files in the `src` directory.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeLintRule } from "@ninjutsu-build/biome";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const lint = makeLintRule(ninja);
 *
 * globSync("src/*.js", { posix: true }).forEach((js) => lint({
 *   in: js,
 *   configPath: "biome.json",
 *   args: "--no-errors-on-unmatched",
 * }));
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 *
 * Linting and other static analysis rules are commonly done as a
 * [ninja validation step](https://ninja-build.org/manual.html#validations) to improve
 * parallelism and avoid increasing the critical path.
 *
 * The example below executes a set of tests using
 * [node's test runner](https://nodejs.org/api/test.html) and sets up a validation rule
 * for each unit test.  Note this example does not lint any JavaScript files other than the
 * test files.
 *
 * Whenever a test file is run via `ninja`, that file will be linted in parallel.
 *
 * ```ts
 * import { NinjaBuilder, validations } from "@ninjutsu-build/core";
 * import { makeLintRule } from "@ninjutsu-build/biome";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const lint = makeLintRule(ninja);
 * const node = makeNodeRule(ninja);
 *
 * globSync("tests/*.test.js", { posix: true }).map((test) => node({
 *   in: test,
 *   out: "$builddir/test-results/" + test,
 *   args: "--test",
 *   [validations]: () => lint({ in: test, configPath: "biome.json" }),
 * }));
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeLintRule(
  ninja: NinjaBuilder,
  name = "lint",
): <I extends string>(args: {
  in: Input<I>;
  configPath: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: string | readonly string[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => `$builddir/.ninjutsu-build/biome/lint/${I}` {
  const lint = ninja.rule(name, {
    command:
      prefix +
      join("node_modules", biomeCommand) +
      " lint $args --config-path $configPath $in > $out",
    description: "Linting $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    configPath: needs<string>(),
    args: "",
  });
  return <I extends string>(a: {
    in: Input<I>;
    configPath: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: string | readonly string[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): `$builddir/.ninjutsu-build/biome/lint/${I}` => {
    const { configPath, [implicitDeps]: _implicitDeps = [], ...rest } = a;
    return lint({
      out: `$builddir/.ninjutsu-build/biome/lint/${getInput(a.in)}`,
      configPath: dirname(configPath),
      ...rest,
      [implicitDeps]: _implicitDeps.concat(a.configPath),
    });
  };
}
