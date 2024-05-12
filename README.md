# Ninjutsu Build

Orchestrate your build with TypeScript - execute it with native tools!

`@ninjutsu-build/core` is a TypeScript library for creating
[ninja](https://ninja-build.org/) files. Combined with a set of plugins for
commonly used JavaScript tools, `@ninjutsu-build` can be used to orchestrate
your JavaScript and TypeScript builds.

Ninjutsu Build is built using itself. You can see the
[configure.mjs](configure/configure.mjs) script used to generate the
`build.ninja` file.

## Why Ninjutsu Build?

Some of the selling points of `@ninjutsu-build` are:

  * Orchestrate your build in JavaScript/TypeScript for ultimate flexibility
  * Execute your build through native tooling for performance
  * Timestamp checking and local-caching for fast incremental builds
  * Per-file dependency tracking to rebuild only when absolutely necessary
  * A set of plugins for formatting, linting, testing, and transpilation
  * Easy to create additional plugins

## Plugins

Though core library `@ninjutsu-build/core` ([npm](https://www.npmjs.com/package/@ninjutsu-build/core))
has everything you need to create ninja files, there are a set of plugins that have already solved
some of the more common requirements:

  - [`biome`](packages/biome/README.md) ([npm `@ninjutsu-build/biome`](https://www.npmjs.com/package/@ninjutsu-build/biome))
    for linting and formatting using `biomejs
  - [`bun`](packages/bun/README.md) ([npm `@ninjutsu-build/bun`](https://www.npmjs.com/package/@ninjutsu-build/bun))
    for transpiling TypeScript to JavaScript using `bun`
  - [`esbuild`](packages/esbuild/README.md) ([npm `@ninjutsu-build/esbuild`](https://www.npmjs.com/package/@ninjutsu-build/esbuild))
    for transpiling and bundling TypeScript/JavaScript using `esbuild`
  - [`node`](packages/node/README.md) ([npm `@ninjutsu-build/node`](https://www.npmjs.com/package/@ninjutsu-build/node))
    for running `node` (and node's test runner) while tracking all JavaScript dependencies
  - [`tsc`](packages/tsc/README.md) ([npm `@ninjutsu-build/tsc`](https://www.npmjs.com/package/@ninjutsu-build/tsc))
    for compiling TypeScript to JavaScript using `tsc` while tracking all TypeScript dependencies

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
// configure.ts
import { NinjaBuilder, needs } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.11",
  builddir: ".builddir",
});

// Create our rules, some from existing plugins, some from `NinjaBuilder.rule`
ninja.comment("Rules");
const tsc = makeTSCRule(ninja);
const test = makeNodeTestRule(ninja);
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
const results = [test1, test2].map((test) => test({
  in: test,
  out: `$builddir/${test}.results.txt`,
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

Run this script with `npx tsx configure.ts` (or `ts-node` etc.) and then run `ninja`!

After changing any of the mentioned TypeScript files mentioned in the script, just run
`ninja` to rebuild only those outputs that are needed.

## Developer Guide

### Setup

  1. Install [`node`](https://nodejs.org/en/download) (>=18)
  2. Install [`ninja`](https://ninja-build.org/) (>=1.11)
  3. `npm ci --prefix configure`
  4. `npm run configure` (or for a slightly faster option in node >=22 `node --run configure`)

### Building + linting + formatting + tests

  1. `ninja`

If new files are added then you must run `npm run configure`/`node --run configure` again
to regenerate a file `build.ninja` that includes these new files.
