<!-- expect: scenario-gap -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Scenario: Jumps
- [*] --> a : start
- b --> [*] : not where it was
