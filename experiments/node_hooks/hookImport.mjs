import { threadId } from 'node:worker_threads';
import { register } from 'node:module';

console.log(`${threadId}: hookImport.mjs`);

register('./load.mjs', import.meta.url);
