import test from "node:test";
import { strict as assert } from "node:assert";
import { NinjaBuilder, implicitDeps } from "@ninjutsu-build/core";
import { makeNodeRule, makeNodeTestRule } from "./node.js";

test("makeNodeRule", () => {
  const ninja = new NinjaBuilder();
  const node = makeNodeRule(ninja);
  const out: "out.txt" = node({ out: "out.txt", in: "in.js", args: "" });
  assert.equal(out, "out.txt");
  const myNode = makeNodeRule(ninja, { name: "myNode" });
  const out2: "out2.txt" = myNode({
    out: "out2.txt",
    in: "in.js",
    nodeArgs: "--allow-worker",
    args: "--foo",
    [implicitDeps]: ["other"],
  });
  assert.equal(out2, "out2.txt");
});

test("makeNodeTestRule", () => {
  const ninja = new NinjaBuilder();
  const test = makeNodeTestRule(ninja);
  const out: "out.txt" = test({ out: "out.txt", in: "in.js" });
  assert.equal(out, "out.txt");
  const myNode = makeNodeTestRule(ninja, { name: "myTest" });
  const out2: "out2.txt" = myNode({
    out: "out2.txt",
    in: "in.js",
    args: "--foo",
    [implicitDeps]: ["other"],
  });
  assert.equal(out2, "out2.txt");
});
