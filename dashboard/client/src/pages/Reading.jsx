import React, { useEffect, useState } from "react";
import { Search, CheckCircle2, CreditCard, Gauge, RotateCcw } from "lucide-react";
import { api, rs, num, date, slabPreview } from "../api.js";
import { Card, Field, Button, Empty, UtilIcon, useToast, Table } from "../ui.jsx";

const thisMonth = () => new Date().toISOString().slice(0, 7);

export default function Reading({ go, ctx }) {
  const toast = useToast();
  const [no, setNo] = useState(ctx.meter_no || ""); const [m, setM] = useState(null); const [findErr, setFindErr] = useState(""); const [finding, setFinding] = useState(false);
  const [value, setValue] = useState(""); const [period, setPeriod] = useState(thisMonth());
  const [saving, setSaving] = useState(false); const [done, setDone] = useState(null);
  useEffect(() => { if (ctx.meter_no) find(ctx.meter_no); }, [ctx]);

  function find(n = no) {
    if (!n.trim()) return setFindErr("Enter a meter number");
    setFinding(true); setFindErr(""); setM(null); setDone(null);
    api("/meters/" + n.trim()).then((d) => { setM(d); setValue(""); }).catch((e) => setFindErr(e.message)).finally(() => setFinding(false));
  }
  const last = m?.meter.last_reading?.value ?? 0;
  const v = Number(value);
  const valErr = value === "" ? "" : isNaN(v) ? "Numbers only" : v < last ? `Must be at least ${num(last)} (previous reading)` : "";
  const perErr = /^\d{4}-(0[1-9]|1[0-2])$/.test(period) ? "" : "Use format YYYY-MM";
  const units = value && !valErr ? Math.round((v - last) * 100) / 100 : 0;
  const preview = slabPreview(units, m?.tariff);
  const unit = m?.tariff?.unit || "units";

  async function submit(e) {
    e.preventDefault(); if (valErr || perErr || !value) return;
    setSaving(true);
    try {
      const r = await api("/readings", { meter_no: m.meter.meter_no, value: v, period });
      setDone(r); toast("success", "Reading saved & bill generated", `${r.bill.bill_no} · ${rs(r.bill.total)}`);
    } catch (e) { toast("error", "Reading not saved", e.message); }
    finally { setSaving(false); }
  }

  if (done) return (
    <Card className="success-card">
      <CheckCircle2 size={44} className="green" />
      <h2>Bill {done.bill.bill_no} generated</h2>
      <p className="muted">{num(done.reading.units_consumed)} {unit} consumed · due {date(done.bill.due_date)}</p>
      <div className="big-amount">{rs(done.bill.total)}</div>
      <div className="row center">
        <Button onClick={() => go("payments", { bill_no: done.bill.bill_no })}><CreditCard size={16} /> Collect payment</Button>
        <Button variant="ghost" onClick={() => { setDone(null); find(); }}><RotateCcw size={16} /> Record another</Button>
      </div>
    </Card>);

  return (
    <div className="grid-1-1">
      <div className="stack">
        <Card title="1 · Find the meter">
          <form className="row" onSubmit={(e) => { e.preventDefault(); find(); }}>
            <Field label="Meter number" hint="E-, W- or G- followed by 7 digits" error={findErr}>
              <input value={no} onChange={(e) => setNo(e.target.value.toUpperCase())} placeholder="E-0000002" autoFocus /></Field>
            <Button loading={finding} type="submit"><Search size={16} /> Find</Button>
          </form>
          {m && <div className="meter big"><UtilIcon type={m.meter.utility_type} size={22} />
            <div className="grow"><b>{m.meter.meter_no}</b><span>{m.consumer?.name} · {m.consumer?.consumer_no}</span>
              <span className="cap">{m.meter.utility_type} · {m.meter.tariff_category} tariff · status {m.meter.status}</span></div>
            <div className="balance"><span>Previous reading</span><b>{num(last)}</b></div></div>}
        </Card>

        <Card title="2 · Enter the new reading">
          {!m ? <Empty icon={Gauge} title="Find a meter first" /> : m.meter.status !== "active" ? <Empty title="This meter is archived" hint="Readings can't be recorded on archived meters." /> :
          <form onSubmit={submit}>
            <div className="row">
              <Field label="Current reading" error={valErr} hint={`Previous: ${num(last)}`}>
                <input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={String(last + 100)} /></Field>
              <Field label="Billing period" error={perErr}><input value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="YYYY-MM" /></Field>
            </div>
            <Button type="submit" loading={saving} disabled={!value || !!valErr || !!perErr}>Save reading & generate bill</Button>
          </form>}
        </Card>
      </div>

      <Card title="Bill preview" subtitle="Updates as you type — calculated with the active tariff slabs">
        {!preview ? <Empty title="Nothing to preview yet" hint="Enter a reading higher than the previous one." /> : <>
          <Table rows={preview.rows} cols={[
            { k: "s", label: "Slab", render: (r) => `${r.from} – ${r.to ?? "above"}` },
            { k: "units", label: unit, num: true, render: (r) => num(r.units) },
            { k: "rate", label: "Rate", num: true, render: (r) => rs(r.rate) },
            { k: "amount", label: "Amount", num: true, render: (r) => rs(r.amount) }]} />
          <dl className="totals">
            <div><dt>Energy charge</dt><dd>{rs(preview.energy)}</dd></div>
            <div><dt>Fixed charge</dt><dd>{rs(preview.fixed)}</dd></div>
            <div><dt>Tax ({(m.tariff.tax_rate * 100).toFixed(0)}%)</dt><dd>{rs(preview.tax)}</dd></div>
            <div className="grand"><dt>Bill total</dt><dd>{rs(preview.total)}</dd></div>
            <div className="muted"><dt>If paid late (+{(m.tariff.late_fee_rate * 100).toFixed(0)}%)</dt><dd>{rs(preview.total * (1 + m.tariff.late_fee_rate))}</dd></div>
          </dl></>}
      </Card>
    </div>
  );
}
