# Full backup -> simulated data loss -> restore -> verify counts. Run from the project root.
$URI = if ($env:MONGO_URI) { $env:MONGO_URI } else { "mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0" }
$OUT = "backups\" + (Get-Date -Format "yyyyMMdd_HHmmss")

Write-Host "== 1. Counts before backup" -ForegroundColor Cyan
$before = mongosh $URI --quiet admin\backup\count.js
$before

Write-Host "== 2. mongodump" -ForegroundColor Cyan
mongodump --uri="$URI" --db=utility_billing --gzip --out="$OUT" --quiet
Write-Host "Backup saved to $OUT"

Write-Host "== 3. Simulating data loss" -ForegroundColor Cyan
mongosh $URI --quiet admin\backup\drop.js
mongosh $URI --quiet admin\backup\count.js

Write-Host "== 4. mongorestore" -ForegroundColor Cyan
mongorestore --uri="$URI" --gzip --nsInclude="utility_billing.*" --drop "$OUT" --quiet
Write-Host "Restore finished"

Write-Host "== 5. Counts after restore" -ForegroundColor Cyan
$after = mongosh $URI --quiet admin\backup\count.js
$after

if (-not $before -or $before -notmatch "bills") { Write-Host "ERROR: could not read counts" -ForegroundColor Red }
elseif (($before -join "") -eq ($after -join "")) { Write-Host "VERIFIED: counts match" -ForegroundColor Green }
else { Write-Host "MISMATCH" -ForegroundColor Red }
