import { beforeEach, test, describe } from "node:test";
import { strict as assert } from "node:assert";
import { writeFileSync, existsSync } from "node:fs";
import { NinjaBuilder, validations, orderOnlyDeps } from "@ninjutsu-build/core";
import {
  makeCheckFormattedRule,
  makeFormatRule,
  makeFormatToRule,
} from "@ninjutsu-build/dprint";
import { execSync, spawnSync } from "node:child_process";
import { join } from "node:path/posix";
import { getTestDir, setup } from "./util.mjs";

describe("dprint", (suiteCtx) => {
  beforeEach(setup(suiteCtx));

  test("Basic example", (testCtx) => {
    const dir = getTestDir(suiteCtx, testCtx);

    const formatted = "formatted.ts";
    writeFileSync(join(dir, formatted), "export const value = { foo: 1 };\n");

    const unformatted = "unformatted.ts";
    writeFileSync(join(dir, unformatted), "export const value = {bar:1};\n");

    const configPath = "dprint.json";
    writeFileSync(
      join(dir, configPath),
      JSON.stringify(
        {
          typescript: {},
          plugins: ["https://plugins.dprint.dev/typescript-0.91.0.wasm"],
        },
        null,
        2,
      ),
    );

    const ninja = new NinjaBuilder({ builddir: "out" }, dir);
    const checkFormatted = makeCheckFormattedRule(ninja);
    const format = makeFormatRule(ninja);
    const formatTo = makeFormatToRule(ninja);

    const formattedOutput = checkFormatted({ in: formatted, configPath });
    const unformattedOutput = checkFormatted({
      in: unformatted,
      configPath,
    });
    const formatUnformatted = format({ in: unformatted, configPath });

    // Format to a path containing slashes to exercise the `type` pipe on Windows.
    const newFormat = formatTo({
      in: unformatted,
      out: "nice/and/formatted.ts",
      configPath,
    });

    writeFileSync(join(dir, "build.ninja"), ninja.output);

    // Correctly formatted file passes check and creates stamp
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
      assert.match(stdoutStr, /Checking format of formatted.ts/);
      assert.strictEqual(existsSync(join(dir, formattedStamp)), true);
      assert.strictEqual(
        execSync("ninja " + formattedStamp, { cwd: dir })
          .toString()
          .trim(),
        "ninja: no work to do.",
      );
    }

    // Unformatted file fails check and leaves no stamp (idempotent)
    const unformattedStamp = unformattedOutput[validations].replace(
      "$builddir",
      "out",
    );
    for (let i = 0; i < 2; ++i) {
      const { stdout, stderr, status } = spawnSync(
        "ninja",
        [unformattedStamp],
        { cwd: dir },
      );
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.notStrictEqual(status, 0, stdoutStr);
      assert.strictEqual(existsSync(join(dir, unformattedStamp)), false);
    }

    // format rule rewrites the file in place and creates stamp
    {
      const makeFormattedStamp = formatUnformatted[orderOnlyDeps].replace(
        "$builddir",
        "out",
      );
      const { stdout, stderr, status } = spawnSync(
        "ninja",
        [makeFormattedStamp],
        { cwd: dir },
      );
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(stdoutStr, /Formatting unformatted.ts/);
      assert.strictEqual(existsSync(join(dir, makeFormattedStamp)), true);
    }

    // formatTo writes formatted content to a new path
    {
      const { stdout, stderr, status } = spawnSync("ninja", [newFormat], {
        cwd: dir,
      });
      const stdoutStr = stdout.toString();
      assert.strictEqual(stderr.toString(), "");
      assert.strictEqual(status, 0, stdoutStr);
      assert.match(
        stdoutStr,
        /Formatting unformatted.ts to nice\/and\/formatted.ts/,
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
