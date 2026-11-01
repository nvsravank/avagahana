<!-- expect: scenario-twice -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Scenario: Same
- [*] --> a

## Scenario: Same
- a --> b
