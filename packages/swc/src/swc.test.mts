import test from "node:test";
import { strict as assert } from "node:assert";
import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import { makeSWCRule } from "@ninjutsu-build/swc";

test("makeSWCRule", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja);
  const out: "dist/index.js" = swc({
    in: "src/index.ts",
    out: "dist/index.js",
  });
  assert.equal(out, "dist/index.js");
});

test("makeSWCRule with args", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja);
  const out: "dist/index.mjs" = swc({
    in: "src/index.mts",
    out: "dist/index.mjs",
    args: ["-C", "jsc.target=es2018", "-C", "module.type=es6"],
  });
  assert.equal(out, "dist/index.mjs");
});

test("makeSWCRule with implicitDeps in options", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja, { [implicitDeps]: "tsconfig.json" });
  const out: "dist/index.js" = swc({
    in: "src/index.ts",
    out: "dist/index.js",
  });
  assert.equal(out, "dist/index.js");
});

test("makeSWCRule with orderOnlyDeps in options", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja, { [orderOnlyDeps]: "setup.stamp" });
  const out: "dist/index.js" = swc({
    in: "src/index.ts",
    out: "dist/index.js",
  });
  assert.equal(out, "dist/index.js");
});

test("makeSWCRule with implicitDeps, orderOnlyDeps, and validations", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja);
  const out: "dist/index.js" = swc({
    in: "src/index.ts",
    out: "dist/index.js",
    [implicitDeps]: ["tsconfig.json"],
    [orderOnlyDeps]: ["setup.stamp"],
    [validations]: (o) => o + ".valid",
  });
  assert.equal(out, "dist/index.js");
});

test("makeSWCRule with default args from options", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja, {
    args: ["-C", "jsc.target=es2018", "-C", "module.type=commonjs"],
  });
  swc({ in: "src/index.ts", out: "dist/index.js" });
  assert.match(
    ninja.output,
    /args = -C jsc\.target=es2018 -C module\.type=commonjs/,
  );
});

test("makeSWCRule per-edge args override options args", () => {
  const ninja = new NinjaBuilder();
  const swc = makeSWCRule(ninja, {
    args: ["-C", "module.type=commonjs"],
  });
  swc({
    in: "src/index.ts",
    out: "dist/index.js",
    args: ["-C", "module.type=es6"],
  });
  assert.match(ninja.output, /args = -C module\.type=es6/);
  assert.doesNotMatch(ninja.output, /commonjs/);
});

test("makeSWCRule with custom name", () => {
  const ninja = new NinjaBuilder();
  makeSWCRule(ninja, { name: "transpile" });
  assert.match(ninja.output, /^rule transpile/m);
});
