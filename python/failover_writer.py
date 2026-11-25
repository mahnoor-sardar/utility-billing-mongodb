"""Writes one document per second with w:majority during the failover demo,
then --verify checks every acknowledged write survived."""
import sys, time
from datetime import datetime
from pymongo.errors import PyMongoError
from config import get_client, get_db

db = get_db(); coll = db.failover_test
if "--verify" in sys.argv:
    acked = [int(l) for l in open("acked.log")]
    found = coll.count_documents({"seq": {"$in": acked}})
    print(f"acknowledged={len(acked)} found={found} data_loss={len(acked) - found}"); sys.exit()
coll.drop(); open("acked.log", "w").close(); seq = 0
while True:
    seq += 1
    try:
        coll.insert_one({"seq": seq, "ts": datetime.utcnow()})
        primary = get_client().primary
        print(f"seq {seq} OK  primary={primary[0]}:{primary[1]}", flush=True)
        open("acked.log", "a").write(f"{seq}\n")
    except PyMongoError as e:
        print(f"seq {seq} FAILED (election in progress?) {type(e).__name__}", flush=True)
    time.sleep(1)
