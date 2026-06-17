# felt-trainer

React poker training app. Lesson spots are precomputed in the `poker-solver` repo and imported as `src/lesson_strategies.json`.

## Builder/checker loop

Run with `/loop <task description>`.

The loop orchestrator (opus) spawns a `builder` agent to write/fix code, then a `checker` agent to run tests. It cycles up to 5 times.

### Stop rules
| Rule | Condition | Action |
|------|-----------|--------|
| ALL GREEN | Checker reports 0 failures | Stop, report success |
| Max cycles | 5 cycles completed without green | Stop, report outstanding failures |
| Stuck | Same failure appears twice in a row | Stop, report stuck failure |
| Regression | A previously passing test now fails | Stop immediately, report regression + last builder change |

### Agent roles
- **builder** (sonnet) — edits source files only; never runs tests; never touches test files
- **checker** (sonnet) — runs `npm test --watchAll=false --ci`; never edits files; reports pass/fail in structured format
- **loop** (opus) — orchestrates; enforces stop rules; never edits files directly
