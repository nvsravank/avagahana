# Worker pipeline

```mermaid
flowchart LR
  admin["Operator"]
  api["API gateway"]
  fn["Lambda"]
  subgraph col [" "]
    direction TB
    subgraph vpc [VPC subnet]
      subgraph main [Main server]
        server["Server"]
        data["Data"]
        cache["Session cache"]
      end
      queue["Queue"]
      sched["Scheduler"]
      subgraph compute [Compute nodes]
        direction TB
        w1["Worker1"]
        w2["Worker2"]
        w3["Worker3 (spot instance, may be reclaimed)"]
      end
    end
    s3["S3"]
  end
  analytics["Analytics"]
  audit["Audit log"]
  admin --> api
  api -->|REST| fn
  fn --> server
  server --> data
  server --> cache
  data --> s3
  server e1@-->|jobs| queue
  sched --> queue
  queue --> w1
  queue --> w2
  queue --> w3
  compute --> analytics
  compute -.-> audit
  class admin person
  classDef plain stroke-width: 0
  class col plain
  click server "#server-internals"
  click server "#submit-a-job"
  click w1 "#job-states"
  click compute "#job-states"
```

## Look: poster

## Node icons

- api : aws api-gateway
- fn : aws lambda verified
- s3 : aws s3
- vpc : aws private-subnet
- main : main ph lock-key
- server : aws ec2 ph gear-six verified
- data : aws rds aws elasticache
- cache : main ph lightning
- queue : aws sqs hypothesis
- sched : main ph clock
- compute : aws auto-scaling-group ph cpu
- w1 : aws ec2
- w2 : aws ec2 warning
- w3 : aws ec2
- analytics : aws category-analytics ph chart-line
- e1 : ph tray

## Details

### <a id="server"></a>Server

The API server. Takes requests from the Lambda, writes jobs to the queue and keeps
sessions in the cache.

### <a id="data"></a>Data

Postgres on RDS, with a read cache in front. Nightly exports go to S3.

### <a id="queue"></a>Queue

SQS standard queue. Not yet checked whether it is FIFO.

### <a id="main"></a>Main server

Everything that runs on the main host.

### <a id="compute"></a>Compute nodes

An auto-scaling group of workers; one is a spot instance.

### <a id="e1"></a>jobs

One message per job, with the job id and its input's S3 key.

## Server internals

```mermaid
flowchart LR
  router["Router"]
  subgraph handlers [Handlers]
    jobs["Jobs handler"]
    users["Users handler"]
  end
  db["DB client"]
  router --> jobs
  router --> users
  jobs --> db
  users --> db
```

## Node icons

- router : ph signpost
- jobs : ph queue
- db : ph database

## Submit a job

```mermaid
sequenceDiagram
  participant fn as Lambda
  participant server as Server
  participant queue as Queue
  fn->>server: POST /jobs
  server->>queue: send job
  queue-->>server: message id
  server-->>fn: 202 Accepted
```

## Job states

```mermaid
stateDiagram-v2
  [*] --> Queued
  Queued --> Running
  Running --> Done
  Running --> Failed
  Failed --> Queued : retry
  Done --> [*]
```
