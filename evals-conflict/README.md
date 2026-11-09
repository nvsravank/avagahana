# Competing-skill evals

Requests another installed skill also claims. Only C4 for now: `solution-architect/` is a
stand-in for a kit's architect skill ("MUST use ... C4 or architecture diagrams").
Its steps name their own output (C4-PlantUML in `architecture.puml`), as a kit skill
with a set output does. `c4-with-architect` passes when the architect loads and writes
that file, and no Avagahana skill loads: Avagahana must not take over a request another
skill owns. The same request without the competitor is `evals/c4-alone`.

`claude plugin eval` loads only the plugin under test, so `scripts/eval_conflict.sh`
copies the plugin to a temporary folder, adds the stand-in to its `skills/`, and runs
these cases there. The stand-in is then listed as `avagahana:solution-architect`.

    scripts/eval_conflict.sh            each case, three runs
    scripts/eval_conflict.sh --runs 1
