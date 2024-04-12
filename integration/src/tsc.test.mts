import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { mkdirSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path/posix";
import { getDeps } from "./util.mjs";

const dir = join("integration", "staging", "tsc");

const compilerOptions = {
  outDir: "dist",
  declaration: true,
  strict: true,
  alwaysStrict: true,
  skipLibCheck: true,
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
    assert.strictEqual(subtract, "imp/subtract.cts");

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

    const script2 = "script.cts";
    writeFileSync(
      join(dir, script2),
      "const { add } = require('./add.cjs');\n" +
        "const { subtract } = require('./src/subtract.cjs');\n" +
        "console.log(add(2, 3));\n" +
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
      // TODO: Change this to `subtract` and have a dependency on the canonical
      // file rather than the symlink path
      assert.notStrictEqual(
        deps[out].indexOf("src/subtract.cts"),
        -1,
        "Missing src/subtract.cts",
      );
    }

    // TODO: `script.cts` is **missing** all of the dependencies we would
    // expect and this needs to be fixed
    for (const out of output2) {
      assert.strictEqual(deps[out].indexOf(add), -1, `Missing ${add}`);
      assert.strictEqual(
        deps[out].indexOf("src/subtract.cts"),
        -1,
        "Missing src/subtract.cts",
      );
    }
  });

  // TODO: Check the `incremental` flag works correctly
});
