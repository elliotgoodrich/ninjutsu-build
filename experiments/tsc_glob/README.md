This tests the speed of `tsconfig.json` `files` vs `include` properties.

Preferring `files` over `include` for performance is recommended in the
[TypeScript wiki page on performance](https://github.com/microsoft/TypeScript/wiki/Performance#specifying-files).

```
node create.mjs 10000
```

```
npx tsc --noEmit -p tsconfig.files.json
```

```
npx tsc --noEmit -p tsconfig.include.json
```

There starts being a difference after 10K files of ~1.5s on Windows (5s vs 6.5s).

```
npx tsc --showConfig -p tsconfig.include.json > tsconfig.show.json
```

A `tsconfig.json` file with both `files` and `include` takes about 5.2s. A little bit
slower than `tsconfig.files.json` but not as much as `tsconfig.include.json`.