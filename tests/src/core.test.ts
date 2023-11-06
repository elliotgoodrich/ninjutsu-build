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
import { assert } from "tsafe/assert";
import type { Equals } from "tsafe";

test("console", () => {
  expect(console).toEqual("console");
});

test("needs", () => {
  expect(needs<boolean>()).toEqual(undefined);
  expect(needs<number>()).toEqual(undefined);
  expect(needs<string>()).toEqual(undefined);
});

test("constructor", () => {
  {
    const ninja = new NinjaBuilder();
    expect(ninja.output).toEqual("");
  }
  {
    const ninja = new NinjaBuilder({ builddir: "output" });
    expect(ninja.output).toEqual("builddir = output\n");
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: undefined,
    });
    expect(ninja.output).toEqual("builddir = output\n");
  }
  {
    const ninja = new NinjaBuilder({
      ninja_required_version: "foo",
      builddir: "output",
    });
    expect(ninja.output).toEqual(`ninja_required_version = foo
builddir = output
`);
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: "foo",
    });
    expect(ninja.output).toEqual(`builddir = output
ninja_required_version = foo
`);
  }
  {
    const ninja = new NinjaBuilder({
      builddir: "output",
      ninja_required_version: "foo",
      //@ts-expect-error Check unexpected variables are still included in the output
      extra: 12,
    });
    expect(ninja.output).toEqual(`builddir = output
ninja_required_version = foo
extra = 12
`);
  }
});

test("comments", () => {
  const ninja = new NinjaBuilder();
  ninja.comment("this is a c#mment");
  expect(ninja.output).toEqual("# this is a c#mment\n");
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
  expect(out).toEqual("out.txt");
  expect(ninja.output).toEqual(
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
  expect(out).toEqual("alias");

  const out2: "my:: alia$ !" = phony({ out: "my:: alia$ !", in: "file$ .txt" });
  expect(out2).toEqual("my:: alia$ !");

  expect(ninja.output).toEqual(
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
  expect(out).toEqual(":out.txt");
  const out2: "out2.txt" = copy({ out: "out2.txt", in: "in txt", extra: true });
  expect(out2).toEqual("out2.txt");
  expect(ninja.output).toEqual(`rule cp
  command = cp $in $out
  description = Copying $in to $out
build $:out.txt: cp in.txt
build out2.txt: cp in$ txt
  extra = true
`);
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
    expect(out).toEqual(["b", "c"]);
    expect(ninja.output).toEqual(`rule test
  command = in-1-out-many
build b c: test a
`);
  }

  {
    const ninja = new NinjaBuilder();
    const inManyOutOne = ninja.rule("test", {
      out: needs<string>(),
      in: needs<readonly string[]>(),
      command: "in-many-out-1",
    });
    const out: "c" = inManyOutOne({ out: "c", in: ["a", "b"] });
    expect(out).toEqual("c");
    expect(ninja.output).toEqual(`rule test
  command = in-many-out-1
build c: test a b
`);
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
    expect(out).toEqual(["a", "b"]);
    expect(ninja.output).toEqual(`rule test
  command = in-many-out-many
build a b: test c d e
`);
  }

  {
    const ninja = new NinjaBuilder();
    const tuple = ninja.rule("test", {
      out: needs<readonly [string, string]>(),
      in: needs<readonly [string]>(),
      command: "in-many-out-many",
    });
    const out: readonly ["a", "b"] = tuple({ out: ["a", "b"], in: ["i"] });
    expect(out).toEqual(["a", "b"]);
    expect(ninja.output).toEqual(`rule test
  command = in-many-out-many
build a b: test i
`);
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
    [validations]: ["validations_"],
    pool: "pool",
    extra: 123,
  });
  expect(out).toEqual("out.txt");
  expect(ninja.output).toEqual(`rule all
  command = [command]
  description = [desc]
build out.txt | implicitOut_: all in.txt | implicitDeps_ || orderOnlyDeps_ |@ validations_
  dyndep = dyndep_
  command = command_
  description = description_
  pool = pool
  extra = 123
`);
});

test("pools", () => {
  const ninja = new NinjaBuilder();
  const p = ninja.pool("myPool", { depth: 17 });
  expect(p).toEqual("myPool");
  expect(ninja.output).toEqual(`pool myPool
  depth = 17
`);
});

test("basic variables", () => {
  const ninja = new NinjaBuilder();
  const myInt = ninja.variable("myInt", 10);
  expect(myInt).toEqual(undefined);
  assert<Equals<typeof myInt, Variable<number>>>();
  const myBool = ninja.variable("myBool", false);
  assert<Equals<typeof myBool, Variable<boolean>>>();
  expect(myBool).toEqual(undefined);
  const myStr = ninja.variable("myStr", "hi");
  assert<Equals<typeof myStr, Variable<string>>>();
  const rule = ninja.rule("generate", {
    command: "echo '$content' > $out",
    out: needs<string>(),
    myStr,
    foo: 1,
    other: needs<boolean>(),
  });

  const out: "out" = rule({ out: "out", content: "myContent", other: true });
  expect(out).toEqual("out");
  const out2: "out2" = rule({ out: "out2", other: false, foo: 32 });
  expect(out2).toEqual("out2");
  const out3: "out3" = rule({
    out: "out3",
    other: false,
    myStr: "bar",
    foo: 32,
  });
  expect(out3).toEqual("out3");

  expect(ninja.output).toEqual(`myInt = 10
myBool = false
myStr = hi
rule generate
  command = echo '$content' > $out
  foo = 1
build out: generate
  content = myContent
  other = true
build out2: generate
  other = false
  foo = 32
build out3: generate
  other = false
  myStr = bar
  foo = 32
`);
});
