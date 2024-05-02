import { register } from 'node:module';
import { MessageChannel } from 'node:worker_threads';

// This example showcases how a message channel can be used to communicate
// between the main (application) thread and the hooks running on the hooks
// thread, by sending `port2` to the `initialize` hook.
const { port1, port2 } = new MessageChannel();

port1.on('message', (msg) => { console.log(msg); });

register('./path-to-my-hooks.mjs', {
  parentURL: import.meta.url,
  data: { port: port2 },
  transferList: [port2],
});