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
import { NinjaBuilder, validations, orderOnlyDeps } from "@ninjutsu-build/core";
import { makeFormatRule, makeLintRule } from "@ninjutsu-build/biome";
import { makeNodeRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder` requiring 1.11 (for validations)
const ninja = new NinjaBuilder({
  ninja_required_version: "1.11",
  builddir: ".mybuilddir",
});

// Create our rules
const format = makeFormatRule(ninja);
const lint = makeLintRule(ninja);
const node = makeNodeRule(ninja);

const biomeConfig = "biome.json",

// For each test
//   - format it
//   - and then afterwards (using order-only dependencies) run the JS test
//   - run linting as a validation step, which will allow ninja to run it
//     in parallel to the test
globSync("tests/*.test.js", { posix: true }).forEach((js) => {
  const formatted = format({ in: js, configPath: biomeConfig });
  node({
    in: formatted.file,
    args: "--test",
    [orderOnlyDeps]: formatted[orderOnlyDeps],
    [validations]: (file) => lint({ in: file, configPath: biomeConfig }),
  })
});

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```
