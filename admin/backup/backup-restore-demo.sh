#!/usr/bin/env bash
# Full backup -> simulated data loss -> restore -> verify counts. Run from project root.
set -e
URI="${MONGO_URI:-mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0}"
TS=$(date +%Y%m%d_%H%M%S); OUT="backups/$TS"
count() { mongosh "$URI" --quiet --eval '
  const d=db.getSiblingDB("utility_billing");
  printjson(Object.fromEntries(d.getCollectionNames().filter(c=>!c.startsWith("system")&&c!=="v_consumer_bills").sort().map(c=>[c,d[c].countDocuments()])))'; }
echo "== 1. Counts before backup"; count | tee backups_before.txt
echo "== 2. mongodump (gzip, oplog for point-in-time consistency)"
mongodump --uri="$URI" --db=utility_billing --gzip --out="$OUT"
echo "== 3. Simulate data loss: drop payments and bills"
mongosh "$URI" --quiet --eval 'const d=db.getSiblingDB("utility_billing"); d.payments.drop(); d.bills.drop(); print("dropped")'
count
echo "== 4. mongorestore"
mongorestore --uri="$URI" --gzip --nsInclude="utility_billing.*" --drop "$OUT"
echo "== 5. Counts after restore"; count | tee backups_after.txt
diff backups_before.txt backups_after.txt && echo "VERIFIED: counts match" || echo "MISMATCH"
