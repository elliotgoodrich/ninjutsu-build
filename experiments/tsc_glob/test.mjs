import { globSync } from "node:fs";
import { globSync } from "glob";

globSync("../tsc_glob/*.json").map(console.log);
