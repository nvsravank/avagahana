#!/usr/bin/env bash
# The eval cases' starting folder. One argument:
#   empty        nothing (the agent saves what it makes in output/)
#   repo         shop/, a tiny git repository: v1.0 (Orders charges cards itself), v1.1 (a
#                Payments service does, on main), and a branch order-events off v1.1
#                (Orders publishes events; Payments, order status and Notifications consume them)
#   map          maps/Shop/Shop platform.md, an existing architecture map
#   billing      billing/schema.sql (CREATE TABLE scripts) and billing/reports.sql
#   deploy       deploy/k8s/ (production on EKS) and deploy/staging/ (docker compose and nginx on one VM)
#   jobs         jobs/worker.py, a queue worker that backs off, alerts and requeues
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
case "${1:-empty}" in
  empty) exit 0 ;;
  map) mkdir -p maps/Shop; cp "$here/Shop platform.md" "maps/Shop/Shop platform.md"; exit 0 ;;
  deploy) cp -R "$here/deploy" deploy; exit 0 ;;
  jobs) mkdir -p jobs; cp "$here/jobs/worker.py" jobs/; exit 0 ;;
  billing) mkdir -p billing; cp "$here/billing/schema.sql" "$here/billing/reports.sql" billing/; exit 0 ;;
  repo) ;;
  *) echo "unknown fixture: $1" >&2; exit 1 ;;
esac
mkdir -p shop && cd shop
git init -q -b main
git config user.email eval@example.com; git config user.name eval
mkdir -p orders db
cat > orders/api.py <<'PY'
"""Orders API: takes an order and charges the card."""
from db.store import save_order
import stripe_client

def create_order(basket, card):
    order = save_order(basket)
    charge_card(order, card)
    return order

def charge_card(order, card):
    # calls the card provider directly, retries a decline twice
    for _ in range(3):
        if stripe_client.charge(card, order.total, key=order.id):
            return True
    return False
PY
cat > db/store.py <<'PY'
"""Postgres access for orders."""
def save_order(basket):
    ...
PY
echo "stripe" > requirements.txt
echo "# Shop" > README.md
git add -A; git commit -qm "Orders charges cards"; git tag v1.0
mkdir -p payments
cat > payments/service.py <<'PY'
"""Payments service: charges cards and records refunds."""
import stripe_client

def charge(order_id, card, amount):
    for _ in range(3):
        if stripe_client.charge(card, amount, key=order_id):
            return True
    return False
PY
cat > orders/api.py <<'PY'
"""Orders API: takes an order and asks Payments to charge it."""
from db.store import save_order
from payments.service import charge

def create_order(basket, card):
    order = save_order(basket)
    charge(order.id, card, order.total)
    return order
PY
git add -A; git commit -qm "Move card charging into a Payments service"; git tag v1.1
git checkout -qb order-events
mkdir -p events notifications
cat > events/bus.py <<'PY2'
"""Event bus client: publish an event, subscribe a handler to a topic."""
import queue_client

def publish(topic, payload):
    queue_client.send(topic, payload)

def subscribe(topic, handler):
    queue_client.listen(topic, handler)
PY2
cat > orders/api.py <<'PY2'
"""Orders API: saves the order and announces it; payment happens elsewhere."""
from db.store import save_order
from events.bus import publish

def create_order(basket, card_token):
    order = save_order(basket, status="awaiting payment")
    publish("order.placed", {"order_id": order.id, "total": order.total, "card": card_token})
    return order
PY2
git add -A; git commit -qm "Orders publishes order.placed instead of calling Payments"
cat > payments/consumer.py <<'PY2'
"""Payments listens for order.placed, charges the card, and reports the result."""
from events.bus import subscribe, publish
from payments.service import charge

def on_order_placed(event):
    ok = charge(event["order_id"], event["card"], event["total"])
    publish("payment.taken" if ok else "payment.failed", {"order_id": event["order_id"]})

subscribe("order.placed", on_order_placed)
PY2
cat > orders/status.py <<'PY2'
"""Orders listens for payment results and updates the order's status."""
from events.bus import subscribe
from db.store import update_status

subscribe("payment.taken", lambda e: update_status(e["order_id"], "paid"))
subscribe("payment.failed", lambda e: update_status(e["order_id"], "payment failed"))
PY2
cat > notifications/service.py <<'PY2'
"""Notifications emails the shopper when a payment is taken or fails."""
from events.bus import subscribe
import mailer

subscribe("payment.taken", lambda e: mailer.send_receipt(e["order_id"]))
subscribe("payment.failed", lambda e: mailer.send_payment_problem(e["order_id"]))
PY2
cat > db/store.py <<'PY2'
"""Postgres access for orders."""
def save_order(basket, status):
    ...

def update_status(order_id, status):
    ...
PY2
git add -A; git commit -qm "Payments, order status and notifications react to events"
git checkout -q main
