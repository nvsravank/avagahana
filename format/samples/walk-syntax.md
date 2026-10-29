<!-- expect: walk-syntax -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Walks: Bad
- a -> b
