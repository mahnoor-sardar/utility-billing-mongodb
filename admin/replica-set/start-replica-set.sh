#!/usr/bin/env bash
# Starts a local 3-node replica set (ports 27017-27019). Run from project root.
set -e
mkdir -p data/rs1 data/rs2 data/rs3
for i in 1 2 3; do mongod --config admin/replica-set/mongod$i.conf --fork; done
sleep 3
mongosh --port 27017 --quiet admin/replica-set/init-replica-set.js
