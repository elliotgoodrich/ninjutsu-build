import { fileURLToPath } from "node:url";
import { open, logDependency } from "../lib/file.cjs";

export async function initialize(out: string): Promise<void> {
  open(out);
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  logDependency(fileURLToPath(url));
  return nextLoad(url, context);
}
