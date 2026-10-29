<!-- expect: deployment-out-of-step -->
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
```

## Deployment: Test

```mermaid
flowchart LR
  subgraph vm [One VM]
    a
  end
```
