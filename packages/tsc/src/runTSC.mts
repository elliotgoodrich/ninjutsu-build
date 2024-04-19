import { exec } from "node:child_process";
import { argv } from "node:process";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative } from "node:path";
import { promisify } from "node:util";

function parseArgs(args: readonly string[]): {
  tsc: string;
  depfile?: string;
  out?: string;
  touch?: string;
  tsArgs: readonly string[];
  input: readonly string[];
} {
  let tsc: string | undefined = undefined;
  let depfile: string | undefined = undefined;
  let touch: string | undefined = undefined;
  let out: string | undefined = undefined;
  let input: string[] = [];
  let tsArgs: string[] = [];
  for (let i = 2; i < argv.length; ++i) {
    switch (argv[i]) {
      case "--tsc":
        if (++i < argv.length) {
          tsc = argv[i];
        }
        break;
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
  if (tsc === undefined) {
    throw new Error("--tsc must be specified");
  }
  if ((depfile === undefined) !== (out === undefined)) {
    throw new Error(
      "Either both --depfile and --out are specified, or neither are!",
    );
  }
  return { tsc, depfile, out, touch, tsArgs, input };
}

async function run(): Promise<void> {
  try {
    const { tsc, depfile, touch, out, tsArgs, input } = parseArgs(argv);
    if (depfile !== undefined) {
      const { stdout } = await promisify(exec)(
        `node ${tsc} ${tsArgs.concat(input).join(" ")}`,
      );
      const lines = stdout.split("\n");
      let deps = out + ":";
      const cwd = process.cwd();
      const makeRelative = (path: string) => {
        if (!isAbsolute(path)) {
          return path;
        }

        // Absolute paths are most likely references to things inside `node_modules`,
        // but could be absolute paths given by the user to something else.  If the
        // path is within the current working directory, replace with the relative
        // path, otherwise keep it as absolute.
        const relativeAttempt = relative(cwd, path);
        return relativeAttempt &&
          !relativeAttempt.startsWith("..") &&
          !isAbsolute(relativeAttempt)
          ? relativeAttempt
          : path;
      };
      for (const line of lines) {
        if (line !== "") {
          deps += " " + makeRelative(line).replaceAll("\\", "/").trim();
        }
      }

      writeFileSync(depfile, deps);
    }

    if (touch !== undefined) {
      writeFileSync(touch, "");
    }
  } catch (e: unknown) {
    process.exitCode = 1;
    const error = e as { stdout: string };
    const lines = error.stdout.split("\n");
    // Print only error lines, attempting to filtering everything that is emitted
    // using `--listFiles`
    console.log(
      lines.filter((line) => line.includes("): error TS")).join("\n"),
    );
  }
}

await run();
