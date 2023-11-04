# Ninjutsu Build

A TypeScript library for creating ninja files (https://ninja-build.org/).

`ninjutsu-build` makes it easy and type-safe to write fast code to generate a ninja
file.

## Prerequisites

This project requires NodeJS (version 18 or later) and npm.

## Installation

```bash
npm install @ninjutsu-build/core --save-dev
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

// Create a build edge using `touch`
const example = touch({ out: "$builddir/example.stamp" });

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

