-- Retail warehouse (star schema, Postgres). Four fact tables share the dimensions.
CREATE TABLE dim_date      (date_key int PRIMARY KEY, calendar_date date NOT NULL, fiscal_week int, fiscal_month int, fiscal_year int);
CREATE TABLE dim_product   (product_key int PRIMARY KEY, sku text UNIQUE, name text, category_key int REFERENCES dim_category(category_key), brand_key int REFERENCES dim_brand(brand_key));
CREATE TABLE dim_category  (category_key int PRIMARY KEY, name text);
CREATE TABLE dim_brand     (brand_key int PRIMARY KEY, name text);
CREATE TABLE dim_customer  (customer_key int PRIMARY KEY, email text UNIQUE, segment_key int REFERENCES dim_segment(segment_key), region_key int REFERENCES dim_region(region_key));
CREATE TABLE dim_segment   (segment_key int PRIMARY KEY, name text);
CREATE TABLE dim_region    (region_key int PRIMARY KEY, name text, country text);
CREATE TABLE dim_store     (store_key int PRIMARY KEY, name text, region_key int REFERENCES dim_region(region_key));
CREATE TABLE dim_warehouse (warehouse_key int PRIMARY KEY, name text, region_key int REFERENCES dim_region(region_key));
CREATE TABLE dim_supplier  (supplier_key int PRIMARY KEY, name text);
CREATE TABLE dim_currency  (currency_code text PRIMARY KEY, name text, minor_units int);
CREATE TABLE dim_promotion (promotion_key int PRIMARY KEY, name text, starts_on date, ends_on date);

CREATE TABLE fact_sales (
  sales_key bigint PRIMARY KEY,
  date_key int NOT NULL REFERENCES dim_date(date_key),
  product_key int NOT NULL REFERENCES dim_product(product_key),
  customer_key int NOT NULL REFERENCES dim_customer(customer_key),
  store_key int NOT NULL REFERENCES dim_store(store_key),
  promotion_key int REFERENCES dim_promotion(promotion_key),
  currency_code text NOT NULL REFERENCES dim_currency(currency_code),
  quantity int, net_amount numeric(12,2)
);
CREATE TABLE fact_returns (
  return_key bigint PRIMARY KEY,
  date_key int NOT NULL REFERENCES dim_date(date_key),
  product_key int NOT NULL REFERENCES dim_product(product_key),
  customer_key int NOT NULL REFERENCES dim_customer(customer_key),
  store_key int NOT NULL REFERENCES dim_store(store_key),
  currency_code text NOT NULL REFERENCES dim_currency(currency_code),
  quantity int, refund_amount numeric(12,2)
);
CREATE TABLE fact_inventory (
  inventory_key bigint PRIMARY KEY,
  date_key int NOT NULL REFERENCES dim_date(date_key),
  product_key int NOT NULL REFERENCES dim_product(product_key),
  warehouse_key int NOT NULL REFERENCES dim_warehouse(warehouse_key),
  on_hand int, on_order int
);
CREATE TABLE fact_purchases (
  purchase_key bigint PRIMARY KEY,
  date_key int NOT NULL REFERENCES dim_date(date_key),
  product_key int NOT NULL REFERENCES dim_product(product_key),
  supplier_key int NOT NULL REFERENCES dim_supplier(supplier_key),
  warehouse_key int NOT NULL REFERENCES dim_warehouse(warehouse_key),
  currency_code text NOT NULL REFERENCES dim_currency(currency_code),
  quantity int, cost numeric(12,2)
);
