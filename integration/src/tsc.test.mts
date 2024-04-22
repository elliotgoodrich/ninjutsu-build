import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import {
  writeFileSync,
  mkdirSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path/posix";
import { getDeps } from "./util.mjs";
import { relative as relativeNative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join("integration", "staging", "tsc");

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

describe("tsc tests", () => {
  beforeEach(() => {
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir);
  });

  test("Basic example", () => {
    const negate = "negate.mts";
    writeFileSync(
      join(dir, negate),
      "export function negate(n: number): number { return -n; }\n",
    );

    const add = "add.cts";
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
      const subtract = "subtract.cts";
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
        "import { add } from './add.cjs';\n" +
        "import { subtract } from './src/subtract.cjs';\n" +
        "console.log(negate(1));\n" +
        "console.log(add(2, 3));\n" +
        "console.log(subtract(4, 5));\n",
    );

    // Intentionally misuse `add` to show that `require`d files in CommonJS
    // are not typechecked
    const script2 = "script.cts";
    writeFileSync(
      join(dir, script2),
      "const { add } = require('./add.cjs');\n" +
        "const { subtract } = require('./src/subtract.cjs');\n" +
        "console.log(add('2', 3));\n" +
        "console.log(subtract(4, 5));\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const tsc = makeTSCRule(ninja);
    const output = tsc({ in: [script], compilerOptions });
    const output2 = tsc({ in: [script2], compilerOptions });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    {
      const { stdout, stderr, status } = spawnSync(
        "ninja",
        ["-d", "keepdepfile"],
        { cwd: dir },
      );
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(stdoutStr, /Compiling script.mts/);
      assert.match(stdoutStr, /Compiling script.cts/);
    }

    for (const out of [...output, ...output2]) {
      assert.strictEqual(existsSync(join(dir, out)), true);
    }

    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );
    const deps = getDeps(dir);
    assert.deepEqual(
      new Set(Object.keys(deps)),
      new Set([...output, ...output2]),
    );
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
  });

  // TODO: Check the `incremental` flag works correctly
});
