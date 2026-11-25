import React, { useEffect, useState } from "react";
import { Users, Gauge, FileText, Wallet, AlertTriangle, TrendingUp, CreditCard, Search } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { api, rs, compact, num } from "../api.js";
import { Card, Spinner } from "../ui.jsx";

const COLORS = { paid: "#16a34a", overdue: "#dc2626", partial: "#f59e0b", unpaid: "#64748b" };

export default function Overview({ go, health }) {
  const [k, setK] = useState(null); const [rev, setRev] = useState([]); const [col, setCol] = useState([]);
  useEffect(() => {
    api("/kpis").then(setK).catch(() => setK({}));
    api("/reports/monthly_revenue").then(setRev).catch(() => {});
    api("/reports/collection_vs_overdue").then(setCol).catch(() => {});
  }, []);
  const c = health?.counts || {};
  const rate = k?.billed ? (k.collected / k.billed) * 100 : 0;
  const stats = [
    { label: "Consumers", value: num(c.consumers), icon: Users, tone: "blue" },
    { label: "Meter readings", value: compact(c.meter_readings), icon: Gauge, tone: "teal" },
    { label: "Bills generated", value: compact(c.bills), icon: FileText, tone: "violet" },
    { label: "Collected", value: "Rs " + compact(k?.collected), sub: rate.toFixed(1) + "% collection rate", icon: Wallet, tone: "green" },
    { label: "Outstanding", value: "Rs " + compact(k?.outstanding), sub: num(k?.overdue) + " overdue bills", icon: AlertTriangle, tone: "red" },
  ];
  return (<>
    <div className="kpis">{stats.map((s) => { const I = s.icon; return (
      <div className={"kpi t-" + s.tone} key={s.label}><div className="kpi-i"><I size={20} /></div>
        <div><span>{s.label}</span><b>{health ? s.value : "…"}</b>{s.sub && <small>{s.sub}</small>}</div></div>); })}</div>

    <div className="quick">
      <button onClick={() => go("reading")}><Gauge size={18} /> Record a reading</button>
      <button onClick={() => go("payments")}><CreditCard size={18} /> Take a payment</button>
      <button onClick={() => go("consumers")}><Search size={18} /> Find a consumer</button>
    </div>

    <div className="grid-2-1">
      <Card title="Revenue collected" subtitle="Completed payments per month, 2026">
        {!rev.length ? <Spinner /> : <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={rev} margin={{ left: 10, right: 10, top: 10 }}>
            <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0d9488" stopOpacity={0.35} /><stop offset="100%" stopColor="#0d9488" stopOpacity={0} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
            <YAxis tickFormatter={(v) => compact(v)} tickLine={false} axisLine={false} fontSize={12} />
            <Tooltip formatter={(v) => rs(v)} />
            <Area type="monotone" dataKey="collected" name="Collected" stroke="#0d9488" strokeWidth={2.5} fill="url(#g)" />
          </AreaChart></ResponsiveContainer>}
      </Card>
      <Card title="Bills by status" subtitle="Share of all bills">
        {!col.length ? <Spinner /> : <>
          <ResponsiveContainer width="100%" height={190}>
            <PieChart><Pie data={col} dataKey="bills" nameKey="status" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {col.map((r) => <Cell key={r.status} fill={COLORS[r.status]} />)}</Pie><Tooltip formatter={(v) => num(v) + " bills"} /></PieChart>
          </ResponsiveContainer>
          <ul className="legend">{col.map((r) => <li key={r.status}><i style={{ background: COLORS[r.status] }} />{r.status}<b>{num(r.bills)}</b></li>)}</ul>
        </>}
      </Card>
    </div>
  </>);
}
