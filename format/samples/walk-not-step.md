<!-- expect: walk-not-step -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Walks: Backwards
- b --> a : no such transition
