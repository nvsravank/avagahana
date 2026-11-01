# Checkout platform, release 1.4

```mermaid
flowchart LR
  customer(["Customer"])
  subgraph edge [Edge]
    cdn["CDN"]
    waf["Web firewall"]
  end
  subgraph app [Checkout platform]
    gw["API gateway"]
    orders["Orders service"]
    pay["Payments service"]
    notify["Notifications"]
  end
  db[("Orders database")]
  vault["Secrets"]
  psp(["Card provider"])

  customer --> cdn
  cdn --> waf
  waf --> gw
  gw --> orders
  orders --> pay
  orders --> notify
  orders --> db
  pay --> vault
  pay e1@-->|card token| psp

  class customer person
  class psp external
  class db database
  click db "#orders-data"
  class vault secrets
```

## Deployment: Production

```mermaid
flowchart LR
  subgraph aws [AWS eu-west-1]
    subgraph front [CloudFront]
      edge
    end
    subgraph serverless [EKS on Fargate]
      gw
      orders
      notify
    end
    subgraph pci [PCI cluster, EC2]
      pay
    end
    subgraph rds [RDS Postgres]
      db
    end
    subgraph sm [Secrets Manager]
      vault
    end
  end
  class serverless fargate
  class pci ec2
  class front cloudfront
  class rds rds
  class sm secrets-manager
```

## Classes

- secrets : ph key : Secrets
- fargate : aws fargate : Serverless containers
- ec2 : aws ec2 : Virtual machines
- cloudfront : aws cloudfront : CDN
- rds : aws rds : Managed database
- secrets-manager : aws secrets-manager : Secrets store

## Node icons

- waf : aws waf

## Details

### <a id="app"></a>Checkout platform

Takes an order from the basket to a paid order. Release 1.4, as it runs today.

### <a id="waf"></a>Web firewall

Managed rules in front of the API gateway: common exploits, bad bots, a rate limit
per client.

### <a id="pay"></a>Payments service

Charges the card through the card provider. Card tokens are kept 30 days for refunds.

### <a id="pci"></a>PCI cluster, EC2

The only hosts in scope for PCI: hardened images, no shell access, patched monthly.

## Orders data

```mermaid
erDiagram
  CUSTOMER["Customer"] {
    int id PK
    string email UK
  }
  subgraph orders [Orders]
    ORDER["Order"] {
      int id PK
      int customer_id FK
      int total "in cents"
      int legacy_basket_id
      timestamp placed_at
    }
    ORDER_LINE["Order line"] {
      int order_id FK "grain"
      int line_no "grain"
      int product_id
      int quantity
    }
  end
  subgraph payments [Payments]
    PAYMENT["Payment"] {
      int id PK
      int order_id FK
      string card_token "kept **30 days**"
      string status
    }
  end
  CUSTOMER:::master
  class ORDER,ORDER_LINE,PAYMENT transaction
```

## Relations

- ORDER.customer_id order-customer@}o--|| CUSTOMER.id : placed by
- ORDER_LINE.order_id line-order@}|--|| ORDER.id : belongs to
- PAYMENT.order_id payment-order@|o--|| ORDER.id : pays

## Details

### <a id="PAYMENT"></a>Payment

One payment per order: a declined card fails the order.
