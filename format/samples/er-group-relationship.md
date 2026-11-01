<!-- expect: er-group-relationship -->
# Sample

```mermaid
erDiagram
  subgraph orders [Orders]
    ORDER ||--o{ ORDER_LINE : has
  end
  CUSTOMER ||--o{ orders : places
```
