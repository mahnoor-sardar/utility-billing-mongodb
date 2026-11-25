Simulated over 4 shards. Ideal share = 25%. Hotspot = % of newest 10% writes on busiest shard (ideal 25%).

### meter_readings
| Candidate key | Cardinality | Max share % | Min share % | Hotspot % |
|---|---|---|---|---|
| hashed meter_id | 3000 | 25.9 | 24.3 | 26.5 |
| reading_date (ranged) | 96 | 25.2 | 24.9 | 100.0 |
| {meter_id:1, reading_date:1} (ranged) | 60000 | 25.0 | 25.0 | 25.4 |

### bills
| Candidate key | Cardinality | Max share % | Min share % | Hotspot % |
|---|---|---|---|---|
| hashed consumer_id | 1496 | 26.2 | 24.0 | 26.0 |
| status (ranged) | 4 | 77.1 | 0.0 | 64.4 |
| utility_type (ranged) | 3 | 49.7 | 0.0 | 50.2 |
| issue_date (ranged) | 99 | 26.2 | 21.9 | 100.0 |
