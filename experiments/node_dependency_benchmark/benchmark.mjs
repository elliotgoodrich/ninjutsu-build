import {
  openSync,
  writeFileSync,
  readFileSync,
  write,
  closeSync,
  unlinkSync,
} from "node:fs";
import { promisify } from "node:util";
import { resolve, relative, isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const asyncWrite = promisify(write);

const typeIndex = process.argv.indexOf("--type");
const type = process.argv[typeIndex + 1];
if (!["sync", "onExit", "onBeforeExit"].includes(type ?? "")) {
  console.error("Usage: node benchmark.mjs --type <sync|onExit|onBeforeExit> --count <n>");
  process.exit(1);
}

const countIndex = process.argv.indexOf("--count");
const N = Number(process.argv[countIndex + 1]);
if (!Number.isInteger(N) || N <= 0) {
  console.error("Usage: node benchmark.mjs --type <sync|onExit|onBeforeExit> --count <n>");
  process.exit(1);
}
const out = join(tmpdir(), "ninjutsu_benchmark_out.txt");
const depfilePath = out + ".depfile";
const cwd = resolve();

const paths = Array.from({ length: N }, (_, i) => {
  if (i % 5 === 0) {
    return resolve("node_modules", "some-package", `file_${i}.js`);
  }
  return resolve("packages", "node", "src", `file_${i}.ts`);
});

function computeDependency(path) {
  const relPath = relative(cwd, path);
  return (
    relPath && !relPath.startsWith("..") && !isAbsolute(relPath)
      ? relPath
      : path
  ).replaceAll("\\", "/");
}

const fd = openSync(depfilePath, "w");
writeFileSync(fd, out + ":");

let buffer = "";

const loopStart = performance.now();

if (type === "sync") {
  for (const path of paths) {
    writeFileSync(fd, " " + computeDependency(path));
  }
} else {
  for (const path of paths) {
    buffer += " " + computeDependency(path);
  }
}

const loopMs = performance.now() - loopStart;

let flushMs = 0;
if (type === "onExit") {
  const flushStart = performance.now();
  writeFileSync(fd, buffer);
  flushMs = performance.now() - flushStart;
} else if (type === "onBeforeExit") {
  const flushStart = performance.now();
  await asyncWrite(fd, buffer);
  flushMs = performance.now() - flushStart;
}

closeSync(fd);
const contentHash = createHash("sha256")
  .update(readFileSync(depfilePath))
  .digest("hex");
unlinkSync(depfilePath);

console.log(JSON.stringify({ loopMs, flushMs, contentHash }));
