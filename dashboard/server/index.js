// Thin Express API over MongoDB. Business logic mirrors python/billing.py and payments.py.
import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import { randomUUID, randomBytes } from "crypto";

const URI = process.env.MONGO_URI || "mongodb://localhost:27017,localhost:27018,localhost:27019/?replicaSet=rs0";
const client = new MongoClient(URI, { writeConcern: { w: "majority" } });
await client.connect();
const db = client.db(process.env.DB_NAME || "utility_billing");
const TXN = { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, readPreference: "primary" };
const r2 = (x) => Math.round((Number(x) + 1e-9) * 100) / 100;
const app = express();
app.use(cors()); app.use(express.json());
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => res.status(e.status || 500).json({ error: e.message }));
const fail = (status, message) => Object.assign(new Error(message), { status });
const audit = (s, entity, entity_id, action, actor, before, after, details = {}) =>
  db.collection("audit_logs").insertOne({ entity, entity_id, action, actor, before, after, details, ts: new Date() }, { session: s });

// ---------- overview ----------
app.get("/api/summary", wrap(async (_q, res) => {
  const names = ["consumers", "meters", "meter_readings", "bills", "payments", "audit_logs"];
  const counts = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await db.collection(n).estimatedDocumentCount()])));
  counts.active_sessions = await db.collection("payment_sessions").countDocuments();
  const hello = await db.admin().command({ hello: 1 });
  res.json({ counts, replicaSet: hello.setName || null, primary: hello.primary || null, hosts: hello.hosts || [] });
}));

// ---------- lookups ----------
app.get("/api/consumers/:no", wrap(async (req, res) => {
  const c = await db.collection("consumers").findOne({ consumer_no: req.params.no });
  if (!c) throw fail(404, "consumer not found");
  const meters = await db.collection("meters").find({ consumer_id: c._id }).toArray();
  const bills = await db.collection("bills").find({ consumer_id: c._id }).sort({ period: -1 }).limit(12).toArray();
  res.json({ consumer: c, meters, bills });
}));
app.get("/api/bills/:id/payments", wrap(async (req, res) => {
  res.json(await db.collection("payments").find({ bill_id: new ObjectId(req.params.id) }).sort({ paid_at: -1 }).toArray());
}));


// ---------- search & detail endpoints for the dashboard ----------
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
app.get("/api/consumers", wrap(async (req, res) => {
  const q = String(req.query.q || "").trim();
  const f = q ? { $or: [{ consumer_no: { $regex: "^" + esc(q), $options: "i" } }, { name: { $regex: esc(q), $options: "i" } }] } : {};
  res.json(await db.collection("consumers").find(f, { projection: { consumer_no: 1, name: 1, category: 1, "address.city": 1, outstanding_balance: 1, status: 1 } })
    .sort({ consumer_no: 1 }).limit(8).toArray());
}));
app.get("/api/meters/:no", wrap(async (req, res) => {
  const m = await db.collection("meters").findOne({ meter_no: req.params.no.toUpperCase() });
  if (!m) throw fail(404, "No meter with that number");
  const c = await db.collection("consumers").findOne({ _id: m.consumer_id }, { projection: { consumer_no: 1, name: 1 } });
  const t = await db.collection("tariff_slabs").findOne({ utility_type: m.utility_type, category: m.tariff_category }, { sort: { effective_from: -1 } });
  res.json({ meter: m, consumer: c, tariff: t });
}));
app.get("/api/bill/:no", wrap(async (req, res) => {
  const b = await db.collection("bills").findOne({ bill_no: req.params.no.toUpperCase() });
  if (!b) throw fail(404, "No bill with that number");
  const c = await db.collection("consumers").findOne({ _id: b.consumer_id }, { projection: { consumer_no: 1, name: 1 } });
  const payments = await db.collection("payments").find({ bill_id: b._id }).sort({ paid_at: -1 }).toArray();
  res.json({ bill: b, consumer: c, payments });
}));
app.get("/api/kpis", wrap(async (_q, res) => {
  const [t] = await db.collection("bills").aggregate([{ $group: { _id: null, billed: { $sum: "$total" }, collected: { $sum: "$amount_paid" }, outstanding: { $sum: "$balance" },
    overdue: { $sum: { $cond: [{ $eq: ["$status", "overdue"] }, 1, 0] } } } }]).toArray();
  res.json(t || {});
}));

// ---------- record reading + generate bill (one transaction) ----------
function slabBreakdown(units, slabs) {
  let rem = units; const out = [];
  for (const s of [...slabs].sort((a, b) => a.from - b.from)) {
    if (rem <= 0) break;
    const width = s.to == null ? rem : s.to - s.from + 1, u = Math.min(rem, width);
    out.push({ from: s.from, to: s.to, units: u, rate: s.rate, amount: r2(u * s.rate) }); rem -= u;
  }
  return out;
}
app.post("/api/readings", wrap(async (req, res) => {
  const { meter_no, value, period, actor = "dashboard" } = req.body;
  const v = Number(value);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period || "")) throw fail(400, "period must be YYYY-MM");
  const s = client.startSession(); let result;
  try {
    await s.withTransaction(async () => {
      const m = await db.collection("meters").findOne({ meter_no, status: "active" }, { session: s });
      if (!m) throw fail(404, "meter not found or archived");
      const prev = m.last_reading?.value ?? 0;
      if (v < prev) throw fail(400, `reading ${v} is lower than previous ${prev}`);
      const now = new Date(), units = r2(v - prev);
      const rd = { meter_id: m._id, period, reading_date: now, previous_value: prev, reading_value: v, units_consumed: units, recorded_by: actor, source: "manual" };
      await db.collection("meter_readings").insertOne(rd, { session: s });
      const up = await db.collection("meters").updateOne({ _id: m._id, "last_reading.value": prev },
        { $set: { last_reading: { value: v, date: now, period } } }, { session: s });
      if (up.modifiedCount !== 1) throw fail(409, "concurrent reading; retry");
      const t = await db.collection("tariff_slabs").findOne({ utility_type: m.utility_type, category: m.tariff_category, effective_from: { $lte: now } }, { sort: { effective_from: -1 }, session: s });
      const bd = slabBreakdown(units, t.slabs), energy = r2(bd.reduce((a, b) => a + b.amount, 0));
      const fixed = r2(t.fixed_charge), tax = r2((energy + fixed) * t.tax_rate), total = r2(energy + fixed + tax);
      const seq = (await db.collection("counters").findOneAndUpdate({ _id: "bill" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session: s })).seq;
      const [y, mo] = period.split("-");
      const bill = { bill_no: `B-${y}-${mo}-${String(900000 + seq).slice(-6)}`, consumer_id: m.consumer_id, meter_id: m._id, utility_type: m.utility_type,
        period, tariff_id: t._id, units, slab_breakdown: bd, charges: { energy, fixed, tax, late_fee: 0 }, total, amount_paid: 0, balance: total,
        status: "unpaid", issue_date: now, due_date: new Date(now.getTime() + 20 * 864e5), late_fee_applied: false, version: 1 };
      await db.collection("bills").insertOne(bill, { session: s });
      await db.collection("consumers").updateOne({ _id: m.consumer_id }, { $inc: { outstanding_balance: total } }, { session: s });
      await audit(s, "bills", bill._id, "generate", actor, null, { total });
      result = { reading: rd, bill };
    }, TXN);
  } finally { await s.endSession(); }
  res.json(result);
}));

// ---------- payment session (TTL) ----------
app.post("/api/sessions", wrap(async (req, res) => {
  const bill = await db.collection("bills").findOne({ bill_no: req.body.bill_no });
  if (!bill || bill.balance <= 0) throw fail(400, "bill not payable");
  const ttl = Number(req.body.ttl_seconds || 120), now = new Date();
  const doc = { bill_id: bill._id, consumer_id: bill.consumer_id, amount: bill.balance, token: randomBytes(18).toString("base64url"),
    state: "pending", created_at: now, expires_at: new Date(now.getTime() + ttl * 1000) };
  await db.collection("payment_sessions").insertOne(doc);
  res.json(doc);
}));
app.get("/api/sessions", wrap(async (_q, res) => res.json(await db.collection("payment_sessions").find().sort({ created_at: -1 }).limit(20).toArray())));

// ---------- payment (transaction + optimistic concurrency + idempotency) ----------
app.post("/api/payments", wrap(async (req, res) => {
  const { bill_no, method = "cash", actor = "dashboard", simulate_failure = false } = req.body;
  const amount = r2(req.body.amount), key = req.body.idempotency_key || randomUUID();
  if (!(amount > 0)) throw fail(400, "amount must be positive");
  const s = client.startSession(); let receipt;
  try {
    await s.withTransaction(async () => {
      const b = await db.collection("bills").findOne({ bill_no }, { session: s });
      if (!b) throw fail(404, "bill not found");
      if (b.balance <= 0) throw fail(400, "bill already paid");
      if (amount > b.balance + 0.004) throw fail(400, `amount ${amount} exceeds balance ${b.balance}`);
      const paid = r2(b.amount_paid + amount), bal = Math.max(r2(b.balance - amount), 0), status = bal <= 0.004 ? "paid" : "partial";
      const u = await db.collection("bills").updateOne({ _id: b._id, version: b.version },
        { $set: { amount_paid: paid, balance: bal, status }, $inc: { version: 1 } }, { session: s });
      if (u.modifiedCount !== 1) throw fail(409, "bill changed concurrently (version conflict)");
      if (simulate_failure) throw fail(500, "SIMULATED FAILURE after bill update - transaction rolled back");
      const c = await db.collection("counters").findOneAndUpdate({ _id: `receipt-${new Date().getFullYear()}` }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after", session: s });
      receipt = { receipt_no: `R-${new Date().getFullYear()}-${String(9000000 + c.seq).padStart(7, "0")}`, bill_id: b._id, consumer_id: b.consumer_id,
        amount, method, paid_at: new Date(), status: "completed", idempotency_key: key };
      await db.collection("payments").insertOne(receipt, { session: s });
      await db.collection("consumers").updateOne({ _id: b.consumer_id }, { $inc: { outstanding_balance: -amount } }, { session: s });
      await db.collection("payment_sessions").updateMany({ bill_id: b._id, state: "pending" }, { $set: { state: "completed" } }, { session: s });
      await audit(s, "bills", b._id, "payment", actor, { amount_paid: b.amount_paid, balance: b.balance, status: b.status },
        { amount_paid: paid, balance: bal, status }, { receipt_no: receipt.receipt_no, amount });
    }, TXN);
  } catch (e) {
    if (e.code === 11000) throw fail(409, `duplicate request: idempotency_key ${key} already used`);
    throw e;
  } finally { await s.endSession(); }
  res.json(receipt);
}));

// ---------- reports (aggregation pipelines) ----------
const reports = {
  monthly_usage: () => db.collection("bills").aggregate([
    { $match: { period: { $gte: "2026-01" } } },
    { $group: { _id: { utility: "$utility_type", period: "$period" }, total_units: { $sum: "$units" }, bills: { $sum: 1 } } },
    { $sort: { "_id.period": 1, "_id.utility": 1 } },
    { $project: { _id: 0, period: "$_id.period", utility: "$_id.utility", total_units: 1, bills: 1 } }]),
  monthly_revenue: () => db.collection("payments").aggregate([
    { $match: { status: "completed", paid_at: { $gte: new Date("2026-01-01") } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$paid_at" } }, collected: { $sum: "$amount" }, payments: { $sum: 1 } } },
    { $sort: { _id: 1 } }, { $project: { _id: 0, month: "$_id", collected: { $round: ["$collected", 2] }, payments: 1 } }]),
  high_usage_meters: async () => {
    const p = "2026-10";
    return db.collection("bills").aggregate([
      { $match: { period: p, utility_type: "electricity" } }, { $group: { _id: "$meter_id", units: { $sum: "$units" } } },
      { $sort: { units: -1 } }, { $limit: 10 },
      { $lookup: { from: "meters", localField: "_id", foreignField: "_id", as: "m" } }, { $unwind: "$m" },
      { $lookup: { from: "consumers", localField: "m.consumer_id", foreignField: "_id", as: "c" } }, { $unwind: "$c" },
      { $project: { _id: 0, meter_no: "$m.meter_no", consumer_no: "$c.consumer_no", name: "$c.name", units: 1, period: p } }]);
  },
  collection_vs_overdue: () => db.collection("bills").aggregate([
    { $group: { _id: "$status", bills: { $sum: 1 }, billed: { $sum: "$total" }, collected: { $sum: "$amount_paid" }, outstanding: { $sum: "$balance" } } },
    { $project: { _id: 0, status: "$_id", bills: 1, billed: { $round: ["$billed", 2] }, collected: { $round: ["$collected", 2] }, outstanding: { $round: ["$outstanding", 2] } } },
    { $sort: { status: 1 } }]),
  overdue_ageing: () => db.collection("bills").aggregate([
    { $match: { balance: { $gt: 0 }, due_date: { $lt: new Date() } } },
    { $set: { d: { $dateDiff: { startDate: "$due_date", endDate: "$$NOW", unit: "day" } } } },
    { $bucket: { groupBy: "$d", boundaries: [0, 31, 61, 91, 181, 100000], output: { bills: { $sum: 1 }, amount: { $sum: "$balance" } } } },
    { $project: { _id: 0, from_day: "$_id", bills: 1, amount: { $round: ["$amount", 2] } } }]),
};
app.get("/api/reports/:name", wrap(async (req, res) => {
  const fn = reports[req.params.name]; if (!fn) throw fail(404, "unknown report");
  res.json(await (await fn()).toArray());
}));

// ---------- alerts (written by python/change_streams.py) + live SSE ----------
app.get("/api/alerts", wrap(async (_q, res) =>
  res.json(await db.collection("audit_logs").find({ entity: "alert" }).sort({ ts: -1 }).limit(25).toArray())));
app.get("/api/audit", wrap(async (_q, res) =>
  res.json(await db.collection("audit_logs").find({ entity: { $ne: "alert" } }).sort({ ts: -1 }).limit(25).toArray())));
app.get("/api/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" }); res.flushHeaders(); res.write(": connected\n\n"); const ka = setInterval(() => res.write(": ping\n\n"), 20000); req.on("close", () => clearInterval(ka));
  const cs = db.collection("bills").watch([{ $match: { operationType: { $in: ["insert", "update"] } } }]);
  cs.on("change", (c) => res.write(`data: ${JSON.stringify({ op: c.operationType, id: c.documentKey._id, fields: c.updateDescription?.updatedFields })}\n\n`));
  cs.on("error", () => res.end());
  req.on("close", () => cs.close());
});

app.listen(4000, () => console.log("API on http://localhost:4000"));

