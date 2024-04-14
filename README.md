# Ninjutsu Build

A set of TypeScript libraries for creating ninja files (https://ninja-build.org/).

Ninjutsu Build is built using itself. You can see the [configure.mjs](configure.mjs)
script used to generate the `build.ninja` file.

## Why Ninjutsu Build?

Some of the selling points of `@ninjutsu-build` are:

  * TypeScript
  * Type-safe design - easy to create build rules that require certain variables, or
    can have optionally specified variables
  * Simple and quick - all methods calls write directly to a `string` property
  * Ninja rules return the value of the `out` argument, which makes it easier to use
    linting tools to find unused build artifatcts
  * Zero dependencies

## Plugins

Though core library `@ninjutsu-build/core` ([npm](https://www.npmjs.com/package/@ninjutsu-build/core))
has everything you need to create ninja files, there are a set of plugins that have already solved
some of the more common requirements:

  - [`node`](packages/node/README.md) ([npm `@ninjutsu-build/node`](https://www.npmjs.com/package/@ninjutsu-build/node))
    for running `node` (and node's test runner) while tracking all JavaScript dependencies
  - [`tsc`](packages/tsc/README.md) ([npm `@ninjutsu-build/tsc`](https://www.npmjs.com/package/@ninjutsu-build/tsc))
    for compiling TypeScript to JavaScript using `tsc` while tracking all TypeScript dependencies
  - [`biome`](packages/biome/README.md) ([npm `@ninjutsu-build/biome`](https://www.npmjs.com/package/@ninjutsu-build/biome))
    for linting and formatting using `biomejs
  - [`bun`](packages/bun/README.md) ([npm `@ninjutsu-build/bun`](https://www.npmjs.com/package/@ninjutsu-build/bun))
    for transpiling TypeScript to JavaScript using `bun`

## Prerequisites

This project requires NodeJS (version 18 or later) and npm.

## Installation

Most likely you require `@ninjutsu-build/core` as a `devDependency`, which can be
achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core --save-dev
```

## Basic Example

```ts
import { NinjaBuilder, needs } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { makeNodeRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.11",
  builddir: ".builddir",
});

// Create our rules, some from existing plugins, some from `NinjaBuilder.rule`
ninja.comment("Rules");
const tsc = makeTSCRule(ninja);
const node = makeNodeRule(ninja);
const concat = ninja.rule("concat", {
  command: "concat $in > $out",
  description: "Concatting '$in' to $out",
  in: needs<readonly string[]>(),
  out: needs<string>(),
})

ninja.comment("Build Edges");

// Compile 3 TypeScript files to JavaScript + their declaration files
const [index, indexTypes, test1, test1Types, test2, test2Types] = tsc({
  in: ["src/index.ts", "src/index1.test.ts", "src/index2.test.ts"],
  compilerOptions: {
    outDir: "dist",
    declaration: true,
    target: "ES2021",
    lib: ["ES2021"],
    module: "NodeNext",
    moduleResolution: "NodeNext",
    strict: true,
    noImplicitAny: true,
  },
});

// Run our 2 tests using node's test runner
const results = [test1, test2].map((test) => node({
  in: test,
  out: `$builddir/${test}.results.txt`,
  args: "--test",
}));

// Concatenate the results to one file (not really needed here
// but acts as demonstration of how it would be used)
concat({
  in: results,
  out: "$builddir/all-tests.results.txt",
});

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```

## Developer Guide

### Setup

  1. Install `node` (>18)
  2. Install `ninja` (>1.11)
  3. `npm ci --prefix configure`
  4. `npm run configure` (`npm run configure -- --bun` to use `bun` instead of `swc` for transpiling)

### Building + linting + formatting + tests

  1. `ninja`
