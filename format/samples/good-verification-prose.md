# Reasoned design

```mermaid
flowchart LR
  cache[Cache] tentative@--> store[Store]
```

## Node icons

- cache : inferred
- tentative : hypothesis

## Details

### <a id="cache"></a>Cache

#### Evidence

Inferred from the documented request path; the cache implementation has not been inspected.

### <a id="tentative"></a>Tentative lookup

#### Evidence

A proposed lookup to test in a trace. This example does not claim observed behaviour.
