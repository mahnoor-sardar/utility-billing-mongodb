// mongosh --port 27017 admin/replica-set/init-replica-set.js
try { rs.status(); print("Replica set already initiated"); }
catch (e) {
  rs.initiate({ _id: "rs0", members: [
    { _id: 0, host: "localhost:27017", priority: 2 },
    { _id: 1, host: "localhost:27018", priority: 1 },
    { _id: 2, host: "localhost:27019", priority: 1 } ] });
  print("Initiated rs0; waiting for primary...");
}
while (!db.hello().isWritablePrimary) { sleep(1000); }
db.adminCommand({ setDefaultRWConcern: 1, defaultWriteConcern: { w: "majority" } });
rs.status().members.forEach(m => print(`${m.name}  ${m.stateStr}`));
