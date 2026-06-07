# dprint - Ninjutsu Build

A package to create `ninjutsu-build` rules for formatting files with
[dprint](https://dprint.dev/).

## Installation

```bash
npm install @ninjutsu-build/core @ninjutsu-build/dprint dprint --save-dev
```

## Basic Example

The following checks that all TypeScript source files are correctly formatted.

```ts
import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeCheckFormattedRule } from "@ninjutsu-build/dprint";
import { writeFileSync } from "node:fs";
import { globSync } from "node:fs";

const ninja = new NinjaBuilder();
const checkFormatted = makeCheckFormattedRule(ninja, { configPath: "dprint.json" });

for (const ts of globSync("src/*.ts")) {
  checkFormatted({ in: ts });
}

writeFileSync("build.ninja", ninja.output);
```
