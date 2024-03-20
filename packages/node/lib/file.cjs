const { openSync, writeFileSync } = require("node:fs");
const { resolve, relative, isAbsolute } = require("node:path");

let handle;
const dir = resolve();

function open(outFile) {
  handle = openSync(outFile + ".depfile", "w");
  writeFileSync(handle, outFile + ":");
}

function logDependency(dependency) {
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

module.exports = {
  open,
  logDependency,
};
