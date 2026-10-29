# Why checkout is slow

```mermaid
flowchart LR
  customer(["Customer"])
  subgraph shop [Shop system]
    ui["Storefront"]
    gw["Gateway"]
    subgraph orders [Orders service]
      ord["Order handler"]
      stock["Stock check"]
    end
    subgraph pay [Payments]
      payh["Payment handler"]
      fraud["Fraud check"]
    end
    db[("Orders database")]
  end
  psp(["Card provider"])

  customer --> ui
  ui e1@--> gw
  gw e2@-->|order| ord
  gw e3@-->|stock| stock
  ord e4@-->|charge| payh
  ord e5@-->|score| fraud
  payh e6@-->|card token| psp
  stock e7@-->|stock levels| db
  ord e8@-->|order rows| db

  class customer person
  class psp external
  class db database
```

## Relations: Retries

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

### <a id="shop"></a>Shop system

An investigation in progress: why checkout takes eight seconds. Each box and arrow
carries a trust mark: verified (read in the code or seen in a trace), inferred
(reasoned from what was read), hypothesis (a guess to test next), unsourced (heard,
not traced to anything).

### <a id="fraud"></a>Fraud check

Suspect: it calls out to a scoring service on every order. Not yet seen in a trace.

### <a id="e5"></a>Order handler scores the order

Hypothesis: the order handler waits for the fraud score before charging. If so, the
two calls run one after the other, not side by side.

### <a id="e6"></a>Card token to the provider

Someone said the provider is slow at peak. Nobody has traced it.
