import {
  openSync,
  writeFileSync,
  readFileSync,
  write,
  closeSync,
  unlinkSync,
} from "node:fs";
import { promisify } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve, relative, isAbsolute, join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

const asyncWrite = promisify(write);

const RUNS = 10;
const N = 10_000;
const types = ["sync", "onExit", "onBeforeExit"];
const N_ARG = String(N);
const benchmarkPath = join(dirname(fileURLToPath(import.meta.url)), "benchmark.mjs");

const cwd = resolve();
const out = join(tmpdir(), "ninjutsu_benchmark_out.txt");
const depfilePath = out + ".depfile";

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

async function captureOutput(type) {
  const fd = openSync(depfilePath, "w");
  writeFileSync(fd, out + ":");
  let buffer = "";
  if (type === "sync") {
    for (const path of paths) writeFileSync(fd, " " + computeDependency(path));
  } else {
    for (const path of paths) buffer += " " + computeDependency(path);
  }
  if (type === "onExit") {
    writeFileSync(fd, buffer);
  } else if (type === "onBeforeExit") {
    await asyncWrite(fd, buffer);
  }
  closeSync(fd);
  const hash = createHash("sha256").update(readFileSync(depfilePath)).digest("hex");
  unlinkSync(depfilePath);
  return hash;
}

// Correctness check: run inline, no spawning
console.log("Correctness check:");
const syncHash = await captureOutput("sync");
let allMatch = true;
for (const type of types.filter((t) => t !== "sync")) {
  const match = (await captureOutput(type)) === syncHash;
  console.log(`  sync vs ${type.padEnd(14)}: ${match ? "✓ identical" : "✗ DIFFER"}`);
  if (!match) allMatch = false;
}
if (!allMatch) process.exit(1);
console.log();

// Benchmark: each type gets RUNS fresh node processes
function runOnce(type) {
  const result = spawnSync(
    process.execPath,
    [benchmarkPath, "--type", type, "--count", N_ARG],
    { encoding: "utf8" },
  );
  if (result.status !== 0) {
    console.error(`[${type}] process exited with ${result.status}:\n${result.stderr}`);
    process.exit(1);
  }
  return JSON.parse(result.stdout.trim());
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: sum / times.length,
    median: sorted[Math.floor(sorted.length / 2)],
  };
}

function fmt(ms) {
  return `${ms.toFixed(2)}ms`;
}

function printStats(label, times) {
  const { min, max, avg, median } = stats(times);
  console.log(
    `  ${label.padEnd(6)}: avg=${fmt(avg)}  med=${fmt(median)}  min=${fmt(min)}  max=${fmt(max)}`,
  );
}

for (const type of types) {
  const loopTimes = [];
  const flushTimes = [];

  for (let i = 0; i < RUNS; i++) {
    const { loopMs, flushMs } = runOnce(type);
    loopTimes.push(loopMs);
    if (type !== "sync") flushTimes.push(flushMs);
  }

  console.log(`[${type}] ${N.toLocaleString()} calls over ${RUNS} runs:`);
  printStats("loop", loopTimes);
  if (flushTimes.length > 0) {
    printStats("flush", flushTimes);
    printStats("total", loopTimes.map((l, i) => l + flushTimes[i]));
  }
  console.log();
}
