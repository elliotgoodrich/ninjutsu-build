# How to Write a Plugin

We will be writing a plugin for a hypothetical command line application called
`samurai`.  This application has a typical command line interface, with the most
basic usage looking like:

```bash
$ samurai --in myfile.txt --output out.dat
```

## Initial skeleton

This initial code will be able to create a `saumrai` rule that can take an `in`
and `out` property and call the `samurai` CLI passing these through.

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O }) => O {
  const { name = "samurai", ...rest } = options;
  return ninja.rule(name, {
    command: "samurai --in $in --output $out",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    ...rest,
  });
}
```

The canonical form of plugins take a `NinjaBuilder` for the first parameter and
then an optional object containing any optional properties that we would like to
pass in.  Two of these properties should be `orderOnlyDeps` and `implicitDeps`
for when applications have additional dependencies that need to be added to each
build edge created with this rule.

In practice this can be used for teams to set up a dependency on another build
edge that installs the `samurai` application.

```ts
const toolsInstalled = aptGet({ in: "samurai" });
const samurai = makeSamuraiRule(ninja, { [implicitDeps]: toolsInstalled });
```

Although not necessary, we specify the signature of the returned function and
make it generic on the `out` property passed in.  This is for developers to be
able to mousehover over values returned from `samurai` and see the value passed
in.  This can help developers to find the location of output files without
needing to debug through the configuration script.

```ts
const ninja = new NinjaBuilder();
const samurai = makeSamuraiRule(ninja);
// Note that the type of `out` is `"out.dat"`
const out = samurai({ in: "src/input.txt", out: "out.dat" });
writeFileSync("build.ninja", ninja.output);
```

We destructure the `options` property and forward everything other than `name`
to `NinjaBuilder.rule`.  This covers the previously mentioned `orderOnlyDeps`
and `implicitDeps` properties, as well as any other special rules that ninja
understands (such as `configure: 1`) and that the user wants to provide -
despite not being accepted by the function signature.

## Adding more command line arguments

Let's assume that `samurai` can take an optional `--swords N` property that we
would want to cover.

```bash
$ samurai --in myfile.txt --output out.dat --swords 7
```

If there is a default known value (e.g. 0), this could be done easily passing in
`0` to `NinjaBuilder.rule`,

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O, swords?: number }) => O {
  const { name = "samurai", ...rest } = options;
  return ninja.rule(name, {
    command: "samurai --in $in --output $out --swords $swords",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    swords: 0,
    ...rest,
  });
}
```

If there is not an appropriate default for this option, it is sometimes easier
to have a generic `$args` variable mentioned in the `command` property and to
build this up ourselves.  This introduces a little bit more boilerplate as we
must create a new lambda and duplicate the signature for it.

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O, swords?: number }) => O {
  const { name = "samurai", ...rest } = options;
  const samurai = ninja.rule(name, {
    command: "samurai --in $in --output $out$args",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <O extends string>(a: { in: Input<string>, out: O, swords?: number }): O {
    const { swords, ...rest } = a;
    const args = swords === undefined ? "" : ` --swords ${swords}`;
    return samurai({ args, ...rest });
  };
}
```

We destructure the `a` object to pull off anything that we either don't want to
forward through (like `swords` since the underlying rule `samurai` wouldn't
understand it).

## Adding a rule-level default

Assuming that the value for `swords` is going to be fixed across your entire
application, it can be better to default this when creating the rule rather than
have to pass it at each stage.

We add an optional `swords` property to `options` that we store as
`defaultSwords`.  This is then set as the default value for `swords` when
destructing `a`.

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    swords?: number,
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O, swords?: number }) => O {
  const { name = "samurai", swords: defaultSwords, ...rest } = options;
  const samurai = ninja.rule(name, {
    command: "samurai --in $in --output $out$args",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <O extends string>(a: { in: Input<string>, out: O, swords?: number }): O {
    const { swords = defaultSwords, ...rest } = a;
    const args = swords === undefined ? "" : ` --swords ${swords}`;
    return samurai({ args, ...rest });
  };
}
```

## Adding a config file

Lots of tools take options from a particular file, whose path can be passed as
an argument, e.g.

```bash
samurai --in myfile.txt --output out.dat --config options.json
```

In these situations it's common that the config file is the same across the
entire project, so we will do the same as `swords` and allow `config` to be
passed when constructing the `samurai` rule, but still overridable for each
build edge,

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    swords?: number;
    config?: string;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O, swords?: number, config?: string }) => O {
  const { name = "samurai", swords: defaultSwords, config: defaultConfig, ...rest } = options;
  const samurai = ninja.rule(name, {
    command: "samurai --in $in --output $out$args",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <O extends string>(a: { in: Input<string>, out: O, swords?: number, config?: string }): O {
    const { swords = defaultSwords, config = defaultConfig, [implicitDeps]: _implicitDeps = [], ...rest } = a;
    let argsArr: string[] = [];
    let allDeps = _implicitDeps;
    if (swords !== undefined) {
      argsArr.push(` --swords ${swords}`);
    }
    if (config !== undefined) {
      argsArr.push(` --config ${config}`);
      allDeps.push(config);
    }

    return samurai({ args: argsArr.join(" "), [implicitDeps]: allDeps, ...rest });
  };
}
```

Since our `samurai` tool will read the configuration file, we need to add it as
an `implicitDeps` so that `ninja` knows to rerun these build edges when this
file is changed.

## `Input<string>`

Any options provided to a Ninjutsu rule that represent a path should be provided
as `Input<string>` instead of just a plain `string`.  An `Input<string>` can be
a `string`, or it can be an object containing a `file: string` property with
optional `implicitDeps` and `orderOnlyDeps` properties. This allows us to inject
additional dependencies, such as waiting for a formatting rule to finish before
using the file.

Right now the below:

```ts
const formattedConfig = format({ in: "options.json" });
const out = samurai({ in: "src/input.txt", out: "out.dat", config: formattedConfig });
```

Would not typecheck or run, as `formattedConfig` is an object containing `file`
and `orderOnlyDeps` properties.  To fix this we change all `config?: string`
properties to `config?: Input<string>` and use `getInput` from
`@ninjutsu-build/core` to extract the file name when we need it to build up the
`args` string.  Otherwise, functions created from `NinjaBuilder.rule` accept
`Input<string>` values for `implicitDeps` and will correctly handle all
dependencies.

```ts
function makeSamuraiRule(
  ninja: NinjaBuilder,
  options: {
    name?: string;
    swords?: number;
    config?: Input<string>;
    [implicitDeps]?: Input<string> | readonly Input<string>[];
    [orderOnlyDeps]?: Input<string> | readonly Input<string>[];
  } = {},
): <O extends string>(a: { in: Input<string>, out: O, swords?: number, config?: Input<string> }) => O {
  const { name = "samurai", swords: defaultSwords, config: defaultConfig, ...rest } = options;
  const samurai = ninja.rule(name, {
    command: "samurai --in $in --output $out$args",
    description: "Samurai'ing $out",
    in: needs<Input<string>>(),
    out: needs<string>(),
    args: needs<string>(),
    ...rest,
  });
  return <O extends string>(a: { in: Input<string>, out: O, swords?: number, config?: Input<string> }): O {
    const { swords = defaultSwords, config = defaultConfig, [implicitDeps]: _implicitDeps = [], ...rest } = a;
    let argsArr: string[] = [];
    let allDeps = _implicitDeps;
    if (swords !== undefined) {
      argsArr.push(` --swords ${swords}`);
    }
    if (config !== undefined) {
      argsArr.push(` --config ${getInput(config)}`);
      allDeps.push(config);
    }

    return samurai({ args: argsArr.join(" "), [implicitDeps]: allDeps, ...rest });
  };
}
```
