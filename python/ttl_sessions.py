"""TTL demo: payment sessions expire automatically via the TTL index on
expires_at (expireAfterSeconds: 0). The TTL monitor runs about every 60 s,
so deletion happens up to ~60 s after expiry.
Usage: python ttl_sessions.py [--seconds 30]"""
import argparse, secrets, time
from datetime import datetime, timedelta
from config import get_db

db = get_db()

def start_session(bill, ttl_seconds=900):
    now = datetime.utcnow()
    doc = {"bill_id": bill["_id"], "consumer_id": bill["consumer_id"], "amount": bill["balance"],
           "token": secrets.token_urlsafe(24), "state": "pending", "created_at": now,
           "expires_at": now + timedelta(seconds=ttl_seconds)}
    doc["_id"] = db.payment_sessions.insert_one(doc).inserted_id
    return doc

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--seconds", type=int, default=30); a = ap.parse_args()
    print("TTL index:", [i for i in db.payment_sessions.list_indexes() if "expireAfterSeconds" in i])
    bill = db.bills.find_one({"balance": {"$gt": 0}})
    s = start_session(bill, a.seconds)
    print(f"session {s['_id']} created, expires_at={s['expires_at']:%H:%M:%S} UTC")
    t0 = time.time()
    while db.payment_sessions.find_one({"_id": s["_id"]}):
        print(f"  t+{int(time.time()-t0):>3}s  still present"); time.sleep(10)
    print(f"  t+{int(time.time()-t0):>3}s  REMOVED by TTL monitor")
