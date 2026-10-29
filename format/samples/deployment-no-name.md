<!-- expect: deployment-no-name -->
# Sample

```mermaid
flowchart LR
  a --> b
```

## Deployment:

```mermaid
flowchart LR
  subgraph k8s [Cluster]
    a
    b
  end
```
