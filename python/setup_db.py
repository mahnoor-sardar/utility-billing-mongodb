"""Creates the 8 collections with $jsonSchema validators and the index plan.
Usage: python setup_db.py [--reset] [--no-indexes]"""
import json, sys, pathlib
from config import get_db

SPEC = json.loads((pathlib.Path(__file__).parent.parent / "db" / "schemas.json").read_text())

def validator_for(name):
    schema = {"$jsonSchema": SPEC["collections"][name]}
    expr = SPEC["expr_backstops"].get(name)
    return {"$and": [schema, {"$expr": expr}]} if expr else schema

def create_collections(db, reset=False):
    existing = set(db.list_collection_names())
    for name in SPEC["collections"]:
        if reset and name in existing:
            db.drop_collection(name); existing.discard(name)
        if name in existing:
            db.command("collMod", name, validator=validator_for(name),
                       validationLevel="strict", validationAction="error")
            print(f"  updated validator: {name}")
        else:
            db.create_collection(name, validator=validator_for(name),
                                 validationLevel="strict", validationAction="error")
            print(f"  created: {name}")

def create_indexes(db, collections=None):
    for coll, keys, opts in SPEC["indexes"]:
        if collections and coll not in collections:
            continue
        db[coll].create_index(list(keys.items()), **opts)
        print(f"  index {opts['name']} on {coll}")

def create_views(db):
    # Consumer-facing view: hides internal fields (version, tariff ids).
    if "v_consumer_bills" in db.list_collection_names():
        db.drop_collection("v_consumer_bills")
    db.command("create", "v_consumer_bills", viewOn="bills", pipeline=[
        {"$lookup": {"from": "consumers", "localField": "consumer_id",
                     "foreignField": "_id", "as": "c"}},
        {"$set": {"consumer_no": {"$first": "$c.consumer_no"}}},
        {"$project": {"c": 0, "version": 0, "tariff_id": 0}}])
    print("  view: v_consumer_bills")

if __name__ == "__main__":
    db = get_db()
    print("Collections:"); create_collections(db, reset="--reset" in sys.argv)
    if "--no-indexes" not in sys.argv:
        print("Indexes:"); create_indexes(db)
    print("Views:"); create_views(db)
    print("Done.")
