export async function initialize({ port }) {
  port.postMessage('initialize');
  //port.close();
}
