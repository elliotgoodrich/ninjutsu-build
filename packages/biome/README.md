# biome - Ninjutsu Build

A package to create a `ninjutsu-build` rule for linting and formatting files With
[Biome](https://biomejs.dev/).

## Installation

Most likely you require both `@ninjutsu-build/biome` and `@ninjutsu-build/code` as a
`devDependency`, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/biome --save-dev
```

## Basic Example

The following formats all `*.test.js` files in the `tests` directory, and then
runs those tests with node's test runner, while linting those JavaScript files
in parallel.

```ts
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeFormatRule, makeLintRule } from "@ninjutsu-build/biome";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder` requiring 1.11 (for validations)
const ninja = new NinjaBuilder({
  ninja_required_version: "1.11",
  builddir: ".mybuilddir",
});

// Create our rules
const format = makeFormatRule(ninja);
const lint = makeLintRule(ninja);
const test = makeNodeTestRule(ninja);

const biomeConfig = "biome.json",

// For each test file, format, lint, and run it in node
for (const js of globSync("tests/*.test.js", { posix: true })) {
  const formatted = format({ in: js, configPath: biomeConfig });
  const linted = lint({ in: formatted, configPath: biomeConfig });
  test({
    in: linted,
    out: `$builddir/results/${js}.txt`,
  });
};

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```
