// Manual before/after explain for screenshots (the Python benchmark automates all queries).
const c = db.consumers.find().skip(500).limit(1).next();
const q = () => db.bills.find({ consumer_id: c._id }).sort({ period: -1 }).explain("executionStats");
const show = (label, e) => print(label, JSON.stringify({ stage: e.queryPlanner.winningPlan.stage, inner: (e.queryPlanner.winningPlan.inputStage || {}).stage, keys: e.executionStats.totalKeysExamined, docs: e.executionStats.totalDocsExamined, n: e.executionStats.nReturned, ms: e.executionStats.executionTimeMillis }));
try { db.bills.dropIndex("ix_consumer_period"); } catch (e) {}
show("BEFORE", q());
db.bills.createIndex({ consumer_id: 1, period: -1 }, { name: "ix_consumer_period" });
show("AFTER ", q());
print("Partial index used for overdue query:");
printjson(db.bills.find({ due_date: { $lt: new Date("2026-06-01") }, status: "overdue", balance: { $gt: 0 } }).explain().queryPlanner.winningPlan);
