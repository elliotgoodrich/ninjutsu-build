import test from "node:test";
import { strict as assert } from "node:assert";
import {
  makeTSCRule,
  makeTypeCheckRule,
  compilerOptionsToString,
  compilerOptionsToArray,
} from "@ninjutsu-build/tsc";
import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";

test("Serializing CompilerOptions", () => {
  // false
  assert.deepEqual(compilerOptionsToArray({ declaration: false }), []);
  assert.equal(compilerOptionsToString({ declaration: false }), "");

  // true
  assert.deepEqual(compilerOptionsToArray({ declaration: true }), [
    "--declaration",
  ]);
  assert.equal(compilerOptionsToString({ declaration: true }), "--declaration");

  // number
  assert.deepEqual(compilerOptionsToArray({ maxNodeModuleJsDepth: 99 }), [
    "--maxNodeModuleJsDepth",
    "99",
  ]);
  assert.equal(
    compilerOptionsToString({ maxNodeModuleJsDept: 99 }),
    "--maxNodeModuleJsDept 99",
  );

  // string
  assert.deepEqual(compilerOptionsToArray({ outDir: "dist" }), [
    "--outDir",
    "dist",
  ]);
  assert.equal(compilerOptionsToString({ outDir: "dist" }), "--outDir dist");

  // null/undefined
  assert.deepEqual(compilerOptionsToArray({ outDir: undefined }), []);
  assert.equal(compilerOptionsToString({ outDir: undefined }), "");

  // array
  assert.deepEqual(compilerOptionsToArray({ types: [] }), ["--types"]);
  assert.deepEqual(compilerOptionsToArray({ types: ["node"] }), [
    "--types",
    "node",
  ]);
  assert.deepEqual(compilerOptionsToArray({ types: ["node", "jest"] }), [
    "--types",
    "node",
    "jest",
  ]);
  assert.equal(
    compilerOptionsToString({ types: ["node", "jest"] }),
    "--types node jest",
  );
});

test("makeTSCRule", () => {
  const ninja = new NinjaBuilder();
  const tsc = makeTSCRule(ninja);
  const tscNamed = makeTSCRule(ninja, { name: "typescript" });
  assert.deepEqual(
    tsc({
      in: ["src/common/index.ts"],
      compilerOptions: {
        outDir: "output",
      },
    }),
    ["output/index.js"],
  );

  assert.deepEqual(
    tscNamed({
      in: ["index.cts"],
      compilerOptions: {
        declaration: true,
        outDir: "",
      },
      [implicitDeps]: ["implicitDeps"],
      [orderOnlyDeps]: ["orderOnlyDeps"],
      [validations]: (out) => [out[0] + "_validation"],
    }),
    ["index.cjs", "index.d.cts"],
  );
});

test("makeTypeCheckRule", () => {
  const ninja = new NinjaBuilder();
  const typecheck = makeTypeCheckRule(ninja);
  assert.deepEqual(
    typecheck({
      in: ["src/common/index.ts", "src/app/index.ts"],
      out: "$builddir/typechecked.stamp",
      compilerOptions: {
        outDir: "output",
      },
    }),
    [
      {
        file: "src/common/index.ts",
        [validations]: "$builddir/typechecked.stamp",
      },
      {
        file: "src/app/index.ts",
        [validations]: "$builddir/typechecked.stamp",
      },
    ],
  );
});

test("makeTSCRule with tsConfig uses outDir relative to cwd, not tsconfig dir", async () => {
  const ninja = new NinjaBuilder();
  const tsc = makeTSCRule(ninja);

  // packages/tsc/tsconfig.json lists src/tsc.ts and src/parseOutput.mts.
  // The outDir is cwd-relative ("packages/tsc/dist"). Before the fix, the
  // tsConfig branch would mix coordinate spaces and produce paths like
  // "dist/tsc.d.ts" (which when joined with "packages/tsc" gave "dist/tsc.d.ts"
  // via "../dist/tsc.d.ts") instead of "packages/tsc/dist/tsc.d.ts".
  const out = await tsc({
    tsConfig: "packages/tsc/tsconfig.json",
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      outDir: "packages/tsc/dist",
    },
  });

  assert.deepEqual(out.sort(), [
    "packages/tsc/dist/parseOutput.d.mts",
    "packages/tsc/dist/tsc.d.ts",
  ]);

  // Verify the generated ninja build statement uses the correct output paths.
  // tsconfig.json lists src/tsc.ts first, so tsc.d.ts is the primary output
  // and parseOutput.d.mts is the implicit output.
  assert.ok(
    ninja.output.includes(
      "build packages/tsc/dist/tsc.d.ts | packages/tsc/dist/parseOutput.d.mts: tsc packages/tsc/tsconfig.json\n",
    ),
    `ninja.output missing expected build line.\nActual output:\n${ninja.output}`,
  );
});
