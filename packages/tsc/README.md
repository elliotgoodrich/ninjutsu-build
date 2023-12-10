# TSC - Ninjutsu Build

A package to create a `ninjutsu-build` rule for running TSC.

## Installation

Most likely you require both `@ninjutsu-build/tsc` and `@ninjutsu-build/core` as a
`devDependency`, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/tsc --save-dev
```

## Basic Example

Given the following simple JavaScript file that prints out numbers 
1 to N,

```ts
// index.ts
console.log("Hello World!");
```

We can build a `build.ninja` file that will compile `index.ts` and
use `@ninjutsu-build/node` to run the resulting JavaScript,

```ts
import { NinjaBuilder, [implicitDeps] } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { makeNodeRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.1",
  builddir: ".mybuilddir",
});

// Create the `tsc` rule and compile `index.ts` to `$builddir/index.js`
const tsc = makeTSCRule(ninja);
const js = tsc({
  in: ["index.ts"],
  compilerOptions: {
    outDir: "$builddir",
  }
});

// Create the `node` rule and invoke the generated JavaScript file,
// saving the output to `$builddir/output.txt`.
const node = makeNodeRule(ninja);
node({
  in: js,
  out: "$builddir/output.txt",
});

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```
