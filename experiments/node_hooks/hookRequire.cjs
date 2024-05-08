const { threadId } = require('node:worker_threads');
const Module = require("module");
console.log(`${threadId}: hookRequire.cjs`);
const r = Module.prototype.require;
Module.prototype.require = function(id) {
    //console.log(this);
    console.log(`${threadId}: require(${id})`);
    return r.call(this, id);
};
