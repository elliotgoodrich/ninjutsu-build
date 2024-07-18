import {
  type NinjaBuilder,
  type Input,
  needs,
  implicitDeps,
  validations,
  orderOnlyDeps,
} from "@ninjutsu-build/core";
import type { BuildOptions } from "esbuild";
import { join, relative, resolve } from "node:path";

function serializeBuildOptions(args: Omit<BuildOptions, "outfile">): string {
  let result = "";
  for (const name in args) {
    const value = args[name as keyof typeof args];
    switch (typeof value) {
      case "string":
      case "number":
        result += " --" + name + "=" + value;
        break;
      case "boolean":
        result += value ? " --" + name : "";
        break;
      case "object":
        if (value === null) {
          break;
        } else if (Array.isArray(value)) {
          result += " --" + name + "=" + value.join(",");
        } else {
          for (const key in value) {
            result +=
              " --" + name + "=" + key + ":" + value[key as keyof typeof value];
          }
        }
        break;
      case "undefined":
        break;
      default:
        throw new Error("Unknown value in `BuildOptions`!");
    }
  }
  return result;
}

/**
 * Create a rule in the specified `ninja` builder with the optionally specified
 * `options.name` that will run `esbuild` on the input file and write the result to the
 * output file.
 *
 * Any `implicitDeps` or `orderOnlyDeps` passed in `options` will be added to all build
 * edges generated with the returned function.
 *
 * The returned function takes an optional `args` property, to pass any additional options
 * to the CLI.  Note that the `--bundle` flag is not passed by default so you most likely
 * want to pass `{ bundle: true }` here.
 *
 * The returned function will create build edges that each have an implicit dependency on
 * the local `bunfig.toml` file if it exists when `makeTranspileRule` existed.
 *
 * For example, the following will format all JavaScript files in the `src`
 * directory and bundle them to `dist/entry.js`,
 *
 * ```ts
 * import { NinjaBuilder } from "@ninjutsu-build/core";
 * import { makeESBuildRule } from "@ninjutsu-build/esbuild";
 * import { makeFormatRule } from "@ninjutsu-build/biome";
 * import { globSync } from "glob";
 *
 * const ninja = new NinjaBuilder();
 * const esbuild = makeESBuild(ninja);
 * const format = makeFormatRule(ninja);
 *
 * // Format all of our JavaScript files
 * const formatted = globSync("src/*.js", { posix: true }).map((js) =>
 *  format({ in: js, configPath: "biome.json" })
 * );
 *
 * // Make sure to have an order-only dependency on the formatting
 * // to make sure we don't bundle the dependencies of `index.js`
 * // while trying to format them.
 * esbuild({
 *   in: "src/index.js",
 *   out: "dist/entry.js",
 *   buildOptions: { bundle: true },
 *   [orderOnlyDeps]: formatted.map((f) => f[orderOnlyDeps]),
 * });
 *
 * writeFileSync("build.ninja", ninja.output);
 * ```
 */
export function makeESBuildRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(args: {
  in: Input<string>;
  out: O;
  buildOptions?: Omit<BuildOptions, "outfile">;
  [implicitDeps]?: Input<string> | readonly Input<string>[];
  [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  [validations]?: (out: string) => Input<string> | readonly Input<string>[];
}) => O {
  const { name = "esbuild", ...rest } = options;
  const rm = process.platform === "win32" ? "del" : "rm";
  const absOutput = resolve(process.cwd(), ninja.outputDir);
  const jq = relative(
    absOutput,
    require.resolve(
      join("node-jq", "bin", process.platform === "win32" ? "jq.exe" : "jq"),
    ),
  );
  const esbuild = relative(
    absOutput,
    require.resolve(
      join(
        "@esbuild",
        `${process.platform}-${process.arch}`,
        process.platform === "win32" ? "esbuild.exe" : "bin/esbuild",
      ),
    ),
  );

  const prefix = process.platform === "win32" ? "cmd /c " : "";
  const command =
    `${prefix}${esbuild} $in --outfile=$out --log-level=warning --color=true --metafile=$out.deps.json $args && ` +
    `${jq} "[\\"$out:\\"] + (.inputs | keys) | map(.+\\" \\")[]" $out.deps.json --join-output > $out.deps && ${rm} $out.deps.json`;
  const rule = ninja.rule(name, {
    command,
    description: "Bundling $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: "",
    depfile: "$out.deps",
    deps: "gcc",
    ...rest,
  });
  return <O extends string>(args: {
    in: Input<string>;
    out: O;
    buildOptions?: Omit<BuildOptions, "outfile">;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
    [validations]?: (out: string) => Input<string> | readonly Input<string>[];
  }): O => {
    const { buildOptions = {}, ...rest } = args;
    return rule({
      ...rest,
      args: serializeBuildOptions(buildOptions),
    });
  };
}
