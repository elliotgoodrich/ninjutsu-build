import {
  NinjaBuilder,
  getInput,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import {
  getEntryPointsFromConfig,
  makeTSCRule,
  makeTypeCheckRule,
} from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import {
  makeCheckFormattedRule,
  makeFormatRule,
  makeLintRule,
} from "@ninjutsu-build/biome";
import { basename, dirname, extname, join, relative } from "node:path/posix";
import {
  resolve as resolveNative,
  relative as relativeNative,
} from "node:path";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { platform } from "os";
import isCi from "is-ci";

if (isCi) {
  console.log("Running in CI mode");
}

// Create a rule to run `npm ci` in a particular directory
function makeNpmCiRule(ninja) {
  const prefix = platform() === "win32" ? "cmd /c " : "";
  const npmci = ninja.rule("npmci", {
    command: prefix + "npm ci $args --silent",
    description: "npm ci $args",
    generator: 1,
  });
  return (a) => {
    const { args = "", ...rest } = a;
    const cwd = dirname(getInput(a.in));
    const withCwd = cwd !== "." ? ` --prefix ${cwd}` : "";
    return npmci({
      ...a,
      out: join(cwd, "node_modules", ".package-lock.json"),
      args: withCwd + args,
      ...rest,
    });
  };
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

// Given a path to a JS file, return the filename of the
// resulting TS file
function getTSFileName(jspath) {
  const ext = extname(jspath);
  const extLookup = {
    ".ts": ".js",
    ".mts": ".mjs",
    ".cts": ".cjs",
  };

  return basename(jspath, ext) + extLookup[ext];
}

// Create a rule to run `swc`, which we used to transpile TypeScript
function makeSWCRule(ninja) {
  const swcPath = relativeNative(
    resolveNative(process.cwd(), ninja.outputDir),
    fileURLToPath(import.meta.resolve("@swc/cli")),
  );
  const node = platform() === "win32" ? "node.exe" : "node";
  const swc = ninja.rule("swc", {
    command: `${node} ${swcPath} $in -o $out -q $args`,
    description: "Transpiling $in",
  });
  return (a) => {
    const { outDir, ...rest } = a;
    const input = getInput(a.in);
    const type = extname(input) === ".mts" ? "es6" : "commonjs";
    return swc({
      out: join(outDir, getTSFileName(getInput(a.in))),
      ...rest,
      args: `-C jsc.target=es2018 -C module.type=${type} -C jsc.parser.syntax=typescript -C module.importInterop=node`,
    });
  };
}

function formatAndLint(file) {
  const formatted = format({ in: file });
  return lint({ in: formatted });
}

const ninja = new NinjaBuilder({
  builddir: ".builddir",
  ninja_required_version: "1.11", // validations were added in 1.11
});

const workspacePkg = "package.json";
const workspaceJSON = JSON.parse(readFileSync(workspacePkg));

ninja.output += "\n";
ninja.comment("Rules + Installation");
const npmci = makeNpmCiRule(ninja);

const { phony } = ninja;
const packagesLinked = npmci({ in: workspacePkg, args: "--workspaces" });

const biomeConfig = "configure/biome.json";

// We would like to check whether `package.json` is formatted correctly.
// Most of the rules inject a build-order dependency on `npm ci` having
// run correctly, but we also need a validation dependency from running
// `npm ci` so we have a cycle (in JS only, ninja is happy with a cycle
// containing a validations edge).  This means it's a bit convoluted to
// create the `checkFormatted` rule but that what the code below does.
let checkFormatted;

const toolsInstalled = npmci({
  in: "configure/package.json",
  [validations]: (toolsInstalled) => {
    checkFormatted = makeCheckFormattedRule(ninja, {
      configPath: biomeConfig,
      [orderOnlyDeps]: toolsInstalled,
    });
    // Add a validation that `package.json` is formatted correctly.
    // If we formatted after running `npmci` it would cause us to run it again
    return checkFormatted({ in: "configure/package.json" })[validations];
  },
});

const tsc = makeTSCRule(ninja, { [orderOnlyDeps]: toolsInstalled });
const typecheck = makeTypeCheckRule(ninja, {
  [orderOnlyDeps]: toolsInstalled,
});
const test = makeNodeTestRule(ninja);
const tar = makeTarRule(ninja);
const format = isCi
  ? checkFormatted
  : makeFormatRule(ninja, {
      configPath: biomeConfig,
      [orderOnlyDeps]: toolsInstalled,
    });
const copy = makeCopyRule(ninja);
const lint = makeLintRule(ninja, {
  configPath: biomeConfig,
  [orderOnlyDeps]: toolsInstalled,
});
const transpile = makeSWCRule(ninja, {
  [orderOnlyDeps]: toolsInstalled,
});

format({ in: "configure/configure.mjs" });
const baseConfig = format({ in: "tsconfig.json" });

// Create a list of all targets that need to be ready before we
// can run `typedoc`.
const docsDependencies = [];

// Go through all of the packages in our workspaces to lint, format,
// typecheck, transpile, and run tests, making sure that we have set
// up the correct intra-package dependencies
const scope = "@ninjutsu-build/";
for (const cwd of workspaceJSON.workspaces) {
  const localPKGJSON = JSON.parse(
    readFileSync(join(cwd, "package.json")).toString(),
  );

  // Build up our dependencies that come from npm or locally linking
  const localDependecies = Object.keys({
    ...localPKGJSON.dependencies,
    ...localPKGJSON.devDependencies,
    ...localPKGJSON.peerDependencies,
  }).filter((d) => d.startsWith(scope));

  // Assume there is a target "@ninjutsu-build/foo/runnable" when the
  // `foo` package can be executed.
  const dependenciesRunnable = [packagesLinked].concat(
    localDependecies.map((d) => `${d}/runnable`),
  );

  // Assume there is a target "@ninjutsu-build/foo/typed" when the `foo`
  // package has all type declarations
  const dependenciesTyped = [packagesLinked].concat(
    localDependecies.map((d) => `${d}/typed`),
  );

  ninja.output += "\n";
  ninja.comment(cwd);

  // Format package.json
  const packageJSON = format({ in: join(cwd, "package.json") });

  // Grab all TypeScript source files and format them
  const tsconfig = format({ in: join(cwd, "tsconfig.json") });
  const sources = (await getEntryPointsFromConfig(ninja, tsconfig)).map(
    formatAndLint,
  );

  const outDir = join(cwd, "dist");

  // Transpile the TypeScript into JavaScript, do this separately from `tsc`
  // as `swc` is much faster and this allows us to start executing unit tests
  // in parallel to typechecking and type declaration generation
  const javascript = sources.map((s) =>
    transpile({
      in: s,
      outDir,
    }),
  );

  // Create a phony target for when the package has all its JavaScript built
  // and it is ready to be executed.  This will be used by depenendent
  // packages to rely on before they can invoke their unit tests.
  const packageRunnable = phony({
    out: `${localPKGJSON.name}/runnable`,
    in: [packageJSON, ...javascript, ...dependenciesRunnable],
  });

  // Create the TypeScript type declaration files and do typechecking.
  const typeDeclarations = await tsc({
    tsConfig: tsconfig,
    compilerOptions: {
      declaration: true,
      emitDeclarationOnly: true,
      outDir,
    },
    [orderOnlyDeps]: [...dependenciesTyped, baseConfig],
  });

  // Create a phony target for when the package has its types generated and
  // it can be used from other packages wanting to generate types or type
  // check their own code.
  const packageHasTypes = phony({
    out: `${localPKGJSON.name}/typed`,
    in: [packageJSON, ...typeDeclarations],
  });

  docsDependencies.push(packageHasTypes);

  // Format, lint, typecheck, tranpile, and run any unit tests
  const testTargets = await (async () => {
    if (!existsSync(join(cwd, "tsconfig.tests.json"))) {
      return [];
    }
    const testTSConfig = format({ in: join(cwd, "tsconfig.tests.json") });
    const tests = await getEntryPointsFromConfig(ninja, testTSConfig);

    if (tests.length === 0) {
      return [];
    }

    const testsFormatted = tests.map(formatAndLint);

    return (
      await typecheck({
        tsConfig: testTSConfig,
        out: join(cwd, "dist", "typechecked.stamp"),
        [orderOnlyDeps]: [packageHasTypes, baseConfig, ...testsFormatted],
      })
    ).map((t) => {
      const js = transpile({
        in: t,
        outDir,
        [orderOnlyDeps]: testsFormatted,
      });
      return test({
        in: js,
        out: join("$builddir", cwd, `${js}.result.txt`),
        [orderOnlyDeps]: packageRunnable,
      });
    });
  })();

  // Tar and gzip our entire package so it can be published to npm
  const createTar = (() => {
    // We assume packages are published if and only if they have a version number.
    // This allows us to avoid creating an archive for the `integration` package.
    if (localPKGJSON.version === undefined) {
      return [];
    }
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
    toPack = toPack.concat(javascript.map((file) => stageForTar({ in: file })));

    return [
      tar({
        out: `$builddir/${localPKGJSON.name}.tgz`,
        in: toPack,
        dir: "$builddir/packages",
      }),
    ];
  })();

  // Create a alias for building and testing the whole package
  phony({
    out: localPKGJSON.name,
    in: [packageHasTypes, packageRunnable, ...createTar, ...testTargets],
  });
}

// Create a target that can be used for anyone wanting to prep the
// project to do the bare minimum in order to generate documentation
phony({ out: "prep-for-docs", in: docsDependencies });

// Finally, write the resulting file to disk
writeFileSync("build.ninja", ninja.output);
