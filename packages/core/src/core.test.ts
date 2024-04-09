import test from "node:test";
import { assert as typeAssert } from "tsafe/assert";
import { strict as assert } from "node:assert";
import type { Equals } from "tsafe";
import {
  NinjaBuilder,
  type Input,
  type Variable,
  console,
  getInput,
  getInputs,
  needs,
  orderOnlyDeps,
  implicitDeps,
  validations,
  implicitOut,
} from "./core.js";

test("console", () => {
  assert.equal(console, "console");
});

test("needs", () => {
  assert.equal(needs<boolean>(), undefined);
  assert.equal(needs<number>(), undefined);
  assert.equal(needs<string>(), undefined);
});

test("getInput(s)", () => {
  {
    const input: "foo" = getInput("foo");
    assert.equal(input, "foo");
  }
  {
    const input: "foo" = getInput({ file: "foo" });
    assert.equal(input, "foo");
  }
  {
    const input: readonly "foo"[] = getInputs(["foo"]);
    assert.deepEqual(input, ["foo"]);
  }
  {
    const input: readonly ("foo" | "bar")[] = getInputs(["foo", "bar"]);
    assert.deepEqual(input, ["foo", "bar"]);
  }
  {
    const input: readonly string[] = getInputs(["foo"] as string[]);
    assert.deepEqual(input, ["foo"]);
  }
});

test("constructor", () => {
  {
    const ninja = new NinjaBuilder();
    assert.equal(ninja.output, "");
    assert.equal(ninja.outputDir, ".");
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
  {
    const ninja = new NinjaBuilder(
      {
        builddir: "output",
      },
      "final/output/dir",
    );
    assert.equal(
      ninja.output,
      `builddir = output
`,
    );
    assert.equal(ninja.outputDir, "final/output/dir");
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
    extra: 321,
    stillIgnored: undefined,
  });
  assert.equal(out, "out.txt");
  assert.equal(
    ninja.output,
    `rule touch
  command = touch $out
  description = Touching $out
build out.txt: touch
  extra = 321
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

  const out3: "all" = phony({ out: "all", in: ["in1", "in2"] });
  assert.equal(out3, "all");

  const out4: "none" = phony({ out: "none", in: [] });
  assert.equal(out4, "none");

  assert.equal(
    ninja.output,
    `build alias: phony file.txt
build my$:$:$ alia$$ !: phony file$$ .txt
build all: phony in1 in2
build none: phony
`,
  );
});

test("basic copy rule", () => {
  const ninja = new NinjaBuilder();
  const copy = ninja.rule("cp", {
    out: needs<string>(),
    in: needs<Input<string>>(),
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
      in: needs<Input<string>>(),
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
      in: needs<readonly Input<string>[]>(),
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
    in: needs<Input<string>>(),
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
  all({
    out: "foo",
    in: {
      file: "hi",
      [implicitDeps]: "implicit1",
      [orderOnlyDeps]: "ordered1",
      [validations]: ["valid1"],
    },
    [implicitDeps]: "implicit2",
    [orderOnlyDeps]: ["ordered2", "ordered3"],
    [validations]: (out: string) => "valid2_" + out,
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
build foo: all hi | implicit1 implicit2 || ordered1 ordered2 ordered3 |@ valid1 valid2_foo
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
  typeAssert<Equals<typeof myInt, Variable<number>>>();
  assert.equal(myInt, "$myInt");
  const myBool = ninja.variable("myBool", false);
  typeAssert<Equals<typeof myBool, Variable<boolean>>>();
  assert.equal(myBool, "$myBool");
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
  const out2: "out2" = rule({ out: "out2", other: false, foo: 32, myStr });
  assert.equal(out2, "out2");
  const out3: "out3" = rule({
    foo: 32,
    out: "out3",
    other: false,
    myStr: ninja.variable("empty", ""),
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
empty = 
build out3: generate
  foo = 32
  other = false
  myStr = $empty
`,
  );
});

test("additional rule dependencies", () => {
  const ninja = new NinjaBuilder();
  const rule = ninja.rule("generate", {
    command: "echo 'hi' > $out",
    out: needs<string>(),
    [implicitDeps]: ["ruleDeps"],
    [implicitOut]: "ruleOut",
    [orderOnlyDeps]: ["ruleOrder1", "ruleOrder2"],
  });

  rule({ out: "out" });
  rule({
    out: "out2",
    [implicitDeps]: "buildDeps1",
    [implicitOut]: ["buildOut1", "buildOut2"],
    [orderOnlyDeps]: "buildOrder1",
  });

  assert.equal(
    ninja.output,
    `rule generate
  command = echo 'hi' > $out
build out | ruleOut: generate | ruleDeps || ruleOrder1 ruleOrder2
build out2 | ruleOut buildOut1 buildOut2: generate | ruleDeps buildDeps1 || ruleOrder1 ruleOrder2 buildOrder1
`,
  );
});
