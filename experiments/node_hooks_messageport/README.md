This tests out using `MessageChannel` and `MessagePort` to communicate between module hooks.

```
node --import ./bootstrap.mjs ./index.mjs
```

There is a current issue causing this to hang: https://github.com/nodejs/node/issues/52846
