"""Payment processing in a multi-document ACID transaction.
One payment updates: bill (amount_paid, balance, status, version) +
consumer.outstanding_balance + payments (receipt) + audit_logs.  All or nothing."""
import uuid
from datetime import datetime
from pymongo.errors import DuplicateKeyError, PyMongoError
from config import get_db, get_client, TXN_OPTS
from billing import r2, status_after_payment, late_fee
from tariffs import active_tariff
from audit import log

db = get_db()

class PaymentError(Exception):
    pass

def _next_receipt(session):
    year = datetime.utcnow().year
    # atomic counter document (lives in audit-free counters collection)
    c = db.counters.find_one_and_update({"_id": f"receipt-{year}"}, {"$inc": {"seq": 1}},
                                        upsert=True, return_document=True, session=session)
    return f"R-{year}-{9000000 + c['seq']:07d}"

def _apply_payment(session, bill_id, amount, method, idem_key, actor, fail_after_bill_update):
    amount = r2(amount)
    if amount <= 0:
        raise PaymentError("amount must be positive")
    bill = db.bills.find_one({"_id": bill_id}, session=session)
    if bill is None:
        raise PaymentError("bill not found")
    if bill["status"] == "paid" or bill["balance"] <= 0:
        raise PaymentError("bill already paid")
    if amount > bill["balance"] + 0.004:
        raise PaymentError(f"amount {amount} exceeds balance {bill['balance']}")
    new_paid = r2(bill["amount_paid"] + amount)
    new_bal = r2(bill["balance"] - amount)
    new_status = status_after_payment(new_bal)
    # Optimistic concurrency: only matches if nobody changed the bill since we read it.
    res = db.bills.update_one(
        {"_id": bill_id, "version": bill["version"], "balance": {"$gte": amount - 0.004}},
        {"$set": {"amount_paid": new_paid, "balance": max(new_bal, 0.0), "status": new_status},
         "$inc": {"version": 1}}, session=session)
    if res.modified_count != 1:
        raise PaymentError("bill changed concurrently (version conflict)")
    if fail_after_bill_update:
        raise RuntimeError("SIMULATED FAILURE after bill update")
    receipt = {"receipt_no": _next_receipt(session), "bill_id": bill_id, "consumer_id": bill["consumer_id"],
               "amount": amount, "method": method, "paid_at": datetime.utcnow(),
               "status": "completed", "idempotency_key": idem_key}
    receipt["_id"] = db.payments.insert_one(receipt, session=session).inserted_id  # unique idem key
    db.consumers.update_one({"_id": bill["consumer_id"]}, {"$inc": {"outstanding_balance": -amount}}, session=session)
    log(db, "bills", bill_id, "payment", actor,
        {"amount_paid": bill["amount_paid"], "balance": bill["balance"], "status": bill["status"]},
        {"amount_paid": new_paid, "balance": new_bal, "status": new_status},
        session=session, details={"receipt_no": receipt["receipt_no"], "amount": amount})
    return receipt

def pay(bill_id, amount, method="cash", idempotency_key=None, actor="staff01", fail_after_bill_update=False):
    """Returns the receipt dict. Raises PaymentError on business-rule rejection.
    with_transaction() retries automatically on TransientTransactionError and
    UnknownTransactionCommitResult."""
    key = idempotency_key or uuid.uuid4().hex
    with get_client().start_session() as s:
        try:
            return s.with_transaction(
                lambda ss: _apply_payment(ss, bill_id, amount, method, key, actor, fail_after_bill_update), **TXN_OPTS)
        except DuplicateKeyError:
            raise PaymentError(f"duplicate request: idempotency_key {key} already used")

def apply_late_fees(as_of=None, actor="system"):
    """After the grace period, add the late fee to unpaid balances and mark overdue."""
    as_of = as_of or datetime.utcnow()
    n = 0
    for bill in db.bills.find({"due_date": {"$lt": as_of}, "balance": {"$gt": 0}, "late_fee_applied": False}):
        meter = db.meters.find_one({"_id": bill["meter_id"]})
        tariff = active_tariff(db, meter["utility_type"], meter["tariff_category"], bill["issue_date"])
        fee = late_fee(bill["balance"], tariff)
        with get_client().start_session() as s:
            def txn(ss):
                r = db.bills.update_one({"_id": bill["_id"], "version": bill["version"]},
                    {"$set": {"charges.late_fee": fee, "status": "overdue", "late_fee_applied": True},
                     "$inc": {"total": fee, "balance": fee, "version": 1}}, session=ss)
                if r.modified_count:
                    db.consumers.update_one({"_id": bill["consumer_id"]}, {"$inc": {"outstanding_balance": fee}}, session=ss)
                    log(db, "bills", bill["_id"], "late_fee", actor, {"balance": bill["balance"]},
                        {"balance": r2(bill["balance"] + fee), "status": "overdue"}, session=ss)
                return r.modified_count
            n += s.with_transaction(txn, **TXN_OPTS)
    return n
