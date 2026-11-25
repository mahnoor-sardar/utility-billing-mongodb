sh.addShard("sh1/localhost:27201"); sh.addShard("sh2/localhost:27202");
sh.enableSharding("utility_billing");
sh.shardCollection("utility_billing.meter_readings", { meter_id: "hashed" });
sh.shardCollection("utility_billing.bills", { consumer_id: "hashed" });
sh.shardCollection("utility_billing.payments", { consumer_id: "hashed" });
sh.status();
