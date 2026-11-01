<!-- expect: scenario-syntax -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Scenario: Bad
- a -> b
