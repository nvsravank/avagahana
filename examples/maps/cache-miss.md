# Product cache

A product page reads through a cache. Most reads are hits and never reach the
database. This map is about the moment they are not.

```mermaid
flowchart LR
  ra(["Reader A"])
  rb(["Reader B"])
  subgraph svc [Product service]
    api["Product API"]
  end
  cache[("Cache")]
  db[("Product database")]

  ra --> api
  rb --> api
  api -->|get, set, lock| cache
  api -->|select| db

  class ra person
  class rb person
  class cache database
  class db database
```

## Details

### <a id="cache"></a>Cache

Entries live for ten minutes. A lock is an entry of its own, `lock:product:42`, set
only if absent, gone after five seconds even if its holder dies.

## When many miss at once

```mermaid
sequenceDiagram
  participant ra as Reader A
  participant rb as Reader B
  participant api as Product API
  participant cache as Cache
  participant db as Product database
  par two readers, the same moment
    ra->>api: GET /products/42
  and
    rb->>api: GET /products/42
  end
  par
    api->>cache: get product:42
  and
    api->>cache: get product:42
  end
  cache-->>api: miss, for both
  par both go to the database
    %% id: m-twice
    api->>db: select product 42
  and
    api->>db: select product 42
  end
  Note over db: Two readers, two identical queries
  db-->>api: the row, twice
  api->>cache: set product:42, twice
  api-->>ra: product
  api-->>rb: product
```

## Plays over

- #product-cache : Relations

## Details

### <a id="m-twice"></a>The same query, again

Nothing here is wrong on its own. Each reader did the sensible thing. Together, at
the moment an entry expires on a busy page, they send the database as many queries as
there are readers.

## One rebuild, the others wait

```mermaid
sequenceDiagram
  participant ra as Reader A
  participant api as Product API
  participant cache as Cache
  participant db as Product database
  ra->>api: GET /products/42
  api->>cache: get product:42
  cache-->>api: miss
  %% id: m-lock
  api->>cache: take lock:product:42, 5 s
  alt the lock is ours
    api->>db: select product 42
    db-->>api: the row
    api->>cache: set product:42, 10 min
    api->>cache: release the lock
  else another reader holds it
    loop every 50 ms, up to 1 s
      api->>cache: get product:42
    end
    cache-->>api: hit
  end
  api-->>ra: product
  Note over api,db: However many miss together, the database sees one query
```

## Plays over

- #product-cache : Relations

## Details

### <a id="m-lock"></a>Take the lock

Set only if absent, so one reader wins. The five seconds are a promise that a reader
which dies holding the lock does not hold it forever.
