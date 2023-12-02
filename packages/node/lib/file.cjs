const { openSync, writeFileSync } = require("node:fs");
const { resolve, relative, isAbsolute, dirname } = require("node:path");

let handle;
const dir = resolve();

function open(outFile) {
  handle = openSync(outFile + ".depfile", "w");
  writeFileSync(handle, outFile + ":");
}

function logDependency(dependency) {
  const path = relative(dir, dependency);
  const dep = ((path && !path.startsWith("..") && !isAbsolute(path)) ? path : dependency).replaceAll("\\", "/");
  writeFileSync(handle, " " + dep);
}

module.exports = {
  open,
  logDependency,
};
