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
import { join, relative, resolve } from "node:path";
import { platform, arch } from "node:os";

const exe = platform() === "win32" ? ".exe" : "";
const prefix = platform() === "win32" ? "cmd /c " : "";
const touch = platform() === "win32" ? "type NUL >" : "touch";

// Don't use `npx biome format` as this requires a node process and
// the overhead is so much greater than running the biome executable.
function getBiomePath(ninja: NinjaBuilder): string {
  return relative(
    resolve(process.cwd(), ninja.outputDir),
    require.resolve(
      join("@biomejs", `cli-${platform()}-${arch()}`, `biome${exe}`),
    ),
  );
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `biome format` on the input file, overwriting its
 * contents. The returned function returns `{ file: string, [orderOnlyDeps]: string }`
 * where the `file` property is the `in` property passed as an argument, and
 * `[orderOnlyDeps]` is an unspecified path to an empty file that is updated after the
 * formatting has completed.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
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
 * const format = makeFormatRule(ninja, { configPath: "src/biome.json" });
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
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <I extends string>(args: {
  in: Input<I>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: {
    file: string;
    [orderOnlyDeps]: string;
  }) => string | readonly string[];
}) => {
  file: I;
  [orderOnlyDeps]: `$builddir/.ninjutsu-build/biome/format/${I}`;
} {
  const { name = "format", configPath: defaultConfigPath, ...rest } = options;
  const format = ninja.rule(name, {
    command: prefix + getBiomePath(ninja) + " format $args --write $in > $out",
    description: "Formatting $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <I extends string>(a: {
    in: Input<I>;
    configPath?: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
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
      configPath = defaultConfigPath,
      args = "",
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
      args:
        configPath === undefined ? args : args + "--config-path " + configPath,
      ...rest,
      [implicitDeps]:
        configPath === undefined
          ? _implicitDeps
          : _implicitDeps.concat(configPath),
      ...validation,
    });
    return result;
  };
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `biome format` on the input file and save the output
 * to the specified file. The returned function returns the `out` parameter passed in.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
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
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(args: {
  out: O;
  in: Input<string>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  // Type cannot handle forward slashes in paths so instead we pass `$inBackSlash`
  // for windows that has backslashes
  const cat = platform() === "win32" ? "type" : "cat";
  const inVar = platform() === "win32" ? "$inBackSlash" : "$in";
  const { name = "formatTo", configPath: defaultConfigPath, ...rest } = options;
  const formatTo = ninja.rule(name, {
    command: `${prefix}${cat} ${inVar} | ${getBiomePath(
      ninja,
    )} format $args --stdin-file-path=$in > $out`,
    description: "Formatting $in to $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <O extends string>(a: {
    out: O;
    in: Input<string>;
    configPath?: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): O => {
    const {
      [implicitDeps]: _implicitDeps = [],
      configPath = defaultConfigPath,
      args = "",
      ...rest
    } = a;
    const extra =
      platform() === "win32"
        ? { inBackSlash: getInput(a.in).replaceAll("/", "\\") }
        : {};
    return formatTo({
      ...rest,
      ...extra,
      args:
        configPath === undefined ? args : args + "--config-path " + configPath,
      [implicitDeps]:
        configPath === undefined
          ? _implicitDeps
          : _implicitDeps.concat(configPath),
    });
  };
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `biome format` on the input file and write the results
 * to a unspecified file, whose path will be returned by the function along with a
 * validation step on the unspecified file containing the results. This causes all build
 * edges that depend on this input to add a validation step on checking whether the input
 * file is correctly formatted.
 *
 * This is useful when build a ninja file for CI as you may not want to fix formatting
 * issues with {@link makeFormatRule} and only alert when a file is not formatted.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
 * [`biome.json` configuration file](https://biome.dev/reference/configuration/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * For example the following will either format or check test files are formatted
 * and run the tests.  The `--ci` flag passed in will cause the generated ninja file to
 * check the formatting in parallel to running the tests, but will not overwrite the
 * source files. Whereas if no flag is passed in will will reformat the source files
 * in parallel and then run the corresponding test once that has finished.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeFormatRule, makeCheckFormattedRule } from "@ninjutsu-build/biome";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 *
 * const nonDestructive = process.argv.includes("--ci");
 * const format = nonDestructive
 *   ? makeCheckFormattedRule(ninja)
 *   : makeFormatRule(ninja);
 *
 * for (const js of globSync("src/*.test.js", { posix: true })) {
 *   const formatted = format({
 *     in: js,
 *     configPath: "biome.json",
 *     args: "--no-errors-on-unmatched",
 *   });
 *   test({
 *     in: formatted,
 *     out: getInput(formatted) + ".txt",
 *   })
 * }
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 *
 * Linting and other static analysis rules are commonly done as a
 * [ninja validation step](https://ninja-build.org/manual.html#validations) to improve
 * parallelism and avoid increasing the critical path.
 */
export function makeCheckFormattedRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <I extends string>(args: {
  in: Input<I>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => {
  file: I;
  [validations]: `$builddir/.ninjutsu-build/biome/checkFormatted/${I}`;
  [orderOnlyDeps]?: string | readonly string[];
} {
  const {
    name = "checkFormatted",
    configPath: defaultConfigPath,
    ...rest
  } = options;
  const checkFormatted = ninja.rule(name, {
    command:
      prefix + getBiomePath(ninja) + ` format $args $in && ${touch} $out`,
    description: "Checking format of $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <I extends string>(a: {
    in: Input<I>;
    configPath?: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): {
    file: I;
    [validations]: `$builddir/.ninjutsu-build/biome/checkFormatted/${I}`;
    [orderOnlyDeps]?: string | readonly string[];
  } => {
    const {
      configPath = defaultConfigPath,
      args = "",
      [implicitDeps]: _implicitDeps = [],
      ...rest
    } = a;
    const file = getInput(a.in);
    const validationFile = checkFormatted({
      out: `$builddir/.ninjutsu-build/biome/checkFormatted/${file}`,
      args:
        configPath === undefined ? args : args + "--config-path " + configPath,
      [implicitDeps]:
        configPath === undefined
          ? _implicitDeps
          : _implicitDeps.concat(configPath),
      ...rest,
    });

    // If there is a build-order dependency then we must return this to
    // anyone depending on our output since we are forwarding it from our
    // input and just injecting a validation step
    const forwardDeps =
      typeof a.in === "object" && orderOnlyDeps in a.in
        ? { [orderOnlyDeps]: a.in[orderOnlyDeps] }
        : {};

    return {
      file,
      [validations]: validationFile,
      ...forwardDeps,
    };
  };
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `biome lint` on the input file and write the results to
 * a unspecified file, whose path will be returned by the function along with a validation
 * step on the unspecified file containing the results. This causes all build edges that
 * depend on this input to add a validation step on the linting.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
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
 * for (const js of globSync("src/*.js", { posix: true })) {
 *   lint({
 *     in: js,
 *     configPath: "biome.json",
 *     args: "--no-errors-on-unmatched",
 *   });
 * }
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
 * import { makeNodeTestRule } from "@ninjutsu-build/node";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const lint = makeLintRule(ninja);
 * const test = makeNodeTestRule(ninja);
 *
 * for (const path of globSync("tests/*.test.js", { posix: true })) {
 *   const linted = lint({ in: path, configPath: "biome.json" });
 *   test({
 *     in: linted,
 *     out: "$builddir/test-results/" + path,
 *   });
 * )
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeLintRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <I extends string>(args: {
  in: Input<I>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: string | readonly string[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [implicitOut]?: string | readonly string[];
  [validations]?: (out: string) => string | readonly string[];
}) => {
  file: I;
  [validations]: `$builddir/.ninjutsu-build/biome/lint/${I}`;
  [orderOnlyDeps]?: string | readonly string[];
} {
  const { name = "lint", configPath: defaultConfigPath, ...rest } = options;
  const lint = ninja.rule(name, {
    command: prefix + getBiomePath(ninja) + ` lint $args $in && ${touch} $out`,
    description: "Linting $in",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <I extends string>(a: {
    in: Input<I>;
    configPath?: string;
    args?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): {
    file: I;
    [validations]: `$builddir/.ninjutsu-build/biome/lint/${I}`;
    [orderOnlyDeps]?: string | readonly string[];
  } => {
    const {
      configPath = defaultConfigPath,
      args = "",
      [implicitDeps]: _implicitDeps = [],
      ...rest
    } = a;

    const file = getInput(a.in);
    const validationFile = lint({
      out: `$builddir/.ninjutsu-build/biome/lint/${file}`,
      args:
        configPath === undefined ? args : args + "--config-path " + configPath,
      [implicitDeps]:
        configPath === undefined
          ? _implicitDeps
          : _implicitDeps.concat(configPath),
      ...rest,
    });

    // If there is a build-order dependency then we must return this to
    // anyone depending on our output since we are forwarding it from our
    // input and just injecting a validation step
    const forwardDeps =
      typeof a.in === "object" && orderOnlyDeps in a.in
        ? { [orderOnlyDeps]: a.in[orderOnlyDeps] }
        : {};

    return {
      file,
      [validations]: validationFile,
      ...forwardDeps,
    };
  };
}
