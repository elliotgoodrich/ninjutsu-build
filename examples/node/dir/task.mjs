import cjs from "./valueFromMJS.cjs";
import mjs from "./valueFromMJS.mjs";

export function mjsTask() {
    console.log("MJS Running " + cjs);
    console.log("MJS Running " + mjs);
}