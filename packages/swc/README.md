# swc - Ninjutsu Build

A package to create a `ninjutsu-build` rule for transpiling TypeScript and JavaScript files using
[SWC](https://swc.rs/).

Unlike `@ninjutsu-build/tsc`, this plugin only transpiles and does not perform type checking or
generate type declarations.  This makes it faster and well-suited for use alongside
`@ninjutsu-build/tsc` (for type declarations) so that typechecking and test execution can run
in parallel.

## Prerequisites

This project requires NodeJS (version 22 or later), npm, and
[`@swc/cli`](https://www.npmjs.com/package/@swc/cli).

## Installation

Most likely you require `@ninjutsu-build/swc`, `@ninjutsu-build/core`, and `@swc/cli` as
`devDependency` packages, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/swc @swc/cli --save-dev
```

## Basic Example

Given the following TypeScript file,

```ts
// src/add.ts
export function add(a: number, b: number): number {
  return a + b;
}
```

We can build a `build.ninja` file that will transpile `src/add.ts` to `dist/add.js`,

```ts
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeSWCRule } from "@ninjutsu-build/swc";
import { writeFileSync } from "node:fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.1",
  builddir: ".builddir",
});

// Create the `swc` rule, passing SWC arguments that apply to all build edges
const swc = makeSWCRule(ninja, {
  args: ["-C", "jsc.target=es2018", "-C", "module.type=commonjs"],
});

swc({
  in: "src/add.ts",
  out: "dist/add.js",
});

writeFileSync("build.ninja", ninja.output);
```

Run this script with `node --experimental-strip-types configure.ts` (or `npx tsx configure.ts`
etc.) and then run `ninja`!

## Overriding args per build edge

SWC arguments set at the rule level apply to every build edge, but can be overridden for
individual build edges by passing `args` directly,

```ts
const swc = makeSWCRule(ninja, {
  args: ["-C", "jsc.target=es2018", "-C", "module.type=commonjs"],
});

// This edge overrides the module type to ES modules
swc({
  in: "src/index.mts",
  out: "dist/index.mjs",
  args: ["-C", "jsc.target=es2018", "-C", "module.type=es6"],
});
```
