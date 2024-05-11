import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { mkdirSync, rmSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { callNinja, depsMatch, getDeps } from "./util.mjs";

const dir = join("integration", "staging", "node");

describe("node tests", () => {
  beforeEach(() => {
    rmSync(dir, { force: true, recursive: true });
    mkdirSync(dir);
  });

  test("Basic example", () => {
    const zero = "number/zero.cjs";
    mkdirSync(join(dir, "number"));
    writeFileSync(join(dir, zero), "exports.zero = 0;\n");

    const one = "one.mjs";
    writeFileSync(join(dir, one), "export const one = 1;\n");

    const two = "number/two.cjs";
    writeFileSync(
      join(dir, two),
      "const { zero } = require('./zero.cjs');\n" + "exports.two = 2 + zero;\n",
    );

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

    const four = "four.cjs";
    writeFileSync(join(dir, four), "exports.four = 4;\n");

    const dummy = "dummy.json";
    writeFileSync(join(dir, dummy), "{}");

    const script = "script.mjs";
    writeFileSync(
      join(dir, script),
      "import { addDependency } from '@ninjutsu-build/node/runtime';\n" +
        "import * as fs from 'node:fs';\n" +
        "import { one } from './one.mjs';\n" +
        "import { two } from './number/two.cjs';\n" +
        "import { three } from './src/three.cjs';\n" +
        "import { createRequire } from 'node:module';\n" +
        "const require = createRequire(import.meta.url);\n" +
        "const { four } = require('./four.cjs');\n" +
        "console.log(one + ' ' + two + ' ' + three + ' ' + four);\n" +
        "addDependency('./dummy.json')",
    );

    const script2 = "script.cjs";
    writeFileSync(
      join(dir, script2),
      "const fs = require('node:fs');\n" +
        "const { two } = require('./number/two.cjs');\n" +
        "const { three } = require('./src/three.cjs');\n" +
        "console.log(two + ' + 1 = ' + three);\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const node = makeNodeRule(ninja);
    const output = node({ in: script, out: "output.txt" });
    const output2 = node({ in: script2, out: "output2.txt" });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    {
      const stdout = callNinja(dir);
      assert.match(stdout, /Creating output.txt from 'node script.mjs'/);
      assert.match(stdout, /Creating output2.txt from 'node script.cjs'/);
    }

    assert.strictEqual(readFileSync(join(dir, output)).toString(), "1 2 3 4\n");
    assert.strictEqual(
      readFileSync(join(dir, output2)).toString(),
      "2 + 1 = 3\n",
    );
    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );

    // We have a dependency on the entry point, which is not necessary,
    // but ninja allows it and our implementation is far neater to
    // not special case it
    depsMatch(getDeps(dir), {
      [output]: [
        /depfile\.cjs$/,
        /runtime\.cjs$/,
        dummy,
        zero,
        one,
        two,
        three,
        four,
        script,
      ],
      [output2]: [zero, two, three, script2],
    });
  });
});
