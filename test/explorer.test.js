import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { explore, ModelError, validateModel } from "../src/explorer.js";
import { htmlReport, humanSummary } from "../src/report.js";

async function fixture(name) {
  return JSON.parse(await readFile(new URL(`../examples/${name}`, import.meta.url), "utf8"));
}

test("lost update produces replayable terminal failures", async () => {
  const result = explore(await fixture("lost-update.json"));
  assert.equal(result.status, "unsafe");
  assert.ok(result.metrics.statesExplored > 20);
  assert.ok(result.metrics.uniqueOutcomes >= 3);
  assert.ok(result.issues.some((issue) => issue.kind === "terminal-expectation"));
  const failure = result.issues.find((issue) => issue.id === "all-stock-reserved");
  assert.equal(failure.state.shared.stock, 1);
  assert.equal(failure.trace.length, 8);
});

test("one lock makes the reservation model safe", async () => {
  const result = explore(await fixture("locked-reservation.json"));
  assert.equal(result.status, "safe");
  assert.equal(result.metrics.issues, 0);
  assert.equal(result.metrics.uniqueOutcomes, 1);
  assert.deepEqual(result.outcomes[0].shared, { stock: 0, orders: 2 });
});

test("opposite lock ordering exposes a deadlock", async () => {
  const result = explore(await fixture("lock-order-deadlock.json"));
  assert.equal(result.status, "unsafe");
  assert.ok(result.metrics.deadlocks >= 1);
  const deadlock = result.issues.find((issue) => issue.kind === "deadlock");
  assert.deepEqual(deadlock.state.locks, { "account-a": "left", "account-b": "right" });
  assert.equal(deadlock.trace.length, 4);
});

test("invariants are checked after every atomic step", () => {
  const model = {
    name: "negative write",
    initial: { value: 0 },
    actors: [{ id: "worker", steps: [{ op: "write", to: "value", value: -1 }] }],
    invariants: [{ id: "nonnegative", condition: { gte: [{ shared: "value" }, 0] } }],
  };
  const result = explore(model);
  assert.equal(result.status, "unsafe");
  assert.equal(result.issues[0].kind, "invariant");
  assert.equal(result.issues[0].trace.length, 1);
});

test("state bound makes the result inconclusive", async () => {
  const result = explore(await fixture("lost-update.json"), { maxStates: 3 });
  assert.equal(result.status, "inconclusive");
  assert.equal(result.limits.truncated, true);
  assert.equal(result.metrics.statesExplored, 3);
});

test("exploration is deterministic", async () => {
  const model = await fixture("lost-update.json");
  assert.deepEqual(explore(model), explore(model));
});

test("invalid models fail with a specific input error", () => {
  assert.throws(
    () => validateModel({ name: "bad", initial: { x: 0 }, actors: [{ id: "a", steps: [{ op: "read", from: "missing", into: "x" }] }] }),
    (error) => error instanceof ModelError && /unknown shared/.test(error.message),
  );
});

test("unowned lock releases are reported", () => {
  const result = explore({
    name: "bad release",
    initial: { done: false },
    locks: ["gate"],
    actors: [{ id: "worker", steps: [{ op: "release", lock: "gate" }] }],
  });
  assert.equal(result.status, "unsafe");
  assert.equal(result.issues[0].kind, "execution-error");
});

test("human summary contains evidence counts", async () => {
  const summary = humanSummary(explore(await fixture("locked-reservation.json")));
  assert.match(summary, /Status: SAFE/);
  assert.match(summary, /Explored: \d+ states/);
});

test("HTML report embeds escaped data and interactive regions", () => {
  const result = explore({
    name: "escape <script>",
    description: "safe & local",
    initial: { value: 1 },
    actors: [{ id: "worker", steps: [{ op: "yield" }] }],
  });
  const html = htmlReport(result);
  assert.doesNotMatch(html, /escape <script>/);
  assert.match(html, /escape &lt;script&gt;/);
  assert.match(html, /\\u003cscript>/);
  assert.match(html, /id="report-data"/);
});
