import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync } from "node:fs";
import { NinjaBuilder, validations, orderOnlyDeps } from "@ninjutsu-build/core";
import {
  makeCheckFormattedRule,
  makeFormatRule,
  makeLintRule,
  makeFormatToRule,
} from "@ninjutsu-build/biome";
import { existsSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path/posix";
import { getTestDir, setup } from "./util.mjs";

describe("biome", (suiteCtx) => {
  beforeEach(setup(suiteCtx));

  test("Basic example", (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);

    const formatted = "formatted.mts";
    writeFileSync(join(dir, formatted), "export const value = { foo: 1 };\n");
    const unformatted = "unformatted.mts";
    writeFileSync(join(dir, unformatted), "export const value = {bar:1};\n");
    const unlinted = "unlinted.mts";
    writeFileSync(join(dir, unlinted), "export const value = 1 == 1;\n");
    const configPath = "biome.json";
    writeFileSync(
      join(dir, configPath),
      '{ "formatter": { "enabled": true }, "linter": { "enabled": true } }',
    );

    const ninja = new NinjaBuilder({ builddir: "out" }, dir);
    const checkFormatted = makeCheckFormattedRule(ninja);
    const lint = makeLintRule(ninja);
    const format = makeFormatRule(ninja);
    const formatTo = makeFormatToRule(ninja);
    const formattedOutput = checkFormatted({
      in: formatted,
      configPath,
    });
    const unformattedOutput = checkFormatted({
      in: unformatted,
      configPath,
    });
    const unlintedCheck = lint({
      in: unlinted,
      configPath,
    });

    const formatUnformatted = format({ in: unformatted, configPath });

    // Format to a path containing slashes as this was an issue on windows using the `type` command
    // to cat files into `biome` with paths containing forward slashes.
    const newFormat = formatTo({
      in: unformatted,
      out: "nice/and/formatted.mts",
      configPath,
    });

    writeFileSync(join(dir, "build.ninja"), ninja.output);

    // Check that formatted files are correctly marked as formatted
    const formattedStamp = formattedOutput[validations].replace(
      "$builddir",
      "out",
    );
    {
      const { stdout, stderr, status } = spawnSync("ninja", [formattedStamp], {
        cwd: dir,
      });
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(stdoutStr, /Checking format of formatted.mts/);

      assert.strictEqual(existsSync(join(dir, formattedStamp)), true);

      assert.strictEqual(
        execSync("ninja " + formattedStamp, { cwd: dir })
          .toString()
          .trim(),
        "ninja: no work to do.",
      );
    }

    // Check that unformatted files are correctly marked as unformatted
    const unformattedStamp = unformattedOutput[validations].replace(
      "$builddir",
      "out",
    );

    // Run this twice as ninja should continue to fail
    for (let i = 0; i < 2; ++i) {
      const { stdout, stderr, status } = spawnSync(
        "ninja",
        [unformattedStamp],
        {
          cwd: dir,
        },
      );
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 1, stdoutStr);
      assert.match(stdoutStr, /Some errors were emitted while running checks/);

      assert.strictEqual(existsSync(join(dir, unformattedStamp)), false);
    }

    // Check that files with lint errors are correctly marked
    const unlintedStamp = unlintedCheck[validations].replace(
      "$builddir",
      "out",
    );

    // Run this twice as ninja should continue to fail
    for (let i = 0; i < 2; ++i) {
      const { stdout, stderr, status } = spawnSync("ninja", [unlintedStamp], {
        cwd: dir,
      });
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 1, stdoutStr);
      assert.match(stdoutStr, /Some errors were emitted while running checks/);

      assert.strictEqual(existsSync(join(dir, unlintedStamp)), false);
    }

    // Check that we can format unformatted files
    {
      const makeFormattedStamp = formatUnformatted[orderOnlyDeps].replace(
        "$builddir",
        "out",
      );
      const { stdout, stderr, status } = spawnSync(
        "ninja",
        [makeFormattedStamp],
        {
          cwd: dir,
        },
      );
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(stdoutStr, /Formatting unformatted.mts/);

      assert.strictEqual(existsSync(join(dir, makeFormattedStamp)), true);

      assert.strictEqual(
        execSync("ninja " + formattedStamp, { cwd: dir })
          .toString()
          .trim(),
        "ninja: no work to do.",
      );
    }

    // Check that we can format to a different place
    {
      const { stdout, stderr, status } = spawnSync("ninja", [newFormat], {
        cwd: dir,
      });
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(
        stdoutStr,
        /Formatting unformatted.mts to nice\/and\/formatted.mts/,
      );

      assert.strictEqual(existsSync(join(dir, newFormat)), true);

      assert.strictEqual(
        execSync("ninja " + newFormat, { cwd: dir })
          .toString()
          .trim(),
        "ninja: no work to do.",
      );
    }
  });
});
