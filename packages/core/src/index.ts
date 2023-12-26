/**
 * `Variable<T>` is a branded type returned by {@link NinjaBuilder#variable} that can be
 * passed to {@link NinjaBuilder#rule} in order to generate a function that accepts an
 * optional property of type `T`.
 */
export type Variable<T> = {
  __ninjutsuVariable: T;
};

/**
 * `Placeholder<T>` is a branded type returned by {@link needs} that can be passed to
 * {@link NinjaBuilder#rule} in order to generate a function that accepts a required
 * property of type `T`.
 */
export type Placeholder<T> = {
  __ninjutsuPlaceholder: T;
};

export const implicitDeps: unique symbol = Symbol("Implicit Dependencies");
export type ImplicitDeps = typeof implicitDeps;

export const implicitOut: unique symbol = Symbol("Implicit Outputs");
export type ImplicitOut = typeof implicitOut;

export const orderOnlyDeps: unique symbol = Symbol("Order-Only Dependencies");
export type OrderOnlyDeps = typeof orderOnlyDeps;

export const validations: unique symbol = Symbol("Validations");
export type Validations = typeof validations;

/**
 * Return `undefined` typed as a {@link Placeholder}, which can be passed to
 * {@link NinjaBuilder#rule} in order to generate a function that accepts a required
 * property of type `T`.  This is needed to specify the `out` and `in` properties when
 * invoking {@link NinjaBuilder#rule}, but can also add additional required ninja variables.
 *
 * @example
 *
 * We can create a `gzip` rule that requires a single input, output, and an integer
 * for the compression level,
 *
 * ```ts
 * import { NinjaBuilder, needs } from "@ninjutsu-build/core";
 *
 * const ninja = new NinjaBuilder();
 * const gzip = ninja.rule({
 *   command: "gzip -c $in -$level > $out",
 *   out: needs<string>(),
 *   in: needs<string>(),
 *   level: needs<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(),
 * });
 *
 * gzip({
 *   out: "$builddir/small.txt.gz",
 *   in: "src/in.txt",
 *   level: 9,
 * });
 * gzip({
 *   out: "$builddir/fast.txt.gz",
 *   in: "src/in.txt",
 *   level: 1,
 * });
 * ```
 *
 * This will generate the following:
 *
 * ```text
 * rule gzip:
 *   command = gzip -c $in -$level > $out
 * build $builddir/small.txt.gz: gzip src/in.txt
 *   level = 9
 * build $builddir/fast.txt.gz: gzip src/in.txt
 *   level = 1
 * ```
 *
 * The `gzip` function would fail to type check if invoked without the `out`, `in`, or `level` properties.
 */
export function needs<T>(): Placeholder<T> {
  return undefined as unknown as Placeholder<T>;
}

/**
 * Escape all "$ ", " ", and ":" substrings in the specified `path` using the
 * rules laid out in {@link https://ninja-build.org/manual.html#ref_lexer | Lexical syntax} in the ninja build manual.
 */
export function escapePath(path: string): string {
  return path
    .replaceAll("$ ", "$$ ")
    .replaceAll(" ", "$ ")
    .replaceAll(":", "$:");
}

/**
 * If `paths` is undefined then return the empty string; otherwise return a string starting
 * with `prefix` and then followed by `paths` concatenated by spaces and having all special
 * characters not allowed in the input or outputs of ninja build rules escaped using
 * using the rules laid out in {@link https://ninja-build.org/manual.html#ref_lexer | Lexical syntax} in the ninja build manual.
 *
 * @private
 */
function concatPaths(
  paths: undefined | string | readonly string[],
  prefix = "",
): string {
  switch (typeof paths) {
    case "undefined":
      return "";
    case "string":
      return prefix + escapePath(paths);
    default: {
      let result = "";
      for (const path of paths) {
        result += prefix + escapePath(path);
        prefix = " ";
      }
      return result;
    }
  }
}

/**
 * `RuleArgs` is a type of an object containing the special variables ninja when creating a
 * build rule.
 */
export type RuleArgs = {
  command: string;
  description?: string;
  out: Placeholder<string> | Placeholder<readonly string[]>;
  in?: Placeholder<string> | Placeholder<readonly string[]>;
  dyndep?: string;
  pool?: string;
  restat?: 1;
  generator?: 1;
  depfile?: string;
  deps?: "gcc" | "msvc";
  msvc_deps_prefix?: string;
  rspfile?: string;
  rspfile_content?: string;
};

/**
 * All variables that are understood by ninja's rules.
 *
 * @private
 */
const ruleVariables: Record<string, true> = {
  command: true,
  depfile: true,
  deps: true,
  msvc_deps_prefix: true,
  description: true,
  dyndep: true,
  generator: true,
  in: true,
  out: true,
  restat: true,
  rspfile: true,
  rspfile_content: true,
  pool: true,
};

type OptionalArgs<V extends Record<string, unknown>> = {
  [K in keyof V as V[K] extends Placeholder<unknown>
    ? never
    : K]?: V[K] extends Variable<infer V> ? V : V[K];
};

type RequiredArgs<V> = {
  [K in keyof V as V[K] extends Placeholder<unknown>
    ? K
    : never]: V[K] extends Placeholder<infer P> ? P : never;
};

type Expand<T extends object> = T extends infer O
  ? O extends Record<"out", unknown>
    ? { [K in keyof O]: O[K] }
    : never
  : never;

type BuildArgs<
  A extends RuleArgs,
  O = A["out"] extends Placeholder<infer P>
    ? P extends string | readonly string[]
      ? P
      : never
    : never,
> = {
  out: O;
} & RequiredArgs<Omit<A, "out">> & {
    [implicitDeps]?: string | readonly string[];
    [implicitOut]?: string | readonly string[];
    [orderOnlyDeps]?: string | readonly string[];
    [validations]?: (out: O) => readonly string[];
    dyndep?: string;
    pool?: string;
  } & OptionalArgs<Omit<A, "command" | "description">>;

/**
 * The built-in ninja pool aimed for build edges, which have direct access to the standard input,
 * output, and error streams.
 * See the ninja manual on {@link https://ninja-build.org/manual.html#_the_literal_console_literal_pool | the console pool} for more information.
 */
export const console = "console";

/**
 * `NinjaBuilder` is a helper class to generate {@link https://ninja-build.org | ninja build} files.
 */
export class NinjaBuilder {
  /**
   * Return the held string containing the contents of the built ninja file.
   */
  output: string;

  /**
   * Create a `NinjaBuilder` that builds a ninja file into the `output` property and write any
   * properties of the specified `variables` as top-level variables.
   *
   * @example
   * ```ts
   * import { NinjaBuilder } from "@ninjutsu-build/core";
   * import { writeFileSync } from "fs";
   *
   * const ninja = new NinjaBuilder({
   *   ninja_required_version: "1.1",
   *   builddir: ".mybuilddir",
   * });
   *
   * writeFileSync("build.ninja", ninja.output);
   * ```
   *
   * would generate the following ninja file:
   *
   * ```text
   * ninja_required_version = 1.1
   * builddir = .mybuilddir
   * ```
   *
   * @example
   * If the `ninja_required_version` or `builddir` variables cannot be provided at construction,
   * they can be passed to the {@link variable} method to generate an equivalent ninja file.
   *
   * ```ts
   * import { NinjaBuilder } from "@ninjutsu-build/core";
   * import { writeDirSync } from "path";
   *
   * const ninja = new NinjaBuilder();
   * ninja.comment(`Generated at ${(new Date).toISOString()}`);
   * ninja.variable("ninja_required_version", "1.1");
   * ninja.variable("builddir", ".mybuilddir");
   *
   * writeDirSync(ninja.output, "build.ninja");
   * ```
   *
   * would generate the following ninja file:
   *
   * ```text
   * # Generated at 2023-10-22T14:18:38.359Z
   * ninja_required_version = 1.1
   * builddir = .mybuilddir
   * ```
   */
  constructor(
    variables: { ninja_required_version?: string; builddir?: string } = {},
  ) {
    this.output = "";
    for (const name in variables) {
      const value = variables[name as keyof typeof variables];
      if (value !== undefined) {
        this.output += name + " = " + value + "\n";
      }
    }
  }

  /**
   * Return a function that will write build edges for the built in `phony` ninja rule and return
   * the `out` property of the first argument.  The `in` and `out` properties will be escaped
   * using {@link escapePath}.
   *
   * See the ninja build manual on
   * {@link https://ninja-build.org/manual.html#_the_literal_phony_literal_rule | the phony rule}
   * for more information.
   *
   * @example
   * ```ts
   * import { NinjaBuilder } from "@ninjutsu-build/core";
   *
   * const ninja = new NinjaBuilder();
   * const foo = ninja.phony({
   *   out: "foo",
   *   in: "some/file/in/a/faraway/subdir/foo",
   * });
   *
   * // Alternatively we can pull off the `phony` property
   * const { phony } = ninja;
   * const mybar = phony({
   *   out: "bar",
   *   in: "another/long/winded/path/needing/a/shortcut/bar",
   * });
   *
   * ninja.default(foo, mybar);
   * ```
   */
  get phony(): <O extends string>(args: { out: O; in: string }) => O {
    return <O extends string>(args: { out: O; in: string }): O => {
      this.output +=
        "build " +
        escapePath(args.out) +
        ": phony " +
        escapePath(args.in) +
        "\n";
      return args.out;
    };
  }

  /**
   * Write a rule declaration with the specified `name` and `variables`. Return a function that
   * will write build edges for that rule when invoked and return the `out` property of the first
   * argument.
   *
   * Non-`undefined` properties in `variables` with the following names only will be written to the
   * ninja rule:
   *
   *   - `command`
   *   - `depfile`
   *   - `deps`
   *   - `msvc_deps_prefix`
   *   - `description`
   *   - `dyndep`
   *   - `generator`
   *   - `in`
   *   - `out`
   *   - `restat`
   *   - `rspfile`
   *   - `rspfile_content`
   *   - `pool`
   *
   * The meaning of these variables can be found in the ninja documentation under
   * [rule variables](https://ninja-build.org/manual.html#ref_rule).
   *
   * Other non-`undefined` values will not be written to the ninja rule, but instead they will be taken
   * as default values for variables in build edges created by the returned function.  These variables
   * can be overridden by passing in values when invoking the returned function.
   *
   * Note that since both {@link Placeholder<T>} and {@link Variable<T>} are always
   * `undefined` values they will not be printed out in the rule declaration or build edges.  However, they
   * will change the type of the returned function to either require or accept (respectively) a
   * variable with that given name.
   *
   * In the object passed to the returned function, following properties are special and will not be added as ninja
   * variables, instead they are understood directly by ninja and will be added to the build
   * edge using the syntax described in
   * [Ninja file reference](https://ninja-build.org/manual.html#ref_ninja_file).  The values of these properties
   * will be escaped using {@link escapePath}.
   *
   *   - `out` - [Explicit outputs](https://ninja-build.org/manual.html#ref_outputs)
   *   - `in` - [Explicit dependencies](https://ninja-build.org/manual.html#ref_dependencies)
   *   - `[implicitDeps]` - [Implicit dependencies](https://ninja-build.org/manual.html#ref_dependencies)
   *   - `[implicitOut]` - [Implicit outputs](https://ninja-build.org/manual.html#ref_outputs)
   *   - `[orderOnlyDeps]` - [Order-only dependencies](https://ninja-build.org/manual.html#ref_dependencies)
   *   - `[validations]` - [Validations](https://ninja-build.org/manual.html#validations)
   *
   * `validations` may have a dependency on the output of the rule and because of this, if supplied, `validations`
   * must be a function, which will be passed the `out` property.  Although not particularly useful when you know
   * the `out` property, `ninjutsu-build` plugins do not take an `out` and instead generate `out` from other
   * properties.
   *
   * All properties keyed by `string` can be referenced as ninja variables, including the special
   * variables `out` and `in` as `$out` and `$in` respectively.  The `Symbol`-keyed properties
   * do not have a name and cannot be referenced.
   *
   * @example
   * ```ts
   * import { NinjaBuilder, needs } from "@ninjutsu-build/core";
   *
   * const ninja = new NinjaBuilder();
   *
   * // Create a `touch` command that requires only a single output
   * const touch = ninja.rule("touch", {
   *   command: "touch $out",
   *   out: needs<string>(),
   * });
   * const stamp = touch({ out: "$builddir/now.stamp" });
   *
   * // Create a `tar` command that requires a single output, but a variable number of inputs.
   * const tar = ninja.rule("tar", {
   *   command: "tar cf $out $in",
   *   out: needs<string>(),
   *   in: needs<readonly string[]>(), // Note `readonly` is required on arrays
   * });
   * const archive = tar({
   *   out: "$builddir/data.tar",
   *   in: [stamp, "src/data.txt"],
   * });
   *
   * // By passing in a value for `args` we can give it a default value of the empty string.
   * const gzip = ninja.rule("gzip", {
   *   command: "gzip -c $in -$level $args > $out",
   *   out: needs<string>(),
   *   in: needs<string>(),
   *   level: needs<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9>(),
   *   args: "",
   * });
   *
   * // And we can optionally override this variable on each separate build edge, whereas
   * // `level` is required by the type system
   * gzip({
   *   out: "$builddir/data.tar.gz",
   *   in: archive,
   *   level: 6,
   *   args: "--verbose",
   * });
   * ```
   */
  rule<A extends RuleArgs>(
    name: string,
    variables: A,
  ): <const I extends Expand<BuildArgs<A>>>(args: I) => I["out"] {
    this.output += "rule " + name + "\n";

    const defaultValues: Record<string, unknown> = {};
    for (const name in variables) {
      const value = variables[name];
      if (value !== undefined) {
        if (name in ruleVariables) {
          this.output += "  " + name + " = " + value + "\n";
        } else {
          defaultValues[name] = value;
        }
      }
    }

    return <const I extends BuildArgs<A> & { in?: string | readonly string[] }>(
      buildVariables: I,
    ): I["out"] => {
      const { in: _in, out, ...rest } = buildVariables;

      // Use a temporary string to not interweave multiple calls on this object
      // if the `validations` calls methods on this `NinjaBuilder`
      let output =
        "build " +
        concatPaths(out) +
        concatPaths(buildVariables[implicitOut], " | ") +
        ": " +
        name +
        concatPaths(_in, " ") +
        concatPaths(buildVariables[implicitDeps], " | ") +
        concatPaths(buildVariables[orderOnlyDeps], " || ") +
        concatPaths(
          buildVariables[validations] === undefined
            ? undefined
            : buildVariables[validations]?.(out),
          " |@ ",
        ) +
        "\n";

      // Add all variables passed in, attempting to replace all `undefined` values
      // with defaults provided when creating the rule
      for (const name in rest) {
        const v = rest[name as keyof typeof rest];
        const value = v !== undefined ? v : defaultValues[name];
        if (value !== undefined) {
          output += "  " + name + " = " + value + "\n";
        }
      }

      // Add all variables that have been defaulted in the rule but not specified
      // in the build edge
      for (const name in defaultValues) {
        if (!(name in rest)) {
          const value = defaultValues[name];
          if (value != undefined) {
            output += "  " + name + " = " + value + "\n";
          }
        }
      }

      this.output += output;

      return out;
    };
  }

  /**
   * Write an include reference to the specified `path`.
   *
   * See the ninja docs on
   * {@link https://ninja-build.org/manual.html#ref_scope | Evaluation and Scoping}
   * for more information.
   */
  include(path: string): void {
    this.output += "include " + path + "\n";
  }

  /**
   * Write a subninja reference to the specified `path`.
   *
   * See the ninja docs on
   * {@link https://ninja-build.org/manual.html#ref_scope | Evaluation and Scoping}
   * for more information.
   */
  subninja(path: string): void {
    this.output += "subninja " + path + "\n";
  }

  /**
   * Write a default target statement for the specified `targets`.
   *
   * See the ninja docs on
   * {@link https://ninja-build.org/manual.html#_default_target_statements | Default target statements}
   * for more information.
   */
  default(...targets: readonly string[]): void {
    this.output += "default " + targets.join(" ") + "\n";
  }

  /**
   * Write a top-level variable declaration with the specified `name` and `value`, and return
   * `undefined` typed as a {@link Variable} that can be passed to {@link rule} in order to
   * generate a function that accepts an optional property of type `T`.
   *
   * Creating multiple variables with the same name will result in an invalid ninja file.
   *
   * @example
   *
   * In this example we create a copy (`cp`) command taking an optional variable.
   *
   * ```ts
   * import { NinjaBuilder, needs } from "@ninjutsu-build/core";
   *
   * const ninja = new NinjaBuilder();
   * const args = ninja.variable("args", "");
   *
   * // Create a `cp` rule that accepts an optional set of command line arguments
   * const cp = ninja.rule({
   *   command: "cp $in $out $args",
   *   out: needs<string>(),
   *   in: needs<string>(),
   *   args,
   * });
   *
   * // By default `cp` can be invoked without specifying `args`
   * cp({
   *   out: "$builddir/out.txt",
   *   in: "src/in.txt",
   * });
   *
   * // Or we can pass a string for `args` causing `cp` follow symbolic links
   * cp({
   *   out: "$builddir/alias.txt",
   *   in: "src/link.txt",
   *   args: "--dereference",
   * });
   * ```
   *
   * This will generate the following:
   *
   * ```text
   * args =
   * rule cp:
   *   command = cp $in $out $args
   * build $builddir/out.txt: cp src/in.txt
   * build $builddir/alias.txt: cp src/link.txt
   *   args = --dereference
   * ```
   */
  variable<T>(name: string, value: T): Variable<T> {
    this.output += name + " = " + value + "\n";
    return undefined as unknown as Variable<T>;
  }

  /**
   * Write a pool declaration with the specified `name` and `options.depth`, and return the name of
   * the pool.
   *
   * Creating multiple pools with the same name or creating a pool with a non-positive integer
   * depth will result in an invalid ninja file.
   *
   * @example
   *
   * Below is an example of throttling API requests with pools:
   *
   * ```ts
   * import { NinjaBuilder, needs } from "@ninjutsu-build/core";
   *
   * const ninja = new NinjaBuilder();
   *
   * // Throttle to 2 concurrent API requests
   * const apiPool = ninja.pool("api", {
   *   depth: 2,
   * });
   *
   * // Rules can have a pool that will apply to all build edges
   * const makeRequest = ninja.rule("makeRequest", {
   *   command: "curl $query --silent --output $out",
   *   description: "Downloading $query to $out",
   *   query: needs<string>(),
   *   pool: apiPool,
   * });
   *
   * makeRequest({
   *   out: "$builddir/fish.json",
   *   query: "https://api.example.com/request?topic=fish",
   * });
   *
   * // It's possible to remove the pool for individual build edges by setting an
   * // empty pool
   * makeRequest({
   *   out: "$builddir/dog.json",
   *   query: "https://cached.api.example.com/request?topic=dog",
   *   pool: ""
   * });
   *
   * // Or we can replace the pool with
   * makeRequest({
   *   out: "$builddir/all.json",
   *   query: "https://firehose.example.com/getEverything",
   *   pool: ninja.pool("firehose", { depth: 1 }),
   * });
   * ```
   *
   * ```text
   * pool api
   *   depth = 2
   * rule makeRequest
   *   command = curl $query --silent --output $out
   *   description = Downloading $query to $out
   *   pool = api
   * build "$builddir/response.json":
   *   query: https://api.example.com/request?topic=fish,
   * build "$builddir/response.json",
   * # End of file
   * ```
   */
  pool(name: string, options: { depth: number }): string {
    this.output += "pool " + name + "\n  depth = " + options.depth + "\n";
    return name;
  }

  /**
   * Write a comment with the specified `text`.
   *
   * @example
   *
   *
   * ```ts
   * import { NinjaBuilder } from "@ninjutsu-build/core";
   *
   * const ninja = new NinjaBuilder();
   * ninja.comment(`Generated at ${(new Date).toISOString()}`);
   * ninja.variable("var", 42);
   * ninja.comment("End of file");
   * ```
   *
   * ```text
   * # Generated at 2023-10-22T14:18:38.359Z
   * var = 42
   * # End of file
   * ```
   */
  comment(text: string): void {
    this.output += "# " + text + "\n";
  }
}
