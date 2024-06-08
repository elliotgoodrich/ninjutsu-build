import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path/posix";

const limit = process.argv[2] ?? 100;

rmSync("src", { recursive: true, force: true });

let entry = "";
for (let i = 0; i < limit; ++i) {
    const dir = join("src", ...i.toString());
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    writeFileSync(join(dir, "file.ts"), `export const var${i} = ${i};\n`);
    entry += `import { var${i} } from "./${dir}/file.js";\n`;
}

writeFileSync("entry.ts", entry);

