import { execSync } from "node:child_process";
import { argv, exit } from "node:process";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

function parseArgs(args: readonly string[]): {
  depfile?: string;
  out?: string;
  touch?: string;
  tsArgs: readonly string[];
} {
  let depfile: string | undefined = undefined;
  let touch: string | undefined = undefined;
  let out: string | undefined = undefined;
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
      default:
        tsArgs = args.slice(i);
        i = argv.length;
    }
  }
  if ((depfile === undefined) != (out === undefined)) {
    throw new Error(
      "Either both --depfile and --out are specified, or neither are!",
    );
  }
  return { depfile, out, touch, tsArgs };
}

try {
  const { depfile, touch, out, tsArgs } = parseArgs(argv);

  if (depfile !== undefined) {
    const result = execSync("npx tsc " + tsArgs.join(" "));
    const lines = result.toString().split("\n");

    const cwd = resolve();
    let deps = out + ":";
    for (const line of lines) {
      const path = relative(cwd, line);
      deps +=
        " " +
        (path && !path.startsWith("..") && !isAbsolute(path) ? path : line)
          .replaceAll("\\", "/")
          .trim();
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
