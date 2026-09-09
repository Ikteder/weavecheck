#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { explore, ModelError } from "./explorer.js";
import { htmlReport, humanSummary } from "./report.js";

function usage() {
  return `Usage: weavecheck <model.json> [--max-states N] [--json FILE] [--html FILE]

Exit codes: 0 safe, 1 unsafe or inconclusive, 2 invalid input.`;
}

function parseArgs(argv) {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return { help: true };
  const args = { model: argv[0], maxStates: 100000 };
  for (let index = 1; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!["--max-states", "--json", "--html"].includes(flag) || value === undefined) throw new ModelError(`invalid argument '${flag}'`);
    if (flag === "--max-states") args.maxStates = Number(value);
    if (flag === "--json") args.json = value;
    if (flag === "--html") args.html = value;
    index += 1;
  }
  return args;
}

async function writeOutput(path, content) {
  const target = resolve(path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content, "utf8");
  return target;
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exitCode = 0;
  } else {
    const model = JSON.parse(await readFile(resolve(args.model), "utf8"));
    const result = explore(model, { maxStates: args.maxStates });
    if (args.json) await writeOutput(args.json, `${JSON.stringify(result, null, 2)}\n`);
    if (args.html) await writeOutput(args.html, htmlReport(result));
    console.log(humanSummary(result));
    process.exitCode = result.status === "safe" ? 0 : 1;
  }
} catch (error) {
  const message = error instanceof SyntaxError ? `invalid JSON: ${error.message}` : error.message;
  console.error(`WeaveCheck input error: ${message}`);
  console.error(usage());
  process.exitCode = 2;
}
