import test from "node:test";
import { assert as typeAssert } from "tsafe/assert";
import { strict as assert } from "node:assert";
import type { Equals } from "tsafe";
import {
  NinjaBuilder,
  Variable,
  console,
  needs,
  orderOnlyDeps,
  implicitDeps,
  validations,
  implicitOut,
} from "@ninjutsu-build/core";

test("console", () => {
  assert.equal(console, "console");
});

test("needs", () => {
  assert.equal(needs<boolean>(), undefined);
  assert.equal(needs<number>(), undefined);
  assert.equal(needs<string>(), undefined);
});

test("constructor", () => {
  {
    const ninja = new NinjaBuilder();
    assert.equal(ninja.output, "");
  }
  {
    const ninja = new NinjaBuilder({ builddir: "output" });
    assert.equal(ninja.output, "builddir = output\n");
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: undefined,
    });
    assert.equal(ninja.output, "builddir = output\n");
  }
  {
    const ninja = new NinjaBuilder({
      ninja_required_version: "foo",
      builddir: "output",
    });
    assert.equal(
      ninja.output,
      `ninja_required_version = foo
builddir = output
`,
    );
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: "foo",
    });
    assert.equal(
      ninja.output,
      `builddir = output
ninja_required_version = foo
`,
    );
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: "foo",
      //@ts-expect-error Check unexpected variables are still included in the output
      extra: 12,
    });
    assert.equal(
      ninja.output,
      `builddir = output
ninja_required_version = foo
extra = 12
`,
    );
  }
});

test("comments", () => {
  const ninja = new NinjaBuilder();
  ninja.comment("this is a c#mment");
  assert.equal(ninja.output, "# this is a c#mment\n");
});

test("touch rule", () => {
  const ninja = new NinjaBuilder();
  const touch = ninja.rule("touch", {
    out: needs<string>(),
    command: "touch $out",
    description: "Touching $out",
    ignored: undefined,
  });
  const out: "out.txt" = touch({
    out: "out.txt",
    extra: 123,
    stillIgnored: undefined,
  });
  assert.equal(out, "out.txt");
  assert.equal(
    ninja.output,
    `rule touch
  command = touch $out
  description = Touching $out
build out.txt: touch
  extra = 123
`,
  );
});

test("phony rule", () => {
  const ninja = new NinjaBuilder();
  const { phony } = ninja;
  const out: "alias" = phony({ out: "alias", in: "file.txt" });
  assert.equal(out, "alias");

  const out2: "my:: alia$ !" = phony({ out: "my:: alia$ !", in: "file$ .txt" });
  assert.equal(out2, "my:: alia$ !");

  assert.equal(
    ninja.output,
    `build alias: phony file.txt
build my$:$:$ alia$$ !: phony file$$ .txt
`,
  );
});

test("basic copy rule", () => {
  const ninja = new NinjaBuilder();
  const copy = ninja.rule("cp", {
    out: needs<string>(),
    in: needs<string>(),
    command: "cp $in $out",
    description: "Copying $in to $out",
  });
  const out: ":out.txt" = copy({
    out: ":out.txt",
    in: "in.txt",
    ignored: undefined,
  });
  assert.equal(out, ":out.txt");
  const out2: "out2.txt" = copy({ out: "out2.txt", in: "in txt", extra: true });
  assert.equal(out2, "out2.txt");
  assert.equal(
    ninja.output,
    `rule cp
  command = cp $in $out
  description = Copying $in to $out
build $:out.txt: cp in.txt
build out2.txt: cp in$ txt
  extra = true
`,
  );
});

test("Rules with different in/out arities", () => {
  {
    const ninja = new NinjaBuilder();
    const inOneOutMany = ninja.rule("test", {
      out: needs<readonly string[]>(),
      in: needs<string>(),
      command: "in-1-out-many",
    });
    const out: readonly ["b", "c"] = inOneOutMany({ out: ["b", "c"], in: "a" });
    assert.deepEqual(out, ["b", "c"]);
    assert.equal(
      ninja.output,
      `rule test
  command = in-1-out-many
build b c: test a
`,
    );
  }

  {
    const ninja = new NinjaBuilder();
    const inManyOutOne = ninja.rule("test", {
      out: needs<string>(),
      in: needs<readonly string[]>(),
      command: "in-many-out-1",
    });
    const out: "c" = inManyOutOne({ out: "c", in: ["a", "b"] });
    assert.equal(out, "c");
    assert.equal(
      ninja.output,
      `rule test
  command = in-many-out-1
build c: test a b
`,
    );
  }

  {
    const ninja = new NinjaBuilder();
    const inOutMany = ninja.rule("test", {
      out: needs<readonly string[]>(),
      in: needs<readonly string[]>(),
      command: "in-many-out-many",
    });
    const out: readonly ["a", "b"] = inOutMany({
      out: ["a", "b"],
      in: ["c", "d", "e"],
    });
    assert.deepEqual(out, ["a", "b"]);
    assert.equal(
      ninja.output,
      `rule test
  command = in-many-out-many
build a b: test c d e
`,
    );
  }

  {
    const ninja = new NinjaBuilder();
    const tuple = ninja.rule("test", {
      out: needs<readonly [string, string]>(),
      in: needs<readonly [string]>(),
      command: "in-many-out-many",
    });
    const out: readonly ["a", "b"] = tuple({ out: ["a", "b"], in: ["i"] });
    assert.deepEqual(out, ["a", "b"]);
    assert.equal(
      ninja.output,
      `rule test
  command = in-many-out-many
build a b: test i
`,
    );
  }
});

test("Passing all arguments to a `NinjaRule`", () => {
  const ninja = new NinjaBuilder();
  const all = ninja.rule("all", {
    out: needs<string>(),
    in: needs<string>(),
    command: "[command]",
    description: "[desc]",
  });
  const out: "out.txt" = all({
    out: "out.txt",
    in: "in.txt",
    dyndep: "dyndep_",
    command: "command_",
    description: "description_",
    [implicitDeps]: "implicitDeps_",
    [implicitOut]: ["implicitOut_"],
    [orderOnlyDeps]: ["orderOnlyDeps_"],
    [validations]: (out) => ["validations_" + out],
    pool: "pool",
    extra: 123,
  });
  assert.equal(out, "out.txt");
  assert.equal(
    ninja.output,
    `rule all
  command = [command]
  description = [desc]
build out.txt | implicitOut_: all in.txt | implicitDeps_ || orderOnlyDeps_ |@ validations_out.txt
  dyndep = dyndep_
  command = command_
  description = description_
  pool = pool
  extra = 123
`,
  );
});

test("pools", () => {
  const ninja = new NinjaBuilder();
  const p = ninja.pool("myPool", { depth: 17 });
  assert.equal(p, "myPool");
  assert.equal(
    ninja.output,
    `pool myPool
  depth = 17
`,
  );
});

test("basic variables", () => {
  const ninja = new NinjaBuilder();
  const myInt: Variable<number> = ninja.variable("myInt", 10);
  assert.equal(myInt, undefined);
  //TODO
  //typeAssert<Equals<typeof myInt, Variable<number>>>();
  const myBool = ninja.variable("myBool", false);
  typeAssert<Equals<typeof myBool, Variable<boolean>>>();
  assert.equal(myBool, undefined);
  const myStr = ninja.variable("myStr", "hi");
  typeAssert<Equals<typeof myStr, Variable<string>>>();
  const rule = ninja.rule("generate", {
    command: "echo '$content' > $out",
    out: needs<string>(),
    myStr,
    foo: 1,
    other: needs<boolean>(),
  });

  const out: "out" = rule({ out: "out", content: "myContent", other: true });
  assert.equal(out, "out");
  const out2: "out2" = rule({ out: "out2", other: false, foo: 32 });
  assert.equal(out2, "out2");
  const out3: "out3" = rule({
    foo: 32,
    out: "out3",
    other: false,
    myStr: "bar",
  });
  assert.equal(out3, "out3");

  assert.equal(
    ninja.output,
    `myInt = 10
myBool = false
myStr = hi
rule generate
  command = echo '$content' > $out
build out: generate
  content = myContent
  other = true
  foo = 1
build out2: generate
  other = false
  foo = 32
build out3: generate
  foo = 32
  other = false
  myStr = bar
`,
  );
});
