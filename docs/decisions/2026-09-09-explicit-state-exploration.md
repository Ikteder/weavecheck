# Decision: bounded explicit-state exploration

Date: 2026-09-09

## Context

A concurrency teaching and review tool could sample random schedules, execute real threads repeatedly, translate to an established model checker, or enumerate a deliberately small state model.

## Decision

Use breadth-first explicit-state exploration over declarative finite actor scripts. Deduplicate states by program counters, shared values, local values, and lock ownership. Keep one predecessor edge per state to reconstruct a shortest witness.

## Why

- Complete exploration within the bound is reproducible and easier to interpret than random stress.
- JSON operations create a clear no-code-execution boundary.
- Breadth-first predecessors make counterexamples concise.
- A dependency-free implementation is portable and inspectable.
- Reporting truncation as inconclusive prevents the bound from masquerading as proof.

## Tradeoffs

State count can grow exponentially. The sequentially consistent atomic-step model omits many real runtime behaviors. State deduplication preserves reachability but does not count the number or probability of schedules. A shortest model trace is not necessarily the easiest production reproduction.

## Rejected options

- Random schedule sampling: scalable for some cases, but a miss does not establish absence.
- Production thread stress: useful as a separate layer, but nondeterministic and hard to replay.
- A wrapper around an external checker: powerful, but would make installation and evidence format depend on another toolchain.
