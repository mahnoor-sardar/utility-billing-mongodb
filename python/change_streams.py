"""Change stream watchers (needs replica set).
 - meter_readings inserts: usage spike if units > 2x the meter's 6-month average
 - bills updates: status changed to overdue or paid
Alerts are written to audit_logs (entity="alert"). Resume tokens are saved so the
watcher continues where it left off after a restart.
Run in its own terminal: python change_streams.py"""
import threading, json, pathlib
from datetime import datetime
from config import get_db

db = get_db()
TOKENS = pathlib.Path(__file__).parent / ".resume_tokens.json"

def _load(name):
    try: return json.loads(TOKENS.read_text()).get(name)
    except Exception: return None

def _save(name, token):
    data = {}
    try: data = json.loads(TOKENS.read_text())
    except Exception: pass
    from bson import json_util
    data[name] = json.loads(json_util.dumps(token)); TOKENS.write_text(json.dumps(data))

def _resume(name):
    from bson import json_util
    t = _load(name); return json_util.loads(json.dumps(t)) if t else None

def alert(kind, entity_id, details):
    db.audit_logs.insert_one({"entity": "alert", "entity_id": entity_id, "action": kind, "actor": "change_stream",
                              "before": None, "after": None, "details": details, "ts": datetime.utcnow()})
    print(f"[{datetime.now():%H:%M:%S}] ALERT {kind}: {details}", flush=True)

def watch_readings():
    pipeline = [{"$match": {"operationType": "insert"}}]
    with db.meter_readings.watch(pipeline, resume_after=_resume("readings")) as stream:
        print("watching meter_readings for usage spikes...", flush=True)
        for ch in stream:
            rd = ch["fullDocument"]
            hist = list(db.meter_readings.find({"meter_id": rd["meter_id"], "_id": {"$ne": rd["_id"]}},
                                               {"units_consumed": 1}).sort("reading_date", -1).limit(6))
            if hist:
                avg = sum(h["units_consumed"] for h in hist) / len(hist)
                if rd["units_consumed"] > 2 * avg:
                    alert("usage_spike", rd["meter_id"], {"period": rd["period"], "units": rd["units_consumed"],
                                                          "avg_6m": round(avg, 1)})
            _save("readings", ch["_id"])

def watch_bills():
    pipeline = [{"$match": {"operationType": "update",
                            "updateDescription.updatedFields.status": {"$in": ["overdue", "paid"]}}}]
    with db.bills.watch(pipeline, full_document="updateLookup", resume_after=_resume("bills")) as stream:
        print("watching bills for status changes...", flush=True)
        for ch in stream:
            b = ch.get("fullDocument") or {}
            alert(f"bill_{ch['updateDescription']['updatedFields']['status']}", ch["documentKey"]["_id"],
                  {"bill_no": b.get("bill_no"), "balance": b.get("balance")})
            _save("bills", ch["_id"])

if __name__ == "__main__":
    threading.Thread(target=watch_readings, daemon=True).start()
    watch_bills()
