import { cjsTask } from "./dir/task.cjs";
import { mjsTask } from "./dir/task.mjs";
import * as _ from "../parent.mjs";
import * as __ from "node:fs";

console.log("MJS Tasks started");
cjsTask();
mjsTask();
console.log("MJS Tasks ended");