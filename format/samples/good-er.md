# Sample

```mermaid
erDiagram
  CUSTOMER ||--o{ ORDER : places
  ORDER ||--|{ LINE : holds
  PRODUCT |o..o{ LINE : "sold as"
  ORDER["**Order**<br>_header_"] {
    int id PK
    int customer_id FK "grain"
    string note "free **text**, _any_<br>length"
    date? shipped_on
  }
  LINE:::fact
  classDef big stroke-width:3px
```
