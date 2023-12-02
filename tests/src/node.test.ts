import { NinjaBuilder, implicitDeps } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";

test("makeNodeRule", () => {
  const ninja = new NinjaBuilder();
  const node = makeNodeRule(ninja);
  const out: "out.txt" = node({ out: "out.txt", in: "in.js" });
  expect(out).toEqual("out.txt");
  const myNode = makeNodeRule(ninja, "myNode");
  const out2: "out2.txt" = myNode({
    out: "out2.txt",
    in: "in.js",
    [implicitDeps]: ["other"],
  });
  expect(out2).toEqual("out2.txt");

  expect(ninja.output).toMatchSnapshot();
});
