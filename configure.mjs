import {
  NinjaBuilder,
  implicitDeps,
  orderOnlyDeps,
  validations,
} from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { makeNodeTestRule } from "@ninjutsu-build/node";
import { makeFormatRule, makeLintRule } from "@ninjutsu-build/biome";
import { dirname, relative, join } from "node:path/posix";
import { readFileSync, writeFileSync } from "node:fs";
import { globSync } from "glob";
import { platform } from "os";
import toposort from "toposort";

const touch = platform() == "win32" ? "type NUL > $out" : "touch $out";
const prefix = platform() === "win32" ? "cmd /c " : "";

function makeNpmCiRule(ninja) {
  const ci = ninja.rule("npmci", {
    command: prefix + "npm ci --prefix $cwd --silent",
    description: "npm ci ($cwd)",
  });
  return (a) => {
    const cwd = dirname(a.in);
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
    const cwd = dirname(a.in);
    const pkgs = a.pkgs;
    const deps = a[implicitDeps] ?? [];
    return ci({
      ...a,
      out: `$builddir/.ninjutsu-build/npmlink/${a.in}`,
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

// This creates a rule that runs prettier on `in` and overwrites the file,
// while creating an empty `out` file to timestamp when it was run.
// In order to chain this up with other rules, we need to make sure that
// the stamp file is added to the orderOnlyDeps.  Return the object
// `{ file: in, [orderOnlyDeps]: out }` that is designed to be passed to a rule
// wrapped with `afterFormat`.
function makePrettierRule(ninja) {
  const prettier = ninja.rule("prettier", {
    command:
      prefix +
      "npm exec --offline --prefix $cwd prettier -- $in --write --log-level silent && " +
      touch,
    description: "Formatting $in",
  });
  return (a) => {
    const { [validations]: _validations = () => {}, ...rest } = a;
    const result = {
      file: a.in,
      [orderOnlyDeps]: "$builddir/.ninjutsu-build/prettier/" + a.in,
    };
    prettier({
      ...rest,
      out: result[orderOnlyDeps],
      [validations]: (out) => _validations(result),
    });
    return result;
  };
}

// Wrap the `rule` so that it accepts `{ file: string, [orderOnlyDeps]: string }` (or an array)
// containing those objects, forwarding on `file` to `in`, and combining the `[orderOnlyDeps]`.
function afterFormat(rule) {
  return (a) => {
    const { in: _in, [orderOnlyDeps]: _orderOnlyDeps = [], ...rest } = a;
    return rule({
      in: Array.isArray(_in) ? _in.map(({ file }) => file) : _in.file,
      [orderOnlyDeps]: _orderOnlyDeps.concat(
        Array.isArray(_in)
          ? _in.map(({ [orderOnlyDeps]: deps }) => deps)
          : _in[orderOnlyDeps],
      ),
      ...rest,
    });
  };
}

function makeCopyRule(ninja) {
  return ninja.rule("copy", {
    command: "cp $in $out",
    description: "Copying $in to $out",
  });
}

function formatAndLint(cwd, file, deps) {
  return format({
    in: file,
    cwd,
    [validations]: (out) => afterFormat(lint)({ in: out, cwd }),
    [orderOnlyDeps]: deps[orderOnlyDeps],
  });
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
const test = makeNodeTestRule(ninja);
const tar = makeTarRule(ninja);
const prettier = inject(makePrettierRule(ninja), {
  [orderOnlyDeps]: toolsInstalled,
});
const format = addBiomeConfig(
  inject(makeFormatRule(ninja), {
    [orderOnlyDeps]: toolsInstalled,
  }),
  "./biome.json",
);
const lint = addBiomeConfig(
  inject(makeLintRule(ninja), {
    [orderOnlyDeps]: toolsInstalled,
  }),
  "./biome.json",
);
const copy = makeCopyRule(ninja);

// TODO: Add a validation that `package.json` is formatted correctly.
// We need to format after running `npmci` but then formatting the
// file will cause us to rerun `npmci` again

format({ in: "configure.mjs", cwd: "." });

// Return an array of all tgz files for our packages
const tars = (() => {
  const scope = "@ninjutsu-build/";
  const graph = {};
  return toposort(
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
      // Go through all of the packages
      ninja.output += "\n";

      const cwd = join("packages", packageName);
      ninja.comment(cwd);

      // Run prettier over package.json
      const packageJSON = prettier({ in: join(cwd, "package.json"), cwd });

      // Run `npm ci`
      const dependenciesInstalled = afterFormat(ci)({
        in: packageJSON,
      });

      // If `packageJSON` is changed (and only after we have run `npm ci`)
      // install our packages locally
      const pkgs = graph[packageName].map((name) => packages[name]);
      const linked =
        pkgs.length > 0
          ? afterFormat(link)({
              in: packageJSON,
              pkgs,
              [orderOnlyDeps]: [dependenciesInstalled],
            })
          : dependenciesInstalled;

      // Run prettier over `file` and then run `lint` as a validation step with a
      // order-only dependency on prettier finishing for that file. Make sure that
      // we start only after lint/biome have been installed.
      const format = (file) =>
        formatAndLint(cwd, file, {
          [orderOnlyDeps]: [dependenciesInstalled],
        });

      // Grab all TypeScript source files and run prettier over them
      const ts = globSync(join(cwd, "src", "*.*"), { posix: true }).map(format);

      // In the `lib` directory we have JavaScript files and TS declaration files
      const lib = globSync(join(cwd, "lib", "*.*"), {
        posix: true,
      }).map(format);

      // Transpile the TypeScript into JavaScript once prettier has finished
      const dist = afterFormat(tsc)({
        in: ts,
        compilerOptions,
        cwd,
        // We must use `implicitDeps` instead of `orderOnlyDeps` as the `npmci` and
        // `npmlink` rules do not yet use `dyndeps` to describe what files they
        // creates in `node_modules`
        [implicitDeps]: [linked],
      });

      // Prepare our files to create a tgz of our package, include
      //   - README.md
      //   - package.json
      //   - contents of `lib`
      //   - contents of `dist`
      const stageForTar = (args) => {
        const { in: _in, ...rest } = args;
        return copy({
          in: _in,
          out: `$builddir/${packageName}/${relative(cwd, _in)}`,
          ...rest,
        });
      };
      let toPack = [];
      toPack.push(stageForTar({ in: join(cwd, "README.md") }));
      toPack.push(afterFormat(stageForTar)({ in: packageJSON }));
      toPack = toPack.concat(dist.map((file) => stageForTar({ in: file })));
      toPack = toPack.concat(
        lib.map((file) => afterFormat(stageForTar)({ in: file })),
      );

      return Object.assign({}, packages, {
        [packageName]: tar({
          out: `$builddir/ninjutsu-build-${packageName}.tgz`,
          in: toPack,
          dir: "$builddir",
        }),
      });
    }, {});
})();

ninja.output += "\n";
ninja.comment("Tests");

{
  const cwd = "tests";

  // Run prettier over tests/package.json
  const packageJSON = prettier({
    in: cwd + "/package.json",
    cwd,
  });

  // Run `npm ci`
  const dependenciesInstalled = afterFormat(ci)({
    in: packageJSON,
  });

  const linked = afterFormat(link)({
    in: packageJSON,
    pkgs: Object.values(tars),
    [orderOnlyDeps]: [dependenciesInstalled],
  });

  // Grab all TypeScript source files and run prettier over them
  const tests = globSync("tests/src/*.*", { posix: true }).map((file) =>
    formatAndLint(cwd, file, { [orderOnlyDeps]: [dependenciesInstalled] }),
  );

  // Transpile the TypeScript into JavaScript once prettier has finished, do this
  // separately for each file because if we do it together and one file changes,
  // `tsc` will regenerate the output for all of them and cause us to have to
  // rerun all of the tests. Use a pool with a single depth to avoid running `tsc`
  // in parallel on the same project.
  const pool = ninja.pool("compiletests", { depth: 1 });
  tests.forEach((t) => {
    const [js] = afterFormat(tsc)({
      in: [t],
      compilerOptions: { ...compilerOptions, declaration: false },
      cwd,
      pool,
      // We must use `implicitDeps` instead of `orderOnlyDeps` as the `npmci` rule does
      // not yet use `dyndeps` to describe what files it creates in `node_modules`. When
      // we do generate this we can use `orderOnlyDeps` instead.
      // Also we can change this to only TypeScript declaration files.
      [implicitDeps]: [linked],
    });
    test({
      in: js,
      out: `${js}.result.txt`,
    });
  });
}

writeFileSync("build.ninja", ninja.output);
