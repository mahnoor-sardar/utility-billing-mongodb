"""Section 10.2 aggregation reports. Each function returns a list of dicts
(also used by the dashboard API). Run directly to print all reports."""
from datetime import datetime
from config import get_db

db = get_db()

def monthly_usage(start="2026-01", end="2026-12"):
    return list(db.bills.aggregate([
        {"$match": {"period": {"$gte": start, "$lte": end}}},
        {"$group": {"_id": {"utility": "$utility_type", "period": "$period"},
                    "total_units": {"$sum": "$units"}, "bills": {"$sum": 1}}},
        {"$sort": {"_id.period": 1, "_id.utility": 1}},
        {"$project": {"_id": 0, "period": "$_id.period", "utility": "$_id.utility", "total_units": 1, "bills": 1}}]))

def monthly_revenue(year=2026):
    return list(db.payments.aggregate([
        {"$match": {"status": "completed", "paid_at": {"$gte": datetime(year, 1, 1), "$lt": datetime(year + 1, 1, 1)}}},
        {"$group": {"_id": {"$dateToString": {"format": "%Y-%m", "date": "$paid_at"}},
                    "collected": {"$sum": "$amount"}, "payments": {"$sum": 1}}},
        {"$sort": {"_id": 1}},
        {"$project": {"_id": 0, "month": "$_id", "collected": {"$round": ["$collected", 2]}, "payments": 1}}]))

def high_usage_meters(period=None, limit=10):
    period = period or "2026-10"
    return list(db.bills.aggregate([
        {"$match": {"period": period, "utility_type": "electricity"}},
        {"$group": {"_id": "$meter_id", "units": {"$sum": "$units"}}},
        {"$sort": {"units": -1}}, {"$limit": limit},
        {"$lookup": {"from": "meters", "localField": "_id", "foreignField": "_id", "as": "m"}},
        {"$unwind": "$m"},
        {"$lookup": {"from": "consumers", "localField": "m.consumer_id", "foreignField": "_id", "as": "c"}},
        {"$unwind": "$c"},
        {"$project": {"_id": 0, "meter_no": "$m.meter_no", "consumer_no": "$c.consumer_no", "name": "$c.name",
                      "category": "$c.category", "units": 1, "period": period}}]))

def collection_vs_overdue():
    return list(db.bills.aggregate([
        {"$group": {"_id": "$status", "bills": {"$sum": 1}, "billed": {"$sum": "$total"},
                    "collected": {"$sum": "$amount_paid"}, "outstanding": {"$sum": "$balance"}}},
        {"$project": {"_id": 0, "status": "$_id", "bills": 1, "billed": {"$round": ["$billed", 2]},
                      "collected": {"$round": ["$collected", 2]}, "outstanding": {"$round": ["$outstanding", 2]}}},
        {"$sort": {"status": 1}}]))

def overdue_ageing(as_of=None):
    as_of = as_of or datetime(2026, 11, 25)
    return list(db.bills.aggregate([
        {"$match": {"balance": {"$gt": 0}, "due_date": {"$lt": as_of}}},
        {"$set": {"days_overdue": {"$dateDiff": {"startDate": "$due_date", "endDate": as_of, "unit": "day"}}}},
        {"$bucket": {"groupBy": "$days_overdue", "boundaries": [0, 31, 61, 91, 181, 100000], "default": "other",
                     "output": {"bills": {"$sum": 1}, "amount": {"$sum": "$balance"}}}},
        {"$project": {"_id": 0, "band": {"$switch": {"branches": [
            {"case": {"$eq": ["$_id", 0]}, "then": "0-30 days"}, {"case": {"$eq": ["$_id", 31]}, "then": "31-60 days"},
            {"case": {"$eq": ["$_id", 61]}, "then": "61-90 days"}, {"case": {"$eq": ["$_id", 91]}, "then": "91-180 days"}],
            "default": "180+ days"}}, "bills": 1, "amount": {"$round": ["$amount", 2]}}}]))

def summary():
    return {"consumers": db.consumers.estimated_document_count(), "meters": db.meters.estimated_document_count(),
            "readings": db.meter_readings.estimated_document_count(), "bills": db.bills.estimated_document_count(),
            "payments": db.payments.estimated_document_count(), "audit_logs": db.audit_logs.estimated_document_count(),
            "active_sessions": db.payment_sessions.count_documents({})}

REPORTS = {"monthly_usage": monthly_usage, "monthly_revenue": monthly_revenue, "high_usage_meters": high_usage_meters,
           "collection_vs_overdue": collection_vs_overdue, "overdue_ageing": overdue_ageing}

if __name__ == "__main__":
    for name, fn in REPORTS.items():
        rows = fn(); print(f"\n=== {name} ({len(rows)} rows) ===")
        for r in rows[:15]: print("  ", r)

