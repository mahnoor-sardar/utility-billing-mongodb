// Run once per user, e.g.:
// mongosh "mongodb://staff_demo:Staff%232026@localhost:27017/utility_billing?authSource=admin&replicaSet=rs0" admin/rbac/test-rbac.js
const d = db.getSiblingDB("utility_billing");
function t(label, fn) {
  try { fn(); print("ALLOWED  " + label); }
  catch (e) { print("DENIED   " + label + "  (" + (e.codeName || e.message) + ")"); }
}
print("User: " + JSON.stringify(db.runCommand({ connectionStatus: 1 }).authInfo.authenticatedUsers));
t("find v_consumer_bills",    () => d.v_consumer_bills.findOne());
t("find bills (raw)",         () => d.bills.findOne());
t("insert meter_readings",    () => d.meter_readings.insertOne({ bad: true }));   // validation error still means ALLOWED by RBAC
t("update tariff_slabs",      () => d.tariff_slabs.updateOne({}, { $set: { fixed_charge: 0 } }));
t("remove audit_logs",        () => d.audit_logs.deleteOne({}));
t("drop payments",            () => { if (!d.payments.drop()) throw new Error("drop failed"); });
t("createUser",               () => db.getSiblingDB("admin").createUser({ user: "x" + Date.now(), pwd: "x", roles: [] }));
