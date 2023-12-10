import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeNodeRule } from "@ninjutsu-build/node";
import { makeTSCRule } from "@ninjutsu-build/tsc";
import { writeFileSync } from "fs";

const ninja = new NinjaBuilder({
    builddir: "mybuilddir",
});

const tsc = makeTSCRule(ninja);
const [index] = tsc({
    in: ["src/index.ts"],
    dyndepName: "$builddir/tsdeps.txt",
    compilerOptions: {
        target: "ES2021",
        lib: ["ES2021"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        //declaration: true,
        isolatedModules: true,
        outDir: "$builddir/dist",
        esModuleInterop: true,
        forceConsistentCasingInFileNames: true,
        strict: true,
        noImplicitAny: true,
        strictNullChecks: true,
        strictFunctionTypes: true,
        strictBindCallApply: true,
        strictPropertyInitialization: true,
        noImplicitThis: true,
        useUnknownInCatchVariables: true,
        alwaysStrict: true,
        noUnusedLocals: true,
        noUnusedParameters: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        skipDefaultLibCheck: true,
        skipLibCheck: true,
   }
});

const node = makeNodeRule(ninja);
node({
    in: index,
    out: "$builddir/greeting.txt",
});

writeFileSync("build.ninja", ninja.output);

