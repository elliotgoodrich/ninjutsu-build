import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";
import { open, logDependency } from "../lib/file.cjs";

export async function initialize(out: string): Promise<void> {
  open(out);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (!isBuiltin(url)) {
    logDependency(fileURLToPath(url));
  }
  return nextLoad(url, context);
}
