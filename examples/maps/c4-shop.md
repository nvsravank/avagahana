# Shop system

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
    end
    subgraph pay [Payments]
      payh["Payment handler"]
      fraud["Fraud check"]
    end
    db[("Orders database")]
    queue[["Event queue"]]
  end
  psp(["Card provider"])

  customer --> ui
  customer --> cart
  ui --> gw
  cart --> gw
  gw --> auth
  gw --> ord
  ord --> stock
  ord --> payh
  payh --> fraud
  payh --> psp
  ord --> db
  stock --> db

  class customer person
  class psp external
  class db database
  class queue queue
  class web web-app
  class api api-gateway
  class orders,pay business-service
```

## Perspective: Data flow

- customer --> cart : basket
- cart --> gw : order
- gw --> ord : order
- ord --> db : order rows
- db --> stock : stock levels
- payh --> psp : card token
- psp --> payh : payment result

## Perspective: Events

- ord -.-> queue : order placed
- queue -.-> payh : charge requested
- payh -.-> queue : payment taken
- queue -.-> ord : mark paid
- queue -.-> ui : order status

## Deployment: Production

```mermaid
flowchart LR
  subgraph aws [AWS us-east-1]
    subgraph eks [EKS cluster]
      web
      api
      orders
    end
    subgraph pci [PCI cluster]
      pay
    end
    subgraph rds [RDS Postgres]
      db
    end
    subgraph mq [Amazon MQ]
      queue
    end
  end
  snap[("Nightly snapshots, us-west-2")]
  rds -.->|copy| snap
```

## Deployment: Staging, Test

```mermaid
flowchart LR
  subgraph stg [One small cluster]
    web
    api
    orders
    pay
    db
    queue
  end
```

## Classes

- web-app : ph browser : Web app
- api-gateway : ph door-open : API gateway
- business-service : ph gear-six : Business service
- queue : ph tray : Message queue

## Details

### <a id="shop"></a>Shop system

An online shop, as a C4 container diagram. Three views: calls (the arrows in the
diagram), data flow and events. Open a container to see its components. Production,
Staging and Test show where the containers run.

### <a id="queue"></a>Event queue

Messages between services, so a slow card provider never holds up an order.

### <a id="eks"></a>EKS cluster

Three nodes across two zones. The services scale on CPU.
