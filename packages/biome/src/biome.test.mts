import test from "node:test";
import { strict as assert } from "node:assert";
import {
  makeCheckFormattedRule,
  makeLintRule,
  makeFormatRule,
  makeFormatToRule,
} from "./biome.js";
import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";

test("makeLintRule", () => {
  const ninja = new NinjaBuilder();
  const lint = makeLintRule(ninja, { name: "lint2" });
  const out: {
    file: "foo.js";
    [validations]: "$builddir/.ninjutsu-build/biome/lint/foo.js";
    [orderOnlyDeps]?: string | readonly string[];
  } = lint({
    in: "foo.js",
    configPath: "biome.json",
  });
  assert.deepEqual(out, {
    file: "foo.js",
    [validations]: "$builddir/.ninjutsu-build/biome/lint/foo.js",
  });

  const out2: {
    file: "bar.js";
    [validations]: "$builddir/.ninjutsu-build/biome/lint/bar.js";
    [orderOnlyDeps]?: string | readonly string[];
  } = lint({
    in: {
      file: "bar.js",
      [orderOnlyDeps]: ["buildOrder"],
      [validations]: ["validation"],
    },
    configPath: "biome.json",
    [orderOnlyDeps]: ["moreBuildOrder"],
  });

  // Check we only pass through the `orderOnlyDeps` within `in`.
  assert.deepEqual(out2, {
    file: "bar.js",
    [validations]: "$builddir/.ninjutsu-build/biome/lint/bar.js",
    [orderOnlyDeps]: ["buildOrder"],
  });
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
  assert.deepEqual(out, {
    file: "bar.js",
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/biome/format/bar.js",
  });
});

test("makeFormatToRule", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatToRule(ninja, {
    configPath: "biome.jsonc",
    [implicitDeps]: "dummy",
  });
  const out: "nice.js" = format({
    in: "ugly.js",
    out: "nice.js",
    configPath: "biome.json",
  });
  assert.equal(out, "nice.js");
});

test("makeCheckFormattedRule", () => {
  const ninja = new NinjaBuilder();
  const checkFormatted = makeCheckFormattedRule(ninja);
  const out: {
    file: "ugly.js";
    [validations]: `$builddir/.ninjutsu-build/biome/checkFormatted/ugly.js`;
  } = checkFormatted({
    in: "ugly.js",
    configPath: "biome.json",
  });
  assert.deepEqual(out, {
    file: "ugly.js",
    [validations]: "$builddir/.ninjutsu-build/biome/checkFormatted/ugly.js",
  });
});

test("format then lint", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  const lint = makeLintRule(ninja);
  const checkFormatted = makeCheckFormattedRule(ninja);

  {
    const formatted = format({
      in: "src/bar.js",
      configPath: "biome.json",
    });
    assert.deepEqual(formatted, {
      file: "src/bar.js",
      [orderOnlyDeps]: "$builddir/.ninjutsu-build/biome/format/src/bar.js",
    });

    const linted = lint({
      in: formatted,
      configPath: "biome.json",
    });

    // Check anything that would take `linted` as an input would wait for
    // formatting to finish (orderOnlyDeps) and guarantee that linting would
    // be done (validations).
    assert.deepEqual(linted, {
      file: "src/bar.js",
      [validations]: "$builddir/.ninjutsu-build/biome/lint/src/bar.js",
      [orderOnlyDeps]: "$builddir/.ninjutsu-build/biome/format/src/bar.js",
    });
  }

  {
    const linted = lint({
      in: "src/in.js",
      configPath: "biome.json",
    });

    const formatChecked = checkFormatted({
      in: linted,
      configPath: "biome.json",
    });

    // We don't need to pass through the validations from `linted` because
    // whenever the formatting validation is triggered it will trigger
    // the linting one.
    assert.deepEqual(formatChecked, {
      file: "src/in.js",
      [validations]: "$builddir/.ninjutsu-build/biome/checkFormatted/src/in.js",
    });
  }
});
