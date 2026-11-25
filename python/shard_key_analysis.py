"""Shard key analysis (O9) on the Faker dataset. Simulates distributing documents
into N chunks/shards for each candidate key and reports cardinality, max/min
shard share (balance), and write hotspot (share of the newest 10% of writes
landing on one shard). Also checks MongoDB 7's analyzeShardKey if available.
Output: ../results/shard_key_analysis.md"""
import hashlib, pathlib
from collections import Counter
from config import get_db

db = get_db(); N = 4

def h(v): return int(hashlib.md5(str(v).encode()).hexdigest(), 16) % N

def ranged(values, key):
    """Range-partition sorted values into N equal ranges (like balanced chunks at split time)."""
    s = sorted(set(values), key=key); b = {}
    for i, v in enumerate(s): b[v] = min(i * N // max(len(s), 1), N - 1)
    return b

def evaluate(name, docs, keyfn, hashed, order_field):
    vals = [keyfn(d) for d in docs]
    card = len(set(vals))
    if hashed: shard = [h(v) for v in vals]
    else:
        m = ranged(vals, key=lambda x: x); shard = [m[v] for v in vals]
    cnt = Counter(shard); total = len(docs)
    shares = [cnt.get(i, 0) / total * 100 for i in range(N)]
    newest = sorted(range(total), key=lambda i: docs[i][order_field])[-max(total // 10, 1):]
    hot = Counter(shard[i] for i in newest).most_common(1)[0][1] / len(newest) * 100
    return {"key": name, "cardinality": card, "max_share": round(max(shares), 1), "min_share": round(min(shares), 1),
            "hotspot_newest10pct": round(hot, 1)}

def analyse(coll, fields, candidates, order_field, sample=60000):
    docs = list(db[coll].aggregate([{"$sample": {"size": sample}}, {"$project": {f: 1 for f in fields}}]))
    return [evaluate(n, docs, fn, hs, order_field) for n, fn, hs in candidates]

if __name__ == "__main__":
    R = analyse("meter_readings", ["meter_id", "reading_date"], [
        ("hashed meter_id", lambda d: d["meter_id"], True),
        ("reading_date (ranged)", lambda d: d["reading_date"], False),
        ("{meter_id:1, reading_date:1} (ranged)", lambda d: (str(d["meter_id"]), d["reading_date"]), False),
    ], "reading_date")
    B = analyse("bills", ["consumer_id", "status", "utility_type", "issue_date"], [
        ("hashed consumer_id", lambda d: d["consumer_id"], True),
        ("status (ranged)", lambda d: d["status"], False),
        ("utility_type (ranged)", lambda d: d["utility_type"], False),
        ("issue_date (ranged)", lambda d: d["issue_date"], False),
    ], "issue_date")
    out = [f"Simulated over {N} shards. Ideal share = {100/N:.0f}%. Hotspot = % of newest 10% writes on busiest shard (ideal {100/N:.0f}%).", ""]
    for title, rows in (("meter_readings", R), ("bills", B)):
        out += [f"### {title}", "| Candidate key | Cardinality | Max share % | Min share % | Hotspot % |", "|---|---|---|---|---|"]
        out += [f"| {r['key']} | {r['cardinality']} | {r['max_share']} | {r['min_share']} | {r['hotspot_newest10pct']} |" for r in rows] + [""]
    txt = "\n".join(out); print(txt)
    try:
        res = db.command({"analyzeShardKey": "utility_billing.meter_readings", "key": {"meter_id": 1}, "readWriteDistribution": False})
        print("analyzeShardKey (meter_id):", res.get("keyCharacteristics"))
    except Exception as e:
        print("analyzeShardKey not available on this deployment (needs a sharded cluster / 7.0+):", type(e).__name__)
    p = pathlib.Path(__file__).parent.parent / "results"; p.mkdir(exist_ok=True)
    (p / "shard_key_analysis.md").write_text(txt); print("Saved results/shard_key_analysis.md")
