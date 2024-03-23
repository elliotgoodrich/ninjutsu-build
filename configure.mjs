import {
  NinjaBuilder,
  getInput,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import { makeTSCRule, makeTypeCheckRule } from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import { makeFormatRule, makeLintRule } from "@ninjutsu-build/biome";
import { makeTranspileRule } from "@ninjutsu-build/bun";
import { basename, dirname, extname, relative, join } from "node:path/posix";
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "glob";
import { platform } from "os";
import toposort from "toposort";

const touch = platform() == "win32" ? "type NUL > $out" : "touch $out";
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

function makeNpmLinkRule(ninja) {
  const ci = ninja.rule("npmlink", {
    command:
      prefix + "npm install --prefix $cwd --silent --no-save $pkgs && " + touch,
    description: "npm link $pkgs ($cwd)",
  });
  return (a) => {
    const input = getInput(a.in);
    const cwd = dirname(input);
    const pkgs = a.pkgs;
    const deps = a[implicitDeps] ?? [];
    return ci({
      ...a,
      out: `$builddir/.ninjutsu-build/npmlink/${input}`,
      pkgs: pkgs.join(" "),
      cwd,
      [implicitDeps]: deps.concat(pkgs),
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

function makeSWCRule(ninja) {
  return ninja.rule("swc", {
    command: prefix + "npx swc $in -o $out -q $args",
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

function addBiomeConfig(rule, configPath) {
  return (a) => {
    return rule({
      ...a,
      configPath,
    });
  };
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
ninja.comment("Rules + Installation");
const ci = makeNpmCiRule(ninja);
const toolsInstalled = ci({ in: "package.json" });

const link = makeNpmLinkRule(ninja);
const tsc = inject(makeTSCRule(ninja), { [orderOnlyDeps]: toolsInstalled });
const typecheck = inject(makeTypeCheckRule(ninja), {
  [orderOnlyDeps]: toolsInstalled,
});
const test = makeNodeTestRule(ninja);
const tar = makeTarRule(ninja);
const format = addBiomeConfig(
  inject(makeFormatRule(ninja), {
    [orderOnlyDeps]: toolsInstalled,
  }),
  "biome.json",
);
const lint = addBiomeConfig(
  inject(makeLintRule(ninja), {
    [orderOnlyDeps]: toolsInstalled,
  }),
  "biome.json",
);
const copy = makeCopyRule(ninja);
const transpile = useBun
  ? makeTranspileRule(ninja)
  : inject(makeSWCRule(ninja), { [orderOnlyDeps]: toolsInstalled });
const transpileArgs = useBun
  ? "--target=node --no-bundle"
  : "-C jsc.target=es2018";

const { phony } = ninja;

// TODO: Add a validation that `package.json` is formatted correctly.
// We need to format after running `npmci` but then formatting the
// file will cause us to rerun `npmci` again

format({ in: "configure.mjs", cwd: "." });

const scope = "@ninjutsu-build/";
const graph = {};
toposort(
  globSync("*", { posix: true, cwd: "packages" }).flatMap((packageName) => {
    const packageJSON = JSON.parse(
      readFileSync(join("packages", packageName, "package.json")).toString(),
    );
    const deps = {
      ...packageJSON.dependencies,
      ...packageJSON.devDependencies,
      ...packageJSON.peerDependencies,
    };
    graph[packageName] = Object.keys(deps)
      .filter((dep) => dep.startsWith(scope))
      .map((dep) => dep.substring(scope.length));
    return graph[packageName].map((dep) => [packageName, dep]);
  }),
)
  .reverse()
  .reduce((packages, packageName) => {
    // Collect all the generated JavaScript tgz packages
    ninja.output += "\n";

    const cwd = join("packages", packageName);
    ninja.comment(cwd);

    // Format package.json
    const packageJSON = format({ in: join(cwd, "package.json") });

    // Run `npm ci`
    const dependenciesInstalled = ci({ in: packageJSON });

    // If `packageJSON` is changed (and only after we have run `npm ci`)
    // install our packages locally
    const pkgs = graph[packageName].map((name) => packages[name]);
    const linked =
      pkgs.length > 0
        ? link({
            in: packageJSON,
            pkgs,
            [orderOnlyDeps]: [dependenciesInstalled],
          })
        : dependenciesInstalled;

    // Grab all TypeScript source files and format them
    const ts = globSync(join(cwd, "src", "*.ts"), {
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
      compilerOptions: { ...compilerOptions, rootDir: "src" },
      cwd,
      // We must use `implicitDeps` instead of `orderOnlyDeps` as the `npmci` and
      // `npmlink` rules do not yet use `dyndeps` to describe what files they
      // creates in `node_modules`
      [implicitDeps]: [linked],
    });

    // Grab all TypeScript tests files and format them
    const tests = globSync(join(cwd, "src", "*.test.ts"), {
      posix: true,
    }).map(formatAndLint);

    // Type check all the tests
    const testTargets = (() => {
      if (tests.length !== 0) {
        const typechecked = typecheck({
          in: tests,
          out: join(cwd, "dist", "typechecked.stamp"),
          compilerOptions,
          cwd,
          [implicitDeps]: [linked],
          // Only run this after generating all the TypeScript definition files for the
          // library files.
          [orderOnlyDeps]: dist,
        });

        // Individually transpile and run each test
        return tests.map((t) => {
          const file = getInput(t);
          const js = transpile({
            in: t,
            out: join(cwd, "dist", basename(file, extname(file)) + ".mjs"),
            [validations]: () => typechecked,
            args: transpileArgs,
          });
          return test({
            in: js,
            out: join("$builddir", packageName, `${js}.result.txt`),
            [implicitDeps]: [linked],
            // Only run this after transpiling the library from TS to JS
            [orderOnlyDeps]: dist,
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
        out: `$builddir/${packageName}/${relative(cwd, getInput(_in))}`,
        ...rest,
      });
    };
    let toPack = [];
    toPack.push(stageForTar({ in: join(cwd, "README.md") }));
    toPack.push(stageForTar({ in: packageJSON }));
    toPack = toPack.concat(dist.map((file) => stageForTar({ in: file })));
    toPack = toPack.concat(lib.map((file) => stageForTar({ in: file })));

    const createTar = tar({
      out: `$builddir/ninjutsu-build-${packageName}.tgz`,
      in: toPack,
      dir: "$builddir",
    });
    phony({ out: packageName, in: [createTar, ...testTargets] });
    return Object.assign({}, packages, {
      [packageName]: createTar,
    });
  }, {});

writeFileSync("build.ninja", ninja.output);
