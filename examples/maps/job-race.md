# Job queue race

Two workers pick up the same job: both read it as pending before either marks it
running.

```mermaid
sequenceDiagram
  participant a as Worker A
  participant db as Jobs table
  participant b as Worker B
  %% id: m-read-a
  a->>db: SELECT job WHERE status = pending
  db-->>a: job 7
  b->>db: SELECT job WHERE status = pending
  db-->>b: job 7
  par both mark it
    a->>db: UPDATE job 7 SET status = running
  and
    b->>db: UPDATE job 7 SET status = running
  end
  loop each item in job 7
    a->>a: process item
    b->>b: process item
  end
  Note over a,b: Both process job 7: every item is sent twice
```

## Details

### <a id="m-read-a"></a>Read without a lock

The select takes no lock and the update does not check the status it read, so the
read and the update are not one step. `SELECT ... FOR UPDATE SKIP LOCKED` or an update
that checks `status = pending` closes the gap.
