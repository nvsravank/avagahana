<!-- expect: er-table-class-twice -->
# Sample

```mermaid
erDiagram
  ORDER ||--o{ ORDER_LINE : has
  ORDER:::transaction
  class ORDER master
```
