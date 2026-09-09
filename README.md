# WeaveCheck

WeaveCheck is a dependency-free bounded concurrency model checker for small, concrete race-condition questions. Describe shared values, actors, atomic steps, locks, invariants, and terminal expectations in JSON. WeaveCheck explores every reachable scripted interleaving within a state bound and returns a shortest replay for each distinct finding.

It is meant for design reviews, regression fixtures, teaching, and reducing a suspected concurrency bug to an inspectable model. It does not execute production threads or prove properties outside the finite model.

## What it catches

- Lost updates caused by separate reads and writes
- Invariants violated after any atomic step
- Terminal expectations that fail in some reachable outcome
- Deadlocks caused by blocked lock acquisition
- Lock releases by non-owners and locks retained at termination
- State-space truncation, reported as `INCONCLUSIVE` instead of a false pass

The included inventory example reaches four distinct terminal shared states. Some schedules leave `stock` or `orders` at `1`, even though both actors finish. Adding one lock reduces the model to one consistent outcome.

## Run it

Requirements: Node.js 20 or newer. There are no runtime dependencies.

```bash
npm run verify
node src/cli.js examples/lost-update.json \
  --json out/lost-update.json \
  --html out/lost-update.html
```

The command exits with:

- `0` when the complete bounded exploration is safe
- `1` when a finding exists or the state bound makes the result inconclusive
- `2` for invalid arguments, JSON, or model structure

Try the repaired and deadlocking examples:

```bash
node src/cli.js examples/locked-reservation.json
node src/cli.js examples/lock-order-deadlock.json
```

## Model format

Each actor is a finite list of atomic steps. A scheduler choice happens between steps, never inside one step.

```json
{
  "name": "Counter increment",
  "initial": { "count": 0 },
  "locks": [],
  "actors": [
    {
      "id": "worker-a",
      "steps": [
        { "op": "read", "from": "count", "into": "seen" },
        { "op": "write", "to": "count", "value": { "add": [{ "local": "seen" }, 1] } }
      ]
    }
  ],
  "invariants": [
    { "id": "nonnegative", "condition": { "gte": [{ "shared": "count" }, 0] } }
  ],
  "expect": {
    "terminal": [
      { "id": "one-write", "condition": { "eq": [{ "shared": "count" }, 1] } }
    ]
  }
}
```

Supported steps are `read`, `write`, `acquire`, `release`, `assert`, and `yield`. Expressions use JSON objects instead of executable code. References are `{"shared":"name"}` and `{"local":"name"}`. Operators are `add`, `sub`, `mul`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `and`, `or`, and `not`.

## Reading a result

`SAFE` means no modeled issue was reachable after the complete finite state space was explored. `UNSAFE` means at least one replayable finding was reachable. `INCONCLUSIVE` means `--max-states` stopped exploration before completion.

State deduplication compares program counters, shared values, actor-local values, and lock owners. Replays use breadth-first predecessor links, so each recorded witness is a shortest trace to its stored state. Distinct findings are grouped by kind, property ID, shared state, and lock state.

The HTML output is self-contained and makes traces expandable. It performs no network requests and embeds the same schema-versioned evidence as the JSON output.

## Verification

The test suite covers lost updates, repaired locking, deadlock, step-level invariants, state limits, deterministic exploration, invalid models, lock ownership, terminal summaries, and safe HTML data embedding.

```bash
npm run check
npm test
npm pack --dry-run
```

GitHub Actions runs the checks on Node.js 20, 22, and 24. See [the dated verification record](docs/experiments/2026-09-09-verification.md) for actual results.

## Scope and limitations

- Models are finite scripts with scalar shared values. There are no loops, dynamic actors, queues, clocks, weak-memory semantics, or real I/O.
- Each declared step is atomic. A poor step boundary can hide or invent a race.
- JavaScript number semantics apply to arithmetic.
- State growth can be exponential. The default bound is 100,000 unique states.
- `SAFE` is not a claim about production code unless the model and its abstraction have been independently justified.
- The explorer retains visited states and shortest-path metadata in memory.

## Project records

- [Approved design spec](docs/superpowers/specs/2026-09-09-weavecheck-design.md)
- [Explicit-state decision](docs/decisions/2026-09-09-explicit-state-exploration.md)
- [Working notes](docs/notes/2026-09-09.md)
- [Verification evidence](docs/experiments/2026-09-09-verification.md)
- [Dataset non-use note](docs/datasets/non-use.md)
- [Model non-use note](docs/models/non-use.md)

## License

MIT
