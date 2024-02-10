# bun - Ninjutsu Build

A package to create a `ninjutsu-build` rule for transpiling TypeScript to JavaScript
using [bun](https://bun.sh).

There are no rules in `@ninjutsu-build/bun` for bundling as this would require `bun`
to output all of the files that have been bundled while processing a particular entry
point.  This would allow us to save this to an appropriate `dyndep` file and use this
in the rule.

There are no rules in `@ninjutsu-build/bun` to execute JavaScript as this would
require `bun` to output all the files that have been `import`ed or `require`d (or allow
us to intercept those calls which is done with `@ninjutsu-build/node`) so we can
create a `dyndep` file to capture all of the dependencies.

## Installation

Make sure `bun` is installed by following their
[instructions](https://bun.sh/docs/installation).

Most likely you require both `@ninjutsu-build/bun` and `@ninjutsu-build/code` as a
`devDependency`, which can be achieved by running the following `npm` command:

```bash
$ npm install @ninjutsu-build/core @ninjutsu-build/bun --save-dev
```

## Basic Example

The following transpiles all `*.test.ts` files in the `tests` directory to
JavaScript,

```ts
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTranspileRule } from "@ninjutsu-build/bun";
import { globSync } from "glob";

const ninja = new NinjaBuilder();
const transpile = makeTranspileRule(ninja);

globSync("src/*.tests.ts", { posix: true }).map((ts) =>
 transpile({
    in: ts,
    out: join("$builddir", "dist", basename(file, extname(file)) + ".mjs"),
    args: "--target node",
  })
);

writeFileSync("build.ninja", ninja.output);
```