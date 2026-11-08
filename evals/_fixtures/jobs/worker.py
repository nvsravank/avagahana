"""Order-email worker: takes messages off the queue and sends the email."""
import time
import queue_client
import mailer
import pager

BACKOFF = [5, 30, 120]   # seconds to wait after each failed connect


def run():
    while True:
        conn = connect()
        if conn is None:
            continue
        msg = conn.receive(timeout=20)
        if msg is None:
            continue
        try:
            mailer.send(msg.body)
            conn.ack(msg)
        except mailer.TemporaryError:
            conn.nack(msg, requeue=True)   # another worker tries it later


def connect():
    for attempt, wait in enumerate(BACKOFF, start=1):
        try:
            return queue_client.connect()
        except queue_client.Unavailable:
            if attempt == len(BACKOFF):
                pager.alert("order-email worker: queue down after 3 tries")
                time.sleep(wait)
                return None
            time.sleep(wait)
