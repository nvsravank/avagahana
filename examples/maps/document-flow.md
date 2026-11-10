<!-- Avagahana map: change it with the illuminate-concept skill -->
# Document intake

How a scanned letter becomes a filed record. The shapes are Mermaid's flowchart shapes,
written as `id@{ shape: … }`: a document, a manual input, a decision, stored data.

```mermaid
flowchart TB
  post@{ shape: docs, label: "Incoming post" }
  scan@{ shape: sl-rect, label: "Scan at the desk" }
  ocr["Read the text"]
  readable@{ shape: diamond, label: "Text readable?" }
  retype@{ shape: manual, label: "Type it in by hand" }
  wait@{ shape: delay, label: "Wait for a clerk" }
  kind@{ shape: decision, label: "Invoice or letter?" }
  ledger@{ shape: lin-cyl, label: "Accounts ledger" }
  file@{ shape: folder, label: "Correspondence" }
  record@{ shape: doc, label: "Filed record" }
  clerk@{ shape: person, label: "Clerk" }

  post --> scan --> ocr --> readable
  readable -->|no| wait --> retype --> kind
  readable -->|yes| kind
  clerk -.-> retype
  kind -->|invoice| ledger
  kind -->|letter| file
  ledger --> record
  file --> record
```
