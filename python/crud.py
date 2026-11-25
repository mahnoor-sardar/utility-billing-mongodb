"""CRUD demo: register consumer + meter, record reading (transaction with
cross-field check), generate bill, update status, archive meter, delete."""
from datetime import datetime
from bson import ObjectId
from pymongo.errors import OperationFailure, DuplicateKeyError
from config import get_db, get_client, TXN_OPTS
from billing import build_bill
from tariffs import active_tariff
from audit import log

db = get_db()

def register_consumer(name, phone, city, category="residential", actor="staff01"):
    last = db.consumers.find_one(sort=[("consumer_no", -1)], projection={"consumer_no": 1})
    nxt = int(last["consumer_no"][2:]) + 1 if last else 1
    doc = {"consumer_no": f"C-{nxt:06d}", "name": name, "contact": {"phone": phone},
           "address": {"street": "N/A", "city": city}, "category": category,
           "status": "active", "outstanding_balance": 0.0, "created_at": datetime.utcnow()}
    doc["_id"] = db.consumers.insert_one(doc).inserted_id
    log(db, "consumers", doc["_id"], "create", actor, None, doc)
    return doc

def register_meter(consumer, utility_type, spec, actor="staff01", start_value=0.0):
    prefix = utility_type[0].upper()
    last = db.meters.find_one({"meter_no": {"$regex": f"^{prefix}-"}}, sort=[("meter_no", -1)])
    nxt = int(last["meter_no"][2:]) + 1 if last else 1
    now = datetime.utcnow()
    doc = {"meter_no": f"{prefix}-{nxt:07d}", "consumer_id": consumer["_id"], "utility_type": utility_type,
           "spec": spec, "tariff_category": consumer["category"], "install_date": now, "status": "active",
           "last_reading": {"value": float(start_value), "date": now}}
    doc["_id"] = db.meters.insert_one(doc).inserted_id
    log(db, "meters", doc["_id"], "create", actor, None, doc)
    return doc

def _record_reading_txn(session, meter_no, value, period, actor):
    meter = db.meters.find_one({"meter_no": meter_no, "status": "active"}, session=session)
    if not meter:
        raise ValueError(f"meter {meter_no} not found or archived")
    prev = meter.get("last_reading", {}).get("value", 0.0)
    if value < prev:  # cross-field rule $jsonSchema cannot express
        raise ValueError(f"reading {value} is lower than previous {prev}")
    now = datetime.utcnow()
    rd = {"meter_id": meter["_id"], "period": period, "reading_date": now, "previous_value": prev,
          "reading_value": float(value), "units_consumed": float(value - prev), "recorded_by": actor, "source": "manual"}
    rd["_id"] = db.meter_readings.insert_one(rd, session=session).inserted_id
    # conditional update: fails if someone else changed last_reading meanwhile
    res = db.meters.update_one({"_id": meter["_id"], "last_reading.value": prev},
                               {"$set": {"last_reading": {"value": float(value), "date": now, "period": period}}},
                               session=session)
    if res.modified_count != 1:
        raise RuntimeError("concurrent reading detected; retry")
    log(db, "meter_readings", rd["_id"], "create", actor, None, rd, session=session)
    return meter, rd

def record_reading(meter_no, value, period, actor="staff01"):
    with get_client().start_session() as s:
        return s.with_transaction(lambda ss: _record_reading_txn(ss, meter_no, value, period, actor), **TXN_OPTS)

def generate_bill(meter, reading, actor="staff01"):
    consumer = db.consumers.find_one({"_id": meter["consumer_id"]})
    tariff = active_tariff(db, meter["utility_type"], meter["tariff_category"], reading["reading_date"])
    seq = db.bills.estimated_document_count() + 1
    y, mo = reading["period"].split("-")
    bill = build_bill(f"B-{y}-{mo}-{seq:06d}", meter, reading, reading["units_consumed"], tariff)
    with get_client().start_session() as s:
        def txn(ss):
            bill["_id"] = db.bills.insert_one(bill, session=ss).inserted_id
            db.consumers.update_one({"_id": consumer["_id"]}, {"$inc": {"outstanding_balance": bill["total"]}}, session=ss)
            log(db, "bills", bill["_id"], "generate", actor, None, {"total": bill["total"]}, session=ss)
        s.with_transaction(txn, **TXN_OPTS)
    return bill

def archive_meter(meter_no, actor="admin"):
    before = db.meters.find_one({"meter_no": meter_no})
    db.meters.update_one({"meter_no": meter_no}, {"$set": {"status": "archived"}})
    log(db, "meters", before["_id"], "archive", actor, {"status": before["status"]}, {"status": "archived"})

def validation_tests():
    print("\n--- $jsonSchema validation tests ---")
    bad = [
        ("consumers", {"consumer_no": "X1", "name": "A"}, "missing fields / bad pattern"),
        ("meter_readings", {"meter_id": ObjectId(), "period": "2026-13", "reading_date": datetime.utcnow(),
                            "previous_value": 10, "reading_value": 5, "units_consumed": -5, "recorded_by": "x"}, "bad period, negative units, reading < previous ($expr)"),
        ("payments", {"receipt_no": "R-2026-0000001", "bill_id": ObjectId(), "consumer_id": ObjectId(), "amount": -100,
                      "method": "bitcoin", "paid_at": datetime.utcnow(), "status": "completed", "idempotency_key": "abcdefgh"}, "negative amount, bad method enum"),
        ("meters", {"meter_no": "E-0000001", "consumer_id": ObjectId(), "utility_type": "water", "spec": {"phase": 3},
                    "tariff_category": "residential", "install_date": datetime.utcnow(), "status": "active"}, "water meter with electricity spec"),
    ]
    for coll, doc, why in bad:
        try:
            db[coll].insert_one(doc); print(f"  [UNEXPECTED ACCEPT] {coll}")
        except OperationFailure as e:
            print(f"  [REJECTED as expected] {coll}: {why}  (code {e.code})")

if __name__ == "__main__":
    c = register_consumer("Ali Raza Jadoon", "03451234567", "Abbottabad")
    print("CREATE consumer:", c["consumer_no"])
    m = register_meter(c, "electricity", {"phase": 1, "sanctioned_load_kw": 5, "tou": False}, start_value=1000)
    print("CREATE meter:", m["meter_no"])
    m2, rd = record_reading(m["meter_no"], 1350, "2026-11")
    print(f"READING recorded: {rd['units_consumed']} units")
    b = generate_bill(m2, rd)
    print(f"BILL {b['bill_no']}: energy={b['charges']['energy']} fixed={b['charges']['fixed']} tax={b['charges']['tax']} total={b['total']}")
    try:
        record_reading(m["meter_no"], 1200, "2026-12")
    except ValueError as e:
        print("REJECTED lower reading:", e)
    print("READ consumer bills:", list(db.bills.find({"consumer_id": c["_id"]}, {"bill_no": 1, "total": 1, "status": 1, "_id": 0})))
    archive_meter(m["meter_no"]); print("UPDATE meter archived")
    r = db.payment_sessions.delete_many({"consumer_id": c["_id"]}); print("DELETE sessions:", r.deleted_count)
    validation_tests()
