const ninjutsu = require("@ninjutsu-build/core");
const { cjsTask } = require("./dir/task.cjs");

console.log("CJS Tasks started");
cjsTask();
import("./dir/task.mjs").then((m) => {
    m.mjsTask();
    console.log("CJS Tasks ended");
});