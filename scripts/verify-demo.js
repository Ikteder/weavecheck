import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { explore } from "../src/explorer.js";
import { htmlReport, humanSummary } from "../src/report.js";

const model = JSON.parse(await readFile(new URL("../examples/lost-update.json", import.meta.url), "utf8"));
const result = explore(model);

assert.equal(result.status, "unsafe");
assert.equal(result.metrics.statesExplored, 61);
assert.equal(result.metrics.transitions, 80);
assert.equal(result.metrics.uniqueOutcomes, 4);
assert.equal(result.metrics.issues, 4);
assert.ok(result.issues.every((issue) => issue.trace.length === 8));

const outputDirectory = new URL("../out/", import.meta.url);
await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL("lost-update.json", outputDirectory), `${JSON.stringify(result, null, 2)}\n`, "utf8");
await writeFile(new URL("lost-update.html", outputDirectory), htmlReport(result), "utf8");

console.log(humanSummary(result));
console.log("Demo assertions: 6/6 passed; JSON and HTML reports generated");
