| Query | Before: stage / keys / docs / ms | After: stage / keys / docs / ms | nReturned |
|---|---|---|---|
| consumers: consumer by consumer_no | COLLSCAN / 0 / 1495 / 3 | EXPRESS_IXSCAN / 1 / 1 / 1 | 1 |
| meters: meter by meter_no | COLLSCAN / 0 / 3000 / 6 | EXPRESS_IXSCAN / 1 / 1 / 3 | 1 |
| meters: meters of consumer by utility | COLLSCAN / 0 / 3000 / 4 | FETCH>IXSCAN / 1 / 1 / 2 | 1 |
| meter_readings: latest 12 readings of a meter | SORT>COLLSCAN / 0 / 72000 / 151 | LIMIT>FETCH>IXSCAN / 12 / 12 / 9 | 12 |
| bills: bill history of consumer | SORT>COLLSCAN / 0 / 72000 / 140 | LIMIT>FETCH>IXSCAN / 12 / 12 / 5 | 12 |
| bills: overdue bills due before date | COLLSCAN / 0 / 72000 / 98 | FETCH>IXSCAN / 11556 / 11555 / 47 | 11555 |
| payments: payments of a bill | SORT>COLLSCAN / 0 / 69964 / 103 | LIMIT>FETCH>IXSCAN / 1 / 1 / 3 | 1 |
