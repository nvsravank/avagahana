<!-- expect: deployment-not-flowchart -->
# Sample

```mermaid
mindmap
  n1(("Centre"))
    n2("Branch")
```

## Deployment: Prod

```mermaid
flowchart LR
  subgraph k8s [Cluster]
    n2
  end
```
