const Module: NodeRequire = require("node:module");
import { addDependency } from "./depfile.cjs";

const r: RequireResolve = Module.prototype.require;

Module.prototype.require = function (this: NodeModule, id: string): string {
  const paths = require.resolve.paths(id);
  // If `paths` is null then this is a core module (e.g. http or fs)
  if (paths !== null) {
    try {
      addDependency(require.resolve(id, { paths: [this.path] }));
    } catch (e) {
      // If the module cannot be found then swallow the exception and
      // delegate to default behavior when calling `require` below.
      // Note that our `require` function is also called for
      // `hookRequire.js` as of Node v24 and `require.resolve` throws
      // an exception when trying to resolve `./hookRequire.js` from
      // itself.
    }
  }
  return r.call(this, id);
};
