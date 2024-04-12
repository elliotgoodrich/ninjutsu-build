import { execSync } from "node:child_process";

export function getDeps(cwd) {
  const deps = {};
  let name = "";
  for (const line of execSync("ninja -t deps", { cwd })
    .toString()
    .split("\n")
    .map((s) => s.trimEnd())) {
    if (line.length === 0) {
      continue;
    }

    if (line[0] === " ") {
      deps[name].push(line.trimStart());
    } else {
      name = line.split(":")[0];
      deps[name] = [];
    }
  }

  return deps;
}
