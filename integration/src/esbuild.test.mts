import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeESBuildRule } from "@ninjutsu-build/esbuild";
import { makeNodeRule } from "@ninjutsu-build/node";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path";
import { getDeps, getTestDir, setup } from "./util.mjs";

describe("esbuild", (suiteCtx) => {
  beforeEach(setup(suiteCtx));

  test("Basic example", (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);
    const add = "add.mts";
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number {\n" +
        "   return a + b;\n" +
        "}\n",
    );
    const subtract = "subtract.mts";
    writeFileSync(
      join(dir, subtract),
      "export function subtract(a: number, b: number): number {\n" +
        "   return a - b;\n" +
        "}\n",
    );

    const index = "index.mjs";
    writeFileSync(
      join(dir, index),
      "import { add } from './add.mjs';\n" +
        "import { subtract } from './subtract.mjs';\n" +
        "console.log(subtract(add(10, 1), 7));\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const esbuild = makeESBuildRule(ninja);
    const node = makeNodeRule(ninja);
    const entry = esbuild({
      in: index,
      out: "entry.mjs",
      buildOptions: { bundle: true, format: "esm" },
    });

    // Instead of trying to check the output of the `esbuild` transpilation we
    // instead execute it to ensure that it is valid
    const output = node({
      in: entry,
      out: "output.txt",
      args: ">",
    });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    const { stdout, stderr, status } = spawnSync(
      "ninja",
      ["-d", "keepdepfile"],
      { cwd: dir },
    );
    const stdoutStr = stdout.toString();
    assert.strictEqual(stderr.toString(), "");
    assert.strictEqual(status, 0, stdoutStr);
    assert.match(stdoutStr, /Creating output.txt from 'node entry.mjs'/);
    assert.match(stdoutStr, /Bundling entry.mjs/);

    assert.strictEqual(readFileSync(join(dir, output)).toString(), "4\n");
    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );
    assert.deepEqual(getDeps(dir), {
      [entry]: [add, index, subtract],
      [output]: [entry], // everything is bundled so only one node dependency
    });

    // TODO: Test warning level + overriding this
  });
});
