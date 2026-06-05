import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync, writeFileSync } from "node:fs";
import { NinjaBuilder, implicitDeps } from "@ninjutsu-build/core";
import { makeSWCRule } from "@ninjutsu-build/swc";
import { makeNodeRule } from "@ninjutsu-build/node";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { callNinja, getTestDir, setup } from "./util.mjs";

const swcArgs = [
  "-C",
  "jsc.parser.syntax=typescript",
  "-C",
  "module.type=es6",
  "-C",
  "jsc.target=es2018",
];

describe("swc", (suiteCtx) => {
  beforeEach(setup(suiteCtx));

  test("Basic example", (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);

    const add = "add.mts";
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number {\n" +
        "  return a + b;\n" +
        "}\n",
    );

    const index = "index.mts";
    writeFileSync(
      join(dir, index),
      "import { add } from './add.mjs';\n" +
        "const result = add(3, 4);\n" +
        "console.log(result);\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const swc = makeSWCRule(ninja, { args: swcArgs });
    const node = makeNodeRule(ninja);

    const addMjs = swc({ in: add, out: "add.mjs" });
    const indexMjs = swc({
      in: index,
      out: "index.mjs",
      args: [
        "-C",
        "jsc.parser.syntax=typescript",
        "-C",
        "module.type=es6",
        "-C",
        "jsc.target=es5",
      ],
    });
    const output = node({
      in: indexMjs,
      out: "output.txt",
      args: ">",
      [implicitDeps]: [addMjs],
    });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    const stdout = callNinja(dir);
    assert.match(stdout, /Transpiling add\.mts/);
    assert.match(stdout, /Transpiling index\.mts/);

    assert.strictEqual(readFileSync(join(dir, output)).toString(), "7\n");

    // index.mts was compiled with jsc.target=es5, so `const` becomes `var`
    assert.match(readFileSync(join(dir, indexMjs)).toString(), /var result/);

    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );
  });

  test("Incremental build", (testCtx: { name: string }) => {
    const dir = getTestDir(suiteCtx, testCtx);

    const add = "add.mts";
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number {\n" +
        "  return a + b;\n" +
        "}\n",
    );

    const multiply = "multiply.mts";
    writeFileSync(
      join(dir, multiply),
      "export function multiply(a: number, b: number): number {\n" +
        "  return a * b;\n" +
        "}\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    const swc = makeSWCRule(ninja, { args: swcArgs });
    swc({ in: add, out: "add.mjs" });
    swc({ in: multiply, out: "multiply.mjs" });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    const stdout1 = callNinja(dir);
    assert.match(stdout1, /Transpiling add\.mts/);
    assert.match(stdout1, /Transpiling multiply\.mts/);

    // Modify only add.mts
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number {\n" +
        "  return a + b + 0;\n" +
        "}\n",
    );

    const stdout2 = callNinja(dir);
    assert.match(stdout2, /Transpiling add\.mts/);
    assert.doesNotMatch(stdout2, /Transpiling multiply\.mts/);
  });

  test("Default args from rule options", (testCtx: { name: string }) => {
    const dir = getTestDir(suiteCtx, testCtx);

    const add = "add.mts";
    writeFileSync(
      join(dir, add),
      "export function add(a: number, b: number): number {\n" +
        "  return a + b;\n" +
        "}\n",
    );

    const ninja = new NinjaBuilder({}, dir);
    // No per-edge args — rely entirely on the rule-level default
    const swc = makeSWCRule(ninja, { args: swcArgs });
    const addMjs = swc({ in: add, out: "add.mjs" });
    writeFileSync(join(dir, "build.ninja"), ninja.output);

    callNinja(dir);

    // Compiled as ES module (module.type=es6 in swcArgs), so output should use `export`
    assert.match(readFileSync(join(dir, addMjs)).toString(), /export/);

    assert.strictEqual(
      execSync("ninja", { cwd: dir }).toString().trim(),
      "ninja: no work to do.",
    );
  });
});
