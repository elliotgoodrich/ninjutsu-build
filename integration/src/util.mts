import { execSync, spawnSync } from "node:child_process";
import { strict as assert } from "node:assert";

export function getDeps(cwd: string): Record<string, string[]> {
  const deps: Record<string, string[]> = {};
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

export function callNinja(cwd: string, target?: string): string {
  const extra = target === undefined ? [] : [target];
  const { stdout, stderr, status } = spawnSync(
    "ninja",
    ["-d", "keepdepfile", ...extra],
    {
      cwd,
    },
  );
  const stdoutStr = stdout.toString();
  assert.strictEqual(stderr.toString(), "");
  assert.strictEqual(status, 0, stdoutStr);
  return stdoutStr;
}

export function callNinjaWithFailure(
  cwd: string,
  target?: string,
): { stdout: string; stderr: string } {
  const extra = target === undefined ? [] : [target];
  const { stdout, stderr, status } = spawnSync(
    "ninja",
    ["-d", "keepdepfile", ...extra],
    {
      cwd,
    },
  );
  const stdoutStr = stdout.toString();
  assert.notStrictEqual(status, 0, stdout.toString());
  return { stdout: stdoutStr, stderr: stderr.toString() };
}

export function depsMatch(
  actual: Record<string, string[]>,
  expected: Record<string, (string | RegExp)[]>,
): void {
  assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort());

  for (const key in expected) {
    const expectedArr = expected[key];
    const actualArr = actual[key];
    assert.strictEqual(
      expectedArr.length,
      actualArr.length,
      `Array mismatch with ${key}, expected ${actualArr.length} items but got ${expectedArr.length}`,
    );
    const found = new Set<number>();
    for (let i = 0; i < expectedArr.length; ++i) {
      const value = expectedArr[i];
      const index =
        typeof value === "string"
          ? actualArr.indexOf(value)
          : actualArr.findIndex((s) => value.test(s));
      assert.notEqual(
        index,
        -1,
        `Could not find ${value} in dependencies for ${key}`,
      );
      assert(
        !found.has(index),
        `Duplicate value match ${value} in dependencies for ${key}`,
      );
      found.add(index);
    }
  }
}
