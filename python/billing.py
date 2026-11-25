"""Tiered slab billing.  Bill = sum(u_i * r_i) + F + T + L"""
from datetime import timedelta

def r2(x):
    return round(float(x) + 1e-9, 2)

def slab_breakdown(units, slabs):
    """Only the units inside each slab use that slab's rate."""
    out, remaining = [], units
    for s in sorted(slabs, key=lambda s: s["from"]):
        if remaining <= 0:
            break
        width = (s["to"] - s["from"] + 1) if s["to"] is not None else remaining
        u = min(remaining, width)
        out.append({"from": s["from"], "to": s["to"], "units": u,
                    "rate": s["rate"], "amount": r2(u * s["rate"])})
        remaining -= u
    return out

def compute_charges(units, tariff):
    breakdown = slab_breakdown(units, tariff["slabs"])
    energy = r2(sum(b["amount"] for b in breakdown))
    fixed = r2(tariff["fixed_charge"])
    tax = r2((energy + fixed) * tariff["tax_rate"])
    total = r2(energy + fixed + tax)
    return breakdown, {"energy": energy, "fixed": fixed, "tax": tax, "late_fee": 0.0}, total

def late_fee(balance, tariff):
    return r2(balance * tariff["late_fee_rate"])

def status_after_payment(balance):
    return "paid" if balance <= 0.004 else "partial"

def build_bill(bill_no, meter, reading, units, tariff, issue_date=None):
    breakdown, charges, total = compute_charges(units, tariff)
    issue = issue_date or reading["reading_date"] + timedelta(days=1)
    return {
        "bill_no": bill_no, "consumer_id": meter["consumer_id"], "meter_id": meter["_id"],
        "utility_type": meter["utility_type"], "period": reading["period"],
        "tariff_id": tariff.get("_id"), "units": units, "slab_breakdown": breakdown,
        "charges": charges, "total": total, "amount_paid": 0.0, "balance": total,
        "status": "unpaid", "issue_date": issue,
        "due_date": reading["reading_date"] + timedelta(days=20),
        "late_fee_applied": False, "version": 1,
    }
