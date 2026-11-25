# RBAC

| Role | Can | Cannot |
|---|---|---|
| consumer_role | read `v_consumer_bills`, read payments, create a payment session | read raw bills, write readings/bills, change tariffs |
| billing_staff_role | CRUD consumers/meters, insert readings, generate/update bills, insert payments, insert audit logs | change tariffs, delete/modify audit logs, drop collections, manage users |
| admin_role | everything incl. users, tariffs, backup/restore, cluster | – |

**Row-level note:** MongoDB privileges are per collection/view, so per-consumer filtering
(a consumer sees only *their own* bills) is enforced in application/script logic — the
dashboard API always adds `consumer_id` to the filter for consumer logins.

Steps: 1) `mongosh ... create-roles-users.js` 2) generate keyfile:
`openssl rand -base64 756 > admin/replica-set/rs-keyfile && chmod 400 admin/replica-set/rs-keyfile`
3) uncomment `security:` in the 3 conf files, restart nodes 4) run `test-rbac.js` as each user and screenshot.
5) set `MONGO_URI` with credentials for the Python scripts, e.g.
`mongodb://admin_demo:Admin%232026@localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0&authSource=admin`
