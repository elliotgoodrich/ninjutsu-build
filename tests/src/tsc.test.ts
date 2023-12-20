import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTSCRule, makeTypeCheckRule } from "@ninjutsu-build/tsc";

test("makeTSCRule", () => {
  const ninja = new NinjaBuilder();
  const tsc = makeTSCRule(ninja);
  expect(
    tsc({
      in: ["src/common/index.ts"],
      compilerOptions: {
        outDir: "output",
      },
    }),
  ).toEqual(["output/index.js"]);

  expect(
    tsc({
      in: ["index.cts"],
      compilerOptions: {
        declaration: true,
        outDir: "",
      },
    }),
  ).toEqual(["index.cjs", "index.d.cts"]);
  expect(ninja.output).toMatchSnapshot();
});

test("makeTypeCheckRule", () => {
  const ninja = new NinjaBuilder();
  const typecheck = makeTypeCheckRule(ninja);
  expect(
    typecheck({
      in: ["src/common/index.ts"],
      out: "$builddir/typechecked.stamp",
      compilerOptions: {
        outDir: "output",
      },
    }),
  ).toEqual("$builddir/typechecked.stamp");

  expect(ninja.output).toMatchSnapshot();
});
