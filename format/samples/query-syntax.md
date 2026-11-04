<!-- expect: query-syntax -->
# Unknown SQL scope

```mermaid
erDiagram
  A {
    int id PK
  }
```

## Query: Missing alias

```sql
SELECT missing.id FROM A a
```
