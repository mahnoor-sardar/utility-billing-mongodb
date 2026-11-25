# A MongoDB-Based Utility Bill and Meter Reading System

COMSATS University Islamabad, Abbottabad Campus · Advanced Database Systems · Semester Project


## Project layout
```
utility-billing/
├── db/schemas.json            # $jsonSchema validators + index plan (single source of truth)
├── python/                    # PyMongo scripts (core verification)
│   ├── config.py              # connection (replica set, w:majority)
│   ├── setup_db.py            # create 8 collections, validators, indexes, view       
│   ├── seed.py                # Faker generator: 3,000 meters / 72,000 readings      
│   ├── crud.py                # CRUD + validation rejection tests                     
│   ├── benchmark_indexes.py   # explain("executionStats") before / after             
│   ├── billing.py, tariffs.py # slab billing formula + illustrative tariffs
│   ├── payments.py            # ACID payment transaction, late fees                   
│   ├── demo_transactions.py   # commit / rollback / duplicate / paid-bill scenarios   
│   ├── demo_concurrency.py    # parallel workers paying one bill                      
│   ├── aggregations.py        # 5 aggregation reports                                 
│   ├── change_streams.py      # usage-spike + bill-status watchers                   
│   ├── ttl_sessions.py        # TTL payment-session expiry                            
│   ├── failover_writer.py     # continuous writer for the failover demo               
│   └── shard_key_analysis.py  # shard key comparison on the dataset                   
├── mongosh/                   # shell scripts for screenshots (validation, explain)
├── admin/
│   ├── replica-set/           # 3 mongod configs, start + init scripts, failover guide 
│   ├── rbac/                  # roles, users, permission tests                         
│   ├── sharding/              # optional local sharded cluster                         
│   └── backup/                # mongodump / drop / mongorestore / verify              
├── dashboard/
│   ├── server/                # Express API (Node MongoDB driver)
│   └── client/                # React + Vite thin dashboard
└── results/                   # benchmark + analysis outputs are written here
```

## Prerequisites
MongoDB Community Server 7.0+, mongosh, MongoDB Database Tools, Python 3.10+, Node.js 18+.

## Run it (from the project root)
```bash
# 1. Replica set (transactions + change streams need it)
bash admin/replica-set/start-replica-set.sh        # Windows: .\admin\replica-set\start-replica-set.ps1

# 2. Python
cd python && pip install -r requirements.txt
python setup_db.py --reset          # collections + validators + indexes + view
python seed.py                      # ~3k meters, 72k readings (use --meters 21000 for 500k+)
python benchmark_indexes.py         # COLLSCAN -> IXSCAN table in results/
python crud.py                      # CRUD + validation rejections
python demo_transactions.py         # Section 10.3 scenarios + worked example check
python demo_concurrency.py          # 8 parallel payers
python aggregations.py              # all reports
python change_streams.py            # (own terminal) then run crud.py / dashboard actions
python ttl_sessions.py              # watch a session expire
python shard_key_analysis.py        # results/shard_key_analysis.md
cd ..

# 3. Admin
mongosh "mongodb://localhost:27017/?replicaSet=rs0" admin/rbac/create-roles-users.js
bash admin/backup/backup-restore-demo.sh
# failover: see admin/replica-set/failover-demo.md

# 4. Dashboard (two terminals)
cd dashboard/server && npm install && npm start      # http://localhost:4000
cd dashboard/client && npm install && npm run dev    # http://localhost:5173
```
Set `MONGO_URI` if you enable authentication (see admin/rbac/README.md).

## Notes
* All data is synthetic (Faker). Tariffs are illustrative, not official.
* Payments are simulated; no gateway.
* `reading_value >= previous_value` is enforced in the transaction logic **and** by a `$expr` validator backstop.
