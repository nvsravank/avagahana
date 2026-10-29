<!-- expect: deployment-arrow-on-node -->
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
  end
  a --> b
```
