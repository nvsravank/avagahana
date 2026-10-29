<!-- expect: deployment-unknown-id -->
# Sample

```mermaid
flowchart LR
  a --> b
```

## Deployment: Prod

```mermaid
flowchart LR
  subgraph k8s [Cluster]
    a
    b
    ghost
  end
```
