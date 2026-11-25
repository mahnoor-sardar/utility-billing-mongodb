"""Several workers pay the same bill at once. Optimistic concurrency on
`version` + transactions guarantee no over-payment / double application.
Usage: python demo_concurrency.py [--workers 8] [--amount 1500]"""
import argparse, threading, uuid
from collections import Counter
from config import get_db
from payments import pay, PaymentError
from demo_transactions import fresh_bill, snapshot

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--amount", type=float, default=1500); a = ap.parse_args()
    db = get_db(); bid = fresh_bill(5830.0)
    print("bill total 5830; each of", a.workers, "workers pays", a.amount)
    results = Counter(); lock = threading.Lock(); barrier = threading.Barrier(a.workers)
    shared_key = uuid.uuid4().hex
    def worker(i):
        barrier.wait()  # start all at the same instant
        key = shared_key if i < 2 else uuid.uuid4().hex   # workers 0 and 1 send a duplicate request
        for attempt in range(5):
            try:
                pay(bid, a.amount, idempotency_key=key, actor=f"worker{i}")
                with lock: results["applied"] += 1
                return
            except PaymentError as e:
                msg = str(e)
                if "concurrently" in msg: continue      # lost the race: re-read and retry
                with lock: results[msg.split(":")[0]] += 1
                return
        with lock: results["gave up"] += 1
    ts = [threading.Thread(target=worker, args=(i,)) for i in range(a.workers)]
    [t.start() for t in ts]; [t.join() for t in ts]
    s = snapshot(bid)
    print("outcomes:", dict(results)); print("final:", s)
    total_paid = sum(p["amount"] for p in db.payments.find({"bill_id": bid}))
    print(f"sum(payments)={total_paid}  bill.amount_paid={s['bill_paid']}  consistent={abs(total_paid - s['bill_paid']) < 0.01}")
    print("never over-paid:", s["bill_paid"] <= 5830.0 + 0.01)

if __name__ == "__main__":
    main()
