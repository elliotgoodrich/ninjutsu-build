import { execSync } from "node:child_process";
import { argv, exit } from "node:process";
import { isAbsolute, relative, resolve } from "node:path";
import { escapePath } from "@ninjutsu-build/core";
import ts from "typescript";

const cwd = resolve();

function convertPath(rawPath: string): string {
  const path = relative(cwd, rawPath);
  return (path && !path.startsWith("..") && !isAbsolute(path) ? path : rawPath)
    .replaceAll("\\", "/")
    .trim();
}

try {
  process.stdout.write("ninja_dyndep_version = 1\n");

  const commandLine = ts.parseCommandLine(argv.slice(2));

  // We need to set this to something, else we get a debug exception
  // in `getOutputFileNames`
  commandLine.options.configFilePath = "";

  const files = commandLine.fileNames;

  const outputs = files
    .flatMap((path: string) => ts.getOutputFileNames(commandLine, path, false))
    .map(convertPath)
    .map(escapePath);
  process.stdout.write(`build ${outputs.map(escapePath).join(" ")} `);

  const inputs = execSync(
    `npx tsc ${argv.slice(2).join(" ")} --listFiles --noEmit`,
  )
    .toString()
    .split("\n")
    .map(convertPath)
    .map(escapePath);
  process.stdout.write(" : dyndep " + (inputs.length === 0 ? "" : "| " + inputs.join(" ")));
  process.stdout.write("\n");
} catch (e) {
  console.log(`ERROR: ${e}`);
  exit(1);
}
