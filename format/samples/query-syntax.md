<!-- expect: query-syntax -->
# Unknown SQL scope

```mermaid
flowchart LR
  sources["Sources"]
  result["Result"]
  sources --> result
```

## Query: Missing alias

#### Query options
- Schema: #tables
- Into: result
- Sources: sources

```sql
SELECT missing.id FROM A a
```

## Tables

```mermaid
erDiagram
  A {
    int id PK
  }
```
