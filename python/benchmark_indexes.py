"""Index benchmark: runs each query with explain("executionStats") BEFORE and
AFTER creating its index. Writes results to ../results/index_benchmark.md"""
import json, pathlib
from config import get_db
import setup_db

db = get_db()
SPEC = setup_db.SPEC

def sample():
    c = db.consumers.find_one({}, sort=[("consumer_no", 1)], skip=500)
    m = db.meters.find_one({"consumer_id": c["_id"]})
    b = db.bills.find_one({"consumer_id": c["_id"]})
    return c, m, b

def queries(c, m, b):
    from datetime import datetime
    return [
        ("consumers", "consumer by consumer_no", {"consumer_no": c["consumer_no"]}, None),
        ("meters", "meter by meter_no", {"meter_no": m["meter_no"]}, None),
        ("meters", "meters of consumer by utility", {"consumer_id": c["_id"], "utility_type": "electricity"}, None),
        ("meter_readings", "latest 12 readings of a meter", {"meter_id": m["_id"]}, [("reading_date", -1)]),
        ("bills", "bill history of consumer", {"consumer_id": c["_id"]}, [("period", -1)]),
        ("bills", "overdue bills due before date", {"due_date": {"$lt": datetime(2026, 6, 1)}, "status": "overdue", "balance": {"$gt": 0}}, None),
        ("payments", "payments of a bill", {"bill_id": b["_id"]}, [("paid_at", -1)]),
    ]

def stage_of(plan):
    s = plan.get("stage"); inner = plan.get("inputStage")
    return f"{s}>{stage_of(inner)}" if inner else s

def explain(coll, flt, sort):
    cur = db[coll].find(flt)
    if sort: cur = cur.sort(sort).limit(12)
    ex = cur.explain()
    st = ex["executionStats"]
    return {"stage": stage_of(ex["queryPlanner"]["winningPlan"]), "keys": st["totalKeysExamined"],
            "docs": st["totalDocsExamined"], "n": st["nReturned"], "ms": st["executionTimeMillis"]}

def drop_secondary(coll):
    for ix in db[coll].list_indexes():
        if ix["name"] != "_id_" and not ix["name"].startswith("ttl_"):
            db[coll].drop_index(ix["name"])

if __name__ == "__main__":
    colls = ["consumers", "meters", "meter_readings", "bills", "payments", "audit_logs"]
    for c in colls: drop_secondary(c)
    c, m, b = sample(); Q = queries(c, m, b)
    before = [explain(coll, f, s) for coll, _, f, s in Q]
    setup_db.create_indexes(db)
    after = [explain(coll, f, s) for coll, _, f, s in Q]
    lines = ["| Query | Before: stage / keys / docs / ms | After: stage / keys / docs / ms | nReturned |", "|---|---|---|---|"]
    for (coll, name, *_), bf, af in zip(Q, before, after):
        lines.append(f"| {coll}: {name} | {bf['stage']} / {bf['keys']} / {bf['docs']} / {bf['ms']} | {af['stage']} / {af['keys']} / {af['docs']} / {af['ms']} | {af['n']} |")
    out = "\n".join(lines); print(out)
    p = pathlib.Path(__file__).parent.parent / "results"; p.mkdir(exist_ok=True)
    (p / "index_benchmark.md").write_text(out + "\n")
    print("\nSaved results/index_benchmark.md")
