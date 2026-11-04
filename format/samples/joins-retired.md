<!-- expect: joins-retired -->
# Retired query view

```mermaid
erDiagram
 A {
  int id PK
 }
 B {
  int id PK
 }
```

## Joins: Old equality view
- A.id old@--- B.id : same id
