import React, { useEffect, useState } from "react";
import { Radio, AlertTriangle, CheckCircle2, FileText, RefreshCw, Zap, History } from "lucide-react";
import { api, ago, rs, num } from "../api.js";
import { Card, Empty, Button } from "../ui.jsx";

const ICON = { usage_spike: Zap, bill_paid: CheckCircle2, bill_overdue: AlertTriangle };
function describe(a) {
  const d = a.details || {};
  if (a.action === "usage_spike") return `Usage spike: ${num(d.units)} units in ${d.period} (6-month avg ${num(d.avg_6m)})`;
  if (a.action === "bill_paid") return `Bill ${d.bill_no} fully paid`;
  if (a.action === "bill_overdue") return `Bill ${d.bill_no} is overdue · balance ${rs(d.balance)}`;
  if (a.action === "payment") return `Payment ${rs(d.amount)} · receipt ${d.receipt_no}`;
  if (a.action === "generate") return `Bill generated · ${rs(a.after?.total)}`;
  return `${a.action} on ${a.entity}`;
}

export default function Activity() {
  const [alerts, setA] = useState(null); const [audit, setAu] = useState(null); const [live, setLive] = useState([]); const [conn, setConn] = useState("connecting");
  const load = () => { api("/alerts").then(setA).catch(() => setA([])); api("/audit").then(setAu).catch(() => setAu([])); };
  useEffect(() => {
    load(); const es = new EventSource("/api/stream");
    es.onopen = () => setConn("live"); es.onerror = () => setConn("offline");
    es.onmessage = (e) => { const x = JSON.parse(e.data); setLive((l) => [{ ...x, at: new Date() }, ...l].slice(0, 20)); load(); };
    return () => es.close();
  }, []);
  return (
    <div className="grid-1-1">
      <Card title="Live bill events" subtitle="Streamed straight from a MongoDB change stream on bills"
        action={<span className={"pill " + conn}><Radio size={14} /> {conn}</span>}>
        {!live.length ? <Empty icon={Radio} title="Waiting for changes…" hint="Record a reading or take a payment in another tab — events appear here instantly." /> :
          <ul className="feed">{live.map((x, i) => (
            <li key={i}><span className={"dotc " + x.op} /><div className="grow"><b>{x.op === "insert" ? "New bill created" : "Bill updated"}</b>
              <span className="muted">{x.fields ? Object.entries(x.fields).filter(([k]) => k !== "version").map(([k, v]) => `${k}: ${typeof v === "number" ? num(v) : v}`).join(" · ") : String(x.id)}</span></div>
              <time>{ago(x.at)}</time></li>))}</ul>}
      </Card>
      <div className="stack">
        <Card title="Alerts" subtitle="Raised by python/change_streams.py" action={<Button variant="ghost" onClick={load}><RefreshCw size={16} /> Refresh</Button>}>
          {!alerts?.length ? <Empty icon={AlertTriangle} title="No alerts yet" hint="Run change_streams.py, then record an unusually high reading." /> :
            <ul className="feed">{alerts.map((a) => { const I = ICON[a.action] || AlertTriangle; return (
              <li key={a._id} className={"al-" + a.action}><I size={18} /><div className="grow"><b>{describe(a)}</b></div><time>{ago(a.ts)}</time></li>); })}</ul>}
        </Card>
        <Card title="Audit trail" subtitle="Append-only log of every financial change">
          {!audit?.length ? <Empty icon={History} title="No audit entries" /> :
            <ul className="feed">{audit.map((a) => (
              <li key={a._id}><FileText size={16} className="muted" /><div className="grow"><b>{describe(a)}</b>
                <span className="muted">{a.entity} · by {a.actor}{a.before?.status && a.after?.status && ` · ${a.before.status} → ${a.after.status}`}</span></div><time>{ago(a.ts)}</time></li>))}</ul>}
        </Card>
      </div>
    </div>
  );
}
