import { NinjaBuilder } from "@ninjutsu-build/core";
import { makeTypecheckRule } from "@ninjutsu-build/tsc";
import { writeFileSync } from "fs";

const ninja = new NinjaBuilder({
    builddir: "mybuilddir",
});

const typecheck = makeTypecheckRule(ninja);
typecheck({
    out: "$builddir/typechecked.stamp",
    in: ["src/index.ts"],
    compilerOptions: {
        target: "ES2021",
        lib: ["ES2021"],
        module: "NodeNext",
        moduleResolution: "NodeNext",
        declaration: true,
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

writeFileSync("build.ninja", ninja.output);

