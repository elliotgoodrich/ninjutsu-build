const Module: NodeRequire = require("node:module");
import { addDependency } from "./depfile.cjs";

const r: RequireResolve = Module.prototype.require;

Module.prototype.require = function (this: NodeModule, id: string): string {
  const paths = require.resolve.paths(id);
  // If `paths` is null then this is a core module (e.g. http or fs)
  if (paths !== null) {
    addDependency(require.resolve(id, { paths: [this.path] }));
  }
  return r.call(this, id);
};
