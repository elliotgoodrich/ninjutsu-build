import { tap, type TestEvent } from "node:test/reporters";

// This is a node test reporter that uses `tap`, but is completely silent if there are no
// failures.  Otherwise it prints out everything that has happened so far.
export default async function* testReporter(
  source: AsyncGenerator<TestEvent>,
): AsyncGenerator<string, void> {
  let buffer: string[] = [];
  let hasFailure = false;
  for await (const event of source) {
    if (event.type === "test:pass") {
      continue;
    }
    if (event.type === "test:fail") {
      hasFailure = true;
      for (const line of buffer) {
        yield line;
      }
      buffer = [];
    }
    let firstLine = true;

    // This is slightly hacky to inject our event like this as it means we need
    // to call `tap` repeatedly and therefore need to constantly strip off the
    // first line.  A better way will be to write an `AsyncGenerator` adapter that
    // can spy on the events emitted to `tap` and tell us when we should dump
    // everything that we've buffered.
    const singleSource = async function* () {
      yield event;
    };
    for await (const line of tap(singleSource())) {
      // Skip the first line which is always `TAP version N`.
      if (!firstLine) {
        if (hasFailure) {
          yield line;
        } else {
          buffer.push(line);
        }
      }

      firstLine = false;
    }
  }
}
