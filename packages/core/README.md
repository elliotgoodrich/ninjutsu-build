# Ninjutsu Build

Easily create ninja build files with this TypeScript library (https://ninja-build.org/).

## Why Ninjutsu Build?

Some of the selling points of `ninjutsu-build` are:

  * TypeScript
  * Type-safe design - easy to create build rules that require certain variables, or
    can have optionally specified variables
  * Simple and quick - all methods calls write directly to a `string` property
  * Ninja rules return the value of the `out` argument, which makes it easier to use
    linting tools to find unused build artifatcts
  * ES Module
  * Zero dependencies

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
import { writeFileSync } from "fs";

// Create a `NinjaBuilder`
const ninja = new NinjaBuilder({
  ninja_required_version: "1.1",
  builddir: ".mybuilddir",
});

// Create the `touch` rule
const touch = ninja.rule("touch", {
  out: needs<string>(),
  command: "touch $out",
  description: "Creating $out",
});

// Create a build edge using `touch` and store the value
// of the `out` property
const example = touch({
  out: "$builddir/example.stamp",
});

// Create the `cp` rule
const copy = ninja.rule("cp", {
  out: needs<string>(),
  in: needs<string>(),
  command: "copy $in $out",
  description: "Copying $in to $out",
});

// Copy the file created previously
copy({
    in: example,
    out: "$builddir/example.copy.stamp",
});

// Write the ninja file to disk
writeFileSync("build.ninja", ninja.output);
```
