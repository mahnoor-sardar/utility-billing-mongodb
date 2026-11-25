"""Reproducible seed generator (Pakistani names/cities from pk_data.py).
Default: ~3,000 meters x 24 months = 72,000 readings (+ bills, payments).
Scale:   python seed.py --meters 21000 --months 24   (~504,000 readings)
Usage:   python seed.py [--meters N] [--months M] [--seed S]"""
import argparse, random, uuid
from datetime import datetime, timedelta
import pk_data
from config import get_db
from billing import build_bill, late_fee, r2
from tariffs import TARIFFS
import setup_db

BASE_USAGE = {"electricity": (120, 650), "water": (8, 45), "gas": (30, 260)}

def month_list(n, end=datetime(2026, 10, 1)):
    y, m, out = end.year, end.month, []
    for _ in range(n):
        out.append((y, m)); m -= 1
        if m == 0: y, m = y - 1, 12
    return list(reversed(out))

def chunks(seq, n=5000):
    for i in range(0, len(seq), n): yield seq[i:i + n]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--meters", type=int, default=3000)
    ap.add_argument("--months", type=int, default=24)
    ap.add_argument("--seed", type=int, default=42)
    a = ap.parse_args()
    random.seed(a.seed)
    db = get_db()
    print("Resetting collections (indexes are created by setup_db / benchmark)...")
    setup_db.create_collections(db, reset=True)
    # minimal unique indexes needed for integrity during seeding
    setup_db.create_indexes(db, collections={"payment_sessions"})

    tariff_ids = {}
    for t in TARIFFS:
        tariff_ids[(t["utility_type"], t["category"])] = db.tariff_slabs.insert_one(dict(t)).inserted_id
    tmap = {k: db.tariff_slabs.find_one({"_id": v}) for k, v in tariff_ids.items()}

    consumers, meters, n_meter = [], [], 0
    cno = 0
    while n_meter < a.meters:
        cno += 1
        cat = random.choices(["residential", "commercial"], [0.85, 0.15])[0]
        name = pk_data.person() if cat == "residential" else pk_data.business()
        c = {"_id": None, "consumer_no": f"C-{cno:06d}", "name": name,
             "contact": {"phone": pk_data.phone(), "email": pk_data.email(name)},
             "address": pk_data.address(), "category": cat, "status": "active", "outstanding_balance": 0.0,
             "created_at": datetime(2023, 12, 1)}
        from bson import ObjectId
        c["_id"] = ObjectId(); consumers.append(c)
        utils = ["electricity"] + random.sample(["water", "gas"], k=random.choice([0, 1, 1, 2]))
        for u in utils:
            if n_meter >= a.meters: break
            n_meter += 1
            pref = u[0].upper()
            spec = ({"phase": random.choice([1, 1, 1, 3]), "sanctioned_load_kw": random.choice([3, 5, 7, 10, 15]), "tou": random.random() < .3}
                    if u == "electricity" else {"pipe_size_mm": random.choice([15, 20, 25]), "unit": "m3"})
            meters.append({"_id": ObjectId(), "meter_no": f"{pref}-{n_meter:07d}", "consumer_id": c["_id"],
                           "utility_type": u, "spec": spec, "tariff_category": cat,
                           "install_date": datetime(2023, 12, random.randint(1, 28)), "status": "active"})
    db.consumers.insert_many(consumers)
    print(f"consumers: {len(consumers)}  meters: {len(meters)}")

    months = month_list(a.months)
    readings, bills, payments = [], [], []
    bill_seq, rec_seq = 0, 0
    today = datetime(2026, 11, 25)
    balances = {c["_id"]: 0.0 for c in consumers}
    payer_type = {c["_id"]: random.choices(["good", "partial", "late"], [0.75, 0.15, 0.10])[0] for c in consumers}
    for m in meters:
        lo, hi = BASE_USAGE[m["utility_type"]]
        base = random.uniform(lo, hi) * (2.2 if m["tariff_category"] == "commercial" else 1)
        value = float(random.randint(1000, 20000))
        tariff = tmap[(m["utility_type"], m["tariff_category"])]
        for (y, mo) in months:
            season = 1.35 if (m["utility_type"] == "electricity" and mo in (6, 7, 8)) or (m["utility_type"] == "gas" and mo in (12, 1, 2)) else 1.0
            units = max(1, int(random.gauss(base * season, base * 0.15)))
            if random.random() < 0.01: units *= 3   # anomaly / spike
            rdate = datetime(y, mo, random.randint(25, 28), 10)
            per = f"{y}-{mo:02d}"
            rd = {"meter_id": m["_id"], "period": per, "reading_date": rdate, "previous_value": value,
                  "reading_value": value + units, "units_consumed": units,
                  "recorded_by": random.choice(["staff01", "staff02", "staff03"]),
                  "source": random.choices(["manual", "smart", "estimated"], [.6, .35, .05])[0]}
            value += units; readings.append(rd)
            bill_seq += 1
            b = build_bill(f"B-{y}-{mo:02d}-{bill_seq:06d}", m, rd, units, tariff)
            b["_id"] = ObjectId()
            # payment behaviour
            pt = payer_type[m["consumer_id"]]
            recent = (today - rdate).days < 40
            r = random.random()
            pay_amounts = []
            if pt == "good" and not (recent and r < .5): pay_amounts = [b["total"]]
            elif pt == "partial": pay_amounts = [r2(b["total"] * random.uniform(.3, .7))] if r < .8 else []
            elif pt == "late" and r < .5: pay_amounts = [b["total"]]
            if pay_amounts and r < .1 and len(pay_amounts) == 1 and pt == "good":
                half = r2(b["total"] / 2); pay_amounts = [half, r2(b["total"] - half)]
            for i, amt in enumerate(pay_amounts):
                rec_seq += 1
                payments.append({"receipt_no": f"R-{y}-{rec_seq:07d}", "bill_id": b["_id"], "consumer_id": b["consumer_id"],
                                 "amount": amt, "method": random.choice(["cash", "card", "bank_transfer", "mobile_wallet"]),
                                 "paid_at": b["issue_date"] + timedelta(days=random.randint(2, 18) + 3 * i),
                                 "status": "completed", "idempotency_key": uuid.UUID(int=random.getrandbits(128)).hex})
                b["amount_paid"] = r2(b["amount_paid"] + amt)
            b["balance"] = r2(b["total"] - b["amount_paid"])
            if b["balance"] <= 0.004:
                b["balance"], b["status"] = 0.0, "paid"
            elif b["amount_paid"] > 0:
                b["status"] = "partial"
            if b["balance"] > 0 and b["due_date"] < today:
                fee = late_fee(b["balance"], tariff)
                b["charges"]["late_fee"] = fee; b["total"] = r2(b["total"] + fee)
                b["balance"] = r2(b["balance"] + fee); b["status"] = "overdue"; b["late_fee_applied"] = True
            balances[b["consumer_id"]] += b["balance"]
            bills.append(b)
        m["last_reading"] = {"value": value, "date": rdate, "period": per}
    db.meters.insert_many(meters)
    for ch in chunks(readings): db.meter_readings.insert_many(ch, ordered=False)
    for ch in chunks(bills): db.bills.insert_many(ch, ordered=False)
    for ch in chunks(payments): db.payments.insert_many(ch, ordered=False)
    from pymongo import UpdateOne
    ops = [UpdateOne({"_id": k}, {"$set": {"outstanding_balance": r2(v)}}) for k, v in balances.items()]
    for ch in chunks(ops): db.consumers.bulk_write(ch)
    db.audit_logs.insert_one({"entity": "system", "entity_id": None, "action": "seed", "actor": "seed.py",
                              "before": None, "after": None,
                              "details": {"meters": len(meters), "readings": len(readings), "bills": len(bills), "payments": len(payments)},
                              "ts": datetime.utcnow()})
    print(f"readings: {len(readings)}  bills: {len(bills)}  payments: {len(payments)}")
    print("Seed complete. Next: python benchmark_indexes.py")

if __name__ == "__main__":
    main()
