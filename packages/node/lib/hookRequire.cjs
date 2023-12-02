const Module = require("module");
const { dirname } = require("node:path");
const { logDependency } = require("./file.cjs");

const r = Module.prototype.require;

Module.prototype.require = function (id) {
  const paths = require.resolve.paths(id);
  // If `paths` is null then this is a core module (e.g. http or fs)
  if (paths !== null) {
    let _prepareStackTrace = Error.prepareStackTrace;
    try {
      Error.prepareStackTrace = (_, stack) => stack;
      const err = new Error();
      const paths = [dirname(err.stack[2].getFileName())];
      logDependency(require.resolve(id, { paths }));
    } catch (err) {
    } finally {
      Error.prepareStackTrace = _prepareStackTrace;
    }
  }
  return r.call(this, id);
};
