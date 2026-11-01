<!-- expect: -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Scenario: Going round
- [*] --> a
- a --> b : go

## Walkthrough: Security

### Diagram: Sample

The state at its top. Watch where it goes.

### Scenario: Going round

Only the one way round.
