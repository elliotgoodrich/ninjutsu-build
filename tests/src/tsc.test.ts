import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTSCRule } from "@ninjutsu-build/tsc";

test("makeTSCRule", () => {
  const ninja = new NinjaBuilder();
  const tsc = makeTSCRule(ninja);
  expect(tsc({
    in: ["src/common/index.ts"],
    compilerOptions: {
      outDir: "output",
    },
    dyndepName: "project.dyndep",
  })).toEqual(["output/common/index.js"]);

  expect(tsc({
    in: ["index.cts"],
    compilerOptions: {
      // Declarations will be put into implicit out
      declaration: true,
    },
    dyndepName: "project.dyndep",
  })).toEqual(["index.cjs"]);
  expect(ninja.output).toMatchSnapshot();
});