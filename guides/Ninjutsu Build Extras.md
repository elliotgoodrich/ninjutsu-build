# Ninjutsu Build Extras

Ninjutsu Build is a relatively thin wrapper to create ninja files. However,
there are several additions added to `@ninjutsu-build/core` to make it easier to
compose ninja files with complex dependencies, while minimizing mistakes.

## Attached Dependencies

There are certain types of rules - such as linting and formatting rules - whose
output is commonly fed into `[validations]` or `[orderOnlyDeps]` instead of `in.
For example, we would usually have something like:

```ts
const myfile = "myfile.js";
const formatted = format({ in: myfile });
const linted = lint({ in: myfile, [orderOnlyDeps]: formatted });
const results = node({
    in: myfile,
    [orderOnlyDeps]: formatted,
    [validations]: () => linted,
});
```

The `formatted` and string refers to an empty file created and updated once the
formatting has happened, and the `linted` string refers to the result of the
linting.

The resulting ninja file will invoke `myfile.js` only after it's formatted, and
whenever the `node` build edge is invoked, we will also lint `myfile.js`.
However, there is a lot of room for mistakes here and this can be made easier
with attached dependencies.

Instead of returning a `string`, the `format` and `lint` rules return an
`Input<string>`, which contains additional `[orderOnlyDeps]` and `[validations]`
that will be added when the object is passed into the `in` property.

For example, instead of returning a `string`, the `format` rule returns
`{ file: "myfile.js", [orderOnlyDeps]: "path/to/empty/file" }` and
similarly the `lint` rule returns
`{ file: "myfile.js", [validations]: "path/to/linting/results" }`.

This means that the above can be written like so:

```ts
const myfile = "myfile.js";
const formatted = format({ in: myfile });
const linted = lint({ in: formatted });
const results = node({ in: linted });
```

and the user has less to worry about.

It's worth noting that `lint` in this case must also return the
`[orderOnlyDeps]` value passed in via `formatted` in order for the `node` rule
to have both the correct order-only dependencies and validations.

## Dependency Collapsing Rules

When passing attached dependencies to `in`, `[implicitDeps]`, `[orderOnlyDeps]`,
or retuning attached dependencies from a `[validations]` function, we need to
decide ultimately where they are going to be put in the generated ninja build
edge - we will refer to this as **dependency collapsing**.

Dependency collapsing allows us to naively pass around paths with attached
dependencies and have the obvious thing happen when generating the build edge.

For `[implicitDeps]` and `[orderOnlyDeps]` values passed to `NinjaBuilder.rule`
the following will happen when creating any build edges with this rule:

| property name     | value             | final ninja entry |
| ----------------- | ----------------- | ----------------- |
| `[implicitDeps]`  | `file`            | implicit          |
| `[implicitDeps]`  | `[orderOnlyDeps]` | order-only        |
| `[implicitDeps]`  | `[validations]`   | validations       |
| `[orderOnlyDeps]` | `file`            | order-only        |
| `[orderOnlyDeps]` | `[orderOnlyDeps]` | order-only        |
| `[orderOnlyDeps]` | `[validations]`   | ignored¹          |

For values passed to `in`, `[implicitDeps]`, and `[orderOnlyDeps]` when creating
build edges, or values returned from functions passed to `[validations]` will be
collapsed as follows:

| property name     | value             | final dependency  |
| ----------------- | ----------------- | ----------------- |
| `in`              | `file`            | in                |
| `in`              | `[orderOnlyDeps]` | order-only        |
| `in`              | `[validations]`   | validations       |
| `[implicitDeps]`  | `file`            | implicit          |
| `[implicitDeps]`  | `[orderOnlyDeps]` | order-only        |
| `[implicitDeps]`  | `[validations]`   | validations       |
| `[orderOnlyDeps]` | `file`            | order-only        |
| `[orderOnlyDeps]` | `[orderOnlyDeps]` | order-only        |
| `[orderOnlyDeps]` | `[validations]`   | ignored¹          |
| `[validations]`   | `file`            | validations       |
| `[validations]`   | `[orderOnlyDeps]` | ignored²          |
| `[validations]`   | `[validations]`   | validations       |

¹ order-only dependencies are designed to bootstrap a rule so that it can then
pick up a subset of these as its true dependencies, e.g. using `dyndeps`.
Requiring validation on all order-only dependencies whenever this particular
edge is executed would create unnecessary work.  In this case the validations
should be on the individual build edges that produce the order-only
dependencies.

² order-only dependencies returned when generating valiations would indicate
that this validation has an order-only dependency on something. It wouldn't be
correct to lift this order-only dependency to the current build edge because
that would not apply to the validation edge. In this case the order-only
dependency needs to be supplied when creating the build edge that is then
returned as a validation.
