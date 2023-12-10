import { execSync } from "node:child_process";
import { argv, exit } from "node:process";
import { writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";

const out = argv[2];
const i = argv.indexOf("--", 3);
const args = argv.slice(3, i);
const files = argv.slice(i + 1);

try {
  const result = execSync(
    `npx tsc ${files.join(" ")} --listFiles --noEmit ${args.join(" ")}`,
  );
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

  writeFileSync(`${out}.depfile`, deps);
  writeFileSync(out, "");
} catch (e) {
  console.log(`${e}`);
  exit(1);
}
