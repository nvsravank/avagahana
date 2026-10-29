<!-- expect: state-mark-unknown -->
# Sample

```mermaid
stateDiagram-v2
  state h <<history>>
  [*] --> a
  a --> h
  h --> [*]
```
