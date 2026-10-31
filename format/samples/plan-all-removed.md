<!-- expect: plan-all-removed -->
# Plan all removed

```mermaid
flowchart LR
  subgraph old [Old cluster]
    a["Orders"]
    b["Billing"]
  end
  class a,b removed
```
