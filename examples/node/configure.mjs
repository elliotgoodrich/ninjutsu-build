import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { writeFileSync } from "fs";

const ninja = new NinjaBuilder({
    builddir: "mybuilddir",
});

const node = makeNodeRule(ninja);
node({
    in: "entry.mjs",
    out: "$builddir/esmodule.txt",
});
node({
    in: "entry.cjs",
    out: "$builddir/commonjs.txt",
});

writeFileSync("build.ninja", ninja.output);

