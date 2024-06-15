import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { NinjaBuilder, getInput, validations } from "@ninjutsu-build/core";
import { makeTSCRule, makeTypeCheckRule } from "@ninjutsu-build/tsc";
import { writeFileSync, mkdirSync, symlinkSync, existsSync } from "node:fs";
import { join } from "node:path/posix";
import {
  getDeps,
  callNinja,
  callNinjaWithFailure,
  getTestDir,
  setup,
} from "./util.mjs";
import { relative as relativeNative, sep } from "node:path";
import { fileURLToPath } from "node:url";

describe("tsc", (suiteCtx) => {
  beforeEach(setup(suiteCtx));

  test("Basic example", (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);
    const negate = "negate.mts";
    writeFileSync(
      join(dir, negate),
      "export function negate(n: number): number { return -n; }\n",
    );

    // Include a space in the filename to check we are escaping characters
    const add = "add together.cts";
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number { return a + b; }\n",
    );

    // `subtract` will be the "real" path to `subtract.cjs` and we will reference it
    // through an symlinked directory and expect that that dynamic dependencies
    // will refer to the canonical path
    const subtract = (() => {
      const impDir = join(dir, "imp");
      mkdirSync(impDir);

      // Use `$` in the file name to check character escaping
      const subtract = "$ubtract.cts";
      writeFileSync(
        join(impDir, subtract),
        "export function subtract(a: number, b: number): number { return a - b; }\n",
      );
      const srcDir = join(dir, "src");
      // Use a "junction" to avoid admin requirements on windows
      // https://github.com/nodejs/node/issues/18518
      symlinkSync(
        // Junction links require absolute
        join(process.cwd(), impDir),
        join(process.cwd(), srcDir),
        "junction",
      );
      return "imp/" + subtract;
    })();

    const script = "script.mts";
    writeFileSync(
      join(dir, script),
      "import { negate } from './negate.mjs';\n" +
        "import { add } from './add together.cjs';\n" +
        "import { subtract } from './src/$ubtract.cjs';\n" +
        "console.log(negate(1));\n" +
        "console.log(add(2, 3));\n" +
        "console.log(subtract(4, 5));\n",
    );

    // Intentionally misuse `add` to show that `require`d files in CommonJS
    // are not typechecked
    const script2 = "script.cts";
    writeFileSync(
      join(dir, script2),
      "const { add } = require('./add together.cjs');\n" +
        "const { subtract } = require('./src/$ubtract.cjs');\n" +
        "console.log(add('2', 3));\n" +
        "console.log(subtract(4, 5));\n",
    );

    const err1 = "err1.cts";
    writeFileSync(join(dir, err1), "const x: number = null;");

    const err2 = "err2.cts";
    writeFileSync(join(dir, err2), "import { bad } from './add together.cjs';");

    const ninja = new NinjaBuilder({}, dir);
    const tsc = makeTSCRule(ninja);
    const typecheck = makeTypeCheckRule(ninja);

    // Tell TypeScript to look for `@types/node` package installed in the
    // workspace `node_modules` directory, otherwise it'll fail to find it
    const typeRoots = [
      relativeNative(
        dir,
        fileURLToPath(import.meta.resolve("@types/node/package.json")),
      )
        .split(sep)
        .slice(0, -2)
        .join("/"),
    ];

    const compilerOptions = {
      outDir: "dist",
      declaration: true,
      strict: true,
      alwaysStrict: true,
      skipLibCheck: true,
      typeRoots,
    };

    const output = tsc({ in: [script], compilerOptions });
    const output2 = tsc({ in: [script2], compilerOptions });
    const [stamp] = typecheck({
      in: [script],
      out: "typecheck.stamp",
      compilerOptions,
    });

    ninja.default(...output, ...output2, stamp[validations]);
    const err1Target = ninja.phony({
      out: "err1",
      in: tsc({ in: [err1], compilerOptions })[0],
    });
    const err2Target = ninja.phony({
      out: "err2",
      in: tsc({ in: [err2], compilerOptions })[0],
    });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    {
      const stdout = callNinja(dir);
      assert.match(stdout, /Compiling script.mts/);
      assert.match(stdout, /Compiling script.cts/);
      assert.match(stdout, /Typechecking script.mts/);
    }

    for (const out of [output, output2, getInput(stamp)].flat()) {
      assert.strictEqual(existsSync(join(dir, out)), true);
    }

    assert.strictEqual(callNinja(dir).trimEnd(), "ninja: no work to do.");
    const deps = getDeps(dir);
    assert.deepEqual(
      new Set(Object.keys(deps)),
      new Set([...output, ...output2, stamp[validations]]),
    );

    {
      // Check that we have the same dependencies whether we typecheck or
      // generate code/types if we have the same inputs
      const lhs = deps[output[0]];
      const rhs = deps[stamp[validations]];
      assert.deepEqual(lhs.sort(), rhs.sort());
    }

    for (const out of output) {
      assert.notStrictEqual(deps[out].indexOf(negate), -1, `Missing ${negate}`);
      assert.notStrictEqual(deps[out].indexOf(add), -1, `Missing ${add}`);
      assert.notStrictEqual(
        deps[out].indexOf(subtract),
        -1,
        `Missing ${subtract}`,
      );
    }

    // No typechecking of `.cts` `require`d files so `tsc` doesn't look at
    // the dependencies
    for (const out of output2) {
      assert.strictEqual(
        deps[out].indexOf(add),
        -1,
        `${add} should be missing`,
      );
      assert.strictEqual(
        deps[out].indexOf(subtract),
        -1,
        `${subtract} should be missing`,
      );
    }

    {
      const { stdout, stderr } = callNinjaWithFailure(dir, err1Target);
      assert.deepEqual(stderr, "");
      assert(stdout.includes("Compiling err1.cts"), stdout);
      assert(
        stdout.includes(
          "error TS2322: Type 'null' is not assignable to type 'number'",
        ),
        stdout,
      );

      // Check that we correctly cull most of the input
      assert(stdout.split("\n").length < 10, stdout);
    }

    {
      const { stdout, stderr } = callNinjaWithFailure(dir, err2Target);
      assert.deepEqual(stderr, "");
      assert(stdout.includes("Compiling err2.cts"), stdout);
      assert(
        stdout.includes(
          "error TS2305: Module '\"./add together.cjs\"' has no exported member 'bad'",
        ),
        stdout,
      );

      // Check that we correctly cull most of the input
      assert(stdout.split("\n").length < 10, stdout);
    }
  });

  test("tsconfig", async (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);
    const script = "script.mts";
    writeFileSync(
      join(dir, script),
      "function greet(msg): void { console.log(msg); }\ngreet('Hello World!');\n",
    );

    const tsConfig = join(dir, "tsconfig.json");
    writeFileSync(
      tsConfig,
      JSON.stringify(
        {
          files: [script],
          compilerOptions: {
            noImplicitAny: false,
            outDir: "myOutput",
            skipLibCheck: true,
          },
        },
        undefined,
        4,
      ),
    );

    const ninja = new NinjaBuilder({}, dir);
    const tsc = makeTSCRule(ninja);
    const typecheck = makeTypeCheckRule(ninja);

    const out = await tsc({
      tsConfig: "tsconfig.json",
      compilerOptions: { declaration: true },
    });
    assert.deepEqual(out, ["myOutput/script.mjs", "myOutput/script.d.mts"]);

    const typechecked = await typecheck({
      tsConfig: "tsconfig.json",
      out: "typechecked.stamp",
    });
    assert.deepEqual(typechecked, [
      { file: "script.mts", [validations]: "typechecked.stamp" },
    ]);

    const failed = await typecheck({
      tsConfig: "tsconfig.json",
      out: "failed.stamp",
      compilerOptions: {
        noImplicitAny: true,
      },
    });
    assert.deepEqual(failed, [
      { file: "script.mts", [validations]: "failed.stamp" },
    ]);

    const err = ninja.phony({ out: "err", in: failed[0][validations] });
    ninja.default(...out, typechecked[0][validations]);
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    {
      const stdout = callNinja(dir);
      assert.match(stdout, /Compiling tsconfig.json/);
      assert.match(stdout, /Typechecking tsconfig.json/);
    }

    for (const output of out) {
      const path = join(dir, getInput(output));
      assert(existsSync(path), `${path} doesn't exist`);
    }

    {
      const path = join(dir, getInput("typechecked.stamp"));
      assert(existsSync(path), `${path} doesn't exist`);
    }

    assert.strictEqual(callNinja(dir).trimEnd(), "ninja: no work to do.");

    {
      const { stdout } = callNinjaWithFailure(dir, err);
      assert.match(
        stdout,
        /error TS7006: Parameter 'msg' implicitly has an 'any' type/,
      );
    }
  });

  // TODO: Check the `incremental` flag works correctly
  test("incremental", { todo: true });
});
