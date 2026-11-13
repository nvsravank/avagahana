<!-- Avagahana map: change it with the illuminate-concept skill -->

# Order fulfilment lanes

```mermaid
flowchart LR
  order([Place order])
  stock{In stock?}
  pay[Take payment]
  refund[Refund]
  pack[Pack box]
  label[Print label]
  ship[Hand to courier]
  track[Get tracking email]
  order --> stock
  stock -->|yes| pay
  stock -->|no| refund
  pay --> pack
  pack --> label
  label --> ship
  ship --> track
  class order,track person
```

## Lanes

### Rows
- customer : Customer
- shop : Shop
- warehouse : Warehouse
- finance : Finance

### Columns
- ask : Request
- check : Approve
- make : Prepare
- send : Deliver

### Parent rows
- company : Our company : ops, finance
- ops : Operations : shop, warehouse

### Parent columns
- after : After the order : approval, fulfil
- approval : Approval : check
- fulfil : Fulfilment : make, send

### Placement
- order : customer : ask
- stock : shop : check
- pay, refund : finance : check
- pack, label : warehouse : make
- ship : warehouse : send
- track : customer : send

## Perspective: Money

- stock --> pay : yes
- stock --> refund : no
- pay --> pack

## Details

### <a id="stock"></a>In stock?

The shop checks stock before any money moves, so a refund only happens when the
item is gone.
