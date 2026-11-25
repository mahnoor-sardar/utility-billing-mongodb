# Windows: starts each node in its own window. Run from project root.
New-Item -ItemType Directory -Force data\rs1, data\rs2, data\rs3 | Out-Null
1..3 | ForEach-Object { Start-Process mongod -ArgumentList "--config admin\replica-set\mongod$_.conf" }
Start-Sleep -Seconds 5
mongosh --port 27017 --quiet admin\replica-set\init-replica-set.js
