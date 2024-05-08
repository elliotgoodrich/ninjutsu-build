import { openSync, writeFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

let fd: number;
let cwd: string;

export function open(out: string): void {
  cwd = resolve();
  fd = openSync(out + ".depfile", "w");
  writeFileSync(fd, out + ":");
}

export function addDependency(path: string): void {
  const relPath = relative(cwd, path);
  const dependency = (
    relPath && !relPath.startsWith("..") && !isAbsolute(relPath)
      ? relPath
      : path
  ).replaceAll("\\", "/");
  writeFileSync(fd, " " + dependency);
}
