# Shop: payments split plan

```mermaid
flowchart LR
  customer(["Customer"])
  subgraph shop [Shop system]
    subgraph web [Web app]
      ui["Storefront"]
      cart["Basket page"]
    end
    subgraph api [API]
      gw["Gateway"]
      auth["Sign-in"]
    end
    subgraph orders [Orders service]
      ord["Order handler"]
      stock["Stock check"]
      payh["Payment handler"]
    end
    subgraph pay [Payments service]
      charge["Charge API"]
      fraud["Fraud check"]
      ledger[("Payments ledger")]
    end
    db[("Orders database")]
  end
  psp(["Card provider"])

  customer --> ui
  customer --> cart
  ui --> gw
  cart --> gw
  gw --> auth
  gw --> ord
  ord --> stock
  ord e1@--> payh
  payh e2@--> psp
  ord e3@-->|charge| charge
  charge --> fraud
  charge --> ledger
  charge e4@-->|card token| psp
  ord e5@--> db
  stock --> db

  class customer person
  class psp external
  class db,ledger database
  class pay added
  class payh,e1,e2 removed
  class ord,e5 changed
  class e3,e4 added
```

## Details

### <a id="pay"></a>Payments service

A service of its own for taking payments, so the card data stays out of the orders
service. It keeps its own ledger.

### <a id="payh"></a>Payment handler

Goes away: the orders service asks the payments service to charge instead.

### <a id="ord"></a>Order handler

Calls the payments service rather than its own payment handler, and saves only the
payment's id with the order.
