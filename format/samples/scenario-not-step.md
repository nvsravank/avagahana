<!-- expect: scenario-not-step -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Scenario: Backwards
- b --> a : no such transition
