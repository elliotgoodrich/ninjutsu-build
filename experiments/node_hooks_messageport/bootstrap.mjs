import { register } from 'node:module';
import { MessageChannel } from 'node:worker_threads';

const { port1, port2 } = new MessageChannel();

port1.on('message', (msg) => {
  console.log(`msg = ${msg}`);
});

register('./hooks.mjs', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
});
