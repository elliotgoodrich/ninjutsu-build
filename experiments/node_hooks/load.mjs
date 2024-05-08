import { threadId } from 'node:worker_threads';
console.log(`${threadId}: load.mjs`);

export async function initialize() {
  console.log(`${threadId}: initialize()`);
}

export async function load(
  url,
  context,
  nextLoad,
) {
  console.log(`${threadId}: load(${url})`);
  return nextLoad(url, context);
}
