import React, { useEffect, useState } from "react";
import { LayoutDashboard, Users, Gauge, CreditCard, BarChart3, Bell, Database, Menu } from "lucide-react";
import { api } from "./api.js";
import Overview from "./pages/Overview.jsx";
import Consumers from "./pages/Consumers.jsx";
import Reading from "./pages/Reading.jsx";
import Payments from "./pages/Payments.jsx";
import Reports from "./pages/Reports.jsx";
import Activity from "./pages/Activity.jsx";

const NAV = [
  { group: "Workspace", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard, desc: "System health and key figures at a glance" } ] },
  { group: "Operations", items: [
    { id: "consumers", label: "Consumers", icon: Users, desc: "Search consumers, view meters and bill history" },
    { id: "reading", label: "Record Reading", icon: Gauge, desc: "Enter a meter reading — the bill is generated automatically" },
    { id: "payments", label: "Payments", icon: CreditCard, desc: "Collect full or partial payments in one ACID transaction" } ] },
  { group: "Insights", items: [
    { id: "reports", label: "Reports", icon: BarChart3, desc: "Aggregation pipeline reports" },
    { id: "activity", label: "Alerts & Audit", icon: Bell, desc: "Live change-stream events, alerts and the audit trail" } ] },
];
const ALL = NAV.flatMap((g) => g.items);

export default function App() {
  const [page, setPage] = useState(() => location.hash.slice(1) || "overview");
  const [ctx, setCtx] = useState({});        // cross-page hand-off (e.g. bill to pay)
  const [health, setHealth] = useState(null);
  const [menu, setMenu] = useState(false);
  const go = (id, data = {}) => { setCtx(data); setPage(id); location.hash = id; setMenu(false); window.scrollTo(0, 0); };
  useEffect(() => {
    const ping = () => api("/summary").then((s) => setHealth({ ok: true, ...s })).catch(() => setHealth({ ok: false }));
    ping(); const t = setInterval(ping, 15000); return () => clearInterval(t);
  }, []);
  const cur = ALL.find((i) => i.id === page) || ALL[0];
  const P = { overview: Overview, consumers: Consumers, reading: Reading, payments: Payments, reports: Reports, activity: Activity }[cur.id];

  return (
    <div className="shell">
      <aside className={"side" + (menu ? " open" : "")}>
        <div className="brand"><div className="logo"><Database size={18} /></div><div><b>UtilityHub</b><span>Billing Console</span></div></div>
        <nav aria-label="Main">
          {NAV.map((g) => (<div key={g.group}><div className="grp">{g.group}</div>
            {g.items.map((i) => { const I = i.icon; return (
              <button key={i.id} className={"nav" + (i.id === cur.id ? " active" : "")} aria-current={i.id === cur.id ? "page" : undefined} onClick={() => go(i.id)}>
                <I size={18} /> {i.label}</button>); })}</div>))}
        </nav>
        <div className="side-f">
          <div className={"health " + (health?.ok ? "up" : health ? "down" : "")}>
            <span className="dot" />
            {health?.ok ? <div><b>Replica set {health.replicaSet || "—"}</b><span>Primary {health.primary}</span></div>
              : health ? <div><b>Disconnected</b><span>Start the API server</span></div> : <div><b>Checking…</b></div>}
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="top">
          <button className="icon-btn burger" aria-label="Menu" onClick={() => setMenu(!menu)}><Menu size={20} /></button>
          <div><div className="crumb">{NAV.find((g) => g.items.includes(cur)).group} / {cur.label}</div>
            <h1>{cur.label}</h1><p className="muted">{cur.desc}</p></div>
        </header>
        <main><P go={go} ctx={ctx} health={health} /></main>
      </div>
    </div>
  );
}
