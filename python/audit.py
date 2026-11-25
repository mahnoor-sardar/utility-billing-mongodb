from datetime import datetime

def _clean(d):
    if d is None: return None
    return {k: v for k, v in d.items() if k != "slab_breakdown"}

def log(db, entity, entity_id, action, actor, before=None, after=None, session=None, details=None):
    db.audit_logs.insert_one({"entity": entity, "entity_id": entity_id, "action": action, "actor": actor,
                              "before": _clean(before), "after": _clean(after), "details": details or {},
                              "ts": datetime.utcnow()}, session=session)
