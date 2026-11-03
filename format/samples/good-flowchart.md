# Sample

```mermaid
flowchart LR
  subgraph app [App]
    a["Web"]
    b[("Store")]
  end
  u(["User"])
  u e1@--> a
  a e2@-->|writes| b
  class u person
  class e2 money
  classDef money stroke-dasharray: 4 2
```

## Details

### <a id="e1"></a>e1

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="r1"></a>r1

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="a"></a>a

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.



## Perspective: Reads

- b r1@--> a : rows

## Node icons

- a : verified
- e1 : inferred
- r1 : unsourced

## Classes

- money : - : Payments

## Deployment: Prod, Test

```mermaid
flowchart LR
  subgraph k8s [Cluster]
    app
  end
```
