# Orders compared

```mermaid
erDiagram
  ORDER["**Order**<br>_header_"] {
    int id PK
    int customer_id FK "grain"
    decimal amount UK
    string status "open, **paid**,<br>_shipped_"
    date? shipped_on
  }
  CUSTOMER {
    int id PK
    int tenant_id
  }
  WIDE {
    int id PK
    int c1
    int c2
    int c3
    int c4
    int c5
    int c6
    int c7
    int c8
    int c9
    int c10
    int c11
    int c12
    int c13
    int c14
    string c15
  }
  ORDER }o--|| WIDE : "wide"
```

## Relations
- ORDER.customer_id oc@}|--|| CUSTOMER.id : placed by

## Renames
- ORDER.customer_id was cust_id
