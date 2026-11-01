<!-- expect: er-group-direction -->
# Sample

```mermaid
erDiagram
  subgraph orders [Orders]
    direction TB
    ORDER ||--o{ ORDER_LINE : has
  end
```
