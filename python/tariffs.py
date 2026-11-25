"""Illustrative synthetic tariffs (NOT official rates)."""
from datetime import datetime

EFFECTIVE = datetime(2024, 1, 1)

def S(*rows):
    return [{"from": f, "to": t, "rate": r} for f, t, r in rows]

TARIFFS = [
    dict(utility_type="electricity", category="residential", unit="kWh",
         slabs=S((1, 100, 10), (101, 300, 15), (301, None, 22)), fixed_charge=200),
    dict(utility_type="electricity", category="commercial", unit="kWh",
         slabs=S((1, 200, 18), (201, 500, 24), (501, None, 30)), fixed_charge=500),
    dict(utility_type="water", category="residential", unit="m3",
         slabs=S((1, 10, 40), (11, 25, 60), (26, None, 90)), fixed_charge=150),
    dict(utility_type="water", category="commercial", unit="m3",
         slabs=S((1, 20, 70), (21, 60, 95), (61, None, 130)), fixed_charge=400),
    dict(utility_type="gas", category="residential", unit="m3",
         slabs=S((1, 50, 30), (51, 150, 45), (151, None, 65)), fixed_charge=250),
    dict(utility_type="gas", category="commercial", unit="m3",
         slabs=S((1, 100, 50), (101, 400, 70), (401, None, 95)), fixed_charge=600),
]
for t in TARIFFS:
    t.update(effective_from=EFFECTIVE, effective_to=None, tax_rate=0.10,
             late_fee_rate=0.05, grace_days=0)

def active_tariff(db, utility_type, category, on_date):
    return db.tariff_slabs.find_one(
        {"utility_type": utility_type, "category": category,
         "effective_from": {"$lte": on_date}},
        sort=[("effective_from", -1)])
