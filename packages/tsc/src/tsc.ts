import {
  type NinjaBuilder,
  type Input,
  getInput,
  getInputs,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import type {
  TsConfigSourceFile,
  CompilerOptions,
  CompilerOptionsValue,
} from "typescript";
import ts from "typescript";
import { platform } from "node:os";
import { relative, resolve } from "node:path";
import { dirname, join } from "node:path/posix";
import { readFile as readFileCb } from "node:fs";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCb);
const readFile = promisify(readFileCb);

// In order to pipe to $out we need to run with `cmd /c` on Windows.
const prefix = platform() === "win32" ? "cmd /c " : "";

// Use `node.exe` on windows to avoid the `winpty node` alias and for a
// small increase in performance.
const node = platform() === "win32" ? "node.exe" : "node";

// Use `call` + delayed expansion on windows otherwise we get the
// `errorLevel` of whatever command was run before. See this answer
// for more details https://stackoverflow.com/a/11178012
const echoErrCode =
  platform() === "win32" ? "call echo %^^errorLevel%" : "echo $$?";
const next = platform() === "win32" ? " &" : ";";

// Cache the path to `tsc` relative to our process
const tsc = relative(
  process.cwd(),
  require.resolve("typescript/bin/tsc"),
).replaceAll("\\", "/");

// In typescript's `getOutputFileNames` there is a debug assertion that the command
// line contains the same string as you pass for the next argument. However, they
// first call their `normalizePath` method first so if your path is not pre-normalized
// we'll hit this issue. e.g. `getOutputFileNames("./foo.mts", "./foo.mts")` will fail
// as they try to find "foo.mts" in "./foo.mts".
//
// The line hit is:
//     Debug.assert(contains(commandLine.fileNames, inputFileName), `Expected fileName to be present in command line`);
//
// This implementation is not the same as typescript's, but it should catch most issues.
function normalizePath(path: string): string {
  const fixedSlashes = path.replaceAll("\\", "/");
  return fixedSlashes.startsWith("./") ? fixedSlashes.slice(2) : fixedSlashes;
}

function getParseOutputPath(ninja: NinjaBuilder): string {
  // Replacing backslashes is not necessary because we pass these paths to node,
  // which understands both. It's just a bit easier on Windows to be able to
  // copy and paste commands results into a non-cmd shell.
  return relative(
    resolve(process.cwd(), ninja.outputDir),
    require.resolve("./parseOutput.mjs"),
  ).replaceAll("\\", "/");
}

function getTSCPath(ninja: NinjaBuilder): string {
  return relative(
    resolve(process.cwd(), ninja.outputDir),
    require.resolve("typescript/bin/tsc"),
  ).replaceAll("\\", "/");
}

function compilerOptionToArray(
  name: string,
  value: CompilerOptionsValue | TsConfigSourceFile,
): string[] {
  switch (typeof value) {
    case "string":
    case "number":
      return [`--${name}`, `${value}`];
    case "boolean":
      return value ? [`--${name}`] : [];
    case "object":
      if (value === null) {
        return [];
      } else if (Array.isArray(value)) {
        return [`--${name}`].concat(value.map((v) => `${v}`));
      } else {
        throw new Error("Unknown value in `CompilerOptions`!");
      }
    case "undefined":
      return [];
    default:
      throw new Error("Unknown value in `CompilerOptions`!");
  }
}

/**
 * Convert the TypeScript `compilerOptions` an array of strings of the equivalent command line
 * arguments that would be passed to `tsc`.
 */
export function compilerOptionsToArray(
  compilerOptions: CompilerOptions,
): string[] {
  return Object.entries(compilerOptions).flatMap(([name, value]) =>
    compilerOptionToArray(name, value),
  );
}

/**
 * Convert the TypeScript `compilerOptions` to the equivalent command line arguments that
 * would be passed to `tsc`.
 */
export function compilerOptionsToString(
  compilerOptions: CompilerOptions,
): string {
  return compilerOptionsToArray(compilerOptions).join(" ");
}

/**
 * Convert the TypeScript `compilerOptions` an array of strings of the equivalent command line
 * arguments that would be passed to `tsc` but skip any arguments are unable to be converted
 * (e.g. the `paths` object)
 */
function compilerOptionsToArrayBestEffort(
  compilerOptions: CompilerOptions,
): string[] {
  return Object.entries(compilerOptions).flatMap(([name, value]) => {
    try {
      return compilerOptionToArray(name, value);
    } catch (e) {
      return [];
    }
  });
}

/**
 * Return the list of filenames as described by the `tsConfig` file's `files`, `include`,
 * and `exclude` properties.
 */
async function getFileNames(
  ninja: NinjaBuilder,
  tsConfig: Input<string>,
): Promise<string[]> {
  const tsConfigPath = join(ninja.outputDir, getInput(tsConfig));
  const buffer = await readFile(tsConfigPath);

  // Use TypeScript's parsing to handle comments
  let { config, error } = ts.parseConfigFileTextToJson(
    tsConfigPath,
    buffer.toString(),
  );
  if (config === undefined) {
    throw new Error(
      error === undefined
        ? `Unknown error while parsing ${tsConfigPath}`
        : `${error.messageText}`,
    );
  }
  if (Array.isArray(config.include) && config.include.length > 0) {
    const { stdout } = await execFile(node, [
      tsc,
      "--showConfig",
      "--project",
      tsConfigPath,
    ]);
    // `--showConfig` displays valid JSON so use the built-in parser
    config = JSON.parse(stdout);
  }

  return config.files;
}

/**
 * Return the JSON result of running `tsc --showConfig` with the specified `tsConfig` file.
 */
async function showConfig(
  ninja: NinjaBuilder,
  tsConfig: Input<string>,
): Promise<{ files: string[]; compilerOptions: CompilerOptions }> {
  const { stdout } = await execFile(node, [
    tsc,
    "--showConfig",
    "--project",
    join(ninja.outputDir, getInput(tsConfig)),
  ]);

  // `--showConfig` displays valid JSON so use the built-in parser
  return JSON.parse(stdout);
}

/**
 * Return the list of entry points specified in the `tsconfig.json` file
 * located at the specified `tsConfigPath`.  This is a combination of
 * the `files`, `include`, and `exclude` properties, see the
 * [`tsconfig.json` documentation](https://www.typescriptlang.org/docs/handbook/tsconfig-json.html)
 * for further information.
 */
export async function getEntryPointsFromConfig(
  ninja: NinjaBuilder,
  tsConfigPath: Input<string>,
): Promise<string[]> {
  const tsConfigPathRaw = join(ninja.outputDir, getInput(tsConfigPath));
  const buffer = await readFile(tsConfigPathRaw);

  // Use TypeScript's parsing to handle comments
  let { config, error } = ts.parseConfigFileTextToJson(
    tsConfigPathRaw,
    buffer.toString(),
  );
  if (config === undefined) {
    throw new Error(
      error === undefined
        ? `Unknown error while parsing ${tsConfigPathRaw}`
        : `${error.messageText}`,
    );
  }

  // If we don't have any `include` property then `files` gives us
  // exactly the entry points we care about
  if (Array.isArray(config.include) && config.include.length > 0) {
    // There is no public typescript method to get the full list of entry points
    // so instead we call out to `tsc --showConfig`.
    const { stdout } = await execFile(node, [
      tsc,
      getTSCPath(ninja),
      "--showConfig",
      "--project",
      tsConfigPathRaw,
    ]);
    // `--showConfig` displays valid JSON so use the built-in parser
    config = JSON.parse(stdout);
  }

  const directory = dirname(getInput(tsConfigPath));
  return config.files.map((f: string) => join(directory, f));
}

export type TypeCheckRuleFn = {
  <O extends string>(a: {
    in: readonly Input<string>[];
    compilerOptions?: CompilerOptions;
    out: O;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): { file: string; [validations]: O }[];

  <O2 extends string>(a: {
    tsConfig: string;
    compilerOptions?: CompilerOptions;
    out: O2;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: string) => string | readonly string[];
  }): Promise<{ file: string; [validations]: O2 }[]>;
  <O3 extends string>(
    a: (
      | {
          in: readonly Input<string>[];
        }
      | {
          tsConfig: Input<string>;
        }
    ) & {
      compilerOptions?: CompilerOptions;
      out: O3;
      [implicitDeps]?: string | readonly string[];
      [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
      [implicitOut]?: string | readonly string[];
      [validations]?: (out: string) => string | readonly string[];
    },
  ):
    | { file: string; [validations]: O3 }[]
    | Promise<{ file: string; [validations]: O3 }[]>;
};

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `tsc` to type check all TypeScript files, and write an empty file to `out` if
 * successful.
 *
 * Files can be specified by either by listing them in the `in` property or by
 * specifying them in a `tsconfig.json` file and passing the path to it to the
 * `tsconfig` property.
 *
 * It is not necessary to specify all TypeScript files, only the entry points are
 * needed.  Other TypeScript files (and `tsconfig.json` file if used) that are
 * `import`ed are added as dependencies automatically by the `ninja` rule. This
 * will cause the rule to be rebuilt if any of these files are modified.
 *
 * No matter how files are specified, `tsc` compilation options can be supplied with
 * `compilerOptions` and will override any other options in the `tsconfig.json` file.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * WARNING! When adding new entry points to `tsconfig.json` or changing any options
 * that control the number or location of output files, the ninja file needs to be
 * regenerated to account for these.
 *
 * For example:
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeTypeCheckRule } from "@ninjutsu-build/tsc";
 *
 * const ninja = new NinjaBuilder();
 * const typecheck = makeTypeCheckRule(ninja);
 * const checked = typecheck({
 *   in: ["src/entrypoint1.ts", "src/entrypoint2.ts"],
 *   out: "$builddir/typechecked.stamp",
 *   compilerOptions: {
 *     noImplicitAny: true,
 *     isolatedModules: true,
 *   },
 * });
 * ```
 *
 * Will create an empty file `$builddir/typechecked.stamp` if both `src/entrypoint1.ts` and
 * `src/entrypoint2.ts` (and all TypeScript files they `import`) are valid TypeScript.
 *
 * This can be done with the following `tsconfig.json` file
 *
 * ```json
 * {
 *     "files": ["entrypoint1.ts", "entrypoint2.ts"],
 *     "compilerOptions": {
 *         "noImplicitAny": true,
 *         "isolatedModules": true
 *     }
 * }
 * ```
 *
 * and the following configuration file:
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeTypeCheckRule } from "@ninjutsu-build/tsc";
 *
 * const ninja = new NinjaBuilder();
 * const typecheck = makeTypeCheckRule(ninja);
 * const checked = typecheck({
 *   tsconfig: "src/tsconfig.json",
 *   out: "$builddir/typechecked.stamp",
 * });
 * ```
 */
export function makeTypeCheckRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): TypeCheckRuleFn {
  const { name = "typecheck", ...rest } = options;
  const typecheck = ninja.rule(name, {
    command:
      prefix +
      `(${node} ${getTSCPath(
        ninja,
      )} --listFiles --noEmit $args $in${next} ${echoErrCode}) | ${node} --experimental-import-meta-resolve ${getParseOutputPath(
        ninja,
      )} $out --touch $tsconfig`,
    description: "Typechecking $in",
    in: needs<readonly Input<string>[]>(),
    out: needs<string>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: needs<string>(),
    tsconfig: "",
    ...rest,
  });
  return (<O extends string>(
    a: (
      | {
          in: readonly Input<string>[];
        }
      | {
          tsConfig: Input<string>;
        }
    ) & {
      compilerOptions?: CompilerOptions;
      out: O;
      [implicitDeps]?: string | readonly string[];
      [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
      [implicitOut]?: string | readonly string[];
      [validations]?: (out: string) => string | readonly string[];
    },
  ):
    | { file: string; [validations]: O }[]
    | Promise<{ file: string; [validations]: O }[]> => {
    if ("in" in a) {
      const { compilerOptions = {}, ...rest } = a;
      const typechecked = typecheck({
        ...rest,
        args: compilerOptionsToString(compilerOptions),
      });
      return getInputs(a.in).map((file) => ({
        file,
        [validations]: typechecked,
      }));
    } else {
      const { tsConfig, compilerOptions = {}, ...rest } = a;
      const typechecked = typecheck({
        in: [tsConfig],
        args: compilerOptionsToString(compilerOptions) + " -p",
        tsconfig: `--tsconfig ${getInput(tsConfig)}`,
        ...rest,
      });
      const directory = dirname(getInput(a.tsConfig));
      return getFileNames(ninja, a.tsConfig).then((files) =>
        files.map((file) => ({
          file: join(directory, file),
          [validations]: typechecked,
        })),
      );
    }
  }) as TypeCheckRuleFn;
}

export type TSCRuleFn = {
  (a: {
    in: readonly Input<string>[];
    compilerOptions?: CompilerOptions;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: readonly string[]) => string | readonly string[];
  }): string[];
  (a: {
    tsConfig: Input<string>;
    compilerOptions?: CompilerOptions;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [implicitOut]?: string | readonly string[];
    [validations]?: (out: readonly string[]) => string | readonly string[];
  }): Promise<string[]>;
  (
    a: (
      | {
          in: readonly Input<string>[];
        }
      | {
          tsConfig: Input<string>;
        }
    ) & {
      compilerOptions?: CompilerOptions;
      [implicitDeps]?: string | readonly string[];
      [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
      [implicitOut]?: string | readonly string[];
      [validations]?: (out: readonly string[]) => string | readonly string[];
    },
  ): string[] | Promise<string[]>;
};

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `tsc` to type check and generate corresponding TypeScript files for `in` and
 * any TypeScript files that they depend on.
 *
 * Files can be specified by either by listing them in the `in` property or by
 * specifying them in a `tsconfig.json` file and passing the path to it to the
 * `tsconfig` property.
 *
 * It is not necessary to specify all TypeScript files, only the entry points are
 * needed.  Other TypeScript files (and `tsconfig.json` file if used) that are
 * `import`ed are added as dependencies automatically by the `ninja` rule. This
 * will cause the rule to be rebuilt if any of these files are modified.
 *
 * No matter how files are specified, `tsc` compilation options can be supplied with
 * `compilerOptions` and will override any other options in the `tsconfig.json` file.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * WARNING! When adding new entry points to `tsconfig.json` or changing any options
 * that control the number or location of output files, the ninja file needs to be
 * regenerated to account for these.
 *
 * For example:
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeTSCRule } from "@ninjutsu-build/tsc";
 * import { writeFileSync } from "fs";
 *
 * const ninja = new NinjaBuilder();
 * const tsc = makeTSCRule(ninja);
 * const [indexJS, cliJS] = tsc({
 *   in: ["src/index.ts", "src/cli.mts"],
 *   compilerOptions: {
 *     outDir: "dist",
 *     noImplicitAny: true,
 *     isolatedModules: true,
 *   },
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 *
 * Will return `"dist/index.js"` for `indexJS` and `"dist/cli.mjs"` for `cliJS` and will create
 * a `build.ninja` file that will compile those TypeScript files and all their dependencies to
 * JavaScript.
 *
 * By passing `declaration: true` as one of the compiler options we will generate
 * corresponding definition files.  Each TypeScript file passed to `in` have 2
 * entries in the returned array, the first being the corresponding JavaScript
 * and the second being the associated declaration file.
 *
 * For example:
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeTSCRule } from "@ninjutsu-build/tsc";
 * import { writeFileSync } from "fs";
 *
 * const ninja = new NinjaBuilder();
 * const tsc = makeTSCRule(ninja);
 * const [indexJS, indexDJS, cliJS, cliDJS] = tsc({
 *   in: ["src/index.ts", "src/cli.mts"],
 *   compilerOptions: {
 *     outDir: "dist",
 *     declaration: true,
 *   },
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeTSCRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: string | readonly string[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): TSCRuleFn {
  const { name = "tsc", ...rest } = options;
  const tsc = ninja.rule(name, {
    command:
      prefix +
      `(${node} ${getTSCPath(
        ninja,
      )} --listFiles $args $in${next} ${echoErrCode}) | ${node} --experimental-import-meta-resolve ${getParseOutputPath(
        ninja,
      )} $out $tsconfig`,
    description: "Compiling $in",
    depfile: "$out.depfile",
    deps: "gcc",
    in: needs<readonly Input<string>[]>(),
    out: needs<string>(),
    args: needs<string>(),
    tsconfig: "",
    ...rest,
  });
  return ((
    a: (
      | {
          in: readonly Input<string>[];
        }
      | {
          tsConfig: Input<string>;
        }
    ) & {
      compilerOptions?: CompilerOptions;
      [implicitDeps]?: string | readonly string[];
      [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
      [implicitOut]?: string | readonly string[];
      [validations]?: (out: readonly string[]) => string | readonly string[];
    },
  ): string[] | Promise<string[]> => {
    if ("in" in a) {
      const {
        compilerOptions = {},
        [implicitOut]: _implicitOut = [],
        [validations]: _validations,
        ...rest
      } = a;

      const args = compilerOptionsToArray(compilerOptions);
      const commandLine = ts.parseCommandLine(
        getInputs(a.in).map(normalizePath).concat(args),
      );

      // We need to set this to something, else we get a debug exception
      // in `getOutputFileNames`
      commandLine.options.configFilePath = "";

      const out = commandLine.fileNames.flatMap((path: string) =>
        ts.getOutputFileNames(commandLine, path, false),
      );
      tsc({
        ...rest,
        out: out[0],
        args: args.join(" "),
        [implicitOut]: out.slice(1).concat(_implicitOut),
        [validations]:
          _validations === undefined ? undefined : () => _validations(out),
      });
      return out;
    } else {
      const {
        tsConfig,
        compilerOptions: overrideOptions = {},
        [implicitOut]: _implicitOut = [],
        [validations]: _validations,
        ...rest
      } = a;
      return showConfig(ninja, tsConfig).then(({ files, compilerOptions }) => {
        const commandLine = ts.parseCommandLine(
          files.map(normalizePath).concat(
            compilerOptionsToArrayBestEffort({
              ...compilerOptions,
              ...overrideOptions,
            }),
          ),
        );

        // We need to set this to something, else we get a debug exception
        // in `getOutputFileNames`
        commandLine.options.configFilePath = "";

        const directory = dirname(getInput(tsConfig));
        const out = commandLine.fileNames
          .flatMap((path: string) =>
            ts.getOutputFileNames(commandLine, path, false),
          )
          .map((f) => join(directory, f));
        tsc({
          ...rest,
          in: [tsConfig],
          out: out[0],
          args: compilerOptionsToString(overrideOptions) + " -p",
          tsconfig: `--tsconfig ${getInput(tsConfig)}`,
          [implicitOut]: out.slice(1).concat(_implicitOut),
          [validations]:
            _validations === undefined ? undefined : () => _validations(out),
        });
        return out;
      });
    }
  }) as TSCRuleFn;
}
