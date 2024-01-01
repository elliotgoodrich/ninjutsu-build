import {
  type NinjaBuilder,
  escapePath,
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
import { platform } from "os";
import { join } from "path";

function compilerOptionToArray(
  name: string,
  value: CompilerOptionsValue | TsConfigSourceFile,
): string[] {
  switch (typeof value) {
    case "string":
    case "number":
      return [`--${name}`, `${value}`];
    case "boolean":
      if (value) {
        return [`--${name}`];
      } else {
        return [];
      }
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

// In order to pipe to $out we need to run with `cmd /c` on Windows.
const prefix = platform() === "win32" ? "cmd /c " : "";

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `tsc` to type check all TypeScript files provided to `in`, and write an empty file
 * to `out` if successful.
 *
 * It is not necessary to specify all TypeScript files for the `in` argument, only the
 * entry points are needed.  Other TypeScript files that are `import`ed are added as
 * dependencies automatically by the `ninja` rule. This will cause the rule to be
 * rebuilt if any of these files are modified.
 *
 * No `tsconfig.json` file will be used in this rule.  Instead, all TypeScript compiler
 * options must be specified when creating the `ninja` build edge.
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
 */
export function makeTypeCheckRule(
  ninja: NinjaBuilder,
  name = "typecheck",
): <O extends string>(a: {
  in: readonly string[];
  out: O;
  compilerOptions?: CompilerOptions;
  cwd?: string;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: (out: string) => readonly string[];
}) => O {
  const rule = ninja.rule(name, {
    command:
      prefix +
      "node node_modules/@ninjutsu-build/tsc/dist/runTSC.mjs --cwd $cwd --out $out --depfile $out.depfile --listFilesOnly $args $in",
    description: "Typechecking $in",
    in: needs<readonly string[]>(),
    out: needs<string>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: needs<string>(),
    cwd: needs<string>(),
  });
  return <O extends string>(a: {
    in: readonly string[];
    out: O;
    compilerOptions?: CompilerOptions;
    cwd?: string;
    [implicitDeps]?: readonly string[];
    [orderOnlyDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: (out: string) => readonly string[];
  }): O => {
    const { compilerOptions = {}, cwd = ".", ...rest } = a;
    return rule({
      ...rest,
      cwd,
      args: compilerOptionsToArray(compilerOptions).join(" "),
    });
  };
}

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `tsc` to type check and generate corresponding TypeScript files for `in` and
 * any TypeScript files that they depend on.
 *
 * It is not necessary to specify all TypeScript files for the `in` argument, only the
 * entry points are needed.  Other TypeScript files that are `import`ed are added as
 * dependencies automatically by the `ninja` rule. This will cause the rule to be
 * rebuilt if any of these files are modified.
 *
 * No `tsconfig.json` file will be used in this rule.  Instead, all TypeScript compiler
 * options must be specified when creating the `ninja` build edge.
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
  name = "tsc",
): (a: {
  in: readonly string[];
  compilerOptions?: CompilerOptions;
  cwd?: string;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: (out: readonly string[]) => readonly string[];
}) => readonly string[] {
  const tsc = ninja.rule(name, {
    command:
      prefix +
      "node node_modules/@ninjutsu-build/tsc/dist/runTSC.mjs --cwd $cwd --out $out --depfile $out.depfile --listFiles $args -- $in",
    description: "Compiling $in",
    depfile: "$out.depfile",
    deps: "gcc",
    in: needs<readonly string[]>(),
    out: needs<string>(),
    cwd: needs<string>(),
    args: needs<string>(),
  });
  return (a: {
    in: readonly string[];
    compilerOptions?: CompilerOptions;
    cwd?: string;
    [implicitDeps]?: readonly string[];
    [orderOnlyDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: (out: readonly string[]) => readonly string[];
  }): readonly string[] => {
    const {
      compilerOptions = {},
      cwd = ".",
      [validations]: _validations,
      [implicitOut]: _implicitOut = [],
      ...rest
    } = a;
    const argsArr = compilerOptionsToArray(compilerOptions);
    const commandLine = ts.parseCommandLine(a.in.concat(argsArr));

    // We need to set this to something, else we get a debug exception
    // in `getOutputFileNames`
    commandLine.options.configFilePath = "";

    const out = commandLine.fileNames
      .flatMap((path: string) =>
        ts.getOutputFileNames(commandLine, path, false),
      )
      .map((p) => join(cwd, escapePath(p)).replaceAll("\\", "/"));
    tsc({
      ...rest,
      out: out[0],
      cwd,
      args: argsArr.join(" "),
      [implicitOut]: out.slice(1).concat(_implicitOut),
      [validations]:
        _validations === undefined ? undefined : () => _validations(out),
    });
    return out;
  };
}
