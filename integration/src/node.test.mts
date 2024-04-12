import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { getDeps } from "./util.mjs";

const dir = join("integration", "staging", "node");

describe("node tests", () => {
  beforeEach(() => {
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir);
  });

  test("Basic example", () => {
    const one = "one.mjs";
    writeFileSync(join(dir, one), "export const one = 1;\n");

    const two = "two.cjs";
    writeFileSync(join(dir, two), "exports.two = 2;\n");

    // `three` will be the "real" path to `three.cjs` and we will reference it
    // through an symlinked directory and expect that that dynamic dependencies
    // will refer to the canonical path
    const three = (() => {
      const impDir = join(dir, "imp");
      mkdirSync(impDir);
      const three = "three.cjs";
      writeFileSync(join(impDir, three), "exports.three = 1 + 2;\n");
      const srcDir = join(dir, "src");
      // Use a "junction" to avoid admin requirements on windows
      // https://github.com/nodejs/node/issues/18518
      symlinkSync(
        // Junction links require absolute
        join(process.cwd(), impDir),
        join(process.cwd(), srcDir),
        "junction",
      );
      return "imp/" + three;
    })();

    const script = "script.mjs";
    writeFileSync(
      join(dir, script),
      "import { one } from './one.mjs';\n" +
        "import { two } from './two.cjs';\n" +
        "import { three } from './src/three.cjs';\n" +
        "console.log(one + ' ' + two + ' ' + three);\n",
    );

    const script2 = "script.cjs";
    writeFileSync(
      join(dir, script2),
      "const { two } = require('./two.cjs');\n" +
        "const { three } = require('./src/three.cjs');\n" +
        "console.log(two + ' + 1 = ' + three);\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const node = makeNodeRule(ninja);
    const output = node({ in: script, out: "output.txt" });
    const output2 = node({ in: script2, out: "output2.txt" });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    {
      const stdout = execSync("ninja", { cwd: dir }).toString();
      assert.match(stdout, /Creating output.txt from 'node script.mjs'/);
      assert.match(stdout, /Creating output2.txt from 'node script.cjs'/);
    }

    assert.strictEqual(readFileSync(join(dir, output)).toString(), "1 2 3\n");
    assert.strictEqual(
      readFileSync(join(dir, output2)).toString(),
      "2 + 1 = 3\n",
    );
    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );

    // Sort the dependencies as files may be resolved asynchronously and
    // therefore the dependencies arrive in a different order
    const deps = getDeps(dir);
    deps[output].sort();
    deps[output2].sort();

    assert.deepEqual(deps, {
      [output]: [three, one, script, two],
      [output2]: [script2], // FIX: Should also depend on `two` and `three`
    });
  });
});
