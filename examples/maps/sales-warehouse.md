# Sales warehouse

Two fact tables, order lines and stock levels, share the date and product dimensions.

```mermaid
erDiagram
  ORDER_LINE }o--|| DATE : "ordered on"
  ORDER_LINE }o--|| PRODUCT : sells
  ORDER_LINE }o--|| CUSTOMER : "bought by"
  ORDER_LINE }o--|| STORE : "sold at"
  STOCK_LEVEL }o--|| DATE : "counted on"
  STOCK_LEVEL }o--|| PRODUCT : counts
  STOCK_LEVEL }o--|| WAREHOUSE : "held in"
  CUSTOMER }o--|| REGION : "lives in"
  STORE }o--|| REGION : "stands in"
  PRODUCT ||--o{ PRODUCT_TAG : "tagged by"
  TAG ||--o{ PRODUCT_TAG : tags
  ORDER_LINE["Order line"] {
    bigint order_line_key PK
    int order_id "grain"
    int line_no "grain"
    int date_key FK
    int product_key FK
    int customer_key FK
    int store_key FK
    int quantity
    decimal net_amount
    decimal discount
    decimal tax
    string currency
  }
  STOCK_LEVEL["Stock level"] {
    bigint stock_key PK
    int date_key FK "grain"
    int product_key FK "grain"
    int warehouse_key FK "grain"
    int on_hand
    int on_order
  }
  DATE["Date"] {
    int date_key PK
    date calendar_date
    int fiscal_week
    int fiscal_month
    int fiscal_year
    bool is_holiday
  }
  PRODUCT["Product"] {
    int product_key PK
    string sku UK
    string name
    string category
    string brand
  }
  CUSTOMER["Customer"] {
    int customer_key PK
    string email UK
    string segment
    int region_key FK
  }
  STORE["Store"] {
    int store_key PK
    string name
    int region_key FK
  }
  WAREHOUSE["Warehouse"] {
    int warehouse_key PK
    string name
    string city
  }
  REGION["Region"] {
    int region_key PK
    string name
    string country
  }
  PRODUCT_TAG["Product tag"] {
    int product_key PK, FK
    int tag_key PK, FK
  }
  TAG["Tag"] {
    int tag_key PK
    string label
  }
```

## Details

### <a id="ORDER_LINE"></a>Order line

One row per line of an order. Amounts are in the order's currency; the reporting
currency comes from the daily rate table, which is not drawn.

## Walks: Revenue by region

- ORDER_LINE --> CUSTOMER : Each order line joins its customer on customer_key.
- CUSTOMER --> REGION : The customer's region on region_key; sum net_amount per region.

## Walks: Sales with tags

- ORDER_LINE --> PRODUCT : Each order line joins its product on product_key.
- PRODUCT --> PRODUCT_TAG : A product has several tags, so a sum over this join counts each line once per tag.
