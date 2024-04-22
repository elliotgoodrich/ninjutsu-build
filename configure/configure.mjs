import {
  NinjaBuilder,
  getInput,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import { makeTSCRule, makeTypeCheckRule } from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import {
  makeCheckFormattedRule,
  makeFormatRule,
  makeLintRule,
} from "@ninjutsu-build/biome";
import { makeTranspileRule } from "@ninjutsu-build/bun";
import { basename, dirname, extname, join, relative } from "node:path/posix";
import {
  resolve as resolveNative,
  relative as relativeNative,
  sep,
} from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { globSync } from "glob";
import { platform } from "os";
import isCi from "is-ci";

if (isCi) {
  console.log("Running in CI mode");
}

// Copy from `@ninjutsu-build/core` for the moment until we widen the
// contract of `phony`
function getOrderOnlyDeps(input) {
  if (typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(getOrderOnlyDeps);
  }
  return input[orderOnlyDeps] ?? input.file;
}

const extLookup = {
  ".ts": ".js",
  ".mts": ".mjs",
  ".cts": ".cjs",
};

const prefix = platform() === "win32" ? "cmd /c " : "";

const useBun = process.argv.includes("--bun");

function makeNpmCiRule(ninja) {
  const ci = ninja.rule("npmci", {
    command: prefix + "npm ci --prefix $cwd --silent",
    description: "npm ci ($cwd)",
  });
  return (a) => {
    const cwd = dirname(getInput(a.in));
    return ci({
      ...a,
      out: join(cwd, "node_modules", ".package-lock.json"),
      cwd,
    });
  };
}

function makeNpmCiWorkspaces(ninja) {
  const ci = ninja.rule("npmciworkspaces", {
    command: prefix + "npm ci --workspaces --silent",
    description: "npm ci --workspaces",
  });
  return (a) =>
    ci({
      ...a,
      out: join(dirname(getInput(a.in)), "node_modules", ".package-lock.json"),
    });
}

function makeTarRule(ninja) {
  // Intentionally avoid using `$in` as it must be the full path of the files
  // we want to add in order for ninja to set up the dependencies correctly, but
  // most of the time we would like to `tar` from a subdirectory.  So we keep
  // `$in` to help ninja, but we -C into our directory and strip the prefix
  // from `$in` and save as the `$files` variable.
  const tar = ninja.rule("tar", {
    command: "tar -czf $out $args $files",
    description: "Creating archive $out",
  });
  return (a) => {
    const { dir, ...rest } = a;
    return tar({
      ...rest,
      files:
        dir === undefined ? a.in : a.in.map((i) => relative(dir, i)).join(" "),
      args: a.dir === undefined ? undefined : "-C " + a.dir,
    });
  };
}

function makeCopyRule(ninja) {
  return ninja.rule("copy", {
    command: "cp $in $out",
    description: "Copying $in to $out",
  });
}

function makeSWCRule(ninja) {
  const swc = relativeNative(
    resolveNative(process.cwd(), ninja.outputDir),
    fileURLToPath(import.meta.resolve("@swc/cli")),
  );
  return ninja.rule("swc", {
    command: `${prefix}node ${swc} $in -o $out -q $args`,
    description: "Transpiling $in",
  });
}

function formatAndLint(file) {
  const formatted = format({ in: file });
  return lint({ in: formatted });
}

// Return a function that will append `args[orderOnlyDeps]` with the build arguments
// before passing to `rule`.
function inject(rule, args) {
  return (a) => {
    const { [orderOnlyDeps]: _orderOnlyDeps = [], ...rest } = a;
    return rule({
      ...rest,
      [orderOnlyDeps]: _orderOnlyDeps.concat(args[orderOnlyDeps]),
    });
  };
}

function addBiomeConfig(rule) {
  return (a) => {
    return rule({
      ...a,
      configPath: join("configure", "biome.json"),
    });
  };
}

// Tell TypeScript to look for `@types/node` package installed in the
// workspace `node_modules` directory, otherwise it'll fail to find it
const typeRoots = [
  relativeNative(
    process.cwd(),
    fileURLToPath(import.meta.resolve("@types/node/package.json")),
  )
    .split(sep)
    .slice(0, -2)
    .join("/"),
];

const compilerOptions = {
  target: "ES2018",
  lib: ["ES2021"],
  module: "nodenext",
  moduleResolution: "nodenext",
  typeRoots,
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

const workspacePkg = "package.json";
const workspaceJSON = JSON.parse(readFileSync(workspacePkg));

ninja.output += "\n";
ninja.comment("Rules + Installation");
const ci = makeNpmCiRule(ninja);
const ciworkpace = makeNpmCiWorkspaces(ninja);

const { phony } = ninja;
const packagesLinked = ciworkpace({ in: workspacePkg });

// We would like to check whether `package.json` is formatted correctly.
// Most of the rules inject a build-order dependency on `npm ci` having
// run correctly, but we also need a validation dependency from running
// `npm ci` so we have a cycle (in JS only, ninja is happy with a cycle
// containing a validations edge).  This means it's a bit convoluted to
// create the `checkFormatted` rule but that what the code below does.
let checkFormatted;

const toolsInstalled = ci({
  in: "configure/package.json",
  [validations]: (out) => {
    checkFormatted = addBiomeConfig(
      inject(makeCheckFormattedRule(ninja), {
        [orderOnlyDeps]: out,
      }),
    );
    // Add a validation that `package.json` is formatted correctly.
    // If we formatted after running `npmci` it would cause us to run it again
    return checkFormatted({ in: "configure/package.json" })[validations];
  },
});

const tsc = inject(makeTSCRule(ninja), { [orderOnlyDeps]: toolsInstalled });
const typecheck = inject(makeTypeCheckRule(ninja), {
  [orderOnlyDeps]: toolsInstalled,
});
const test = makeNodeTestRule(ninja);
const tar = makeTarRule(ninja);
const format = isCi
  ? checkFormatted
  : addBiomeConfig(
      inject(makeFormatRule(ninja), {
        [orderOnlyDeps]: toolsInstalled,
      }),
    );
const copy = makeCopyRule(ninja);
const lint = addBiomeConfig(
  inject(makeLintRule(ninja), {
    [orderOnlyDeps]: toolsInstalled,
  }),
);
const transpile = useBun
  ? makeTranspileRule(ninja)
  : inject(makeSWCRule(ninja), { [orderOnlyDeps]: toolsInstalled });
const transpileArgs = useBun
  ? "--target=node --no-bundle"
  : "-C jsc.target=es2018";

format({ in: "configure/configure.mjs" });

const scope = "@ninjutsu-build/";
for (const cwd of workspaceJSON.workspaces) {
  if (cwd === "integration") {
    // Handle the integration package separately for the moment
    continue;
  }
  const localPKGJSON = JSON.parse(
    readFileSync(join(cwd, "package.json")).toString(),
  );

  // Build up our dependencies that come from npm or locally linking (we
  // assume there will be a "@ninjutsu-build/foo/build" target for when a
  // dependency is built and usable)
  const dependencies = [packagesLinked].concat(
    Object.keys({
      ...localPKGJSON.dependencies,
      ...localPKGJSON.devDependencies,
      ...localPKGJSON.peerDependencies,
    })
      .filter((d) => d.startsWith(scope))
      .map((d) => `${d}/build`),
  );

  ninja.output += "\n";
  ninja.comment(cwd);

  // Format package.json
  const packageJSON = format({ in: join(cwd, "package.json") });

  // Grab all TypeScript source files and format them
  const ts = globSync(join(cwd, "src", "*.{mts,ts}"), {
    posix: true,
    ignore: { ignored: (f) => f.name.endsWith(".test.ts") },
  }).map(formatAndLint);

  // In the `lib` directory we have JavaScript files and TS declaration files
  const lib = globSync(join(cwd, "lib", "*.*"), {
    posix: true,
  }).map(formatAndLint);

  // Transpile the TypeScript into JavaScript once formatting has finished
  const dist = tsc({
    in: ts,
    compilerOptions: {
      ...compilerOptions,
      outDir: join(cwd, "dist"),
    },
    [orderOnlyDeps]: [...dependencies, ...lib],
  });

  // Create a phony target for when the package has been built and is consumable
  // from other packages
  const buildPackage = phony({
    out: `${localPKGJSON.name}/build`,
    in: [packageJSON, ...dist, ...lib].map(getOrderOnlyDeps),
  });

  // Grab all TypeScript tests files and format them
  const tests = globSync(join(cwd, "src", "*.test.ts"), {
    posix: true,
  }).map(formatAndLint);

  // Type check all the tests
  const testTargets = (() => {
    if (tests.length !== 0) {
      return typecheck({
        in: tests,
        out: join(cwd, "dist", "typechecked.stamp"),
        compilerOptions,
        [orderOnlyDeps]: [...dependencies, ...dist],
      }).map((t) => {
        const file = getInput(t);
        const js = transpile({
          in: t,
          out: join(cwd, "dist", basename(file, extname(file)) + ".mjs"),
          args: transpileArgs,
        });
        return test({
          in: js,
          out: join("$builddir", cwd, `${js}.result.txt`),
          [orderOnlyDeps]: [...dependencies, ...dist],
        });
      });
    } else {
      return [];
    }
  })();

  // Prepare our files to create a tgz of our package, include
  //   - README.md
  //   - package.json
  //   - contents of `lib`
  //   - contents of `dist`
  const stageForTar = (args) => {
    const { in: _in, ...rest } = args;
    return copy({
      in: _in,
      out: `$builddir/${cwd}/${relative(cwd, getInput(_in))}`,
      ...rest,
    });
  };
  let toPack = [];
  toPack.push(stageForTar({ in: join(cwd, "README.md") }));
  toPack.push(stageForTar({ in: packageJSON }));
  toPack = toPack.concat(dist.map((file) => stageForTar({ in: file })));
  toPack = toPack.concat(lib.map((file) => stageForTar({ in: file })));

  const createTar = tar({
    out: `$builddir/${localPKGJSON.name}.tgz`,
    in: toPack,
    dir: "$builddir",
  });

  // Create a alias for building and testing the whole package
  phony({
    out: localPKGJSON.name,
    in: [buildPackage, ...testTargets, createTar],
  });
}

{
  const cwd = "integration";

  // If `packageJSON` is changed (and only after we have run `npm ci`)
  // install our packages locally
  const packageJSON = join(cwd, "package.json");

  const localPKGJSON = JSON.parse(readFileSync(packageJSON).toString());

  // Build up our dependencies that come from npm or locally linking (we
  // assume there will be a "@ninjutsu-build/foo/build" target for when a
  // dependency is built and usable)
  const dependencies = [packagesLinked].concat(
    Object.keys({
      ...localPKGJSON.dependencies,
      ...localPKGJSON.devDependencies,
      ...localPKGJSON.peerDependencies,
    })
      .filter((d) => d.startsWith(scope))
      .map((d) => `${d}/build`),
  );

  // Grab all TypeScript tests files and format them
  const tests = globSync(join(cwd, "src", "*.mts"), {
    posix: true,
    ignore: { ignored: (f) => f.name.endsWith(".d.mts") },
  }).map(formatAndLint);

  const utilJS = copy({
    in: join(cwd, "src", "util.mjs"),
    out: join(cwd, "dist", "util.mjs"),
  });
  const utilDecl = copy({
    in: join(cwd, "src", "util.d.mts"),
    out: join(cwd, "dist", "util.d.mts"),
  });

  // Typecheck everything in one go
  const typechecked = typecheck({
    in: tests,
    out: join(cwd, "dist", "typechecked.stamp"),
    compilerOptions,
    [orderOnlyDeps]: dependencies,
  });

  // Transpile all files into JavaScript
  const jsTests = typechecked.map((t) => {
    const file = getInput(t);
    const ext = extname(file);
    return transpile({
      in: t,
      out: join(cwd, "dist", basename(file, ext) + extLookup[ext]),
      args: transpileArgs,
    });
  });

  // Run all tests and make sure they have an order-only dependency
  // on our non-test files.
  const integrationTests = jsTests.map((t) =>
    test({
      in: t,
      out: getInput(t) + ".result.txt",
      [orderOnlyDeps]: dependencies.concat(utilJS),
    }),
  );

  phony({ out: "integration", in: integrationTests });
}

writeFileSync("build.ninja", ninja.output);
