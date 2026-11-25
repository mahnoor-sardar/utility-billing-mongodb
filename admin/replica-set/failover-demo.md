# Failover demo (O8)

1. Terminal A: `python python/failover_writer.py` (writes 1 doc/sec with w:majority, prints which node is primary)
2. Terminal B: `mongosh --port 27017 --eval "rs.status().members.map(m=>m.name+' '+m.stateStr)"`
3. Stop the primary:
   - `mongosh --port 27017 --eval "db.getSiblingDB('admin').shutdownServer()"`  (or kill the process)
4. Watch Terminal A: a few writes retry for ~2-12 s, then continue on the new primary (election).
5. `mongosh --port 27018 --eval "rs.status().members.map(m=>m.name+' '+m.stateStr)"` → new PRIMARY shown.
6. Restart the old node: `mongod --config admin/replica-set/mongod1.conf --fork`
   It rejoins as SECONDARY (then, having priority 2, takes back PRIMARY after catch-up).
7. Stop the writer and check: `failover_writer.py --verify` → every acknowledged write is present (no data loss).
