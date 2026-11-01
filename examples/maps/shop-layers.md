# Shop platform

```mermaid
flowchart TB
  subgraph people [People]
    shopper["Shopper"]
    support["Support agent"]
    merchant["Merchant"]
  end

  subgraph channels [Channels]
    web["Web shop"]
    mobile["Mobile app"]
    backoffice["Back office"]
  end

  subgraph edge [Edge]
    auth["Sign-in service"]
    cdn["CDN"]
    gateway["API gateway"]
  end

  subgraph services [Services]
    orders["Orders service"]
    cart["Cart service"]
    catalogue["Catalogue service"]
    payments["Payments service"]
    stock["Stock service"]
    notify["Notification service"]
  end

  subgraph messaging [Messaging]
    bus[["Event bus"]]
    retry[["Retry queue"]]
  end

  subgraph data [Data]
    orderdb[("Orders database")]
    stockdb[("Stock database")]
    cache[("Cart cache")]
    catdb[("Catalogue database")]
  end

  subgraph outside [Outside systems]
    courier["Courier"]
    psp["Card provider"]
    mail["Email provider"]
  end

  web -->|HTTPS| gateway
  gateway -->|places order| orders
  gateway -->|checks token| auth
  gateway -->|adds items| cart

  mobile -->|HTTPS| gateway
  web -->|pages, images| cdn
  catalogue --> catdb
  orders --> orderdb
  support -->|refunds| backoffice

  backoffice -->|HTTPS| gateway
  gateway -->|reads| catalogue
  orders e1@-->|charges| payments
  notify -->|sends email| mail

  shopper -->|browses, buys| web
  stock --> stockdb
  orders -->|reserves| stock

  backoffice -->|lists products| catalogue

  shopper -->|buys| mobile
  merchant -->|lists products| backoffice
  payments e2@-->|card charge| psp
  cart --> cache

  click orders "#orders-service-components"
  click orders "#payment-retry-ideas"
  click orders "#order-lifecycle"
  click orderdb "#orders-data"
  click web "#web-shop-features"
  click mobile "#web-shop-features"

  classDef plain stroke-width: 0
  classDef async stroke-dasharray: 6 4
  class people plain
  class shopper,support,merchant person
  class psp,mail,courier external
  class catdb,cache,orderdb,stockdb database
  class bus,retry queue
  class messaging async
  class web,mobile,backoffice channel
  class gateway,auth,cdn edge
  class e1,e2 money
  class catalogue,cart,orders,payments,stock,notify service
```

## Relations: Checkout (synchronous)

- shopper --> web : buys
- web --> gateway : place order
- gateway --> auth : checks token
- gateway --> orders : place order
- orders --> stock : reserve items
- orders --> payments : charge :::money
- payments --> psp : card charge :::money
- orders --> orderdb : save order

## Relations: Events (asynchronous)

- orders -.-> bus : order placed
- payments -.-> bus : payment taken
- bus -.-> orders : payment taken
- bus -.-> stock : order placed
- bus -.-> notify : order placed
- notify -.-> retry : failed sends :::retry
- retry e3@-.-> notify : resend :::retry
- notify --> mail : sends email
- orders -.-> courier : ship order

## Classes

- channel : ph devices : Channel
- edge : ph shield-check : Edge
- money : - : Money moves
- retry : - : Retries
- service : ph gear-six : Service
- queue : ph tray : Messaging

## Details

### <a id="web"></a>Web shop

The shop in a browser: where most orders start. Server-rendered pages with a little
script, so it works on slow phones and with scripts off.

- Pages and images come from the CDN; everything else goes through the API gateway.
- The basket lives in the cart service, so it follows the shopper to the mobile app.
- Checkout is three steps: address, delivery, payment. Guests can check out without
  an account.
- Target: a product page in under a second on a mid-range phone.

What shoppers can do is in [Web shop features](#web-shop-features).

### <a id="orders"></a>Orders service

Owns an order from the basket to the courier. It checks the basket, reserves stock,
charges the card and confirms, and tells the rest of the shop through the event bus.

- Team: Checkout
- Runs: three copies behind the API gateway

### <a id="e1"></a>Orders charges Payments

A synchronous call: the shopper waits for it.

- Times out after 10 seconds; the order is then rejected and stock released.
- Carries the order's idempotency key, so a retried call never charges twice.

### <a id="e3"></a>Retry queue resends

Failed emails come back with a growing wait: 1 minute, 10 minutes, 1 hour. After the
third try the send is dropped and logged.

## Orders service components

```mermaid
flowchart LR
  subgraph api [API]
    direction TB
    place["POST /orders"]
    status["GET /orders/:id"]
  end

  subgraph checkout [Checkout flow]
    direction TB
    validate{"Basket valid?"}
    reserve["Reserve stock"]
    charge["Charge card"]
    confirm["Confirm order"]
    reject["Reject order"]
    release["Release stock"]
  end

  subgraph events [Events]
    direction TB
    publish[["Publish: order placed"]]
    listen[["Listen: payment taken"]]
  end

  store[("Orders database")]

  place --> validate
  validate -->|yes| reserve
  validate -->|no| reject
  reserve -->|reserved| charge
  reserve -->|out of stock| reject
  charge -->|paid| confirm
  charge -->|declined| release
  release --> reject
  confirm --> store
  confirm -.-> publish
  listen -.->|mark paid| store
  status --> store

  click charge "#payment-retry-ideas"
  click store "#orders-data"
  classDef async stroke-dasharray: 6 4
  class publish,listen async
  class store database
```

## Payment retry ideas

```mermaid
mindmap
  r(("Payment retries"))
    a("When to retry")
      a1("Card provider timeout")
      a2("Soft decline")
    b("When not to")
      b1("Hard decline")
      b2("Fraud flag")
    c("How")
      c1("Backoff: 1s, 5s, 30s")
      c2("Same idempotency key")
```

## Order lifecycle

```mermaid
stateDiagram-v2
  direction LR
  [*] --> Placed
  Placed --> Validating : POST /orders
  state valid <<choice>>
  Validating --> valid
  valid --> Reserving : basket valid
  valid --> Rejected : basket invalid
  state stocked <<choice>>
  Reserving --> stocked
  stocked --> Charging : reserved
  stocked --> Rejected : out of stock
  Charging : entry / charge with the idempotency key
  state paid <<choice>>
  Charging --> paid
  paid --> Confirmed : paid
  paid --> Retrying : soft decline
  paid --> Releasing : hard decline
  Retrying --> Charging : backoff 1 s, 5 s, 30 s
  Retrying --> Releasing : third try fails
  Releasing --> Rejected : stock released
  Confirmed --> Shipped : courier collects
  Shipped --> [*]
  Rejected --> [*]
  note right of Retrying : Every try sends the same idempotency key.
```

## Details

### <a id="Charging"></a>Charging

One call to the card provider, with the order's idempotency key, so a retry can never
charge twice. When and how to retry: [Payment retry ideas](#payment-retry-ideas).

## Walks: Soft decline, then paid

- [*] --> Placed : The shopper places the order.
- Placed --> Validating : The Orders service checks the basket.
- Validating --> valid : Every item still exists at this price.
- valid --> Reserving : The Stock service holds the items.
- Reserving --> stocked : All of them are in stock.
- stocked --> Charging : The card provider is asked to charge.
- Charging --> paid : The provider answers.
- paid --> Retrying : A soft decline: the bank asks to try later.
- Retrying --> Charging : One second later, the same key again.
- Charging --> paid : The provider answers again.
- paid --> Confirmed : Paid. The order is confirmed and published.

## Orders data

```mermaid
erDiagram
  CUSTOMER["Customer"] {
    uuid id PK
    string email UK
    string name
  }
  ORDER["Order"] {
    uuid id PK
    uuid customer_id FK
    uuid billing_address_id FK
    uuid shipping_address_id FK
    string idempotency_key UK
    string status
    timestamp placed_at
  }
  ORDER_LINE["Order line"] {
    uuid id PK
    uuid order_id FK "grain"
    int line_no "grain"
    uuid product_id FK
    int quantity
    decimal price
  }
  ADDRESS["Address"] {
    uuid id PK
    string street
    string city
  }
  PRODUCT["Product"] {
    uuid id PK
    string sku UK
    string title
  }
  PAYMENT["Payment attempt"] {
    uuid id PK
    uuid order_id FK "grain"
    int attempt "grain"
    string outcome
    decimal amount
  }
  SHIPMENT["Shipment"] {
    uuid id PK
    uuid order_id FK
    string courier_ref
  }
  RESERVATION["Stock reservation"] {
    uuid id PK
    uuid order_line_id FK
    timestamp expires_at
  }
  class CUSTOMER,ADDRESS,PRODUCT master
  class ORDER,ORDER_LINE,PAYMENT,SHIPMENT,RESERVATION transaction
```

## Relations

- ORDER.customer_id order-customer@}o--|| CUSTOMER.id : placed by
- ORDER_LINE.order_id line-order@}|--|| ORDER.id : belongs to
- ORDER_LINE.product_id line-product@}o--|| PRODUCT.id : sells
- PAYMENT.order_id payment-order@}o--|| ORDER.id : pays
- SHIPMENT.order_id shipment-order@}o--|| ORDER.id : ships
- RESERVATION.order_line_id reservation-line@|o--|| ORDER_LINE.id : reserves
- ORDER.billing_address_id order-billing@}o--|| ADDRESS.id : billed to
- ORDER.shipping_address_id order-shipping@}o--|| ADDRESS.id : shipped to

## Joins: Paid amount per line

- line-order
- payment-order

## Joins: Fulfilment

- shipment-order
- order-shipping
- order-billing
- PAYMENT.order_id payment-shipment@--- SHIPMENT.order_id : attempts and shipments for the same order

## Details

### <a id="payment-shipment"></a>Equality is not a declared relationship

Payment attempts and shipments can be joined on order_id, but neither identifies the other. Multiple attempts and shipments can multiply rows. This join exists only in the Fulfilment view; it adds no schema relationship or cardinality.

## Walks: Payment to shipment | Fulfilment

- PAYMENT payment-shipment@--> SHIPMENT : Match order_id; this equality does not imply a foreign key between these tables.

## Walks: Paid amount per line | Paid amount per line

- ORDER_LINE line-order@--> ORDER : Each line joins its order on order_id.
- ORDER payment-order@--> PAYMENT : An order has one payment attempt per try, so a retried order's lines appear once per attempt. Filter to outcome = paid before summing.

## Web shop features

```mermaid
mindmap
  r(("Web shop"))
    find("Find products")
      ::icon(ph magnifying-glass)
      f1("Search with typo tolerance")
      f2("Filter by size, colour, price")
      f3("Browse categories")
      f4("Recently viewed")
    buy("Buy")
      ::icon(ph shopping-cart)
      b1("Basket kept across devices")
      b2("Guest checkout")
      b3("Saved cards")
      b4("Gift cards and codes")
    track("After buying")
      ::icon(ph package)
      t1("Order status")
      t2("Courier tracking")
      t3("Returns and refunds")
    account("Account")
      ::icon(ph user)
      a1("Sign in with email or passkey")
      a2("Addresses")
      a3("Wish list")
      a4("Email preferences")
```


## Checkout

```mermaid
sequenceDiagram
  actor shopper as Shopper
  participant web as Web shop
  participant gateway as API gateway
  participant auth as Sign-in service
  participant orders as Orders service
  participant stock as Stock service
  participant payments as Payments service
  participant psp as Card provider
  participant orderdb as Orders database
  shopper->>web: Buy
  %% id: m-post
  web->>gateway: POST /orders
  %% id: m-token
  gateway->>auth: check token
  auth-->>gateway: ok
  gateway->>orders: place order
  %% id: m-validate
  orders->>orders: validate basket
  par reserve and charge at the same time
    orders->>stock: reserve items
  and
    %% id: m-charge
    orders->>payments: charge
  end
  loop up to 3 tries on a timeout
    payments->>psp: card charge
  end
  psp-->>payments: approved
  payments-->>orders: paid
  stock-->>orders: reserved
  orders->>orderdb: save order
  orders-->>gateway: 201 Created
  gateway-->>web: order page
  Note over web: The shopper sees the order number
```

## Plays over

- #shop-platform : Checkout (synchronous)

## Details

### <a id="m-post"></a>POST /orders

The browser posts the basket id and the chosen address and delivery slot. It carries an
idempotency key made from the basket id, so a double click places one order.

### <a id="m-token"></a>Check token

The gateway checks the signed token against the sign-in service's keys, cached for five
minutes. Guests get a short-lived guest token.

### <a id="m-validate"></a>Validate basket

Prices and stock levels are read again; a changed price stops checkout and shows the new
total.

### <a id="m-charge"></a>Charge

Synchronous: the shopper waits. Times out after 10 seconds; the order is then rejected
and stock released.
