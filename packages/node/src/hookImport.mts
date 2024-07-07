import { fileURLToPath } from "node:url";
import { isBuiltin } from "node:module";
import type { MessagePort } from "node:worker_threads";

let port: MessagePort;

export async function initialize(p: MessagePort): Promise<void> {
  port = p;
}

export async function load(
  url: string,
  context: unknown,
  nextLoad: (url: string, context: unknown) => Promise<unknown>,
): Promise<unknown> {
  if (!isBuiltin(url)) {
    port.postMessage(fileURLToPath(url));
  }
  return nextLoad(url, context);
}
