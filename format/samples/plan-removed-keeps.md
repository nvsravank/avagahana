<!-- expect: plan-removed-keeps -->
# Plan removed keeps

```mermaid
flowchart LR
  subgraph old [Old cluster]
    a["Orders"]
    b["Billing"]
  end
  class old,a removed
```
