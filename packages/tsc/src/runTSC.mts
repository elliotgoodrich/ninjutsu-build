import { execSync } from "node:child_process";
import { argv, exit } from "node:process";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve, join } from "node:path";

function parseArgs(args: readonly string[]): {
  depfile?: string;
  out?: string;
  touch?: string;
  cwd?: string;
  tsArgs: readonly string[];
  input: readonly string[];
} {
  let depfile: string | undefined = undefined;
  let touch: string | undefined = undefined;
  let out: string | undefined = undefined;
  let cwd: string | undefined = undefined;
  let input: string[] = [];
  let tsArgs: string[] = [];
  for (let i = 2; i < argv.length; ++i) {
    switch (argv[i]) {
      case "--depfile":
        if (++i < argv.length) {
          depfile = argv[i];
        }
        break;
      case "--out":
        if (++i < argv.length) {
          out = argv[i];
        }
        break;
      case "--touch":
        if (++i < argv.length) {
          touch = argv[i];
        }
        break;
      case "--cwd":
        if (++i < argv.length) {
          cwd = argv[i];
        }
        break;
      default: {
        const splitIndex = args.indexOf("--", i);
        if (splitIndex === -1) {
          throw new Error("'--' must come after flags but before input files");
        }
        tsArgs = args.slice(i, splitIndex);
        input = args.slice(splitIndex + 1);
        i = argv.length;
      }
    }
  }
  if ((depfile === undefined) != (out === undefined)) {
    throw new Error(
      "Either both --depfile and --out are specified, or neither are!",
    );
  }
  return { depfile, out, touch, cwd, tsArgs, input };
}

try {
  const { depfile, touch, out, cwd, tsArgs, input } = parseArgs(argv);
  if (depfile !== undefined) {
    const tsc = execSync("npx which tsc", { cwd }).toString().trim();
    const files =
      cwd !== undefined
        ? input.map((i) => relative(cwd, i).replaceAll("\\", "/"))
        : input;
    const result = execSync(`${tsc} ${tsArgs.join(" ")} ${files.join(" ")}`, {
      cwd,
    });
    const lines = result.toString().split("\n");

    const scriptCwd = resolve();
    let deps = out + ":";
    const makeRelative = (path: string) => {
      if (isAbsolute(path)) {
        // Absolute paths are most likely references to things inside `node_modules`,
        // but could be absolute paths given by the user to something else.  If the
        // path is within the current working directory, replace with the relative
        // path, otherwise keep it as absolute.
        const relativeAttempt = relative(scriptCwd, path);
        return relativeAttempt &&
          !relativeAttempt.startsWith("..") &&
          !isAbsolute(relativeAttempt)
          ? relativeAttempt
          : path;
      } else {
        // Relative paths at this point are within the project, they need to be
        // adjusted to add back the `cwd` prefix that we removed on the inputs
        return join(cwd ?? "", path);
      }
    };
    for (const line of lines) {
      deps += " " + makeRelative(line).replaceAll("\\", "/").trim();
    }

    writeFileSync(depfile, deps);
  }

  if (touch !== undefined) {
    writeFileSync(touch, "");
  }
} catch (e) {
  console.log(`${e}`);
  exit(1);
}
