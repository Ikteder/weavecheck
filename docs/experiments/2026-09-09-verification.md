# Verification Record: 2026-09-09

Environment: Windows, Node.js 26.8.1, npm 11.6.2.

## Automated verification

| Check | Actual result |
|---|---|
| JavaScript syntax | Passed for all three source modules |
| Node test suite | 10/10 passed |
| Lost-update demo | Unsafe, 61 states, 80 transitions, 9 terminal states, 4 unique shared outcomes, 4 findings |
| Locked repair | Safe, one unique shared outcome, zero findings |
| Lock-order model | Unsafe with a reachable deadlock |
| JSON report | Generated and parsed as schema version 1 |
| HTML report | Generated as a standalone artifact with escaped embedded JSON |
| CLI exit contract | Safe `0`, unsafe `1`, truncated `1`, invalid input `2` |
| Dependency audit | 0 vulnerabilities across 1 package |
| Package dry run | 9 intended files, 11,207-byte archive, 34,578 bytes unpacked, no bundled dependencies |
| README character policy | 0 em dash matches |

Detailed fixture evidence:

| Fixture | States | Transitions | Terminal states | Outcomes | Findings |
|---|---:|---:|---:|---:|---:|
| Lost update | 61 | 80 | 9 | 4 | 4 terminal expectation failures |
| Locked reservation | 25 | 24 | 2 | 1 | 0 |
| Opposite lock order | 37 | 44 | 2 | 1 | 1 deadlock |

## Browser verification

The generated lost-update report rendered at a 1280 by 720 browser viewport with 6 metric cards, 4 finding cards, 4 outcome rows, and no document-level horizontal overflow. Expanding the first finding displayed all 8 replay steps. The safe report displayed one outcome and the zero-findings explanation. Browser console warnings and errors were zero.

The available in-app browser did not expose its viewport override capability, so a narrow visual viewport was not executed. The report includes a 520 px media query and scroll containment for tables, but that rule was not visually claimed as verified.

## CI correction

The first public matrix run `34393252361` failed because `npm run verify` invoked the intentionally unsafe CLI demo. The CLI correctly returned `1`, but the package script treated that expected result as a failed verification command. The verification path was changed to an assertion script that requires the unsafe status and exact fixture metrics while still generating both reports. The CLI exit contract was not weakened. Replacement run `34393430618` passed on Node.js 20, 22, and 24.

## Interpretation

The evidence confirms the implemented finite-state semantics and output paths for the included fixtures. It does not validate production-thread instrumentation, weak-memory behavior, or fidelity of any external system abstraction.

## Remaining verification

Narrow-viewport visual verification remains open because the local browser did not expose viewport emulation.
