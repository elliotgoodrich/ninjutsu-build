import test from "node:test";
import { strict as assert } from "node:assert";
import { NinjaBuilder, implicitDeps } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";

test("makeNodeRule", () => {
  const ninja = new NinjaBuilder();
  const node = makeNodeRule(ninja);
  const out: "out.txt" = node({ out: "out.txt", in: "in.js" });
  assert.equal(out, "out.txt");
  const myNode = makeNodeRule(ninja, "myNode");
  const out2: "out2.txt" = myNode({
    out: "out2.txt",
    in: "in.js",
    args: "--test",
    [implicitDeps]: ["other"],
  });
  assert.equal(out2, "out2.txt");

  assert.equal(
    ninja.output,
    `rule node
  command = cmd /c node.exe --require "@ninjutsu-build/node/lib/hookRequire.cjs" --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('@ninjutsu-build/node/dist/makeDepfile.js', pathToFileURL('./'), { data: '$out' });" $in $args > $out
  description = Creating $out from 'node $in'
  depfile = $out.depfile
  deps = gcc
build out.txt: node in.js
  args = 
rule myNode
  command = cmd /c node.exe --require "@ninjutsu-build/node/lib/hookRequire.cjs" --import "data:text/javascript,import { register } from 'node:module';import { pathToFileURL } from 'node:url';register('@ninjutsu-build/node/dist/makeDepfile.js', pathToFileURL('./'), { data: '$out' });" $in $args > $out
  description = Creating $out from 'node $in'
  depfile = $out.depfile
  deps = gcc
build out2.txt: myNode in.js | other
  args = --test
`,
  );
});
