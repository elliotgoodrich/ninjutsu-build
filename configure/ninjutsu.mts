import {
  type Input,
  NinjaBuilder,
  getInput,
  getInputs,
  needs,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import {
  getEntryPointsFromConfig,
  makeTSCRule,
  makeTypeCheckRule,
} from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import { makeSWCRule } from "@ninjutsu-build/swc";
import { makeCheckFormattedRule, makeLintRule } from "@ninjutsu-build/biome";
import { basename, extname, join, relative } from "node:path/posix";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function makeTarRule(ninja: NinjaBuilder) {
  // Intentionally avoid using `$in` as it must be the full path of the files
  // we want to add in order for ninja to set up the dependencies correctly, but
  // most of the time we would like to `tar` from a subdirectory.  So we keep
  // `$in` to help ninja, but we -C into our directory and strip the prefix
  // from `$in` and save as the `$files` variable.
  const tar = ninja.rule("tar", {
    command: "tar -czf $out $args $files",
    description: "Creating archive $out",
    out: needs<string>(),
    in: needs<readonly Input<string>[]>(),
    args: "",
    files: needs<string>(),
  });
  return (a: Omit<Parameters<typeof tar>[0], "files"> & { dir?: string }) => {
    const { dir, ...rest } = a;
    return tar({
      ...rest,
      files:
        dir === undefined
          ? getInputs(a.in).join(" ")
          : getInputs(a.in)
              .map((i: string) => relative(dir, i))
              .join(" "),
      args: a.dir === undefined ? undefined : "-C " + a.dir,
    });
  };
}

function makeCopyRule(ninja: NinjaBuilder) {
  return ninja.rule("copy", {
    command: "cp $in $out",
    description: "Copying $in to $out",
    out: needs<string>(),
    in: needs<Input<string>>(),
  });
}

function makeTranspileRule(ninja: NinjaBuilder) {
  const swc = makeSWCRule(ninja);
  return (a: { in: Input<string>; outDir: string }) => {
    const input = getInput(a.in);
    const ext = extname(input);
    const jsExt: Record<string, string> = {
      ".ts": ".js",
      ".mts": ".mjs",
      ".cts": ".cjs",
    };
    const type = ext === ".mts" ? "es6" : "commonjs";
    return swc({
      in: a.in,
      out: join(a.outDir, basename(input, ext) + jsExt[ext]),
      args: [
        "-C",
        `module.type=${type}`,
        "-C",
        "jsc.target=es2018",
        "-C",
        "jsc.parser.syntax=typescript",
        "-C",
        "module.importInterop=node",
      ],
    });
  };
}

function formatAndLint(file: string) {
  const formatted = checkFormatted({ in: file });
  return lint({ in: formatted });
}

const ninja = new NinjaBuilder({
  builddir: ".builddir",
  ninja_required_version: "1.11", // validations were added in 1.11
});

const workspacePkg = "package.json";
const workspaceJSON = JSON.parse(readFileSync(workspacePkg, "utf-8"));

ninja.output += "\n";
ninja.comment("Rules");

const { phony } = ninja;
const biomeConfig = "biome.json";
const checkFormatted = makeCheckFormattedRule(ninja, {
  configPath: biomeConfig,
});

const tsc = makeTSCRule(ninja);
const typecheck = makeTypeCheckRule(ninja);
const test = makeNodeTestRule(ninja);
const tar = makeTarRule(ninja);
const copy = makeCopyRule(ninja);
const lint = makeLintRule(ninja, { configPath: biomeConfig });
const transpile = makeTranspileRule(ninja);

const baseConfig = checkFormatted({ in: "tsconfig.json" });
const configTSConfig = checkFormatted({ in: "configure/tsconfig.json" });
const configureTypecheckedStamp = join(
  ".builddir",
  "configure",
  "typechecked.stamp",
);
await typecheck({
  tsConfig: configTSConfig,
  out: configureTypecheckedStamp,
  [orderOnlyDeps]: baseConfig,
});
checkFormatted({
  in: "configure/ninjutsu.mts",
  [validations]: () => configureTypecheckedStamp,
});

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
  const dependenciesRunnable = localDependecies.map((d) => `${d}/runnable`);

  // Assume there is a target "@ninjutsu-build/foo/typed" when the `foo`
  // package has all type declarations
  const dependenciesTyped = localDependecies.map((d) => `${d}/typed`);

  ninja.output += "\n";
  ninja.comment(cwd);

  // Check if package.json is formatted correctly
  const packageJSON = checkFormatted({ in: join(cwd, "package.json") });

  // Grab all TypeScript source files and check if they are formatted correctly
  const tsconfig = checkFormatted({ in: join(cwd, "tsconfig.json") });
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
    const testTSConfig = checkFormatted({
      in: join(cwd, "tsconfig.tests.json"),
    });
    const tests = await getEntryPointsFromConfig(ninja, testTSConfig);

    if (tests.length === 0) {
      return [];
    }

    tests.forEach(formatAndLint);

    return (
      await typecheck({
        tsConfig: testTSConfig,
        out: join(cwd, "dist", "typechecked.stamp"),
        [orderOnlyDeps]: [packageHasTypes, baseConfig],
      })
    ).map((t) => {
      const js = transpile({
        in: t,
        outDir,
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
    const stageForTar = (args: { in: Input<string> }) => {
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
    toPack = toPack.concat(
      typeDeclarations.map((file) => stageForTar({ in: file })),
    );

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
