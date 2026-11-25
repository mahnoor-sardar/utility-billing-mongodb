import React, { useEffect, useState } from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, AreaChart, Area, Legend, Cell } from "recharts";
import { Download } from "lucide-react";
import { api, rs, num, compact } from "../api.js";
import { Card, Spinner, Table, Button } from "../ui.jsx";

const R = {
  monthly_usage: { label: "Monthly usage", sub: "Total units billed per utility — $match → $group → $sort" },
  monthly_revenue: { label: "Revenue", sub: "Amount collected per month — $match → $group by $dateToString" },
  high_usage_meters: { label: "High-usage meters", sub: "Top 10 electricity meters — $group → $sort → $limit → $lookup ×2" },
  collection_vs_overdue: { label: "Collection vs overdue", sub: "Billed, collected and outstanding per status — $group" },
  overdue_ageing: { label: "Overdue ageing", sub: "Unpaid balances by days overdue — $bucket" },
};
const UC = { electricity: "#f59e0b", water: "#0ea5e9", gas: "#ef4444" };
const BANDS = { 0: "0–30 d", 31: "31–60 d", 61: "61–90 d", 91: "91–180 d", 181: "180+ d" };
const ax = { tickLine: false, axisLine: false, fontSize: 12 };

function csv(rows, name) {
  const cols = Object.keys(rows[0]); const body = [cols.join(","), ...rows.map((r) => cols.map((c) => JSON.stringify(r[c] ?? "")).join(","))].join("\n");
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "text/csv" })); a.download = name + ".csv"; a.click();
}

export default function Reports() {
  const [tab, setTab] = useState("monthly_usage"); const [rows, setRows] = useState(null); const [util, setUtil] = useState("electricity");
  useEffect(() => { setRows(null); api("/reports/" + tab).then(setRows).catch(() => setRows([])); }, [tab]);
  const usage = rows && tab === "monthly_usage" ? rows.filter((r) => r.utility === util) : [];
  return (<>
    <div className="tabs" role="tablist">{Object.entries(R).map(([k, v]) => <button role="tab" aria-selected={tab === k} key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{v.label}</button>)}</div>
    <Card title={R[tab].label} subtitle={R[tab].sub} action={rows?.length ? <Button variant="ghost" onClick={() => csv(rows, tab)}><Download size={16} /> Export CSV</Button> : null}>
      {!rows ? <Spinner label="Running aggregation pipeline…" /> : <>
        {tab === "monthly_usage" && <>
          <div className="seg small">{Object.keys(UC).map((u) => <button key={u} className={util === u ? "on" : ""} onClick={() => setUtil(u)}><span className="cap">{u}</span></button>)}</div>
          <ResponsiveContainer width="100%" height={300}><BarChart data={usage}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="period" {...ax} /><YAxis tickFormatter={compact} {...ax} /><Tooltip formatter={(v) => num(v) + (util === "electricity" ? " kWh" : " m³")} />
            <Bar dataKey="total_units" name="Units" fill={UC[util]} radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></>}
        {tab === "monthly_revenue" && <ResponsiveContainer width="100%" height={300}><AreaChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="month" {...ax} /><YAxis tickFormatter={compact} {...ax} /><Tooltip formatter={(v, n) => n === "Collected" ? rs(v) : num(v)} />
          <Area dataKey="collected" name="Collected" stroke="#0d9488" fill="#0d948833" strokeWidth={2.5} /></AreaChart></ResponsiveContainer>}
        {tab === "high_usage_meters" && <ResponsiveContainer width="100%" height={340}><BarChart data={rows} layout="vertical" margin={{ left: 40 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" /><XAxis type="number" {...ax} />
          <YAxis type="category" dataKey="meter_no" width={90} {...ax} /><Tooltip formatter={(v) => num(v) + " kWh"} labelFormatter={(l) => { const r = rows.find((x) => x.meter_no === l); return `${l} · ${r?.name}`; }} />
          <Bar dataKey="units" fill="#6366f1" radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer>}
        {tab === "collection_vs_overdue" && <ResponsiveContainer width="100%" height={300}><BarChart data={rows}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="status" {...ax} /><YAxis tickFormatter={compact} {...ax} /><Tooltip formatter={(v) => rs(v)} /><Legend />
          <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[6, 6, 0, 0]} /><Bar dataKey="outstanding" name="Outstanding" fill="#dc2626" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer>}
        {tab === "overdue_ageing" && <ResponsiveContainer width="100%" height={300}><BarChart data={rows.map((r) => ({ ...r, band: r.band || BANDS[r.from_day] || r.from_day }))}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" /><XAxis dataKey="band" {...ax} /><YAxis tickFormatter={compact} {...ax} /><Tooltip formatter={(v) => rs(v)} />
          <Bar dataKey="amount" name="Outstanding" radius={[6, 6, 0, 0]}>{rows.map((_, i) => <Cell key={i} fill={["#fbbf24", "#f97316", "#ef4444", "#dc2626", "#991b1b"][i] || "#991b1b"} />)}</Bar></BarChart></ResponsiveContainer>}

        <details className="raw"><summary>Show data table ({rows.length} rows)</summary>
          <Table rows={tab === "monthly_usage" ? usage : rows} cols={Object.keys(rows[0] || {}).map((k) => ({ k, label: k.replace(/_/g, " "),
            num: typeof rows[0][k] === "number", render: (r) => typeof r[k] === "number" ? (/(billed|collected|outstanding|amount)/.test(k) ? rs(r[k]) : num(r[k])) : String(r[k]) }))} />
        </details></>}
    </Card>
  </>);
}
