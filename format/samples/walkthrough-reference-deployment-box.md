<!-- expect: walkthrough-reference -->
# Example

```mermaid
flowchart LR
  web["Web"] --> db["Database"]
```

## Deployment: Production

```mermaid
flowchart TB
  subgraph prodhost [Server host]
    web
    db
  end
```

## Deployment: Development

```mermaid
flowchart TB
  subgraph laptop [Laptop]
    web
    db
  end
```

## Details

### <a id="prodhost"></a>Server host

Where production runs.

### <a id="laptop"></a>Laptop

Where a developer runs it.

## Walkthrough: Where it runs

What the sample is: two environments of one small app. For a new joiner.

### Deployment: Production

One host runs both.

#### Stop options

- Notes: laptop
