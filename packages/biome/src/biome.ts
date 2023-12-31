import {
  NinjaBuilder,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { join } from "node:path";
import { platform, arch } from "os";

const exe = platform() === "win32" ? ".exe" : "";
const prefix = platform() === "win32" ? "cmd /c " : "";

// Don't use `npx biome format` as this requires a node process and
// the overhead is so much greater than running the biome executable.
const biomeCommand = join(
  "@biome",
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
 * For example the following will format all test files in the `tests` directory and
 * then run the test file afterwards.  This uses ninja's order-only dependencies to make
 * sure that formatting always occurs before running the test.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeFormatRule } from "@ninjutsu-build/biome";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const format = makeFormatRule(ninja);
 * const node = makeNodeRule(ninja);
 *
 * globSync("tests/*.test.js", { posix: true }).forEach((test) => {
 *   const formatted = format({
 *     in: test,
 *     configPath: "biome.json",
 *     args: "--no-errors-on-unmatched",
 *   });
 *   node({
 *     in: formatted.file,
 *     args: "--test",
 *     [orderOnlyDeps]: formatted[orderOnlyDeps],
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
  in: I;
  configPath: string;
  args?: string;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: (out: {
    file: string;
    [orderOnlyDeps]: string;
  }) => readonly string[];
}) => {
  file: I;
  [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${I}`;
} {
  const format = ninja.rule(name, {
    command:
      prefix +
      join("node_modules", biomeCommand) +
      " format --write $in > $out",
    description: "Formatting $in",
    in: needs<string>(),
    out: needs<string>(),
    configPath: needs<string>(),
    args: "",
  });
  return <I extends string>(a: {
    in: I;
    configPath: string;
    args?: string;
    [implicitDeps]?: readonly string[];
    [orderOnlyDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: (out: {
      file: string;
      [orderOnlyDeps]: string;
    }) => readonly string[];
  }): {
    file: I;

    [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${I}`;
  } => {
    const {
      [implicitDeps]: _implicitDeps = [],
      [validations]: _validations,
      ...rest
    } = a;
    const result = {
      file: a.in,
      [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${a.in}`,
    } as const;
    const validation =
      _validations === undefined
        ? undefined
        : {
            [validations]: () => _validations(result),
          };
    format({
      out: result[orderOnlyDeps],
      ...rest,
      [implicitDeps]: _implicitDeps.concat(a.configPath),
      ...validation,
    });
    return result;
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
  in: I;
  configPath: string;
  args?: string;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: (out: string) => readonly string[];
}) => `$builddir/.ninjutsu-build/biome/lint/${I}` {
  const lint = ninja.rule(name, {
    command:
      prefix +
      join("node_modules", biomeCommand) +
      " lint $args --config-path $configPath $in > $out",
    description: "Formatting $in",
    in: needs<string>(),
    out: needs<string>(),
    configPath: needs<string>(),
    args: "",
  });
  return <I extends string>(a: {
    in: I;
    configPath: string;
    args?: string;
    [implicitDeps]?: readonly string[];
    [orderOnlyDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: (out: string) => readonly string[];
  }): `$builddir/.ninjutsu-build/biome/lint/${I}` => {
    const { [implicitDeps]: _implicitDeps = [], ...rest } = a;
    return lint({
      out: `$builddir/.ninjutsu-build/biome/lint/${a.in}`,
      ...rest,
      [implicitDeps]: _implicitDeps.concat(a.configPath),
    });
  };
}
