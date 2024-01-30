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
  implicitOut,
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
    tsc({
      in: ["index.cts"],
      compilerOptions: {
        declaration: true,
        outDir: "",
      },
      [implicitDeps]: ["implicitDeps"],
      [implicitOut]: ["implicitOut"],
      [orderOnlyDeps]: ["orderOnlyDeps"],
      [validations]: (out) => [out[0] + "_validation"],
    }),
    ["index.cjs", "index.d.cts"],
  );
  assert.equal(
    ninja.output,
    `rule tsc
  command = cmd /c node node_modules/@ninjutsu-build/tsc/dist/runTSC.mjs --cwd $cwd --out $out --depfile $out.depfile --listFiles $args -- $in
  description = Compiling $in
  depfile = $out.depfile
  deps = gcc
build output/index.js: tsc src/common/index.ts
  cwd = .
  args = --outDir output
build index.cjs | index.d.cts implicitOut: tsc index.cts | implicitDeps || orderOnlyDeps |@ index.cjs_validation
  cwd = .
  args = --declaration --outDir 
`,
  );
});

test("makeTypeCheckRule", () => {
  const ninja = new NinjaBuilder();
  const typecheck = makeTypeCheckRule(ninja);
  assert.equal(
    typecheck({
      in: ["src/common/index.ts"],
      out: "$builddir/typechecked.stamp",
      compilerOptions: {
        outDir: "output",
      },
    }),
    "$builddir/typechecked.stamp",
  );

  assert.equal(
    ninja.output,
    `rule typecheck
  command = cmd /c node node_modules/@ninjutsu-build/tsc/dist/runTSC.mjs --cwd $cwd --touch $out --out $out --depfile $out.depfile --listFilesOnly $args -- $in
  description = Typechecking $in
  depfile = $out.depfile
  deps = gcc
build $builddir/typechecked.stamp: typecheck src/common/index.ts
  cwd = .
  args = --outDir output
`,
  );
});
