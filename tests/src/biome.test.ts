import test from "node:test";
import { strict as assert } from "node:assert";
import { makeLintRule, makeFormatRule } from "@ninjutsu-build/biome";
import { NinjaBuilder, orderOnlyDeps } from "@ninjutsu-build/core";

test("makeLintRule", () => {
  const ninja = new NinjaBuilder();
  const lint = makeLintRule(ninja);
  const out: {
    file: "foo.js";
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/biome/lint/foo.js";
  } = lint({
    in: "foo.js",
    configPath: "biome.json",
  });
  assert.equal(out.file, "foo.js");
  assert.equal(
    out[orderOnlyDeps],
    "$builddir/.ninjutsu-build/biome/lint/foo.js",
  );
});

test("makeFormatRule", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  const out: {
    file: "bar.js";
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/biome/format/bar.js";
  } = format({
    in: "bar.js",
    configPath: "biome.json",
  });
  assert.equal(out.file, "bar.js");
  assert.equal(
    out[orderOnlyDeps],
    "$builddir/.ninjutsu-build/biome/format/bar.js",
  );
});

test("format then lint", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  const lint = makeLintRule(ninja);
  const formatted = format({
    in: "bar.js",
    configPath: "biome.json",
  });
  lint({
    in: formatted,
    configPath: "biome.json",
  });
});
