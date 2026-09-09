# WeaveCheck 0.1 Design Spec

Status: approved for implementation on 2026-09-09.

## Problem

Concurrency failures are often explained with prose or nondeterministic stress tests. A reviewer needs a small tool that can enumerate the interleavings of a reduced example, expose bad reachable states, and preserve a trace that another person can replay.

## User and job

The intended user is a developer, reviewer, student, or incident investigator. They want to answer one bounded question such as: can these two read-modify-write sequences lose an update, or can this lock order deadlock?

## Product boundary

WeaveCheck consumes declarative JSON. It never imports or executes model-supplied code. It explores finite actor scripts under sequentially consistent, step-atomic semantics. It writes human, JSON, and offline HTML evidence.

The tool does not instrument production programs, claim weak-memory coverage, or infer that a reduced model is faithful to a deployed system.

## Required behavior

1. Validate names, shared references, lock references, operations, and expression structure before exploration.
2. Represent shared values, actor program counters, actor locals, and lock owners in every state key.
3. Use breadth-first traversal for deterministic shortest witnesses.
4. Detect invariant failures, terminal expectation failures, deadlocks, lock leaks, and invalid release behavior.
5. Report state-bound exhaustion as inconclusive.
6. Produce schema-versioned JSON and a self-contained responsive HTML report.
7. Include unsafe, repaired, and deadlocking example models.
8. Verify core semantics without third-party packages.

## Acceptance criteria

- The lost-update example reaches more than one terminal outcome and includes an eight-step failing replay.
- The locked reservation example reaches exactly one shared outcome with no finding.
- The opposite-order example reaches at least one deadlock whose locks are owned by different actors.
- Repeated exploration produces byte-equivalent JavaScript result objects.
- A very small state bound returns inconclusive.
- Generated HTML escapes model content and exposes findings, outcomes, metrics, and expandable traces.
- Node syntax checks, automated tests, demo generation, and package inspection pass.

## Visual direction

The report should look like a compact engineering instrument: dark navy surface, mint evidence accents, red findings, large status, dense but readable metric cards, and horizontally contained trace tables on narrow screens.
