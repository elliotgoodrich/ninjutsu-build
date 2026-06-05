import test from "node:test";
import { strict as assert } from "node:assert";
import type { TestEvent } from "node:test/reporters";
import testReporter from "./testReporter.mjs";

async function* makeSource(events: TestEvent[]): AsyncGenerator<TestEvent> {
  for (const event of events) {
    yield event;
  }
}

async function collect(
  reporter: AsyncGenerator<string, void>,
): Promise<string[]> {
  const lines: string[] = [];
  for await (const line of reporter) {
    lines.push(line);
  }
  return lines;
}

function makePassEvent(name: string, testNumber: number): TestEvent {
  return {
    type: "test:pass",
    data: { name, nesting: 0, testNumber, details: { duration_ms: 1 } },
  };
}

function makeFailEvent(name: string, testNumber: number): TestEvent {
  return {
    type: "test:fail",
    data: {
      name,
      nesting: 0,
      testNumber,
      details: { duration_ms: 1, error: new Error("test failed") },
    },
  };
}

test("testReporter is completely silent when all tests pass", async () => {
  const output = await collect(
    testReporter(
      makeSource([makePassEvent("test 1", 1), makePassEvent("test 2", 2)]),
    ),
  );
  assert.deepEqual(output, []);
});

test("testReporter is silent for empty source", async () => {
  const output = await collect(testReporter(makeSource([])));
  assert.deepEqual(output, []);
});

test("testReporter outputs TAP when there is a failure", async () => {
  const output = await collect(
    testReporter(makeSource([makeFailEvent("failing test", 1)])),
  );
  const joined = output.join("");
  assert.ok(output.length > 0, "should produce output on failure");
  assert.ok(
    joined.includes("not ok"),
    "output should contain TAP failure line",
  );
  assert.ok(joined.includes("failing test"), "output should include test name");
});

test("testReporter includes buffered events before the failure", async () => {
  const output = await collect(
    testReporter(
      makeSource([
        makePassEvent("passing test", 1),
        makeFailEvent("failing test", 2),
      ]),
    ),
  );
  const joined = output.join("");
  assert.ok(
    joined.includes("passing test"),
    "should include buffered passing test",
  );
  assert.ok(joined.includes("failing test"), "should include failing test");
});

test("testReporter includes events after the failure", async () => {
  const output = await collect(
    testReporter(
      makeSource([
        makeFailEvent("failing test", 1),
        makePassEvent("post-failure test", 2),
      ]),
    ),
  );
  const joined = output.join("");
  assert.ok(joined.includes("failing test"), "should include failing test");
  assert.ok(
    joined.includes("post-failure test"),
    "should include post-failure test",
  );
});
