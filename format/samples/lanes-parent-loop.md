<!-- expect: lanes-parent-loop -->
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
- one : One : x, two
- two : Two : y, one

### Placement
- a : x
- b, c : y
