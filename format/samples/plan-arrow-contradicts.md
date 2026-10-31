<!-- expect: plan-arrow-contradicts -->
# Plan arrow contradicts

```mermaid
flowchart LR
  api["API"] e1@--> db["Old database"]
  class db removed
  class e1 added
```
