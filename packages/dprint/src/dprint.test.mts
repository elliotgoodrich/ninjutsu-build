import test from "node:test";
import { strict as assert } from "node:assert";
import {
  makeCheckFormattedRule,
  makeFormatRule,
  makeFormatToRule,
} from "@ninjutsu-build/dprint";
import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";

test("makeFormatRule", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  const out: {
    file: "bar.ts";
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/dprint/format/bar.ts";
  } = format({
    in: "bar.ts",
    configPath: "dprint.json",
  });
  assert.deepEqual(out, {
    file: "bar.ts",
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/dprint/format/bar.ts",
  });
});

test("makeFormatToRule", () => {
  const ninja = new NinjaBuilder();
  const formatTo = makeFormatToRule(ninja, {
    configPath: "dprint.json",
    [implicitDeps]: "extra.txt",
  });
  const out: "gen/generated.ts" = formatTo({
    in: "$builddir/generated.ts",
    out: "gen/generated.ts",
    configPath: "override.json",
  });
  assert.equal(out, "gen/generated.ts");
});

test("makeCheckFormattedRule", () => {
  const ninja = new NinjaBuilder();
  const checkFormatted = makeCheckFormattedRule(ninja);
  const out: {
    file: "ugly.ts";
    [validations]: "$builddir/.ninjutsu-build/dprint/checkFormatted/ugly.ts";
  } = checkFormatted({
    in: "ugly.ts",
    configPath: "dprint.json",
  });
  assert.deepEqual(out, {
    file: "ugly.ts",
    [validations]: "$builddir/.ninjutsu-build/dprint/checkFormatted/ugly.ts",
  });
});

test("makeCheckFormattedRule forwards orderOnlyDeps from input", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  const checkFormatted = makeCheckFormattedRule(ninja, {
    name: "checkFormatted2",
  });

  const formatted = format({ in: "src/foo.ts", configPath: "dprint.json" });
  const checked = checkFormatted({ in: formatted, configPath: "dprint.json" });

  assert.deepEqual(checked, {
    file: "src/foo.ts",
    [validations]: "$builddir/.ninjutsu-build/dprint/checkFormatted/src/foo.ts",
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/dprint/format/src/foo.ts",
  });
});

test("makeCheckFormattedRule with orderOnlyDeps on input", () => {
  const ninja = new NinjaBuilder();
  const checkFormatted = makeCheckFormattedRule(ninja, {
    name: "checkFormatted3",
  });

  const out = checkFormatted({
    in: {
      file: "bar.ts",
      [orderOnlyDeps]: ["buildOrder"],
      [validations]: ["validation"],
    },
    configPath: "dprint.json",
    [orderOnlyDeps]: ["moreBuildOrder"],
  });

  assert.deepEqual(out, {
    file: "bar.ts",
    [validations]: "$builddir/.ninjutsu-build/dprint/checkFormatted/bar.ts",
    [orderOnlyDeps]: ["buildOrder"],
  });
});

test("configPath is space-separated from user args", () => {
  // A single space must separate `args` from the injected `--config` flag,
  // otherwise they glue into one invalid token (e.g.
  // `--incremental--config dprint.json`).
  {
    const ninja = new NinjaBuilder();
    const format = makeFormatRule(ninja);
    format({ in: "bar.ts", configPath: "dprint.json", args: "--incremental" });
    assert.match(
      ninja.output,
      /\n {2}args = --incremental --config dprint\.json\n/,
    );
  }
  {
    const ninja = new NinjaBuilder();
    const formatTo = makeFormatToRule(ninja);
    formatTo({
      in: "$builddir/generated.ts",
      out: "gen/generated.ts",
      configPath: "dprint.json",
      args: "--incremental",
    });
    assert.match(
      ninja.output,
      /\n {2}args = --incremental --config dprint\.json\n/,
    );
  }
  {
    const ninja = new NinjaBuilder();
    const checkFormatted = makeCheckFormattedRule(ninja);
    checkFormatted({
      in: "ugly.ts",
      configPath: "dprint.json",
      args: "--incremental",
    });
    assert.match(
      ninja.output,
      /\n {2}args = --incremental --config dprint\.json\n/,
    );
  }
});

test("configPath with empty args has no leading space", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja);
  format({ in: "bar.ts", configPath: "dprint.json" });
  assert.match(ninja.output, /\n {2}args = --config dprint\.json\n/);
});

test("makeFormatRule with implicitDeps option", () => {
  const ninja = new NinjaBuilder();
  const format = makeFormatRule(ninja, {
    name: "format2",
    configPath: "dprint.json",
    [implicitDeps]: "extra-dep.txt",
  });
  const out = format({ in: "src/index.ts" });
  assert.deepEqual(out, {
    file: "src/index.ts",
    [orderOnlyDeps]: "$builddir/.ninjutsu-build/dprint/format/src/index.ts",
  });
});
