-- Billing schema (Postgres)
CREATE TABLE customers (
  id          bigint PRIMARY KEY,
  name        text NOT NULL,
  email       text UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id          bigint PRIMARY KEY,
  sku         text NOT NULL UNIQUE,
  name        text NOT NULL,
  unit_price  numeric(10,2) NOT NULL
);

CREATE TABLE invoices (
  id           bigint PRIMARY KEY,
  customer_id  bigint NOT NULL REFERENCES customers(id),
  issued_on    date NOT NULL,
  due_on       date NOT NULL,
  status       text NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  total        numeric(12,2) NOT NULL
);

CREATE TABLE invoice_lines (
  invoice_id  bigint NOT NULL REFERENCES invoices(id),
  line_no     int NOT NULL,
  product_id  bigint NOT NULL REFERENCES products(id),
  quantity    int NOT NULL CHECK (quantity > 0),
  amount      numeric(12,2) NOT NULL,
  PRIMARY KEY (invoice_id, line_no)
);

CREATE TABLE payments (
  id          bigint PRIMARY KEY,
  invoice_id  bigint NOT NULL REFERENCES invoices(id),
  paid_on     date NOT NULL,
  amount      numeric(12,2) NOT NULL,
  method      text NOT NULL
);
