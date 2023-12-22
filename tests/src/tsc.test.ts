import test from "node:test";
import { strict as assert } from "node:assert";
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTSCRule, makeTypeCheckRule } from "@ninjutsu-build/tsc";

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
build index.cjs: tsc index.cts
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
  command = cmd /c node node_modules/@ninjutsu-build/tsc/dist/runTSC.mjs --cwd $cwd --out $out --depfile $out.depfile --listFilesOnly $args $in
  description = Typechecking $in
  depfile = $out.depfile
  deps = gcc
build $builddir/typechecked.stamp: typecheck src/common/index.ts
  cwd = .
  args = --outDir output
`,
  );
});
