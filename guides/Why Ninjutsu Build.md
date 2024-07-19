# Why Choose Ninjutsu Build?

Ninjutsu Build is a collection of packages designed to help create a `.ninja`
file. This file outlines all dependencies between inputs and outputs in your
projects, along with the necessary shell commands to generate those files.

The [`ninja`](https://ninja-build.org/) executable reads this file. Known for
its speed, Ninja is used to build large C++ applications like
[Chromium](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/build_instructions.md#setting-up-the-build)
and
[LLVM](https://www.llvm.org/docs/GettingStarted.html#getting-the-source-code-and-building-llvm).

Using Ninjutsu Build, you orchestrate your build process with JavaScript while
executing it with `ninja`. This approach combines JavaScript's flexibility with
the speed of a native build orchestrator. Modern tools for transpiling
TypeScript to JavaScript allow you to separate typechecking and type generation
from running tests, providing faster feedback during development.

After making changes to files, `ninja` will identifies which output files are
outdated and determines the quickest way to update them. For instance, the
Ninjutsu `node` plugin tracks all JavaScript files imported during each test
run, so after modifying one file, `ninja` will only rerun the subset of tests
that imported that file.

Consider using Ninjutsu Build if:

  * You are dissatisfied with the large number of `package.json` scripts.
  * You have non-standard build steps.
  * You already use a JavaScript/TypeScript script to orchestrate your build but
    seek improved performance or better dependency tracking.
  * You want to integrate formatting, linting, transpiling, and/or typechecking
    into the same build command.
