import { tap, type TestEvent } from "node:test/reporters";

// This is a node test reporter that uses `tap`, but is completely silent if there are no
// failures.  Otherwise it prints out everything that has happened so far.
export default async function* testReporter(
  source: AsyncGenerator<TestEvent>,
): AsyncGenerator<string, void> {
  const events = await Array.fromAsync(source);
  if (events.some((event) => event.type === "test:fail")) {
    yield* tap(
      (async function* () {
        yield* events;
      })(),
    );
  }
}
