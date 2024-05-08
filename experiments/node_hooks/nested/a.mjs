import aa_mjs from "./nested/aa.mjs";
import aa_cjs from "./nested/aa.cjs";
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require("./nested/bb.cjs");

export default "a.cjs";
