import {
  type NinjaBuilder,
  escapePath,
  needs,
  implicitDeps,
  implicitOut,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import {
  TsConfigSourceFile,
  type CompilerOptions,
  type CompilerOptionsValue,
} from "typescript";
import ts from "typescript";
import { platform } from "os";

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

function compilerOptionsToArray(
  compilerOptions: CompilerOptions = {},
): string[] {
  return Object.entries(compilerOptions).flatMap(([name, value]) =>
    compilerOptionToArray(name, value),
  );
}

// In order to pipe to $out we need to run with `cmd /c` on Windows.  Additionally
// we mention `node.exe` with the file extension to avoid the `winpty node` alias.
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
 *   noImplicitAny: true,
 *   isolatedModules: true,
 * });
 * ```
 *
 * Will create an empty file `$builddir/typechecked.stamp` if both `src/entrypoint1.ts` and
 * `src/entrypoint2.ts` (and all TypeScript files they `import`) are valid TypeScript.
 */
export function makeTypecheckRule(
  ninja: NinjaBuilder,
  name = "typecheck",
): <O extends string>(a: {
  in: readonly string[];
  out: O;
  compilerOptions?: CompilerOptions;
  [implicitDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: readonly string[];
}) => O {
  const rule = ninja.rule(name, {
    command:
      prefix + "node node_modules/@ninjutsu-build/tsc/dist/parseTSC.mjs $out $args -- $in",
    description: "Typechecking $in",
    in: needs<readonly string[]>(),
    out: needs<string>(),
    depfile: "$out.depfile",
    deps: "gcc",
    args: needs<string>(),
  });
  return <O extends string>(a: {
    in: readonly string[];
    out: O;
    compilerOptions?: CompilerOptions;
    [implicitDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: readonly string[];
  }): O => {
    const { compilerOptions, ...rest } = a;
    return rule({
      ...rest,
      args: compilerOptionsToArray(a.compilerOptions).join(" "),
    });
  };
}

/**
 * Create a rule in the specified `ninja` builder with the specified `name` that will
 * run `tsc` to type check and generate corresponding TypeScript files for `in` and
 * any TypeScript files that they depend on.
 *
 * Note that only one element of `in` (i.e. 1 entry point) is supported at the moment.
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
 * const [indexJS] = tsc({
 *   in: ["src/index.ts"],
 *   outDir: "dist",
 *   noImplicitAny: true,
 *   isolatedModules: true,
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 *
 * Will return `["dist/index.js"]` for `indexJS` and will create a `build.ninja` file that will
 * compile the TypeScript files `index.ts` and all their dependencies to JavaScript.
 */
export function makeTSCRule(
  ninja: NinjaBuilder,
  name = "tsc",
  dyndepRuleName = "tscDyndep",
): (a: {
  in: readonly [string];
  compilerOptions?: CompilerOptions;
  dyndepName: string;
  [implicitDeps]?: readonly string[];
  [orderOnlyDeps]?: readonly string[];
  [implicitOut]?: readonly string[];
  [validations]?: readonly string[];
}) => readonly string[] {
  const tscDyndep = ninja.rule(dyndepRuleName, {
    // TODO: Change this to something we can run with `npx`?
    command:
      prefix +
      "node node_modules/@ninjutsu-build/tsc/dist/makeDyndeps.mjs $args $in > $out",
    description: "Getting compilation dependencies for compiling $in",
    in: needs<readonly string[]>(),
    out: needs<string>(),
    args: needs<string>(),
  });
  const tsc = ninja.rule(name, {
    command: prefix + "npx tsc $in $args",
    description: "Compiling $in",
    in: needs<readonly [string]>(),
    out: needs<readonly [string]>(),
    args: needs<string>(),
  });
  return (a: {
    in: readonly [string];
    compilerOptions?: CompilerOptions;
    dyndepName: string;
    [implicitDeps]?: readonly string[];
    [orderOnlyDeps]?: readonly string[];
    [implicitOut]?: readonly string[];
    [validations]?: readonly string[];
  }): readonly [string] => {
    const {
      compilerOptions,
      dyndepName,
      [orderOnlyDeps]: orderDeps = [],
      [implicitOut]: otherOuts = [],
      ...rest
    } = a;
    const argsArr = compilerOptionsToArray(a.compilerOptions);
    const commandLine = ts.parseCommandLine(a.in.concat(argsArr));

    const args = argsArr.join(" ");
    const dyndep = tscDyndep({ out: dyndepName, in: a.in, args });

    // We need to set this to something, else we get a debug exception
    // in `getOutputFileNames`
    commandLine.options.configFilePath = "";

    const out = commandLine.fileNames
      .flatMap((path: string) =>
        ts.getOutputFileNames(commandLine, path, false),
      )
      .map(escapePath);
    return tsc({
      ...rest,
      // We only handle one output file at the moment, the rest will
      // go into [implicitOut].
      out: [out[0]],
      dyndep,
      args,
      [implicitOut]: otherOuts.concat(out.slice(1)),
      [orderOnlyDeps]: orderDeps.concat(dyndep),
    });
  };
}
