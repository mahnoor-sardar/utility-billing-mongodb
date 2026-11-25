// mongosh "mongodb://localhost:27017/?replicaSet=rs0" admin/rbac/create-roles-users.js
// Run BEFORE enabling authorization (localhost exception) or as an existing root user.
const admin = db.getSiblingDB("admin");
const DB = "utility_billing";
function upsertRole(name, privileges, roles) {
  if (admin.getRole(name)) admin.updateRole(name, { privileges, roles });
  else admin.createRole({ role: name, privileges, roles });
  print("role: " + name);
}
const r = (coll, actions) => ({ resource: { db: DB, collection: coll }, actions });

// Consumer: read-only view of bills + own payments; may start a payment session.
upsertRole("consumer_role", [
  r("v_consumer_bills", ["find"]),
  r("payments", ["find"]),
  r("payment_sessions", ["find", "insert"]),
], []);

// Billing staff: day-to-day operations; cannot drop, cannot change tariffs, cannot manage users.
upsertRole("billing_staff_role", [
  r("consumers", ["find", "insert", "update"]),
  r("meters", ["find", "insert", "update"]),
  r("meter_readings", ["find", "insert"]),
  r("bills", ["find", "insert", "update"]),
  r("payments", ["find", "insert"]),
  r("audit_logs", ["find", "insert"]),          // insert-only: no update / remove
  r("payment_sessions", ["find", "insert", "update", "remove"]),
  r("tariff_slabs", ["find"]),
  r("counters", ["find", "insert", "update"]),
  r("v_consumer_bills", ["find"]),
], []);

// Administrator: full DB ownership, user admin, backup/restore, cluster monitoring.
upsertRole("admin_role", [], [
  { role: "dbOwner", db: DB }, { role: "userAdminAnyDatabase", db: "admin" },
  { role: "backup", db: "admin" }, { role: "restore", db: "admin" },
  { role: "clusterMonitor", db: "admin" }, { role: "clusterManager", db: "admin" } ]);

function upsertUser(user, pwd, role) {
  if (admin.getUser(user)) admin.updateUser(user, { pwd, roles: [{ role, db: "admin" }] });
  else admin.createUser({ user, pwd, roles: [{ role, db: "admin" }] });
  print("user: " + user + " -> " + role);
}
upsertUser("consumer_demo", "Consumer#2026", "consumer_role");
upsertUser("staff_demo", "Staff#2026", "billing_staff_role");
upsertUser("admin_demo", "Admin#2026", "admin_role");
// Also a root user for emergencies (change password!)
if (!admin.getUser("root")) admin.createUser({ user: "root", pwd: "Root#2026", roles: ["root"] });
print("Done. Now enable 'security.authorization' + keyFile in the mongod*.conf files and restart.");
