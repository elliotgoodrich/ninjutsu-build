import {
  type NinjaBuilder,
  type Input,
  needs,
  getInput,
  implicitDeps,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import { createRequire } from "node:module";
import { join, relative, resolve } from "node:path";
import { platform } from "node:os";

const _require = createRequire(import.meta.url);
const exe = platform() === "win32" ? ".exe" : "";
const prefix = platform() === "win32" ? "cmd /c " : "";
const touch = platform() === "win32" ? "type NUL >" : "touch";
const cat = platform() === "win32" ? "type" : "cat";

function getDprintPath(ninja: NinjaBuilder): string {
  return relative(
    resolve(process.cwd(), ninja.outputDir),
    _require.resolve(join("dprint", `dprint${exe}`)),
  );
}

function concatConfig(
  deps: Input<string> | readonly Input<string>[],
  configPath: string | undefined,
): readonly Input<string>[] {
  const arr = Array.isArray(deps) ? deps : [deps];
  return configPath === undefined ? arr : arr.concat(configPath);
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `dprint fmt` on the input file, overwriting its
 * contents. The returned function returns `{ file: string, [orderOnlyDeps]: string }`
 * where the `file` property is the `in` property passed as an argument, and
 * `[orderOnlyDeps]` is an unspecified path to an empty file that is updated after the
 * formatting has completed.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
 * [`dprint.json` configuration file](https://dprint.dev/config/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeFormatRule } from "@ninjutsu-build/dprint";
 * import { globSync } from "node:fs";
 *
 * const ninja = new NinjaBuilder();
 * const format = makeFormatRule(ninja, { configPath: "dprint.json" });
 *
 * for (const ts of globSync("src/*.ts")) {
 *   format({ in: ts });
 * }
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeFormatRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <I extends string>(args: {
  in: Input<I>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: {
    file: string;
    [orderOnlyDeps]: string;
  }) => Input<string> | readonly Input<string>[];
}) => {
  file: I;
  [orderOnlyDeps]: `$builddir/.ninjutsu-build/dprint/format/${I}`;
} {
  const { name = "format", configPath: defaultConfigPath, ...rest } = options;
  const format = ninja.rule(name, {
    command: `${prefix}${getDprintPath(ninja)} fmt $args $in && ${touch} $out`,
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
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [validations]?: (out: {
      file: string;
      [orderOnlyDeps]: string;
    }) => Input<string> | readonly Input<string>[];
  }): {
    file: I;
    [orderOnlyDeps]: `$builddir/.ninjutsu-build/dprint/format/${I}`;
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
      [orderOnlyDeps]: `$builddir/.ninjutsu-build/dprint/format/${input}`,
    } as const;
    const validation =
      _validations === undefined
        ? undefined
        : {
            [validations]: () => _validations(result),
          };
    format({
      out: result[orderOnlyDeps],
      args: configPath === undefined ? args : args + "--config " + configPath,
      ...rest,
      [implicitDeps]: concatConfig(_implicitDeps, configPath),
      ...validation,
    });
    return result;
  };
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `dprint fmt` on the input file and save the formatted
 * output to the specified output file. The returned function returns the `out` parameter
 * passed in.
 *
 * This is preferred over {@link makeFormatRule} when formatting generated code that is
 * the output of another build edge, since `makeFormatRule` overwrites the source file
 * and would cause ninja to view it as dirty on every run.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
 * [`dprint.json` configuration file](https://dprint.dev/config/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeFormatToRule } from "@ninjutsu-build/dprint";
 * import { makeNodeRule } from "@ninjutsu-build/node";
 *
 * const ninja = new NinjaBuilder();
 * const formatTo = makeFormatToRule(ninja);
 * const node = makeNodeRule(ninja);
 *
 * const generatedJS = node({ in: "makeCode.mjs", out: "$builddir/generated.ts" });
 * const outputTS = formatTo({ in: generatedJS, out: "gen/generated.ts" });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeFormatToRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(args: {
  out: O;
  in: Input<string>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: string) => string | readonly string[];
}) => O {
  const inVar = platform() === "win32" ? "$inBackSlash" : "$in";
  const { name = "formatTo", configPath: defaultConfigPath, ...rest } = options;
  const formatTo = ninja.rule(name, {
    command: `${prefix}${cat} ${inVar} | ${getDprintPath(ninja)} fmt $args --stdin $in > $out`,
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
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
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
      args: configPath === undefined ? args : args + "--config " + configPath,
      [implicitDeps]: concatConfig(_implicitDeps, configPath),
    });
  };
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `dprint check` on the input file and write the results
 * to an unspecified file, whose path will be returned by the function along with a
 * validation step. This causes all build edges that depend on this input to add a
 * validation step on checking whether the input file is correctly formatted.
 *
 * This is useful when building a ninja file for CI as you may not want to fix formatting
 * issues with {@link makeFormatRule} and only alert when a file is not formatted.
 *
 * Any `configPath`, `implicitDeps` or `orderOnlyDeps` passed in `options` will be added
 * to all build edges generated with the returned function.
 *
 * The returned function takes an optional `configPath` property, which is the path to the
 * [`dprint.json` configuration file](https://dprint.dev/config/).  An optional
 * `args` property exists to pass in any additional options to the CLI.
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeCheckFormattedRule } from "@ninjutsu-build/dprint";
 * import { globSync } from "node:fs";
 *
 * const ninja = new NinjaBuilder();
 * const checkFormatted = makeCheckFormattedRule(ninja, { configPath: "dprint.json" });
 *
 * for (const ts of globSync("src/*.ts")) {
 *   checkFormatted({ in: ts });
 * }
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeCheckFormattedRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    configPath?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <I extends string>(args: {
  in: Input<I>;
  configPath?: string;
  args?: string;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: string) => string | readonly string[];
}) => {
  file: I;
  [validations]: `$builddir/.ninjutsu-build/dprint/checkFormatted/${I}`;
  [orderOnlyDeps]?: string | readonly string[];
} {
  const {
    name = "checkFormatted",
    configPath: defaultConfigPath,
    ...rest
  } = options;
  const checkFormatted = ninja.rule(name, {
    command: `${prefix}${getDprintPath(
      ninja,
    )} check $args $in && ${touch} $out`,
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
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [validations]?: (out: string) => string | readonly string[];
  }): {
    file: I;
    [validations]: `$builddir/.ninjutsu-build/dprint/checkFormatted/${I}`;
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
      out: `$builddir/.ninjutsu-build/dprint/checkFormatted/${file}`,
      args: configPath === undefined ? args : args + "--config " + configPath,
      [implicitDeps]: concatConfig(_implicitDeps, configPath),
      ...rest,
    });

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
