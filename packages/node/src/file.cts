import { openSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

let handle: number | undefined;
const dir = resolve();

export function open(outFile: string): void {
  handle = openSync(outFile + ".depfile", "w");
  writeFileSync(handle, outFile + ":");
}

export function logDependency(dependency: string): void {
  if (handle === undefined) {
    // In this case we are most likely `require`ing ourselves before we've called
    // `open`. TODO: Fix the ordering in the future.
    return;
  }
  const path = relative(dir, dependency);
  const dep = (
    path && !path.startsWith("..") && !isAbsolute(path) ? path : dependency
  ).replaceAll("\\", "/");
  writeFileSync(handle, " " + dep);
}
