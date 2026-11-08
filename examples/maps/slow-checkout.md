<!-- Avagahana map: change it with the illuminate-concept skill -->

# Why checkout is slow

```mermaid
flowchart LR
  psp(["Card provider"])
  subgraph shop [Shop system]
    db[("Orders database")]
    subgraph pay [Payments]
      payh["Payment handler"]
      fraud["Fraud check"]
    end
    ui["Storefront"]
    subgraph orders [Orders service]
      stock["Stock check"]
      ord["Order handler"]
    end
    gw["Gateway"]
  end
  customer(["Customer"])

  stock e7@-->|stock levels| db
  ui e1@--> gw
  ord e8@-->|order rows| db
  customer --> ui
  payh e6@-->|card token| psp
  ord e4@-->|charge| payh
  gw e3@-->|stock| stock
  gw e2@-->|order| ord
  ord e5@-->|score| fraud

  class customer person
  class psp external
  class db database
```

## Perspective: Retries

- payh r1@-.-> psp : retry on timeout

## Node icons

- gw : verified
- ord : inferred
- fraud : hypothesis
- psp : unsourced
- e1 : verified
- e2 : inferred
- e3 : inferred
- e4 : verified
- e5 : hypothesis
- e6 : unsourced
- e7 : verified
- r1 : hypothesis

## Details


### <a id="e1"></a>e1

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="e2"></a>e2

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="e3"></a>e3

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="e4"></a>e4

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="e7"></a>e7

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="r1"></a>r1

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="psp"></a>psp

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="ord"></a>ord

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="gw"></a>gw

#### Evidence

Illustrative trust assignment in this fictional example; no external source
revision is captured for this claim.

### <a id="shop"></a>Shop system

An investigation in progress: why checkout takes eight seconds. Each box and arrow
carries a trust mark: verified (read in the code or seen in a trace), inferred
(reasoned from what was read), hypothesis (a guess to test next), unsourced (heard,
not traced to anything).

### <a id="fraud"></a>Fraud check

#### Evidence

Suspect: it calls out to a scoring service on every order. Not yet seen in a trace.

### <a id="e5"></a>Order handler scores the order

#### Evidence

Hypothesis: the order handler waits for the fraud score before charging. If so, the
two calls run one after the other, not side by side.

### <a id="e6"></a>Card token to the provider

#### Evidence

Someone said the provider is slow at peak. Nobody has traced it.
