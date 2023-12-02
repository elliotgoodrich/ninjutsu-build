const cjs = require("./valueFromCJS.cjs");

exports.cjsTask = () => {
    console.log("CJS Running " + cjs);
    console.log("MJS Not Running");
}