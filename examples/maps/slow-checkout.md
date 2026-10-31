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
