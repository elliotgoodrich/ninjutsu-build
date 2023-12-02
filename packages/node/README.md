# Node - Ninjutsu Build

A package to create a `ninjutsu-build` rule for running JavaScript files within node.

## Prerequisites

This project requires NodeJS (version 18.18.0 or later for
[`--import` support](https://nodejs.org/api/cli.html#--importmodule)) and npm.

## Installation

Most likely you require both `@ninjutsu-build/node` and `@ninjutsu-build/code` as a
`devDependency`, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/node --save-dev
```

## Basic Example

Given the following simple JavaScript file that prints out numbers 
1 to N,

```js
// count.js
const process = require('node:process');

const limit = parseInt(process.argv[2]);
for (let i = 1; i < limit; ++i) {
  console.log(i);
}
```

We can build a `build.ninja` file that will invoke `count.js` and
save the output,

```ts
import { NinjaBuilder, [implicitDeps] } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.1",
  builddir: ".mybuilddir",
});

// Create a `runJS` ninja rule
const node = makeNodeRule(ninja, "runJS");

// Run `src/count.js` and save to `$builddir/output.txt`.
// Pass the `.package-lock.json` file as an implicit dependency
// so that installing or changing dependencies will cause ninja
// to regenerate `output.txt`.
const output = node({
  in: "src/count.js",
  out: "$builddir/output.txt",
  args: 10, // pass `10` to `count.js`
  [implicitDeps]: ["src/node_modules/.package-lock.json"],
});

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```
