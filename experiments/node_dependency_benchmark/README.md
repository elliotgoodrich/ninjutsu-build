Benchmarks three strategies for writing ninja depfiles from `packages/node/src/depfile.cts`:

- **sync** — `writeFileSync` on every `addDependency` call (current behaviour)
- **onExit** — buffer in memory, flush with `writeFileSync` in a `process.on('exit')` handler
- **onBeforeExit** — buffer in memory, flush with async `write` in a `process.on('beforeExit')` handler

```
node run.mjs
```

`benchmark.mjs` can also be run directly for a single measurement:

```
node benchmark.mjs --type <sync|onExit|onBeforeExit> --count <n>
```
