const Module: NodeRequire = require("module");
import { dirname } from "node:path";
import { logDependency } from "./file.cjs";

const r: RequireResolve = Module.prototype.require;

Module.prototype.require = function (id: string): string {
  const paths = require.resolve.paths(id);
  // If `paths` is null then this is a core module (e.g. http or fs)
  if (paths !== null) {
    const _prepareStackTrace = Error.prepareStackTrace;
    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const err = new Error();
      //@ts-expect-error `err.stack` is lazily generated when accessed
      const paths = [dirname(err.stack[2].getFileName())];
      logDependency(require.resolve(id, { paths }));
    } finally {
      Error.prepareStackTrace = _prepareStackTrace;
    }
  }
  return r.call(this, id);
};
