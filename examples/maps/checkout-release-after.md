# Checkout platform, release 1.5

```mermaid
flowchart LR
  customer(["Customer"])
  subgraph edge [Edge]
    cdn["CDN"]
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
  cdn --> gw
  gw --> orders
  orders --> pay
  orders --> notify
  orders --> db
  pay --> vault
  orders e2@-->|db password| vault
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
      notify
    end
    subgraph vms [Orders hosts, EC2]
      orders
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
  class pci,vms ec2
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

## Details

### <a id="app"></a>Checkout platform

Takes an order from the basket to a paid order. Release 1.5: the web firewall is gone
(the CDN's own rules replace it), the orders service moves to EC2 hosts, and it reads
its database password from the secrets store itself.

### <a id="pay"></a>Payments service

Charges the card through the card provider. Card tokens are kept 90 days, so refunds
work for the whole return period.

### <a id="vms"></a>Orders hosts, EC2

Two hosts behind the gateway, moved off Fargate for steady load and cheaper long-running
work. Outside PCI scope.

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
      decimal(10,2) total "in euros"
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
      string psp_token "kept **90 days**,<br>for refunds"
      date? token_expires_on
      string status
    }
    REFUND["Refund"] {
      int id PK
      int payment_id FK
      decimal(10,2) amount
    }
  end
  CUSTOMER:::master
  class ORDER,ORDER_LINE,PAYMENT,REFUND transaction
```

## Relations

- ORDER.customer_id order-customer@}o--|| CUSTOMER.id : placed by
- ORDER_LINE.order_id line-order@}|--|| ORDER.id : belongs to
- PAYMENT.order_id payment-order@}o--|| ORDER.id : pays
- REFUND.payment_id refund-payment@}o--|| PAYMENT.id : refunds

## Renames

- PAYMENT.psp_token was card_token

## Details

### <a id="PAYMENT"></a>Payment

A declined card can be retried, so an order may have several payments. The migration:
rename the token column, add `token_expires_on` and backfill it from the payment date
plus 90 days, then turn on retries.
