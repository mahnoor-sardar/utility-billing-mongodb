# Optional local sharded cluster demo

```bash
mkdir -p data/cfg data/sh1 data/sh2
mongod --configsvr --replSet cfg --port 27100 --dbpath data/cfg --fork --logpath data/cfg/log
mongosh --port 27100 --eval 'rs.initiate({_id:"cfg",configsvr:true,members:[{_id:0,host:"localhost:27100"}]})'
mongod --shardsvr --replSet sh1 --port 27201 --dbpath data/sh1 --fork --logpath data/sh1/log
mongod --shardsvr --replSet sh2 --port 27202 --dbpath data/sh2 --fork --logpath data/sh2/log
mongosh --port 27201 --eval 'rs.initiate({_id:"sh1",members:[{_id:0,host:"localhost:27201"}]})'
mongosh --port 27202 --eval 'rs.initiate({_id:"sh2",members:[{_id:0,host:"localhost:27202"}]})'
mongos --configdb cfg/localhost:27100 --port 27300 --fork --logpath data/mongos.log
mongosh --port 27300 admin/sharding/shard-collections.js
```
Then seed against the router: `MONGO_URI=mongodb://localhost:27300 python python/seed.py --meters 3000`
and check `sh.status()` and `db.meter_readings.getShardDistribution()`.
