<!-- expect: lanes-parent-twice -->
# Sample

```mermaid
flowchart LR
  a[Ask] --> b[Check]
  b --> c[Ship]
```

## Lanes

### Rows
- x : X
- y : Y

### Parent rows
- one : One : x, y
- two : Two : y

### Placement
- a : x
- b, c : y
