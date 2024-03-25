import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { chdir } from "node:process";

function getDeps() {
  const deps: Record<string, string[]> = {};
  let name = "";
  for (const line of execSync("ninja -t deps")
    .toString()
    .split("\n")
    .map((s) => s.trimEnd())) {
    if (line.length === 0) {
      continue;
    }

    if (line[0] === " ") {
      deps[name].push(line.trimStart());
    } else {
      name = line.split(":")[0];
      deps[name] = [];
    }
  }

  return deps;
}

const dir = "node";

describe("node tests", () => {
  beforeEach(() => {
    chdir("./integration/staging");
    rmSync(`./${dir}`, { force: true, recursive: true });
    mkdirSync(dir);
    chdir(`./${dir}`);
  });

  test("Basic example", () => {
    const one = "one.mjs";
    writeFileSync(one, "export const one = 1;\n");

    const two = "two.cjs";
    writeFileSync(two, "exports.two = 2;\n");
    const script = "script.mjs";
    writeFileSync(
      script,
      "import { one } from './one.mjs';\n" +
        "import { two } from './two.cjs';\n" +
        "console.log(one + ' ' + two + ' 3');\n",
    );

    const script2 = "script.cjs";
    writeFileSync(
      script2,
      "const { two } = require('./two.cjs');\n" +
        "console.log(two + ' + 1 = 3');\n",
    );

    const ninja = new NinjaBuilder();
    const node = makeNodeRule(ninja);
    const output = node({ in: script, out: "output.txt" });
    const output2 = node({ in: script2, out: "output2.txt" });
    writeFileSync("build.ninja", ninja.output);

    {
      const stdout = execSync("ninja").toString();
      assert.match(stdout, /Creating output.txt from 'node script.mjs'/);
      assert.match(stdout, /Creating output2.txt from 'node script.cjs'/);
    }

    assert.strictEqual(readFileSync(output).toString(), "1 2 3\n");
    assert.strictEqual(readFileSync(output2).toString(), "2 + 1 = 3\n");
    assert.strictEqual(
      execSync("ninja").toString().trim(),
      "ninja: no work to do.",
    );
    assert.deepEqual(getDeps(), {
      [output]: [script, one, two],
      [output2]: [script2], // FIX: Should also depend on `two`
    });
  });
});
