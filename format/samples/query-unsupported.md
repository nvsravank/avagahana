<!-- expect: query-unsupported -->
# Reader limit

```mermaid
flowchart LR
  sources["Sources"]
  result["Result"]
  sources --> result
```

## Query: Family tree

#### Query options
- Schema: #tables
- Into: result
- Sources: sources

```sql
WITH RECURSIVE tree AS (SELECT a.id FROM A a) SELECT t.id FROM tree t
```

## Tables

```mermaid
erDiagram
  A {
    int id PK
  }
```
