import React, { useEffect, useState } from "react";
import { Search, MapPin, Phone, Mail, User, CreditCard } from "lucide-react";
import { api, rs, num, date } from "../api.js";
import { Card, Badge, Spinner, Empty, Table, UtilIcon, Button } from "../ui.jsx";

export default function Consumers({ go, ctx }) {
  const [q, setQ] = useState(""); const [list, setList] = useState([]); const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(null); const [detail, setDetail] = useState(null); const [err, setErr] = useState("");
  useEffect(() => {   // debounced live search
    setBusy(true);
    const t = setTimeout(() => api("/consumers?q=" + encodeURIComponent(q)).then(setList).catch((e) => setErr(e.message)).finally(() => setBusy(false)), 250);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { if (ctx.consumer_no) open(ctx.consumer_no); }, [ctx]);
  function open(no) {
    setSel(no); setDetail(null);
    api("/consumers/" + no).then(setDetail).catch((e) => setErr(e.message));
  }
  return (
    <div className="split">
      <Card className="list-card">
        <div className="search"><Search size={16} /><input autoFocus placeholder="Search by name or consumer no. (e.g. C-000012)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search consumers" /></div>
        {busy && !list.length ? <Spinner /> : !list.length ? <Empty icon={Search} title="No consumers found" hint="Try a different name or number." /> :
          <ul className="results">{list.map((c) => (
            <li key={c.consumer_no}><button className={sel === c.consumer_no ? "sel" : ""} onClick={() => open(c.consumer_no)}>
              <div className="avatar">{c.name[0]}</div>
              <div className="grow"><b>{c.name}</b><span>{c.consumer_no} · {c.address?.city} · {c.category}</span></div>
              {c.outstanding_balance > 0 && <span className="owed">{rs(c.outstanding_balance)}</span>}
            </button></li>))}</ul>}
        {err && <p className="err-txt">{err}</p>}
      </Card>

      <div className="stack">
        {!sel ? <Card><Empty icon={User} title="Select a consumer" hint="Their meters and bills will appear here." /></Card>
          : !detail ? <Card><Spinner /></Card> : <>
          <Card>
            <div className="profile">
              <div className="avatar lg">{detail.consumer.name[0]}</div>
              <div className="grow"><h2>{detail.consumer.name}</h2>
                <div className="meta"><span>{detail.consumer.consumer_no}</span><span className="cap">{detail.consumer.category}</span><Badge status={detail.consumer.status} /></div>
                <div className="meta muted"><span><MapPin size={14} />{detail.consumer.address.street}, {detail.consumer.address.city}</span>
                  <span><Phone size={14} />{detail.consumer.contact.phone}</span>{detail.consumer.contact.email && <span><Mail size={14} />{detail.consumer.contact.email}</span>}</div></div>
              <div className="balance"><span>Outstanding</span><b className={detail.consumer.outstanding_balance > 0 ? "red" : "green"}>{rs(detail.consumer.outstanding_balance)}</b></div>
            </div>
          </Card>
          <Card title="Meters" subtitle={detail.meters.length + " registered"}>
            <div className="meters">{detail.meters.map((m) => (
              <div key={m.meter_no} className="meter"><UtilIcon type={m.utility_type} size={18} />
                <div className="grow"><b>{m.meter_no}</b><span className="cap">{m.utility_type} · last reading {num(m.last_reading?.value)}</span></div>
                <Button variant="ghost" onClick={() => go("reading", { meter_no: m.meter_no })} disabled={m.status !== "active"}>Record reading</Button></div>))}</div>
          </Card>
          <Card title="Recent bills" subtitle="Latest 12 billing periods">
            <Table rows={detail.bills} cols={[
              { k: "bill_no", label: "Bill no." }, { k: "period", label: "Period" },
              { k: "u", label: "Utility", render: (b) => <span className="cap inline"><UtilIcon type={b.utility_type} size={13} />{b.utility_type}</span> },
              { k: "units", label: "Units", num: true, render: (b) => num(b.units) },
              { k: "total", label: "Total", num: true, render: (b) => rs(b.total) },
              { k: "balance", label: "Balance", num: true, render: (b) => rs(b.balance) },
              { k: "due", label: "Due", render: (b) => date(b.due_date) },
              { k: "status", label: "Status", render: (b) => <Badge status={b.status} /> },
              { k: "a", label: "", render: (b) => b.balance > 0 && <button className="link" onClick={() => go("payments", { bill_no: b.bill_no })}><CreditCard size={14} /> Pay</button> },
            ]} />
          </Card>
        </>}
      </div>
    </div>
  );
}
