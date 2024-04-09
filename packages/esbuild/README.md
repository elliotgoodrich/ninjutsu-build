# esbuild - Ninjutsu Build

A package to create a `ninjutsu-build` rule for running
[esbuild](https://esbuild.github.io/).

## Installation

Most likely you require both `@ninjutsu-build/esbuild` and `@ninjutsu-build/code` as a
`devDependency`, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/esbuild --save-dev
```

## Basic Example

The following transpiles all `*.test.ts` files in the `tests` directory to
JavaScript,

```ts
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeESBuildRule } from "@ninjutsu-build/esbuild";
import { globSync } from "glob";

const ninja = new NinjaBuilder();
const esbuild = makeESBuildRule(ninja);

globSync("src/*.tests.ts", { posix: true }).map((ts) =>
 esbuild({
    in: ts,
    out: join("$builddir", "dist", basename(file, extname(file)) + ".mjs"),
    buildOptions: { bundle: true, format: "esm" },
  })
);

writeFileSync("build.ninja", ninja.output);
```