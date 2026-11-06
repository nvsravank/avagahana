<!-- expect: query-legacy-format -->
# Legacy query authoring

```mermaid
erDiagram
  ORDERS {
    int id PK
  }
```

## Query: Orders

```sql
SELECT o.id FROM ORDERS o
```
