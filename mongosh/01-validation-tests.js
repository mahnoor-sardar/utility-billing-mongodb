// mongosh "mongodb://localhost:27017/utility_billing?replicaSet=rs0" mongosh/01-validation-tests.js
const t = (label, fn) => { try { fn(); print("ACCEPTED  " + label); } catch (e) { print("REJECTED  " + label + " -> " + (e.errInfo ? JSON.stringify(e.errInfo.details.schemaRulesNotSatisfied).slice(0, 160) : e.message)); } };
t("valid reading", () => { const m = db.meters.findOne(); db.meter_readings.insertOne({ meter_id: m._id, period: "2030-01", reading_date: new Date(), previous_value: m.last_reading.value, reading_value: m.last_reading.value + 10, units_consumed: 10, recorded_by: "shell" }); });
t("period '2026-13'", () => db.meter_readings.insertOne({ meter_id: ObjectId(), period: "2026-13", reading_date: new Date(), previous_value: 1, reading_value: 2, units_consumed: 1, recorded_by: "x" }));
t("reading < previous ($expr backstop)", () => db.meter_readings.insertOne({ meter_id: ObjectId(), period: "2026-11", reading_date: new Date(), previous_value: 500, reading_value: 400, units_consumed: 0, recorded_by: "x" }));
t("bill status 'pending'", () => db.bills.insertOne(Object.assign(db.bills.findOne({}, { _id: 0 }), { bill_no: "B-2099-01-000001", status: "pending" })));
t("payment amount 0", () => db.payments.insertOne({ receipt_no: "R-2099-0000001", bill_id: ObjectId(), consumer_id: ObjectId(), amount: 0, method: "cash", paid_at: new Date(), status: "completed", idempotency_key: "abcdefghij" }));
t("consumer missing contact", () => db.consumers.insertOne({ consumer_no: "C-999999", name: "No Contact", category: "residential", status: "active", outstanding_balance: 0, created_at: new Date() }));
db.meter_readings.deleteMany({ period: "2030-01" });
