import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { makeNodeRule } from "@ninjutsu-build/node";
import { dirname, join, sep } from "node:path/posix";
import { writeFileSync } from "node:fs";
import { globSync } from "glob";
import { platform } from "os";
import { relative } from "path/posix";

const prefix = platform() === "win32" ? "cmd /c " : "";

function makeNpmCiRule(ninja) {
  const ci = ninja.rule("npmci", {
    command: prefix + "npm ci --prefix $cwd --silent",
    description: "Running npm ci in $cwd",
  });
  return (a) => {
    const cwd = dirname(a.in);
    return ci({
      in: a.in,
      out: join(cwd, "node_modules", ".package-lock.json"),
      cwd,
    });
  };
}

function makeTarRule(ninja) {
  const tar = ninja.rule("tar", {
    command: "tar -czvf $args $out $in",
    description: "Creating $out",
  });
  return (a) =>
    tar({
      in:
        a.rootDir === undefined
          ? a.in
          : a.in.map((i) => relative(a.rootDir, i)),
      out: a.out,
      args: a.rootDir === undefined ? undefined : "-C " + a.rootDir,
    });
}

function makePrettierRule(ninja) {
  const touch = platform() == "win32" ? "type NUL > $out" : "touch $out";
  const prettier = ninja.rule("prettier", {
    command:
      prefix +
      "npm exec --prefix $cwd prettier -- $in --write --log-level silent && " +
      touch,
    description: "Running prettier on $in",
  });
  return (a) =>
    prettier({
      ...a,
      out: "$builddir/.ninjutsu-build/prettier/" + a.in,
    });
}

function makeESLintRule(ninja) {
  const eslint = ninja.rule("eslint", {
    command: prefix + "npm exec --prefix $cwd eslint -- $in > $out",
    description: "Linting $in",
  });
  return (a) =>
    eslint({
      ...a,
      out: "$builddir/.ninjutsu-build/eslint/" + a.in,
    });
}

const compilerOptions = {
  target: "ES2018",
  lib: ["ES2021"],
  outDir: "dist",
  module: "NodeNext",
  moduleResolution: "NodeNext",
  declaration: true,
  esModuleInterop: true,
  forceConsistentCasingInFileNames: true,
  strict: true,
  noImplicitAny: true,
  strictNullChecks: true,
  strictFunctionTypes: true,
  strictBindCallApply: true,
  strictPropertyInitialization: true,
  noImplicitThis: true,
  useUnknownInCatchVariables: true,
  alwaysStrict: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  skipDefaultLibCheck: true,
  skipLibCheck: true,
};

const ninja = new NinjaBuilder({
  builddir: ".builddir",
  // validations were added in 1.11
  ninja_required_version: "1.11",
});

ninja.output += "\n";
ninja.comment("Rules");
const tsc = makeTSCRule(ninja);
const node = makeNodeRule(ninja);
const ci = makeNpmCiRule(ninja);
const tar = makeTarRule(ninja);
const prettier = makePrettierRule(ninja);
const eslint = makeESLintRule(ninja);

{
  ninja.output += "\n";
  ninja.comment("Configuration");

  // Run `npm ci`
  const packageJSON = "package.json";

  // Run prettier over package.json
  const prettyPackageJSON = prettier({ in: packageJSON, cwd: "." });
  prettier({ in: "configure.mjs", cwd: "." });

  ci({
    in: packageJSON,
    [orderOnlyDeps]: [prettyPackageJSON],
  });
}

// Collect all the JavaScript files in our packages
const js = globSync("packages/*/package.json", { posix: true }).reduce(
  (deps, packageJSON) => {
    const [, packageName] = dirname(packageJSON).split(sep);
    const cwd = `packages/${packageName}`;
    ninja.output += "\n";
    ninja.comment(cwd);

    // Run prettier over package.json
    const prettyPackageJSON = prettier({ in: packageJSON, cwd });

    // Run `npm ci`
    const dependenciesInstalled = ci({
      in: packageJSON,
      [orderOnlyDeps]: [prettyPackageJSON],
    });

    // Grab all TypeScript source files and run prettier over them
    const ts = globSync(`packages/${packageName}/src/*.*`, { posix: true });

    // Run linting on the TypeScript once it's been made pretty
    const pretty = ts.map((file) =>
      prettier({
        in: file,
        cwd,
        [validations]: eslint({ in: file, cwd }),
      }),
    );

    // Transpile the TypeScript into JavaScript once prettier has finished
    return deps.concat(
      tsc({
        in: ts,
        compilerOptions,
        cwd,
        // We must use `implicitDeps` instead of `orderOnlyDeps` as the `npmci` rule does
        // not use `dyndeps` to describe what files it creates in `node_modules`
        [implicitDeps]: pretty.concat(dependenciesInstalled),
      }),
    );
  },
  [],
);

ninja.output += "\n";
ninja.comment("Tests");

{
  const cwd = "tests";
  const packageJSON = cwd + "/package.json";

  // Run prettier over tests/package.json
  const prettyPackageJSON = prettier({
    in: packageJSON,
    cwd,
  });

  // Run `npm ci`
  const dependenciesInstalled = ci({
    in: packageJSON,
    [orderOnlyDeps]: [prettyPackageJSON],
  });

  // Grab all TypeScript source files and run prettier over them
  const ts = globSync("tests/src/*.*", { posix: true });

  // Run linting on the TypeScript once it's been made pretty
  const pretty = ts.map((file) =>
    prettier({
      in: file,
      cwd,
      [validations]: eslint({ in: file, cwd }),
    }),
  );

  // Transpile the TypeScript into JavaScript once prettier has finished
  const tests = tsc({
    in: ts,
    compilerOptions: { ...compilerOptions, declaration: false },
    cwd,
    // We must use `implicitDeps` instead of `orderOnlyDeps` as the `npmci` rule does
    // not use `dyndeps` to describe what files it creates in `node_modules`
    [implicitDeps]: pretty.concat(dependenciesInstalled),
  });

  tests.forEach((test) =>
    node({
      in: test,
      out: `$builddir/${test}.result.txt`,
      args: "--test",
      // Use `orderOnlyDeps` to make sure we don't run before building all of our
      // packages. But once this has been done, we use a `depfile` to pick up the
      // true dependencies.
      [orderOnlyDeps]: js,
    }),
  );
}

writeFileSync("build.ninja", ninja.output);
