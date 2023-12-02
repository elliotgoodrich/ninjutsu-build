import { cjsTask } from "./dir/task.cjs";
import { mjsTask } from "./dir/task.mjs";
import * as _ from "../parent.mjs";

console.log("MJS Tasks started");
cjsTask();
mjsTask();
console.log("MJS Tasks ended");