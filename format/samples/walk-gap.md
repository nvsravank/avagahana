<!-- expect: walk-gap -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  a --> b : go
  b --> [*]
```

## Walks: Jumps
- [*] --> a : start
- b --> [*] : not where it was
