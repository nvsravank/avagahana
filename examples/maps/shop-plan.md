# Shop: payments split plan

```mermaid
flowchart LR
  psp(["Card provider"])
  customer(["Customer"])
  subgraph shop [Shop system]
    subgraph pay [Payments service]
      charge["Charge API"]
      ledger[("Payments ledger")]
      fraud["Fraud check"]
    end
    subgraph api [API]
      gw["Gateway"]
      auth["Sign-in"]
    end
    subgraph orders [Orders service]
      ord["Order handler"]
      payh["Payment handler"]
      stock["Stock check"]
    end
    db[("Orders database")]
    subgraph web [Web app]
      ui["Storefront"]
      cart["Basket page"]
    end
  end

  ui --> gw
  charge --> ledger
  cart --> gw
  gw --> ord
  ord e3@-->|charge| charge
  customer --> cart
  customer --> ui
  gw --> auth
  ord e1@--> payh
  charge e4@-->|card token| psp
  ord e5@--> db
  ord --> stock
  stock --> db
  charge --> fraud
  payh e2@--> psp

  class customer person
  class psp external
  class db,ledger database
  class pay,charge,fraud,ledger added
  class payh,e1,e2 removed
  class ord,e5 changed
  class e3,e4 added
```

## Details

### <a id="pay"></a>Payments service

A service of its own for taking payments, so the card data stays out of the orders
service. It keeps its own ledger. Its charge API, fraud check and ledger are new with it.

### <a id="payh"></a>Payment handler

Goes away: the orders service asks the payments service to charge instead.

### <a id="ord"></a>Order handler

Calls the payments service rather than its own payment handler, and saves only the
payment's id with the order.
