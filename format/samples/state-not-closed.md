<!-- expect: state-not-closed -->
# Sample

```mermaid
stateDiagram-v2
  [*] --> a
  state a {
    [*] --> b
    b --> [*]
  a --> [*]
```
