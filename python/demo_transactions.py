"""Section 10.3 scenarios: commit, rollback on over-payment, rollback on forced
failure, duplicate idempotency key, paying an already-paid bill, and the
worked example from Section 7 (350 units -> 5,830 -> late fee -> pay 4,000)."""
from datetime import datetime, timedelta
from bson import ObjectId
from config import get_db
from billing import compute_charges, late_fee, r2
from payments import pay, PaymentError
from tariffs import TARIFFS

db = get_db()
import uuid; DEMO_KEY = 'DEMO-KEY-' + uuid.uuid4().hex[:8]

def snapshot(bill_id):
    b = db.bills.find_one({"_id": bill_id})
    c = db.consumers.find_one({"_id": b["consumer_id"]})
    return {"bill_paid": b["amount_paid"], "bill_balance": b["balance"], "status": b["status"], "version": b["version"],
            "consumer_balance": round(c["outstanding_balance"], 2),
            "payments": db.payments.count_documents({"bill_id": bill_id}),
            "audit": db.audit_logs.count_documents({"entity_id": bill_id})}

def fresh_bill(total=5830.0):
    c = db.consumers.find_one({"category": "residential"})
    m = db.meters.find_one({"consumer_id": c["_id"]})
    now = datetime.utcnow()
    seq = db.bills.estimated_document_count() + 500000
    b = {"bill_no": f"B-{now.year}-{now.month:02d}-{seq % 1000000:06d}", "consumer_id": c["_id"], "meter_id": m["_id"],
         "utility_type": m["utility_type"], "period": f"{now.year}-{now.month:02d}", "units": 350,
         "slab_breakdown": [{"from": 1, "to": 100, "units": 100, "rate": 10, "amount": 1000}],
         "charges": {"energy": 5100, "fixed": 200, "tax": 530, "late_fee": 0}, "total": total, "amount_paid": 0.0,
         "balance": total, "status": "unpaid", "issue_date": now, "due_date": now + timedelta(days=20),
         "late_fee_applied": False, "version": 1}
    b["_id"] = db.bills.insert_one(b).inserted_id
    db.consumers.update_one({"_id": c["_id"]}, {"$inc": {"outstanding_balance": total}})
    return b["_id"]

def header(t): print(f"\n=== {t} ===")

def worked_example():
    header("Worked example (Section 7): 350 units, residential electricity")
    t = next(t for t in TARIFFS if t["utility_type"] == "electricity" and t["category"] == "residential")
    bd, ch, total = compute_charges(350, t)
    for s in bd: print(f"  slab {s['from']}-{s['to'] or 'above'}: {s['units']} x {s['rate']} = {s['amount']}")
    fee = late_fee(total, t)
    print(f"  energy={ch['energy']} fixed={ch['fixed']} tax={ch['tax']} total={total}")
    print(f"  late fee={fee} payable after due date={r2(total + fee)}")
    print(f"  after paying 4000: balance={r2(total + fee - 4000)} status=partial")
    assert (ch["energy"], ch["tax"], total, fee) == (5100, 530, 5830, 291.5), "MISMATCH with hand calculation"
    print("  PASS: matches hand-calculated values")

if __name__ == "__main__":
    worked_example()
    bid = fresh_bill()
    header("1. Valid partial payment (commit)")
    print("  before:", snapshot(bid))
    r = pay(bid, 4000, "card"); print("  receipt:", r["receipt_no"])
    print("  after: ", snapshot(bid))

    header("2. Payment exceeds balance (abort)")
    before = snapshot(bid)
    try: pay(bid, 999999)
    except PaymentError as e: print("  rejected:", e)
    print("  unchanged:", snapshot(bid) == before)

    header("3. Forced failure after bill update (rollback)")
    before = snapshot(bid)
    try: pay(bid, 500, fail_after_bill_update=True)
    except RuntimeError as e: print("  error:", e)
    after = snapshot(bid); print("  after:", after); print("  rolled back (unchanged):", after == before)

    header("4. Duplicate idempotency_key")
    pay(bid, 100, idempotency_key=DEMO_KEY)
    before = snapshot(bid)
    try: pay(bid, 100, idempotency_key=DEMO_KEY)
    except PaymentError as e: print("  rejected:", e)
    print("  payments with key:", db.payments.count_documents({"idempotency_key": DEMO_KEY}), "| unchanged:", snapshot(bid) == before)

    header("5. Pay remaining then pay an already-paid bill")
    bal = db.bills.find_one({"_id": bid})["balance"]; pay(bid, bal); print("  status:", snapshot(bid)["status"])
    try: pay(bid, 10)
    except PaymentError as e: print("  rejected:", e)

